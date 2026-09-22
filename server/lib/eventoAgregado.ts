/**
 * O card de um evento de VÁRIOS DESFECHOS — a identidade e as listas paralelas.
 *
 * POR QUE É UMA FUNÇÃO SEPARADA E TESTADA (Auditoria 21/09, DAD-03).
 *
 * Um evento negRisk do Polymarket ("Democratic Presidential Nominee 2028") é um
 * conjunto de mercados binários, um por candidato. A tela junta todos num card
 * só — e, ao juntar, precisava escolher QUAL id o card carrega. Carregava o do
 * mercado LÍDER.
 *
 * O líder muda. É uma disputa: é exatamente o que o card existe para mostrar. E
 * quando mudava, o card trocava de identidade sozinho:
 *  · o link que alguém compartilhou passava a abrir outro desfecho;
 *  · o item salvo na watchlist virava outro mercado;
 *  · o alerta de variação (`prevMarketProbs`, chaveado por este id) comparava o
 *    preço de um candidato com o preço de outro e disparava "subiu 20pp";
 *  · a análise guardada em cache respondia sobre quem não foi perguntado.
 * Nada disso dá erro na tela. Só fica errado.
 *
 * A regra: **o card é o EVENTO** (`ev-<id>`, que não muda nunca) e **o desfecho
 * é o mercado** (`outcomeMarketIds[i]`, que liquida). São perguntas diferentes e
 * agora têm identificadores diferentes.
 *
 * As quatro listas são PARALELAS — mesmo índice, mesmo desfecho. Se uma sair de
 * ordem, a tela mostra o histórico de um candidato sob o nome de outro: um erro
 * que desenha bonito e mente. É a mesma razão de `client/src/lib/desfechos.ts`
 * ser uma função testada.
 */

export interface DesfechoDoEvento {
  rotulo: string;
  /** 0–1. */
  prob: number;
  /** Id do mercado aninhado — é ele que liquida este desfecho. */
  idDoMercado: string;
  /** Token CLOB do SIM — serve para o histórico de preço, e só. */
  token: string;
}

export interface CardDoEvento {
  /** `ev-<idDoEvento>`: estável enquanto o evento existir. */
  id: string;
  outcomes: string;
  outcomePrices: string;
  outcomeTokens: string;
  outcomeMarketIds: string;
}

/**
 * Monta a identidade e as listas do card agregado. Recebe os desfechos JÁ
 * ordenados (é `rankOutcomes` quem ordena e corta o ruído) para que a ordem da
 * tela e a ordem das listas sejam a mesma, por construção.
 */
export function montarCardDoEvento(idDoEvento: string, desfechos: ReadonlyArray<DesfechoDoEvento>): CardDoEvento {
  return {
    id: `ev-${String(idDoEvento).trim()}`,
    outcomes: JSON.stringify(desfechos.map((d) => d.rotulo)),
    // 4 casas: é a precisão que o Polymarket publica. Arredondar aqui fazia a
    // calculadora ler 19% onde o preço praticado era 18,5%.
    outcomePrices: JSON.stringify(desfechos.map((d) => d.prob.toFixed(4))),
    outcomeTokens: JSON.stringify(desfechos.map((d) => d.token ?? "")),
    outcomeMarketIds: JSON.stringify(desfechos.map((d) => String(d.idDoMercado ?? ""))),
  };
}
