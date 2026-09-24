/**
 * edge.ts — a conta de vantagem, em UM lugar só.
 *
 * O QUE ISTO CONSERTA. As mesmas quatro fórmulas viviam em TRÊS arquivos:
 * `components/marketDetail/utils.ts`, `components/mercados/panels.tsx` e, em
 * pedaços, dentro do próprio JSX da calculadora. Três cópias da mesma regra é o
 * padrão que produziu todos os críticos da auditoria de 09/09 — elas não
 * divergem no dia em que nascem, divergem seis meses depois, e nada quebra:
 * nem build, nem tipo, nem teste. Só o número na tela.
 *
 * E havia uma divergência viva: a tela de detalhe imprimia `0.0%` no cartão de
 * EV (com PONTO, fora do padrão pt-BR do resto do site) porque o estado neutro
 * era uma STRING literal no JSX, não o resultado da conta. Com mercado a 18,5%
 * e estimativa 19,0%, o EV verdadeiro é +2,7% — a tela mostrava zero.
 *
 * AS FÓRMULAS. `p` = preço do desfecho (0..1, EXATO — nunca o arredondado da
 * tela), `q` = estimativa do usuário (0..1):
 *
 *     edgePp    = (q − p) × 100        diferença em pontos percentuais
 *     ev        = q ÷ p − 1            retorno esperado por real na posição
 *     kellyCheio = (q − p) ÷ (1 − p)   fração da banca
 *     kellyMeio  = kellyCheio ÷ 2
 *
 * A forma antiga era `q × b − (1 − q)` com `b = 1/p − 1`, que é a MESMA coisa
 * depois de simplificar. Mantive a forma curta porque ela mostra na cara de que
 * depende: só do preço e da sua estimativa.
 *
 * PREÇO EXTREMO NÃO TEM CONTA. Abaixo de 0,5% ou acima de 99% o resultado é
 * dominado pelo ruído de arredondamento do próprio preço — um desfecho cotado a
 * 1% num mercado de 12 times produz "EV +900%" que não significa nada. Nesses
 * casos `ev` e `kelly` voltam `null`, e quem chama mostra a explicação em vez de
 * um número. Nunca renderizar `Infinity`, `NaN` nem `-0`.
 */

/** Abaixo disso o preço não sustenta a conta (ruído de arredondamento domina). */
export const PRECO_MINIMO = 0.005;

/** Acima disso idem — e `1 − p` no denominador de Kelly explode. */
export const PRECO_MAXIMO = 0.99;

/**
 * Meio ponto percentual: MENOS que a resolução do próprio controle (passo de
 * 0,5 pp). Abaixo disso não há vantagem a declarar, só arredondamento.
 *
 * A auditoria fotografou "EDGE +0,5 pp" logo acima de "Mercado 53% · você 53%"
 * — a tela se contradizendo na mesma linha (DET-02).
 */
export const LIMIAR_PP = 0.5;

export interface Vantagem {
  /** Diferença em pontos percentuais. Sempre definida — é subtração, não divisão. */
  edgePp: number;
  /** Retorno esperado por real na posição. `null` em preço extremo. */
  ev: number | null;
  /** Fração da banca por Kelly. `null` em preço extremo, 0 quando não há vantagem. */
  kellyCheio: number | null;
  /** Metade do Kelly — a escolha mais conservadora, nunca "a recomendada". */
  kellyMeio: number | null;
  /** `true` quando a estimativa está ABAIXO do preço: Kelly seria negativo. */
  abaixoDoMercado: boolean;
  /** `true` quando |edge| não passa do ruído de arredondamento. */
  neutro: boolean;
}

/** O preço sustenta EV e Kelly? Fora desta faixa a conta vira ruído amplificado. */
export function precoCalculavel(p: number): boolean {
  return Number.isFinite(p) && p >= PRECO_MINIMO && p <= PRECO_MAXIMO;
}

/**
 * A conta inteira, de uma vez. Todos os cartões da tela consomem daqui — é o que
 * garante que o EV e o Kelly ao lado dele estejam falando do mesmo preço.
 *
 * @param q estimativa do usuário, 0..1
 * @param p preço do desfecho, 0..1, com a precisão que veio da fonte
 */
export function calcularVantagem(q: number, p: number): Vantagem {
  const edgePp = Number.isFinite(q) && Number.isFinite(p) ? (q - p) * 100 : 0;
  const neutro = Math.abs(edgePp) < LIMIAR_PP;

  // A guarda vale para os DOIS lados. Guardar só o preço deixava passar um `q`
  // sujo (NaN vindo de um campo vazio, Infinity de uma divisão anterior) e o
  // cartão imprimia "Infinity%" — o teste pegou isto na primeira rodada.
  if (!Number.isFinite(q) || !precoCalculavel(p)) {
    return { edgePp, ev: null, kellyCheio: null, kellyMeio: null, abaixoDoMercado: edgePp < 0, neutro };
  }

  const ev = q / p - 1;
  // Kelly negativo significa "não apostar neste lado", e não "aposte menos que
  // zero". Vira 0 com a explicação por fora — número negativo solto num cartão
  // de tamanho de posição é um convite a interpretar errado.
  const bruto = (q - p) / (1 - p);
  const kellyCheio = Math.max(0, bruto);

  /**
   * NEUTRO ZERA O QUE É DERIVADO (Auditoria 21/09, UXP-02).
   *
   * O limiar já declarava que abaixo de meio ponto percentual "não há vantagem
   * a declarar, só arredondamento" — mas quem zerava era a TELA, e ela zerava
   * só dois dos três cartões. Com mercado a 52,0% e estimativa 52,4%, a mesma
   * fileira mostrava "EDGE 0,0 pp", "EV 0,0%" e "Kelly Completo 0,8% da banca".
   * O leitor tinha três respostas para a mesma pergunta, e a única que sugeria
   * agir era a que estava errada.
   *
   * Zerar aqui, e não lá, é o que impede o próximo cartão de nascer com o mesmo
   * defeito: a regra passa a valer para quem chamar.
   */
  if (neutro) {
    return { edgePp, ev: 0, kellyCheio: 0, kellyMeio: 0, abaixoDoMercado: false, neutro };
  }

  return {
    edgePp,
    // `+ 0` mata o `-0`, que o JS produz e o formatador imprime como "-0,0".
    ev: ev + 0,
    kellyCheio,
    kellyMeio: kellyCheio / 2,
    abaixoDoMercado: bruto < 0,
    neutro,
  };
}
