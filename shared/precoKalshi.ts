/**
 * O preço do Kalshi em pontos percentuais — a escala, dita num lugar só.
 *
 * O QUE ACONTECIA (14/09/2026). Quatro lugares liam o `yesProb` do cache do
 * Kalshi com a mesma adivinhação: `yesProb > 1 ? yesProb : yesProb * 100`, isto
 * é, "se for maior que 1 já está em %, senão está em 0–1". Só que o cache do
 * Kalshi está SEMPRE em % — `kalshiYesProb` (server/lib/marketNormalize.ts)
 * devolve de 0,1 a 99,9. A adivinhação erra justamente na faixa em que um
 * mercado está quase decidido:
 *
 *   · 0,8% virava 80%   → a sugestão das SUAS previsões dizia "provável SIM";
 *   · 1,0% virava 100%  → o track record da IA e os Duelos liquidariam SIM um
 *                          mercado que o próprio Kalshi dava como NÃO;
 *   · 0,5% virava 50%   → a lista pública de divergências mostraria a IA
 *                          discordando de um preço que não existe.
 *
 * Adivinhar escala pelo valor é o mesmo defeito de casar token por substring:
 * funciona no caso comum e falha calado na borda. A escala vem da ORIGEM, não
 * do número — por isso o nome da função diz de onde o dado veio.
 */

/**
 * `yesProb` como vem de `/api/kalshi/markets` e do cache `kalshi:markets`
 * (0–100) → pontos percentuais. `null` quando não é um preço (NaN, ausente,
 * fora de 0–100): quem chama pula o mercado em vez de inventar um número.
 */
export function pctDoKalshi(yesProb: unknown): number | null {
  if (typeof yesProb !== "number" || !Number.isFinite(yesProb)) return null;
  if (yesProb < 0 || yesProb > 100) return null;
  return yesProb;
}
