// ── Cerebro: base de conhecimento proprietária (Supabase REST) ───────────────
// Cruza o mercado com artigos curados + sínteses IA. Também lê snapshots para
// calcular o momentum do mercado. Extraído de routes/ai.ts.
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseRest.ts";
import { translateToPt } from "./translate.ts";
import { getCache, setCache } from "./cache.ts";
import { callClaude } from "./anthropic.ts";
import { extractJson } from "./extractJson.ts";
import { embedText, embeddingsEnabled } from "./embeddings.ts";

interface CerebroHit { title: string; summary: string; source: string; kind: "síntese" | "artigo"; date?: string; _semantic?: boolean; _sim?: number }

const STOPWORDS = new Set([
  // PT
  "que","com","por","uma","dos","das","será","vai","ser","está","sobre","como","após","entre","mais",
  "para","pelo","pela","seus","suas","esse","essa","este","esta","isso","antes","depois","ainda","até",
  // EN (títulos de mercado chegam em inglês)
  "will","the","and","what","when","this","that","with","from","have","does","over","under","than",
  "into","more","before","after","become","announce","between","released","during","their","there","about",
]);

/**
 * Extrai termos significativos para busca full-text, priorizando substantivos
 * próprios (capitalizados fora do início da frase) — são as entidades do
 * mercado (Irã, Fed, Trump) e o sinal mais forte de relevância.
 * Exportada para teste.
 */
export function topKeywords(text: string, n = 4): string {
  const tokens = text.replace(/[^a-zA-ZÀ-ú0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const seen = new Set<string>();
  const proper: string[] = [];
  const common: string[] = [];
  tokens.forEach((w, i) => {
    const lower = w.toLowerCase();
    // ⚠️ O corte por tamanho (<=3) descartava justamente os termos MAIS
    // distintivos de várias categorias: em e-sports os times são T1, G2, FPX e
    // as ligas LCK, LEC (e formatos BO3/BO5); em cripto os tickers são BTC, ETH.
    // Flagrado em 31/08: "LoL: T1 vs Gen.G (BO5) - LCK Finals" sobrava com UM
    // termo — "Finals" — e casava com "NBA Finals". Um mercado de e-sport
    // recebia destaque de basquete como "contexto".
    // Agora tokens curtos sobrevivem quando são claramente entidades: sigla em
    // maiúsculas (LCK, BTC) ou mistura de letra e número (T1, G2, BO5).
    const curtoMasDistintivo =
      w.length >= 2 && (/^[A-Z0-9]+$/.test(w) || /^[A-Za-z]+\d+$/.test(w));
    if ((w.length <= 3 && !curtoMasDistintivo) || STOPWORDS.has(lower) || seen.has(lower)) return;
    seen.add(lower);
    if (i > 0 && /^[A-ZÀ-Ú]/.test(w)) proper.push(w);
    else common.push(w);
  });
  return [...proper, ...common].slice(0, n).join(" ");
}

/** Heurística barata: o texto parece inglês? (o índice FTS do Cerebro é português) — exportada para teste */
export function looksEnglish(text: string): boolean {
  const hints = ["will","the","and","with","from","before","after","this","that","who","wins","win","announce","between","over","under","than","into","released","become","confirm"];
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 3) return false;
  const hintSet = new Set(hints);
  const hitCount = words.filter((w) => hintSet.has(w)).length;
  return hitCount >= 2 || hitCount / words.length > 0.2;
}

const normText = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Termos que valem como prova de sobreposição. Regra igual à do `topKeywords`:
 * ≥4 letras, OU sigla/alfanumérico curto (LCK, BTC, T1, BO5) — que costuma ser o
 * termo MAIS distintivo, não o menos. Precisa olhar o token cru (antes de
 * `normText`), porque é a caixa alta que denuncia a sigla.
 */
function usefulTerms(terms: string[]): string[] {
  const kept = terms.filter(
    (t) => t.length >= 4 || /^[A-Z0-9]{2,}$/.test(t) || /^[A-Za-z]+\d+$/.test(t),
  );
  return Array.from(new Set(kept.map(normText).filter(Boolean)));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Quantos termos o texto contém — como PALAVRA INTEIRA, não como pedaço de outra.
 *
 * Era `text.includes(termo)`, e substring pegava coincidência absurda: o mercado
 * "Dota 2: 4ikibamboni vs Inner Circle (BO3) - EPL Masters" casou um artigo sobre
 * depósitos de USDC porque "epl" está dentro de "d(epl)oyer" e "circle" era a
 * empresa de cripto. Dois acidentes ortográficos bastaram para furar a régua de
 * "2+ termos" — quanto mais curto o termo, mais fácil ele se esconder dentro de
 * outra palavra, e o conserto das siglas (LCK, T1, BO3) tornou isso mais provável,
 * não menos. Os dois andam juntos de propósito.
 */
function matchCount(text: string, nterms: string[]): number {
  return nterms.reduce(
    (acc, t) => acc + (new RegExp(`(?<![a-z0-9])${escapeRe(t)}(?![a-z0-9])`).test(text) ? 1 : 0),
    0,
  );
}

/** Frescor: notícia de hoje vale ~0.9; decai linearmente até 0 em 21 dias.
 *  Teto < 1 de propósito — desempata hits de mesma relevância, mas NUNCA
 *  atropela um hit com um termo a mais (que vale 1.0). Relevância > recência. */
function recencyBoost(date?: string): number {
  if (!date) return 0;
  const ageDays = (Date.now() - new Date(date).getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 0) return 0;
  return 0.9 * Math.max(0, 1 - ageDays / 21);
}

/**
 * Idade máxima da notícia que pode INFLUENCIAR PREÇO.
 *
 * 🔴 Medido em 03/09/2026, e o resultado inverteu a intuição do arquivo. Quando o
 * Cérebro entregava contexto, o desvio da IA em relação ao preço previa o erro do
 * mercado com correlação **−0,35** (IC 95% [−0,51, −0,18], não cruza zero): ou
 * seja, a notícia empurrava a estimativa para o lado ERRADO, de forma sistemática.
 * Sem notícia, o desvio era ruído puro (−0,00). Notícia estava PIORANDO o preço.
 *
 * A causa: a notícia entregue tinha idade mediana de **7 dias**, com casos de 21 e
 * 54. Para um mercado que resolve em dias, isso é informação que o mercado já
 * precificou há uma semana — a IA lia e se ajustava na direção do passado.
 *
 * O ranking priorizava "relevância > recência" de propósito (o bônus de recência é
 * limitado a 0,9 justamente para não atropelar um termo a mais). Essa escolha é
 * boa para EXPLICAR um mercado e ruim para PRECIFICAR: um artigo muito relevante
 * de 54 dias ganha de um razoável de hoje. Por isso o corte é duro, não um peso —
 * peso o ranking já tinha, e não bastou.
 */
const MAX_IDADE_PRECIFICACAO_DIAS = 3;

/** O artigo é fresco o bastante para mexer em preço? Sem data, não arriscamos. */
export function noticiaFresca(date: string | undefined, maxDias = MAX_IDADE_PRECIFICACAO_DIAS): boolean {
  if (!date) return false;
  const idade = (Date.now() - new Date(date).getTime()) / 86_400_000;
  return Number.isFinite(idade) && idade >= 0 && idade <= maxDias;
}

/** Re-rank barato sem LLM: ordena por nº de termos da consulta presentes no
 *  título+resumo (sínteses ganham meio ponto) + bônus de frescor. É o que
 *  salva a relevância do fallback OR e faz a notícia recente subir. Exportada p/ teste. */
export function rankHits<T extends { title: string; summary: string; kind?: string; date?: string }>(hits: T[], terms: string[]): T[] {
  const nterms = usefulTerms(terms);
  if (nterms.length === 0) return hits;
  const score = (h: T) => {
    const overlap = matchCount(normText(`${h.title} ${h.summary}`), nterms);
    return overlap + (h.kind === "síntese" ? 0.5 : 0) + recencyBoost(h.date);
  };
  return hits.map((h) => ({ h, s: score(h) })).sort((a, b) => b.s - a.s).map(({ h }) => h);
}

/**
 * O item toca ALGUM termo distintivo da pergunta? Mesmo critério de sobreposição
 * do rankHits, mas como filtro em vez de ordenação — usado para impedir que uma
 * síntese entre no contexto só por ser síntese. Uma síntese de cripto liderando
 * uma pergunta sobre o Lula é ruído bem formatado, e ruído bem formatado é o mais
 * perigoso: parece fonte. Exportada p/ teste.
 */
export function overlapsQuery(
  h: { title: string; summary: string },
  terms: string[],
  minMatches = 2,
): boolean {
  const nterms = usefulTerms(terms);
  if (nterms.length === 0) return true;                 // sem termos distintivos, não dá para filtrar
  const need = Math.min(minMatches, nterms.length);      // não exige mais do que existe
  return matchCount(normText(`${h.title} ${h.summary}`), nterms) >= need;
}

/** Remove duplicatas por título normalizado (mesmo artigo sindicalizado em fontes diferentes). Exportada p/ teste. */
export function dedupeByTitle<T extends { title: string }>(hits: T[]): T[] {
  const seen = new Set<string>();
  return hits.filter((h) => {
    const key = normText(h.title).slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Busca full-text PT: sínteses (maior valor, mais recentes) primeiro, depois artigos recentes.
 *  op: plfts = AND de todos os termos (precisão) · wfts = websearch, aceita "or" (recall) */
async function queryCerebro(kw: string, op: "plfts" | "wfts" = "plfts"): Promise<CerebroHit[]> {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const enc = encodeURIComponent(kw);

  const [synthRes, artRes] = await Promise.allSettled([
    fetch(`${SUPABASE_URL}/rest/v1/cerebro_analyses?fts=${op}(portuguese).${enc}&status=eq.active&select=title,content,wiki_date&order=wiki_date.desc&limit=3`, { headers, signal: AbortSignal.timeout(6_000) }),
    fetch(`${SUPABASE_URL}/rest/v1/cerebro_articles?fts=${op}(portuguese).${enc}&status=eq.active&select=title,summary,source,published_at&order=published_at.desc&limit=6`, { headers, signal: AbortSignal.timeout(6_000) }),
  ]);

  const hits: CerebroHit[] = [];
  if (synthRes.status === "fulfilled" && synthRes.value.ok) {
    const rows = await synthRes.value.json() as Array<{ title: string; content: string; wiki_date: string | null }>;
    for (const r of rows) hits.push({ title: r.title, summary: (r.content ?? "").slice(0, 400), source: "Cerebro IA", kind: "síntese", date: r.wiki_date ?? undefined });
  }
  if (artRes.status === "fulfilled" && artRes.value.ok) {
    const rows = await artRes.value.json() as Array<{ title: string; summary: string | null; source: string; published_at: string | null }>;
    for (const r of rows) hits.push({ title: r.title, summary: (r.summary ?? "").slice(0, 250), source: r.source, kind: "artigo", date: r.published_at ?? undefined });
  }
  return hits;
}

/** Último recurso do RAG: Haiku expande a consulta em termos PT correlatos
 *  (entidades, sinônimos). Só roda em miss total; cache 24h por consulta. */
async function expandQueryTerms(text: string): Promise<string[]> {
  const key = `rag-expand:${text.toLowerCase().replace(/\s+/g, " ").slice(0, 80)}`;
  const cached = getCache<string[]>(key);
  if (cached !== null) return cached;
  if (!process.env.ANTHROPIC_API_KEY) return [];
  try {
    const raw = await callClaude({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 120,
      timeoutMs: 8_000,
      messages: [{
        role: "user",
        content: `Tema: "${text.slice(0, 200)}"\nListe 4 termos de busca em português (entidades envolvidas, sinônimos, temas correlatos) para achar notícias sobre isso num índice full-text.\nJSON apenas: {"termos":["termo1","termo2","termo3","termo4"]}`,
      }],
    });
    const parsed = extractJson(raw) as { termos?: string[] };
    const termos = (parsed.termos ?? []).filter((t) => typeof t === "string" && t.length >= 4).slice(0, 4);
    setCache(key, termos, 86_400);
    return termos;
  } catch { return []; }
}

/** Intercala dois arrays, dando vez alternada a cada fonte (FTS × semântico). */
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < a.length) out.push(a[i]);
    if (i < b.length) out.push(b[i]);
  }
  return out;
}

/** Busca semântica (embeddings + pgvector): acha artigos relevantes SEM match de
 *  palavra-chave. Retorna [] se embeddings/RPC não estiverem disponíveis (migração
 *  016 ainda não aplicada, ou sem GEMINI_API_KEY) → o FTS assume sozinho. */
/** Abaixo disto nem vale buscar: é o chão de semelhança entre dois textos quaisquer. */
const PISO_SEMANTICO = 0.60;
/** A partir daqui o vetor decide sozinho, sem precisar de confirmação lexical. */
const ALTA_CONFIANCA = 0.65;

async function semanticCerebro(searchText: string): Promise<CerebroHit[]> {
  if (!embeddingsEnabled() || !SUPABASE_URL || !SUPABASE_KEY) return [];
  // Cacheia o VETOR da query (1h): a mesma busca não re-embeda — economiza a cota do
  // Gemini (1000/dia, compartilhada com o backfill) e corta o round-trip de latência.
  const embKey = `rag-embed:${searchText.toLowerCase().replace(/\s+/g, " ").slice(0, 120)}`;
  let vec = getCache<number[]>(embKey);
  if (!vec) {
    vec = await embedText(searchText, "RETRIEVAL_QUERY", 8_000);
    if (vec) setCache(embKey, vec, 3600);
  }
  if (!vec) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/match_cerebro_articles`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      // ⚠️ PISO 0.60 + DUAS FAIXAS, calibrado por MEDIÇÃO (2026-08-31), não por
      // chute. Histórico: 0.40 não filtrava nada (beisebol trazia r/MMA); subiu
      // para 0.65 e passou a matar sinal legítimo. Medido nos dois regimes:
      //    ruído  (MMA p/ beisebol, futebol p/ Valorant) → 0.564–0.573
      //    ruído  ("Fila Amaldiçoada" p/ Valorant)       → 0.587
      //    ruído  (LCS p/ pergunta de LCK)               → 0.593
      //    SINAL  ("Alcaraz anuncia volta" p/ Alcaraz)   → 0.624  ← 0.65 matava
      //    sinal  (Lula p/ pergunta do Lula)             → 0.731–0.741
      //    sinal  (preço do BTC p/ pergunta do BTC)      → 0.744–0.764
      // Ou seja: NÃO existe um piso único que separe os dois grupos. Perguntas
      // de ENTIDADE ("Alcaraz vs Sinner") comprimem a similaridade — o artigo
      // certo fala de OUTRA partida do mesmo torneio, então o vetor fica no meio
      // do caminho. Por isso a decisão virou de duas faixas (ver ALTA_CONFIANCA):
      // acima de 0.65 o vetor decide sozinho; entre 0.60 e 0.65 ele só entra se
      // o texto confirmar uma entidade da pergunta. Abaixo de 0.60 nem busca.
      body: JSON.stringify({ query_embedding: `[${vec.join(",")}]`, match_count: 6, min_similarity: PISO_SEMANTICO }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return []; // RPC ausente (migração não aplicada) → fallback FTS
    const rows = await res.json() as Array<{ title: string; summary: string | null; source: string; published_at: string | null; similarity?: number }>;
    return rows.map((r) => ({
      title: r.title, summary: (r.summary ?? "").slice(0, 250),
      source: r.source, kind: "artigo" as const, date: r.published_at ?? undefined, _semantic: true,
      _sim: typeof r.similarity === "number" ? r.similarity : undefined,
    }));
  } catch { return []; }
}

export async function fetchCerebroContext(
  title: string,
  description?: string,
  /** `true` = o contexto vai INFLUENCIAR PREÇO → só notícia fresca entra.
   *  Padrão `false` porque as telas de análise e o chat EXPLICAM o mercado, e ali
   *  um artigo de duas semanas ainda ajuda a entender. Ver MAX_IDADE_PRECIFICACAO_DIAS. */
  paraPrecificar = false,
): Promise<{ context: string; hits: CerebroHit[] }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { context: "", hits: [] };
  const original = `${title} ${description ?? ""}`.trim();
  if (!original) return { context: "", hits: [] };

  try {
    // Títulos de mercado chegam em inglês, mas o índice FTS é português —
    // traduzir antes de extrair keywords multiplica o recall ("Iran"→"Irã",
    // "withdrawal"→"retirada"). Cache 24h; falha cai no texto original.
    let searchText = original;
    if (looksEnglish(original)) {
      const translated = await translateToPt(original);
      if (translated) searchText = translated;
    }

    const kw = topKeywords(searchText);
    if (!kw) return { context: "", hits: [] };

    // Busca semântica em PARALELO com a cascata FTS (fallback gracioso: [] sem embeddings).
    const semanticP = semanticCerebro(searchText);

    // Cascata precisão→recall: AND de todos os termos; sem hit, OR só dos
    // termos distintivos (websearch); por fim, o termo mais forte (o maior).
    let hits = await queryCerebro(kw);
    let usedFallback = false;
    const words = kw.split(" ");
    if (hits.length === 0 && words.length > 1) {
      const distinctive = words.filter((w) => w.length >= 5).slice(0, 3);
      const orTerms = distinctive.length > 0 ? distinctive : words;
      hits = await queryCerebro(orTerms.join(" or "), "wfts");
      usedFallback = true;
    }
    if (hits.length === 0 && words.length > 1) {
      const strongest = [...words].sort((a, b) => b.length - a.length)[0];
      hits = await queryCerebro(strongest);
      usedFallback = true;
    }
    // Miss total mesmo após tradução e OR: expande a consulta com a IA
    if (hits.length === 0) {
      const expanded = await expandQueryTerms(searchText);
      if (expanded.length > 0) {
        hits = await queryCerebro(expanded.join(" or "), "wfts");
        usedFallback = true;
      }
    }

    // Junta os hits semânticos (embeddings) aos do FTS. Sem embeddings disponíveis,
    // semanticHits é [] e o resultado é IDÊNTICO ao FTS de antes (fallback gracioso).
    const semanticHits = await semanticP;
    if (hits.length === 0 && semanticHits.length === 0) return { context: "", hits: [] };

    // Dedupe + re-rank DENTRO de cada grupo: sínteses (âncora de qualidade) na
    // frente; nos artigos, intercala os do FTS (por sobreposição de termos) com os
    // semânticos (por similaridade) — o semântico NÃO é rebaixado por não ter match
    // de palavra-chave, que é exatamente o ponto dele.
    // ⛔ NADA RELEVANTE > RUÍDO — mas o corte tem que ser fino, não cego.
    // Havia aqui um `if (usedFallback && semanticHits.length === 0) return vazio`.
    // A intenção era certa (contexto irrelevante convida o modelo a inventar),
    // mas ele desistia ANTES do filtro de sobreposição lá embaixo — e levava
    // junto acerto legítimo. Flagrado em 31/08: "Tennis: Alcaraz vs Sinner - US
    // Open" devolvia ZERO enquanto o Cérebro tinha "Alcaraz anuncia volta para
    // defender título" — casava o nome próprio, e mesmo assim ia para o lixo.
    // O corte fino (`relevant`, 2+ termos distintivos) já faz esse trabalho sem
    // efeito colateral, e o `hits.length === 0` no fim garante o mesmo vazio.
    void usedFallback; // mantido: alimenta o log de diagnóstico da cascata

    const deduped = dedupeByTitle([...hits, ...semanticHits]);
    // Sínteses NÃO entram mais incondicionalmente na frente: elas são âncora de
    // qualidade, mas uma síntese de cripto liderando uma pergunta sobre o Lula é
    // ruído bem formatado. Agora concorrem por relevância como o resto.
    // Quem entra no contexto, por origem:
    //  · semântico ACIMA de 0.65 → entra sozinho (faixa provada precisa);
    //  · semântico entre 0.60 e 0.65 → só com confirmação lexical, porque essa
    //    faixa mistura o artigo certo do torneio certo (0.624) com discussão
    //    diária genérica do mesmo subreddit (0.636 — MAIS alto que o sinal!).
    //    O vetor sozinho não separa os dois; o nome próprio separa.
    //  · FTS → sempre precisa de 2+ termos distintivos, porque uma palavra comum
    //    cola qualquer coisa (a pergunta sobre o Lula trazia síntese de cripto,
    //    "El Niño navio" e "Discord Justiça Federal", cada um tocando UM termo).
    const relevant = (h: CerebroHit) =>
      (h._semantic && (h._sim ?? 0) >= ALTA_CONFIANCA) || overlapsQuery(h, words);
    const synth = rankHits(deduped.filter((h) => h.kind === "síntese"), words).filter(relevant);
    const ftsArts = rankHits(deduped.filter((h) => h.kind === "artigo" && !h._semantic), words).filter(relevant);
    // .filter(relevant) TAMBÉM aqui: antes o grupo semântico entrava inteiro sem
    // passar pela régua — era por onde a faixa 0.60–0.65 vazaria sem confirmação.
    const semArts = deduped.filter((h) => h.kind === "artigo" && h._semantic).filter(relevant);
    hits = [...synth, ...interleave(semArts, ftsArts)].slice(0, 6);
    // Corte de frescor SÓ na precificação — medido: notícia velha empurrava a
    // estimativa na direção errada (corr −0,35). Melhor não ter contexto do que
    // ter contexto vencido, porque contexto vencido não é neutro: ele convence.
    if (paraPrecificar) hits = hits.filter((h) => noticiaFresca(h.date));
    if (hits.length === 0) return { context: "", hits: [] };

    const note = "";
    const context = note + hits.map((h, i) => `[C${i + 1}] (${h.kind} · ${h.source}) "${h.title}"\n${h.summary}`).join("\n\n");
    return { context, hits };
  } catch { return { context: "", hits: [] }; }
}

/** Busca o histórico de preço do mercado (snapshots) e calcula momentum. */
export async function fetchMarketMomentum(marketId: string | undefined, source: string): Promise<string> {
  if (!marketId || !SUPABASE_URL || !SUPABASE_KEY) return "";
  const rawId = marketId.replace(/^(poly-|kalshi-|manifold-)/, "");
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
  try {
    const url = `${SUPABASE_URL}/rest/v1/market_snapshots?market_id=eq.${encodeURIComponent(rawId)}&source=eq.${encodeURIComponent(source)}&snapped_at=gte.${since}&select=yes_prob,snapped_at&order=snapped_at.asc`;
    const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return "";
    const rows = await res.json() as Array<{ yes_prob: number; snapped_at: string }>;
    if (rows.length < 3) return "";
    const first = rows[0].yes_prob;
    const last = rows[rows.length - 1].yes_prob;
    const max = Math.max(...rows.map((r) => r.yes_prob));
    const min = Math.min(...rows.map((r) => r.yes_prob));
    const change = last - first;
    const days = Math.round((new Date(rows[rows.length - 1].snapped_at).getTime() - new Date(rows[0].snapped_at).getTime()) / 86_400_000);
    const trend = Math.abs(change) < 3 ? "estável" : change > 0 ? `subindo (+${change.toFixed(0)}pp)` : `caindo (${change.toFixed(0)}pp)`;
    return `TRAJETÓRIA DO MERCADO (${days}d, ${rows.length} snapshots): de ${first.toFixed(0)}% → ${last.toFixed(0)}% — tendência ${trend}. Faixa: ${min.toFixed(0)}%–${max.toFixed(0)}%.`;
  } catch { return ""; }
}

// ── AI Forecast Log (track record + divergências) ───────────────────────────
// Registra cada fair value que a IA gera, para depois medir a calibração real
// da própria IA (Brier) e surfaçar onde ela mais discorda do mercado.
