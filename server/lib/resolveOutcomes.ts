// ── Resolvedor autoritativo de resultados ────────────────────────────────────
// Busca o RESULTADO OFICIAL de um mercado direto na plataforma (settlement),
// não um proxy de preço. É a fonte da verdade do nosso "Comparador entre
// resultados": o que a IA/usuário previu vs. o que a plataforma liquidou.
//
//   • Kalshi   → campo `result` ("yes"/"no") — liquidação oficial da bolsa.
//   • Polymarket → `umaResolutionStatus="resolved"`/`closed` + preços liquidados
//     (o vencedor vai a ~1.00). Oráculo UMA, a mesma verdade que paga as posições.
//
// Reusa a MESMA lógica das rotas de detalhe (routes/kalshi.ts, routes/polymarket.ts)
// para não divergir. Retorna `null` sempre que não dá pra afirmar com certeza —
// nunca um palpite: o pior caso é "ainda não resolvido", jamais um falso resultado.
import { fetchJSON } from "./fetcher.ts";

export interface RealOutcome {
  outcome: boolean;            // true = SIM venceu, false = NÃO venceu
  source: "settled";          // procedência: resultado oficial da plataforma
}

interface GammaMarket {
  id?: string; outcomes?: string; outcomePrices?: string;
  closed?: boolean; umaResolutionStatus?: string;
}
interface KalshiMarketResp { market?: { ticker?: string; status?: string; result?: string } }

/** Tira o prefixo interno (poly-/kalshi-/manifold-) e devolve o id cru da plataforma. */
export function stripPrefix(marketId: string): string {
  return marketId.replace(/^(poly-|kalshi-|manifold-)/, "");
}

// ── Derivação PURA (sem rede) — testável e única fonte da regra de desfecho ────

/**
 * Desfecho oficial do Polymarket a partir do estado do mercado. `null` = ainda
 * não resolvido, ou resolvido sem vencedor binário claro (multi-resultado).
 */
export function derivePolymarketOutcome(
  closed: boolean | undefined,
  umaResolutionStatus: string | undefined,
  outcomes: string | undefined,
  outcomePrices: string | undefined,
): boolean | null {
  const resolved = closed === true || umaResolutionStatus === "resolved";
  if (!resolved) return null;
  const labels = safeJson<string[]>(outcomes) ?? [];
  const prices = (safeJson<string[]>(outcomePrices) ?? []).map((p) => parseFloat(p));
  const win = prices.findIndex((p) => p >= 0.99);   // vencedor liquida em ~1.00
  if (win < 0) return null;                         // fechado mas sem preço liquidado ainda
  const label = labels[win];
  if (label === "Yes") return true;
  if (label === "No") return false;
  return null;                                      // rótulo desconhecido / multi-resultado
}

/** Desfecho oficial do Kalshi a partir do campo `result`. `null` = não liquidado. */
export function deriveKalshiOutcome(result: string | undefined): boolean | null {
  if (result === "yes") return true;
  if (result === "no") return false;
  return null;                                      // "" / undefined = ainda não liquidado
}

// ── Busca com rede ────────────────────────────────────────────────────────────

/**
 * Retorna o resultado OFICIAL do mercado, ou `null` se ainda não resolveu / não
 * dá pra determinar / não se aplica (Manifold é play-money, não pontua).
 */
export async function fetchRealOutcome(source: string, marketId: string): Promise<RealOutcome | null> {
  const rawId = stripPrefix(marketId);
  try {
    if (source === "polymarket") {
      const id = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
      if (!id) return null;
      const m = await fetchJSON<GammaMarket>(`https://gamma-api.polymarket.com/markets/${id}`);
      if (!m || !m.id) return null;
      const outcome = derivePolymarketOutcome(m.closed, m.umaResolutionStatus, m.outcomes, m.outcomePrices);
      return outcome === null ? null : { outcome, source: "settled" };
    }

    if (source === "kalshi") {
      const ticker = rawId.replace(/[^A-Za-z0-9_-]/g, "");
      if (!ticker) return null;
      const data = await fetchJSON<KalshiMarketResp>(
        `https://api.elections.kalshi.com/trade-api/v2/markets/${ticker}`,
        { Accept: "application/json" },
      );
      const outcome = deriveKalshiOutcome(data?.market?.result);
      return outcome === null ? null : { outcome, source: "settled" };
    }

    return null;                                     // manifold (play-money) e outros: não pontuam
  } catch {
    return null;                                     // rede/timeout/HTTP: trata como "ainda não sei", nunca chuta
  }
}

function safeJson<T>(raw?: string): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
