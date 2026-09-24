/**
 * Tradução dos títulos de mercado EN→pt-BR.
 *
 * O QUE ACONTECIA (Auditoria 21/09, DAD-05).
 *
 * Quem traduzia era o endpoint NÃO OFICIAL do Google (`client=gtx`) com o
 * MyMemory de reserva, e o resultado ficava só em memória por 24 h — some a cada
 * deploy. Três defeitos que a tela mostrava:
 *
 *  1. O SENTIDO INVERTIDO. "CNN, Politico, or MS NOW unbanned from White House
 *     press pool" virava "…BANIDOS da Casa Branca": o contrário do que o mercado
 *     pergunta. Quem lê o card decide dinheiro fictício em cima disso.
 *  2. NOME PRÓPRIO TRADUZIDO. "Giants vs. Rams" saía "Gigantes vs. Carneiros";
 *     "(HIGH) $3.0T" perdia o patamar, que é o que separa um mercado do irmão.
 *  3. PORTUGUÊS DE PORTUGAL ("Irão") e "by September 30" como "POR 30 de
 *     setembro" — em mercado de prazo, "por" e "até" não são a mesma coisa.
 *
 * AGORA. Quem traduz é a cadeia de IA do site (Anthropic → Gemini → Groq, a
 * mesma do resto), com as regras acima escritas no prompt, e cada título é
 * traduzido UMA VEZ NA VIDA: o resultado fica em `traducoes_mercado`. O gtx
 * continua no fim da fila, para quando não há IA disponível.
 *
 * DUAS TRAVAS QUE IMPORTAM:
 *  · a resposta da IA é CONFERIDA antes de virar tela (`ehTraducaoUtil`): se
 *    sumiu um número do original, se voltou igual, se voltou um romance no lugar
 *    de um título — não é tradução, é `null`, e o card mostra o original;
 *  · `/api/translate/lote` é rota PÚBLICA e sem login. Sem teto, qualquer um
 *    gastaria a cota de IA do site mandando texto inventado. O teto do dia é
 *    contado NO BANCO (linhas novas em `traducoes_mercado`), como o resto do
 *    orçamento — contador em memória zera a cada partida do servidor.
 */
import { createHash } from "node:crypto";
import { getCache, setCache } from "./cache.ts";
import { fetchJSON } from "./fetcher.ts";
import { callClaude } from "./anthropic.ts";
import { extractJson } from "./extractJson.ts";
import { contarHoje, restanteDoDia } from "./orcamentoIA.ts";
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "./supabaseRest.ts";
import { log } from "./log.ts";

/** Títulos NOVOS por dia. O catálogo inteiro tem ~600; depois do primeiro dia
 *  quase tudo já está salvo, então isto só limita abuso da rota pública. */
export const TETO_TRADUCOES_DIA = 500;

/** Títulos por chamada de IA. Acima disso a resposta trunca no meio do JSON. */
const POR_CHAMADA = 20;

/** Chamadas de IA ao mesmo tempo. Ver o comentário em `traduzirLote`: o limite
 *  por minuto do Gemini grátis é o que manda aqui, não a nossa pressa. */
const CONCORRENCIA = 2;

/**
 * Quanto o request espera pela IA. ZERO, de propósito.
 *
 * MEDIDO em 22/09: com todos os títulos já traduzidos a resposta sai em 0,0 s;
 * bastou UM título novo no mesmo lote para ela levar 3,2 s — e até 9 s no pior
 * caso. Ou seja, um mercado recém-listado atrasava a tradução dos outros 39 que
 * já estavam prontos, e a tela inteira ficava em inglês esperando por ele.
 *
 * Então o request devolve na hora o que já sabe, e o título novo é traduzido em
 * segundo plano — volta pronto na próxima visita, e antes disso a tarefa de
 * `traducaoCatalogo.ts` já costuma ter traduzido. Quem tem tempo é o cron; o
 * visitante, não.
 */
const PRAZO_DO_REQUEST_MS = Number(process.env.JLB_PRAZO_TRADUCAO_MS ?? 0);

const MAX_CHARS = 500;

export function hashDoTexto(texto: string): string {
  return createHash("sha256").update(texto.trim()).digest("hex");
}

function isTranslationError(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("mymemory warning") || t.includes("quota") ||
    t.includes("you used all") || t.includes("invalid language pair") ||
    t.includes("must be shorter than") || t.startsWith("http");
}

/**
 * Português de Portugal que escapa do prompt, corrigido por PALAVRA INTEIRA.
 *
 * ⚠️ "Irão" é o caso delicado, e é por isso que a regra olha a maiúscula: com
 * inicial minúscula é o futuro do verbo ir ("eles irão decidir"). Trocar por
 * substring — o erro que já mordeu este projeto quatro vezes — escreveria
 * "eles Irã decidir".
 *
 * ⚠️ E SÓ ENTRA AQUI TROCA QUE NÃO MEXE EM CONCORDÂNCIA. A primeira versão desta
 * lista trocava "equipa" por "time" — e escrevia "A time joga em casa", porque o
 * artigo que veio antes concorda com a palavra que saiu. Corretor que escreve
 * errado é pior do que o erro que ele veio corrigir. Palavra de gênero diferente
 * fica para o prompt resolver; aqui só nome próprio e troca de mesmo gênero.
 */
const PT_PT: Array<[RegExp, string]> = [
  [/\bIrão\b/g, "Irã"],
  [/\bTeerão\b/g, "Teerã"],
  [/\butilizador\b/g, "usuário"],
  [/\butilizadores\b/g, "usuários"],
];

export function normalizarPtBr(texto: string): string {
  let saida = texto;
  for (const [de, para] of PT_PT) saida = saida.replace(de, para);
  return saida;
}

/**
 * Os números do original sobreviveram?
 *
 * "Will Anthropic's valuation hit (HIGH) $3.0T by December 31?" sem o "3.0" não
 * é o mesmo mercado — é o mercado irmão. Compara ignorando o separador decimal,
 * porque trocar ponto por vírgula é justamente o certo em pt-BR ("21.5" → "21,5").
 */
export function numerosPreservados(original: string, traducao: string): boolean {
  const numeros = (s: string) => (s.match(/\d[\d.,]*\d|\d/g) ?? []).map((n) => n.replace(/[.,]/g, ""));
  const naTraducao = numeros(traducao);
  return numeros(original).every((n) => naTraducao.includes(n));
}

/**
 * A resposta é uma tradução de verdade — vale guardar?
 *
 * Confiável NÃO quer dizer diferente: título que já estava em português volta
 * igual, e essa é a resposta CERTA. Guardá-la é o que impede de perguntar de
 * novo à IA todo dia pelo mesmo título.
 */
export function ehTraducaoConfiavel(original: string, traducao: string | null | undefined): boolean {
  const t = (traducao ?? "").trim();
  if (!t) return false;
  if (isTranslationError(t)) return false;
  // Título traduzido não vira parágrafo: a IA às vezes explica em vez de traduzir.
  if (t.length > Math.max(80, original.length * 2.2)) return false;
  return numerosPreservados(original, t);
}

/**
 * "Tradução" que só mexeu na pontuação é o mesmo texto.
 *
 * MEDIDO na primeira rodada com a IA de verdade (22/09): "Map 2 Total Rounds:
 * Over/Under 21.5" voltou como "Map 2 Total Rounds: Over/Under 21,5" — o modelo
 * trocou o separador decimal e mais nada. Como as strings são diferentes, isso
 * passaria na conferência e o card desenharia o título DUAS VEZES, que é
 * exatamente o defeito MKT-01 de volta, disfarçado de vírgula.
 */
function praticamenteIgual(a: string, b: string): boolean {
  // Faixa à-ÿ em vez de \p{L}: a config de TS deste projeto não aceita escape
  // de propriedade unicode, e ela cobre todo acento do português.
  const so = (s: string) => s.toLowerCase().replace(/[^0-9a-zà-ÿ]/g, "");
  return so(a) === so(b);
}

/**
 * Isto pode ir para a TELA?
 *
 * A regra do `null` vem de MKT-01: tradução que falhou NÃO devolve o original
 * fingindo, senão o card desenha o mesmo título duas vezes — foi o que
 * aconteceu em todo card do site, e no tema claro a segunda linha saía com
 * contraste 1,71:1.
 */
export function ehTraducaoUtil(original: string, traducao: string | null | undefined): boolean {
  if (!ehTraducaoConfiavel(original, traducao)) return false;
  return !praticamenteIgual((traducao ?? "").trim(), original.trim());
}

/** O prompt. As regras são os defeitos que a auditoria fotografou, um a um. */
export function montarPromptDeTraducao(textos: readonly string[]): string {
  const lista = textos.map((t, i) => `${i + 1}. ${t}`).join("\n");
  return `Traduza para PORTUGUÊS DO BRASIL os títulos de mercados de previsão abaixo.

REGRAS (cada uma corrige um erro real de tradução automática):
- NÃO traduza nome próprio: pessoas, times, empresas, ligas, siglas, moedas e tickers.
  "Giants vs. Rams" continua "Giants vs. Rams" — nunca "Gigantes vs. Carneiros".
- Mas TERMO COMUM de esporte e aposta NÃO é nome próprio, e deve ser traduzido:
  "Total Rounds" = "Total de Rounds", "Over/Under" = "Mais/Menos",
  "Winner" = "Vencedor", "Map 2" = "Mapa 2", "Spread" = "Handicap".
- NÃO inverta o sentido. "unbanned" é "readmitido/liberado", não "banido".
  Preste atenção em prefixos de negação (un-, de-, non-) e em "fail to".
- "by <data>" é "até <data>", nunca "por <data>". Em mercado de prazo os dois
  querem dizer coisas diferentes.
- PRESERVE todos os números, patamares e símbolos exatamente: "(HIGH) $3.0T",
  "21.5", "25 bps". Pode trocar o separador decimal para vírgula ("21,5").
- Português do BRASIL: "Irã" (não "Irão"), "time" (não "equipa").
- MOEDA: o cifrão do original é DÓLAR. Em português, "$110" se lê como REAL —
  escreva "US$ 110". O número não muda; só o símbolo ganha a marca da moeda.
- Traduza só o título. Não explique, não comente, não acrescente contexto.
- Se o título já estiver em português, repita-o igual.

TÍTULOS:
${lista}

Responda APENAS com um objeto JSON, sem texto antes ou depois, no formato:
{"1": "tradução do 1", "2": "tradução do 2"}`;
}

/**
 * Casa a resposta da IA com os textos pedidos, jogando fora o que não passa na
 * conferência. A IA erra a contagem, inventa chave, devolve string vazia — e
 * nada disso pode virar título na tela.
 */
export function interpretarRespostaDaIA(
  bruto: string,
  textos: readonly string[],
): Record<string, string> {
  let objeto: Record<string, unknown>;
  try { objeto = extractJson(bruto); } catch { return {}; }

  const saida: Record<string, string> = {};
  textos.forEach((texto, i) => {
    const valor = objeto[String(i + 1)];
    if (typeof valor !== "string") return;
    const limpa = normalizarPtBr(valor.trim());
    if (ehTraducaoConfiavel(texto, limpa)) saida[texto] = limpa;
  });
  return saida;
}

// ── Persistência: cada título é traduzido uma vez na vida ────────────────────

async function lerSalvas(textos: readonly string[]): Promise<Record<string, string>> {
  if (!SUPABASE_URL || !SUPABASE_KEY || textos.length === 0) return {};
  const porHash = new Map(textos.map((t) => [hashDoTexto(t), t]));
  try {
    const lista = Array.from(porHash.keys()).join(",");
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/traducoes_mercado?hash=in.(${lista})&select=hash,traducao`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!r.ok) return {};
    const linhas = await r.json() as Array<{ hash: string; traducao: string }>;
    const saida: Record<string, string> = {};
    for (const l of linhas) {
      const original = porHash.get(l.hash);
      // Devolve TUDO que está salvo, inclusive a tradução idêntica ao original
      // (título que já estava em português). Quem filtra o que vai para a tela é
      // quem chama — aqui, esconder a linha faria o título voltar para a fila da
      // IA todo dia.
      if (original && ehTraducaoConfiavel(original, l.traducao)) saida[original] = l.traducao;
    }
    return saida;
  } catch { return {}; }
}

async function salvar(novas: Record<string, string>, modelo: string): Promise<void> {
  const linhas = Object.entries(novas).map(([original, traducao]) => ({
    hash: hashDoTexto(original), original, traducao, modelo,
  }));
  if (!SUPABASE_URL || !SUPABASE_KEY || linhas.length === 0) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/traducoes_mercado?on_conflict=hash`, {
      method: "POST",
      headers: supaWriteHeaders(),
      body: JSON.stringify(linhas),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    log.warn("translate", `não consegui salvar ${linhas.length} traduções: ${String(e)}`);
  }
}

// ── Último recurso: os tradutores externos ───────────────────────────────────

async function tryGoogleTranslate(text: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt-BR&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const data = await r.json() as Array<unknown>;
    const chunks = (data[0] as Array<[string]> | null) ?? [];
    const result = chunks.map((c) => c[0] ?? "").join("").trim();
    return result && !isTranslationError(result) ? result : null;
  } catch { return null; }
}

async function tryMyMemory(text: string): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|pt-BR`;
    interface MyMemoryResponse { responseData: { translatedText: string }; responseStatus: number }
    const data = await fetchJSON<MyMemoryResponse>(url);
    if (data.responseStatus !== 200) return null;
    const result = data.responseData?.translatedText?.trim() ?? "";
    return result && !isTranslationError(result) ? result : null;
  } catch { return null; }
}

/** Os externos traduzem pior (é o defeito deste achado), então vêm por último e
 *  só para o que a IA não cobriu. */
async function traduzirPorFora(textos: readonly string[]): Promise<Record<string, string>> {
  const saida: Record<string, string> = {};
  await Promise.all(textos.map(async (t) => {
    const r = await tryGoogleTranslate(t) ?? await tryMyMemory(t);
    const limpa = r ? normalizarPtBr(r) : null;
    if (limpa && ehTraducaoUtil(t, limpa)) saida[t] = limpa;
  }));
  return saida;
}

// ── A porta ──────────────────────────────────────────────────────────────────

const chaveDeCache = (t: string) => `translate:${t}`;

/** Só o que tem o que mostrar: título já em português sai da resposta. */
function apenasAsUteis(mapa: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(mapa).filter(([t, v]) => ehTraducaoUtil(t, v)));
}

export interface ResultadoDeTraducao {
  /** Só o que traduziu DE VERDADE. */
  traducoes: Record<string, string>;
  /**
   * Títulos que estão sendo traduzidos AGORA, em segundo plano.
   *
   * Existe por causa do cliente: ele guarda "não há tradução" para não insistir
   * à toa, e sem esta lista guardaria isso para um título que vai ficar pronto
   * daqui a alguns segundos — deixando-o em inglês pelo resto da sessão, que é
   * a versão nova do mesmo defeito que este achado veio corrigir.
   */
  pendentes: string[];
}

/**
 * Traduz a lista inteira. Texto ausente de `traducoes` significa "mostre o
 * original", nunca "mostre duas vezes".
 */
export async function traduzirLote(
  entrada: readonly string[],
  prazoMs = PRAZO_DO_REQUEST_MS,
): Promise<ResultadoDeTraducao> {
  const textos = Array.from(new Set(
    entrada.map((t) => String(t ?? "").trim().slice(0, MAX_CHARS)).filter(Boolean),
  ));
  if (textos.length === 0) return { traducoes: {}, pendentes: [] };

  // `sabido` é tudo que já temos resposta para — inclusive a resposta "este
  // título já está em português", que é idêntica ao original e não vai para a
  // tela. Misturar as duas coisas foi o que faria a IA ser consultada de novo
  // todo dia pelos mesmos títulos.
  const sabido: Record<string, string> = {};
  const faltando: string[] = [];

  // 1. Memória do processo (barato, vale para a rajada de cards da mesma tela).
  for (const t of textos) {
    const guardado = getCache<string>(chaveDeCache(t));
    if (guardado) sabido[t] = guardado;
    else faltando.push(t);
  }

  // 2. O que já foi traduzido alguma vez na vida.
  const aindaFalta: string[] = [];
  if (faltando.length > 0) {
    const salvas = await lerSalvas(faltando);
    for (const t of faltando) {
      if (salvas[t]) { sabido[t] = salvas[t]; setCache(chaveDeCache(t), salvas[t], 86_400); }
      else aindaFalta.push(t);
    }
  }
  if (aindaFalta.length === 0) return { traducoes: apenasAsUteis(sabido), pendentes: [] };

  // 3. Título novo custa IA — e a rota é pública. Teto do dia contado no banco.
  const restante = restanteDoDia(TETO_TRADUCOES_DIA, await contarHoje("traducoes_mercado", "criado_em"));
  const novos = aindaFalta.slice(0, restante);
  if (novos.length < aindaFalta.length) {
    log.warn("translate", `teto do dia: ${aindaFalta.length - novos.length} títulos ficam em inglês`);
  }
  if (novos.length === 0) return { traducoes: apenasAsUteis(sabido), pendentes: [] };

  // 4. Os pedaços vão JUNTOS, não em fila: 40 títulos são duas chamadas em
  // paralelo, e a espera é a de uma só. Cada pedaço guarda o que traduziu assim
  // que termina — quem não couber no prazo abaixo continua e fica pronto para a
  // próxima visita, em vez de se perder.
  const traduzidas: Record<string, string> = {};
  const pedacos: string[][] = [];
  for (let i = 0; i < novos.length; i += POR_CHAMADA) pedacos.push(novos.slice(i, i + POR_CHAMADA));

  const umPedaco = async (pedaco: string[]) => {
    let lote: Record<string, string> = {};
    try {
      let provedor = "anthropic";
      const bruto = await callClaude({
        model: "claude-haiku-4-5-20251001",
        maxTokens: 2000,
        messages: [{ role: "user", content: montarPromptDeTraducao(pedaco) }],
        timeoutMs: 25_000,
        onProvider: (p) => { provedor = p; },
      });
      lote = interpretarRespostaDaIA(bruto, pedaco);
      if (Object.keys(lote).length > 0) await salvar(lote, provedor);
    } catch (e) {
      log.warn("translate", `IA não traduziu ${pedaco.length} títulos: ${String(e)}`);
    }

    // O que a IA não cobriu (sem chave, cota estourada, JSON quebrado) cai nos
    // tradutores externos — que traduzem pior, e por isso vêm por último.
    const semIA = pedaco.filter((t) => !lote[t]);
    if (semIA.length > 0) {
      const porFora = await traduzirPorFora(semIA);
      Object.assign(lote, porFora);
      if (Object.keys(porFora).length > 0) await salvar(porFora, "gtx");
    }

    for (const [t, v] of Object.entries(lote)) {
      setCache(chaveDeCache(t), v, 86_400);
      traduzidas[t] = v;
    }
  };

  // ⚠️ DOIS LOTES POR VEZ, não todos de uma vez. MEDIDO em 22/09: a
  // pré-tradução do catálogo disparou 6 chamadas simultâneas, estourou o limite
  // POR MINUTO do Gemini grátis, caiu no Groq — que já estava no teto do dia — e
  // 25 dos 120 títulos ficaram sem tradução. O request do visitante nunca tem
  // mais de dois lotes (40 títulos), então para ele nada muda; quem se comporta
  // é a tarefa de fundo, que é justamente quem tem tempo de sobra.
  const trabalho = (async () => {
    for (let i = 0; i < pedacos.length; i += CONCORRENCIA) {
      await Promise.all(pedacos.slice(i, i + CONCORRENCIA).map(umPedaco));
    }
  })().catch((e) => {
    // O trabalho continua depois que o request já respondeu: uma exceção aqui
    // não tem quem a pegue e derrubaria o processo inteiro (unhandled rejection).
    log.warn("translate", `lote em segundo plano falhou: ${String(e)}`);
  });

  // ⏱️ PRAZO DO REQUEST. O plano grátis do Render dá 0,1 CPU e a tradução
  // depende de um provedor externo: medido em 22/09, sete títulos novos levaram
  // 11,2 s pelo Gemini. Segurar a tela do visitante por isso é pior do que
  // mostrar o título em inglês por uma visita. Então o request espera um prazo
  // curto, entrega o que chegou, e o resto termina em segundo plano e já está
  // salvo na próxima vez — cada título custa essa espera UMA vez na vida.
  await Promise.race([trabalho, new Promise((ok) => setTimeout(ok, prazoMs))]);

  return {
    traducoes: apenasAsUteis({ ...sabido, ...traduzidas }),
    // Os que o prazo não esperou continuam sendo traduzidos agora mesmo.
    pendentes: novos.filter((t) => !traduzidas[t]),
  };
}

/**
 * Um texto só. Mantida para o RAG do Cerebro, que traduz o título do mercado
 * antes da busca full-text (o índice é português; keyword em inglês zera o
 * recall).
 *
 * Aqui o prazo é generoso de propósito: quem espera é uma tarefa de fundo, não
 * uma tela aberta. Devolver `null` cedo custaria o recall da busca inteira.
 */
export async function translateToPt(text: string): Promise<string | null> {
  const trimmed = text.trim().slice(0, MAX_CHARS);
  if (!trimmed) return null;
  const { traducoes } = await traduzirLote([trimmed], 30_000);
  return traducoes[trimmed] ?? null;
}
