// ── Cerebro: base de conhecimento proprietária (Supabase REST) ───────────────
// Cruza o mercado com artigos curados + sínteses IA. Também lê snapshots para
// calcular o momentum do mercado. Extraído de routes/ai.ts.
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseRest.ts";
import { translateToPt } from "./translate.ts";
import { getCache, setCache } from "./cache.ts";
import { callClaude } from "./anthropic.ts";
import { extractJson } from "./extractJson.ts";

interface CerebroHit { title: string; summary: string; source: string; kind: "síntese" | "artigo"; date?: string }

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
    if (w.length <= 3 || STOPWORDS.has(lower) || seen.has(lower)) return;
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

/** Frescor: notícia de hoje vale ~0.9; decai linearmente até 0 em 21 dias.
 *  Teto < 1 de propósito — desempata hits de mesma relevância, mas NUNCA
 *  atropela um hit com um termo a mais (que vale 1.0). Relevância > recência. */
function recencyBoost(date?: string): number {
  if (!date) return 0;
  const ageDays = (Date.now() - new Date(date).getTime()) / 86_400_000;
  if (!Number.isFinite(ageDays) || ageDays < 0) return 0;
  return 0.9 * Math.max(0, 1 - ageDays / 21);
}

/** Re-rank barato sem LLM: ordena por nº de termos da consulta presentes no
 *  título+resumo (sínteses ganham meio ponto) + bônus de frescor. É o que
 *  salva a relevância do fallback OR e faz a notícia recente subir. Exportada p/ teste. */
export function rankHits<T extends { title: string; summary: string; kind?: string; date?: string }>(hits: T[], terms: string[]): T[] {
  const nterms = Array.from(new Set(terms.map(normText).filter((t) => t.length >= 4)));
  if (nterms.length === 0) return hits;
  const score = (h: T) => {
    const text = normText(`${h.title} ${h.summary}`);
    const overlap = nterms.reduce((acc, t) => acc + (text.includes(t) ? 1 : 0), 0);
    return overlap + (h.kind === "síntese" ? 0.5 : 0) + recencyBoost(h.date);
  };
  return hits.map((h) => ({ h, s: score(h) })).sort((a, b) => b.s - a.s).map(({ h }) => h);
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

export async function fetchCerebroContext(title: string, description?: string): Promise<{ context: string; hits: CerebroHit[] }> {
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

    if (hits.length === 0) return { context: "", hits: [] };
    // Dedupe + re-rank por sobreposição de termos DENTRO de cada grupo:
    // sínteses continuam na frente (são o ancoradouro de qualidade — misturar
    // deixava artigo-ruído com 2 termos genéricos passar na frente delas).
    const deduped = dedupeByTitle(hits);
    hits = [
      ...rankHits(deduped.filter((h) => h.kind === "síntese"), words),
      ...rankHits(deduped.filter((h) => h.kind === "artigo"), words),
    ].slice(0, 6);
    // Match de fallback é mais fraco — avisa o modelo para filtrar por relevância
    const note = usedFallback
      ? "(correspondência parcial por palavra-chave — use APENAS itens diretamente relevantes ao tema; ignore o resto)\n\n"
      : "";
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
