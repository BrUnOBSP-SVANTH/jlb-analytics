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

/**
 * O id do mercado no NOSSO formato: `poly-<id>`, `kalshi-<ticker>`,
 * `manifold-<id>`.
 *
 * O QUE ACONTECIA (medido em 20/09/2026, percorrendo o site logado com uma
 * conta de teste). Cada tela montava o id do seu jeito, e duas delas gravavam o
 * id CRU da plataforma:
 *
 *  · a previsão registrada na ficha do mercado virava `market_id = "1130012"`.
 *    `idDeLiquidacao` exige o prefixo — sem ele devolve `null` e a previsão
 *    NUNCA é resolvida. As três previsões do banco estavam assim, inclusive a
 *    do fundador, de abril: o usuário registra, espera o resultado e ele não
 *    chega. É o laço morto que o job das 6h existe para fechar;
 *  · a análise pedida na ficha mandava `polymarket-1130012` ao servidor, e o
 *    track record só aceita `poly-`/`kalshi-` — a análise era descartada em
 *    silêncio (confirmado: a análise do teste não aparece em `ai_forecasts`).
 *
 * "poly", não "polymarket": é o prefixo que o banco guarda desde sempre
 * (`paper_bets`, `ai_forecasts`). Id que já vem prefixado passa intacto, então
 * chamar duas vezes é seguro.
 */
const PREFIXO_DA_FONTE: Record<string, string> = {
  polymarket: "poly", poly: "poly", kalshi: "kalshi", manifold: "manifold",
};

export function idCanonicoDeMercado(fonte: string | undefined, idCru: string): string {
  const id = String(idCru ?? "").trim();
  if (!id) return id;
  if (/^(poly|kalshi|manifold)-/.test(id)) return id;
  const prefixo = PREFIXO_DA_FONTE[String(fonte ?? "").toLowerCase()];
  // Sem fonte conhecida não se inventa prefixo: melhor um id que não liquida do
  // que um que liquida contra o mercado ERRADO.
  return prefixo ? `${prefixo}-${id}` : id;
}
