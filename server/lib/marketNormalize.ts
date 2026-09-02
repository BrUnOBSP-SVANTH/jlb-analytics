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

export interface Outcome<T> { label: string; prob: number; ref: T }

/**
 * Ordena os desfechos de um evento multi-resultado (negRisk) por PROBABILIDADE,
 * descartando rótulo vazio e prob desprezível (≤0.5%), e capando em `cap`. O item 0
 * é o líder — e o chamador DEVE usar `ranked[0].ref` como representante para que id,
 * clobTokenIds e outcomePrices[0] descrevam o MESMO desfecho. Sem isso, o settlement
 * (que resolve pelo id) liquida o outcome ERRADO — o bug de track record/apostas.
 */
export function rankOutcomes<T>(items: Array<Outcome<T>>, cap = 12): Array<Outcome<T>> {
  return items
    .filter((o) => o.label && o.prob > 0.005)
    .sort((a, b) => b.prob - a.prob)
    .slice(0, cap);
}

/**
 * O mercado tem preço REAL? (mid com bid e ask, ou um last negociado)
 *
 * Existe porque `kalshiYesProb` cai num padrão 50 quando não há cotação nenhuma —
 * e 50% inventado, exibido como se fosse preço de mercado, é dado falso passando
 * por real. Medido em 02/09: 629 dos 14.339 mercados ativos do Kalshi (4%) não têm
 * preço, e 7 chegavam ao catálogo marcando exatamente 50%. Era também a causa da
 * soma absurda nos multi-resultado: "Brazil Presidential Election First Round"
 * somava 554% porque doze desfechos sem cotação marcavam 50% cada.
 *
 * O mesmo defeito já tinha sido corrigido no seed da IA ("30% dos resolvidos
 * ficavam com market_prob=50 falso") — a vitrine é que tinha ficado para trás.
 */
export function kalshiTemPrecoReal(bidDollars?: string, askDollars?: string, lastDollars?: string): boolean {
  return midConfiavel(bidDollars, askDollars) !== null || parseFloat(lastDollars ?? "0") > 0;
}

/**
 * Spread (em pp) a partir do qual o "meio" deixa de significar preço.
 *
 * Calibrado por MEDIÇÃO em 02/09 sobre os 10.031 mercados do Kalshi com bid e ask:
 * mediana de spread 7pp, p75 e p90 em 9pp — mercado normal é apertado. O p99 é
 * 78pp. Só 3% passam de 30pp, então o corte não encosta no mercado saudável e pega
 * a cauda absurda: com bid 1¢ e ask 99¢ o "meio" dá 50%, tecnicamente uma cotação
 * mas informativamente nada. Era o que sobrava fazendo "Who will be the next
 * Secretary General of NATO?" somar 227% entre os desfechos.
 */
const SPREAD_MAX_PP = 30;

/** Mid em pp quando bid e ask existem E o spread é estreito; senão `null`. */
function midConfiavel(bidDollars?: string, askDollars?: string): number | null {
  const bid = parseFloat(bidDollars ?? "0") * 100;
  const ask = parseFloat(askDollars ?? "0") * 100;
  if (!(bid > 0 && ask > 0)) return null;
  if (ask - bid > SPREAD_MAX_PP) return null;
  return (bid + ask) / 2;
}

/**
 * Probabilidade do "Yes" (0.1–99.9) de um mercado Kalshi a partir dos preços em DÓLAR
 * (strings "0"–"1"): mid (bid+ask)/2 quando ambos existem, senão o last, senão 50.
 * Arredonda a 1 casa e clampa (nunca 0/100 — a extremidade fica pro settlement oficial).
 *
 * ⚠️ O padrão 50 é um ÚLTIMO recurso para não quebrar o tipo. Antes de exibir,
 * checar `kalshiTemPrecoReal` — mercado sem cotação não deve ir para a tela.
 */
export function kalshiYesProb(bidDollars?: string, askDollars?: string, lastDollars?: string): number {
  const last = parseFloat(lastDollars ?? "0") * 100;
  // Mid só quando o spread é estreito. Spread largo → o último negócio é a melhor
  // evidência de preço que existe; sem ele, cai no 50 (que não deve ser exibido).
  const raw = midConfiavel(bidDollars, askDollars) ?? (last || 50);
  return Math.max(0.1, Math.min(99.9, parseFloat(raw.toFixed(1))));
}
