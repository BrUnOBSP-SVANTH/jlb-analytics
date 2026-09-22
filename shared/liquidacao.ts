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
 *  · Desfecho do POLYMARKET: cada desfecho de um evento negRisk É um mercado
 *    binário, com id próprio e resolução própria — `poly-<idDoMercado>` responde
 *    "este desfecho aconteceu?", e o vencedor liquida SIM enquanto os demais
 *    liquidam NÃO, igual ao Kalshi. Antes (DAD-03) guardávamos aqui o token
 *    CLOB, que é identificador de NEGOCIAÇÃO e não tem resultado: a previsão
 *    ficava presa em "aguardando" para sempre. Token continua devolvendo `null`
 *    — é por isso que os dois formatos são distinguidos abaixo.
 *
 * ⚠️ NUNCA devolver o id do MERCADO para uma previsão de desfecho. O settlement
 * do mercado é o SIM/NÃO do LÍDER: aplicado a outro desfecho, grava Brier
 * errado marcado como "oficial", sem erro nenhum na tela.
 */

/** Formato de ticker do Kalshi: "KXUCL-27-BAR", "KXPRESNOMD-28-AOC". */
export const TICKER_KALSHI = /^[A-Z0-9]+(?:-[A-Z0-9.]+)+$/;

/**
 * Id de MERCADO do Polymarket (numérico, poucos dígitos: "559653", "1130012").
 *
 * O token CLOB também é só dígitos, mas é um uint256: na prática 76 a 78 deles
 * ("1070649854354943331133910384704017191132728005304297031827104160667740689…").
 * É essa a diferença que separa "dá para liquidar" de "não dá".
 *
 * ⚠️ O teto é 10 dígitos, e a folga entre 8 e 10 é de propósito: os ids reais
 * hoje têm 6 ou 7, e o que cair na faixa do meio — 11 a 75 dígitos — não é
 * reconhecido por nada e devolve `null`. Errar para o lado de "não liquida" é
 * seguro; errar para o outro grava resultado oficial contra um mercado
 * adivinhado.
 */
export const ID_MERCADO_POLY = /^\d{1,10}$/;

/**
 * O id do card NÃO é o de um mercado quando ele representa um EVENTO inteiro
 * ("poly-ev-123"). Evento não liquida: quem liquida é o desfecho (DAD-03).
 */
export const EVENTO_POLY = /^poly-ev-/;

export function idDeLiquidacao(p: { marketId: string; outcomeId?: string | null }): string | null {
  if (!p.marketId.startsWith("poly-") && !p.marketId.startsWith("kalshi-")) return null;
  if (!p.outcomeId) {
    // Card de evento agregado sem desfecho escolhido não tem o que liquidar: o
    // evento não tem SIM/NÃO. Devolver o id aqui mandaria o liquidador procurar
    // um mercado "ev-123" que não existe — e, pior, antes do DAD-03 ele mandava
    // o id do LÍDER, liquidando a previsão contra um desfecho que o usuário
    // nunca escolheu.
    return EVENTO_POLY.test(p.marketId) ? null : p.marketId;
  }
  if (p.marketId.startsWith("kalshi-") && TICKER_KALSHI.test(p.outcomeId)) return `kalshi-${p.outcomeId}`;
  if (p.marketId.startsWith("poly-") && ID_MERCADO_POLY.test(p.outcomeId)) return `poly-${p.outcomeId}`;
  return null;
}

/**
 * Qual mercado liquida um CARD — quando a pergunta é binária (SIM/NÃO).
 *
 * A previsão da IA e a aposta da banca simulada são SIM/NÃO sobre a
 * probabilidade PRINCIPAL do card, e a principal de um evento agregado é a do
 * desfecho que está na frente. Como o card de evento se chama `ev-…` e evento
 * não é um mercado, esses caminhos precisam do id do mercado do LÍDER — senão o
 * liquidador procura um mercado que não existe e a aposta fica pendente para
 * sempre, que é o limbo que o DAD-03 veio tirar.
 *
 * ⚠️ Resolvido NA HORA DE GRAVAR, e é isso que o torna correto: o que foi
 * gravado fica preso ao desfecho que era líder QUANDO a aposta foi feita. Se
 * amanhã outro assumir a frente, a aposta de ontem continua valendo sobre quem
 * foi apostado — só o CARD, que é o evento, acompanha a disputa.
 *
 * Mora aqui, e não no servidor, porque a banca simulada decide isto no
 * navegador e o seed da IA decide no servidor: é a mesma pergunta, e ela não
 * pode ter duas respostas (a mesma razão de `shared/banca.ts` existir).
 */
export function mercadoQueLiquida(card: { id: string; outcomeMarketIds?: string | null }): string | null {
  const id = String(card.id ?? "").trim();
  if (!id) return null;
  if (!id.startsWith("ev-")) return id;          // mercado binário comum
  try {
    const ids = JSON.parse(String(card.outcomeMarketIds ?? "[]")) as string[];
    const lider = String(ids[0] ?? "").trim();
    return lider || null;                        // sem o id do líder não se inventa um
  } catch { return null; }
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
