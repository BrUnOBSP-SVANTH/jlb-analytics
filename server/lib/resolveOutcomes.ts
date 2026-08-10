// ── Resolvedor autoritativo de resultados (em lote) ──────────────────────────
// Busca o RESULTADO OFICIAL de mercados direto na plataforma (settlement), não um
// proxy de preço. É a fonte da verdade do "Comparador entre resultados": o que a
// IA/usuário previu vs. o que a plataforma liquidou.
//
//   • Kalshi   → campo `result` ("yes"/"no") — liquidação oficial da bolsa.
//   • Polymarket → `umaResolutionStatus="resolved"` (oráculo UMA, a verdade que
//     paga as posições) OU preços liquidados EXATOS (1/0), que só ocorrem após a
//     resolução final. 'closed' sozinho NÃO basta: a UMA pode estar em disputa,
//     e disputa inverte o desfecho.
//
// EM LOTE por padrão: as APIs aceitam vários mercados por chamada — Polymarket
// `?closed=true&id=A&id=B…`, Kalshi `?tickers=A,B…` (ambos verificados ao vivo).
// Trocar N chamadas sequenciais por poucas em lote deixa o cron fechar TODOS os
// pendentes por execução, sem throttle, com muito menos pressão de rate-limit.
//
// Retorna resultado só para quem resolveu oficialmente — nunca um palpite: o pior
// caso é "ainda não resolvido" (ausente do mapa), jamais um falso resultado.
import { fetchWithRetry } from "./fetcher.ts";

const POLY_CHUNK = 40;    // ids curtos → URL folgada (~500 chars) por lote
const KALSHI_CHUNK = 25;  // tickers longos → mantém a URL < ~1500 chars

interface GammaMarket {
  id?: string | number; outcomes?: string; outcomePrices?: string;
  closed?: boolean; umaResolutionStatus?: string;
}

/** Tira o prefixo interno (poly-/kalshi-/manifold-) e devolve o id cru da plataforma. */
export function stripPrefix(marketId: string): string {
  return marketId.replace(/^(poly-|kalshi-|manifold-)/, "");
}

/** Fatia um array em pedaços de tamanho `size` (>=1). */
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += Math.max(1, size)) out.push(arr.slice(i, i + Math.max(1, size)));
  return out;
}

// ── Derivação PURA (sem rede) — testável e única fonte da regra de desfecho ────

/**
 * Desfecho oficial do Polymarket. `null` = ainda não resolvido, ou sem liquidação
 * binária clara. O desfecho é "o PRIMEIRO desfecho (índice 0) venceu?" — pois o
 * fair value e o market_prob registrados são P(índice 0). Isso vale para mercados
 * Yes/No, Over/Under, nomes de time, etc. (antes só resolvíamos rótulos "Yes"/"No",
 * perdendo a maioria dos mercados binários e enviesando a estatística).
 */
export function derivePolymarketOutcome(
  closed: boolean | undefined,
  umaResolutionStatus: string | undefined,
  _outcomes: string | undefined,
  outcomePrices: string | undefined,
): boolean | null {
  void _outcomes; // mantido na assinatura por compat; o desfecho vem do preço[0]
  const prices = (safeJson<string[]>(outcomePrices) ?? []).map((p) => parseFloat(p));
  if (prices.length < 2 || prices.some((p) => !isFinite(p))) return null;

  // Autoridade da liquidação: SÓ a resolução final da UMA, ou preços já liquidados
  // EXATAMENTE (vencedor ~1, resto ~0). Durante 'proposed'/'disputed' o preço é o
  // último trade fracionário (ex.: 0.995), então o atalho não dispara antes da hora.
  const umaResolved = umaResolutionStatus === "resolved";
  const pricesSettled = prices.some((p) => p >= 0.9999) && prices.every((p) => p >= 0.9999 || p <= 0.0001);
  if (!umaResolved && !(closed === true && pricesSettled)) return null;

  const p0 = prices[0];                 // P(primeiro desfecho) liquidada
  if (p0 >= 0.99) return true;          // índice 0 venceu
  if (p0 <= 0.01) return false;         // índice 0 perdeu (outro lado venceu)
  return null;                          // não liquidou claramente para um lado
}

/** Desfecho oficial do Kalshi a partir do campo `result`. `null` = não liquidado. */
export function deriveKalshiOutcome(result: string | undefined): boolean | null {
  if (result === "yes") return true;
  if (result === "no") return false;
  return null;                          // "" / undefined = ainda não liquidado
}

// ── Busca EM LOTE com rede ─────────────────────────────────────────────────────

export interface BatchOutcomes {
  outcomes: Map<string, boolean>;   // id → resultado oficial (só os já liquidados)
  unavailable: Set<string>;         // ids que NÃO pudemos consultar (chunk falhou) → deixar pendente
}

/**
 * Resolve uma lista de marketIds (prefixados poly-/kalshi-) pelo resultado oficial,
 * em lote. Retorna `outcomes` (só os que resolveram oficialmente) e `unavailable`
 * (ids de chunks que FALHARAM ao consultar — o chamador deve mantê-los pendentes,
 * NÃO cair num fallback permanente). Manifold e ids sem prefixo são ignorados.
 */
export async function fetchRealOutcomesBatch(marketIds: string[]): Promise<BatchOutcomes> {
  const outcomes = new Map<string, boolean>();
  const unavailable = new Set<string>();
  const polyIds = marketIds.filter((id) => id.startsWith("poly-"));
  const kalshiIds = marketIds.filter((id) => id.startsWith("kalshi-"));
  // Fontes independentes → em paralelo; chunks sequenciais dentro de cada fonte.
  await Promise.all([
    resolvePolymarketBatch(polyIds, outcomes, unavailable),
    resolveKalshiBatch(kalshiIds, outcomes, unavailable),
  ]);
  return { outcomes, unavailable };
}

async function resolvePolymarketBatch(ids: string[], out: Map<string, boolean>, unavailable: Set<string>): Promise<void> {
  for (const group of chunk(ids, POLY_CHUNK)) {
    // rawId → marketId (para remapear a resposta de volta ao id interno).
    const idMap = new Map<string, string>();
    for (const id of group) {
      const raw = stripPrefix(id).replace(/[^a-zA-Z0-9_-]/g, "");
      if (raw) idMap.set(raw, id);
    }
    if (idMap.size === 0) continue;
    const q = Array.from(idMap.keys()).map((raw) => `id=${encodeURIComponent(raw)}`).join("&");
    try {
      const markets = await fetchWithRetry<GammaMarket[]>(
        `https://gamma-api.polymarket.com/markets?closed=true&limit=100&${q}`,
      );
      for (const m of markets ?? []) {
        const marketId = idMap.get(String(m.id));
        if (!marketId) continue;
        const outcome = derivePolymarketOutcome(m.closed, m.umaResolutionStatus, m.outcomes, m.outcomePrices);
        if (outcome !== null) out.set(marketId, outcome);
      }
    } catch {
      // Chunk falhou (rede/timeout): NÃO sabemos o resultado. Marca como indisponível
      // para o chamador NÃO cair no fallback 'inferred' (permanente e possivelmente errado).
      for (const id of group) unavailable.add(id);
    }
  }
}

async function resolveKalshiBatch(ids: string[], out: Map<string, boolean>, unavailable: Set<string>): Promise<void> {
  for (const group of chunk(ids, KALSHI_CHUNK)) {
    const idMap = new Map<string, string>();
    for (const id of group) {
      const raw = stripPrefix(id).replace(/[^A-Za-z0-9_-]/g, "");
      if (raw) idMap.set(raw, id);
    }
    if (idMap.size === 0) continue;
    const tickers = Array.from(idMap.keys()).join(",");
    try {
      const data = await fetchWithRetry<{ markets?: Array<{ ticker?: string; result?: string }> }>(
        `https://api.elections.kalshi.com/trade-api/v2/markets?limit=100&tickers=${encodeURIComponent(tickers)}`,
        { Accept: "application/json" },
      );
      for (const m of data?.markets ?? []) {
        const marketId = m.ticker ? idMap.get(m.ticker) : undefined;
        if (!marketId) continue;
        const outcome = deriveKalshiOutcome(m.result);
        if (outcome !== null) out.set(marketId, outcome);
      }
    } catch {
      for (const id of group) unavailable.add(id);
    }
  }
}

function safeJson<T>(raw?: string): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
