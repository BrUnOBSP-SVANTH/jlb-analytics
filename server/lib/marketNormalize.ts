/**
 * Helpers PUROS de normalização de mercado (Polymarket/Kalshi). Extraídos das rotas
 * para ficarem testáveis: são o ponto onde a resposta crua da API externa vira o
 * nosso formato, e um erro silencioso aqui gera "mercado falso" (link 404) ou uma
 * probabilidade errada — exatamente as regressões que já corrigimos.
 */

/** Preço do "Yes" (índice 0) de um outcomePrices JSON do Polymarket. É a base da
 *  probabilidade de cada desfecho num evento negRisk. Nunca lança: inválido → 0. */
export function parseYesPrice(outcomePrices?: string): number {
  if (!outcomePrices) return 0;
  try {
    return (JSON.parse(outcomePrices) as string[]).map(parseFloat)[0] ?? 0;
  } catch {
    return 0;
  }
}

/**
 * URL canônica do Polymarket. SÓ existe `/pt/event/{eventSlug}` — market.slug e o id
 * numérico dão 404 (o "mercado falso" que o usuário via ao clicar). Sem eventSlug não
 * há página válida → undefined, e o chamador descarta o mercado em vez de expor o 404.
 */
export function polyEventUrl(eventSlug?: string): string | undefined {
  return eventSlug ? `https://polymarket.com/pt/event/${eventSlug}` : undefined;
}

/**
 * URL canônica do Kalshi: `/markets/{série}/{evento}` em MINÚSCULAS. Maiúsculo dá 404
 * (a causa dos "mercados falsos" da Kalshi); o slug do meio (título da série) é opcional.
 */
export function kalshiMarketUrl(seriesTicker: string, eventTicker: string): string {
  return `https://kalshi.com/markets/${seriesTicker.toLowerCase()}/${eventTicker.toLowerCase()}`;
}

/**
 * Probabilidade do "Yes" (0.1–99.9) de um mercado Kalshi a partir dos preços em DÓLAR
 * (strings "0"–"1"): mid (bid+ask)/2 quando ambos existem, senão o last, senão 50.
 * Arredonda a 1 casa e clampa (nunca 0/100 — a extremidade fica pro settlement oficial).
 */
export function kalshiYesProb(bidDollars?: string, askDollars?: string, lastDollars?: string): number {
  const bid = parseFloat(bidDollars ?? "0") * 100;
  const ask = parseFloat(askDollars ?? "0") * 100;
  const last = parseFloat(lastDollars ?? "0") * 100;
  const raw = bid > 0 && ask > 0 ? (bid + ask) / 2 : last || 50;
  return Math.max(0.1, Math.min(99.9, parseFloat(raw.toFixed(1))));
}
