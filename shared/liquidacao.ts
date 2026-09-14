/**
 * Qual id liquida uma previsão — a regra, num lugar só, para cliente E servidor.
 *
 * POR QUE MORA EM `shared/`. Existem dois caminhos que resolvem previsão de
 * usuário pelo resultado oficial: o cliente (`detectResolutions`, ao abrir o
 * Dashboard) e o servidor (`resolveUserPredictions`, a cada 6 horas, que ainda
 * manda push). Em 14/09/2026 a regra do desfecho foi escrita só no cliente, e o
 * servidor continuou resolvendo tudo pelo `market_id` — com a migration 030 no
 * ar, a primeira previsão de "Aston Villa" que chegasse ao banco levaria o
 * resultado do Barcelona e um push de "✅ Você acertou". Um lint de variável
 * sem uso é que levou até o arquivo do servidor.
 *
 * A REGRA:
 *  · Binária (sem desfecho): o próprio mercado.
 *  · Desfecho do KALSHI: cada desfecho de um evento do Kalshi é um mercado com
 *    ticker e liquidação próprios — o vencedor liquida SIM, os demais NÃO. O
 *    `outcomeId` gravado JÁ é esse ticker, então `kalshi-<outcomeId>` responde
 *    "este desfecho aconteceu?". Só com formato de ticker: quando o cache antigo
 *    não trazia o id, ele caiu no rótulo ("Barcelona"), e rótulo não liquida.
 *    Verificado contra o Kalshi real (mercados já liquidados do mesmo evento:
 *    cada ticker recebeu o próprio resultado).
 *  · Desfecho do POLYMARKET: o id é token de negociação (CLOB), sem mercado
 *    próprio para liquidar → `null`, resolve à mão.
 *
 * ⚠️ NUNCA devolver o id do MERCADO para uma previsão de desfecho. O settlement
 * do mercado é o SIM/NÃO do LÍDER: aplicado a outro desfecho, grava Brier
 * errado marcado como "oficial", sem erro nenhum na tela.
 */

/** Formato de ticker do Kalshi: "KXUCL-27-BAR", "KXPRESNOMD-28-AOC". */
export const TICKER_KALSHI = /^[A-Z0-9]+(?:-[A-Z0-9.]+)+$/;

export function idDeLiquidacao(p: { marketId: string; outcomeId?: string | null }): string | null {
  if (!p.marketId.startsWith("poly-") && !p.marketId.startsWith("kalshi-")) return null;
  if (!p.outcomeId) return p.marketId;
  if (p.marketId.startsWith("kalshi-") && TICKER_KALSHI.test(p.outcomeId)) return `kalshi-${p.outcomeId}`;
  return null;
}
