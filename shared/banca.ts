/**
 * Banca simulada — a matemática do retorno em mercado de previsão.
 *
 * COMO FUNCIONA, em português: uma cota paga R$ 1 se o evento acontecer e R$ 0
 * se não acontecer. O preço da cota É a probabilidade que o mercado dá ao evento
 * — cota a R$ 0,40 quer dizer "o mercado acha que tem 40% de chance". Então
 * apostar R$ 100 a 40% compra 250 cotas (100 ÷ 0,40): se acertar voltam R$ 250,
 * se errar volta nada. É por isso que o palpite impopular paga mais: ninguém
 * paga caro por uma cota que quase todo mundo acha que não vai valer nada.
 *
 * UMA IMPLEMENTAÇÃO SÓ, de propósito. A mesma conta roda no navegador (para
 * mostrar ANTES quanto se ganha e quanto se perde) e no servidor (para creditar
 * quando o mercado resolve). Se fossem duas, o usuário veria um número na tela
 * e receberia outro na banca — e a divergência nunca apareceria num teste.
 */

/** R$ fictícios com que toda banca nasce. Nenhum centavo é real. */
export const SALDO_INICIAL = 1000;

/** Piso da aposta: abaixo disso o resultado vira ruído de arredondamento. */
export const APOSTA_MINIMA = 1;

/**
 * Extremos de preço que recusamos. A 1% ou 99% o retorno explode (100×) e o
 * mercado costuma estar praticamente resolvido — apostar ali ensina a lição
 * errada, e o arredondamento sozinho já mexe no resultado.
 */
export const PRECO_MIN = 0.02;
export const PRECO_MAX = 0.98;

export type Lado = "sim" | "nao";

export interface Aposta {
  lado: Lado;
  /** Probabilidade de SIM no momento da aposta (0–1). Sempre o lado SIM, mesmo
   *  quando se apostou no NÃO — é o mesmo referencial do resto do site. */
  precoEntrada: number;
  /** Quanto foi apostado, em R$ fictícios. */
  valor: number;
  /** Probabilidade de SIM agora, quando conhecida — para marcar a mercado. */
  precoAtual?: number;
  resolvido?: boolean;
  /** O SIM aconteceu? Só preenchido pelo resultado OFICIAL da plataforma. */
  desfecho?: boolean | null;
}

// ── O preço, o retorno e a perda ─────────────────────────────────────────────

/**
 * O que ESTA aposta pagou por cota. Quem aposta no NÃO compra a cota contrária,
 * que custa 1 − p: se o SIM vale 0,40, o NÃO vale 0,60. As duas somam R$ 1
 * porque exatamente uma delas vai pagar.
 */
export function precoDoLado(lado: Lado, precoSim: number): number {
  return lado === "sim" ? precoSim : 1 - precoSim;
}

/** Quantas cotas de R$ 1 o valor apostado comprou. */
export function cotas(a: Aposta): number {
  const preco = precoDoLado(a.lado, a.precoEntrada);
  if (!(preco > 0)) return 0;
  return a.valor / preco;
}

/** Quanto VOLTA para a banca se a previsão der certo (já inclui o que foi apostado). */
export function retornoSeAcertar(a: Aposta): number {
  return cotas(a);
}

/** O lucro limpo do acerto — o retorno menos o que saiu do bolso. */
export function lucroSeAcertar(a: Aposta): number {
  return retornoSeAcertar(a) - a.valor;
}

/**
 * Quanto se perde se a previsão der errado: tudo que foi apostado. Não existe
 * meia perda em mercado binário — a cota que não acontece vale R$ 0.
 */
export function perdaSeErrar(a: Aposta): number {
  return a.valor;
}

/**
 * As mesmas chances na linguagem de casa de aposta: "paga 2,5×". É só o inverso
 * do preço — serve para quem já entende odds reconhecer o que está vendo.
 */
export function oddsDecimais(a: Aposta): number {
  const preco = precoDoLado(a.lado, a.precoEntrada);
  return preco > 0 ? 1 / preco : 0;
}

/** A previsão bateu com o que aconteceu de verdade? */
export function acertou(a: Aposta): boolean | null {
  if (a.desfecho !== true && a.desfecho !== false) return null;
  return (a.lado === "sim") === a.desfecho;
}

/** Quanto o mercado devolveu de fato: o retorno cheio no acerto, zero no erro. */
export function pagamento(a: Aposta): number | null {
  const certo = acertou(a);
  if (certo === null) return null;
  return certo ? retornoSeAcertar(a) : 0;
}

/**
 * Quanto a aposta ABERTA vale se fosse vendida agora, ao preço de mercado. É a
 * ponte entre "ainda não resolveu" e "quanto eu tenho": cada cota vale hoje o
 * que o mercado paga por ela. Sem preço atual, devolve o valor apostado — não
 * inventamos lucro que ninguém mediu.
 */
export function valorDeMercado(a: Aposta): number {
  if (a.precoAtual === undefined || !Number.isFinite(a.precoAtual)) return a.valor;
  return cotas(a) * precoDoLado(a.lado, a.precoAtual);
}

// ── A banca inteira ──────────────────────────────────────────────────────────

export interface ResumoBanca {
  /** Onde a banca começou. */
  saldoInicial: number;
  /** O que está livre para apostar agora. */
  disponivel: number;
  /** O que está preso em apostas que ainda não resolveram. */
  emJogo: number;
  /** Quanto as apostas abertas valeriam se vendidas ao preço de hoje. */
  valorAberto: number;
  /** Disponível + valor das abertas: a foto honesta do patrimônio. */
  patrimonio: number;
  /** Lucro (ou prejuízo) já fechado, só do que resolveu. */
  lucroRealizado: number;
  /** Rendimento sobre o saldo inicial, em %. */
  retornoPct: number;
  abertas: number;
  resolvidas: number;
  acertos: number;
  /** Fração de acerto entre as resolvidas — `null` enquanto nenhuma resolveu. */
  taxaAcerto: number | null;
}

/**
 * Fecha a conta da banca. A regra do dinheiro é a de qualquer bolsa: o valor
 * apostado SAI do disponível na hora e só volta (multiplicado, ou zerado) quando
 * o mercado resolve. Sem isso a "banca" viraria lista de desejos, e a lição
 * central — que a aposta custa antes de pagar — se perderia.
 */
export function resumirBanca(apostas: Aposta[], saldoInicial = SALDO_INICIAL): ResumoBanca {
  let emJogo = 0, valorAberto = 0, devolvido = 0, apostadoResolvido = 0;
  let abertas = 0, resolvidas = 0, acertos = 0;

  for (const a of apostas) {
    const pago = a.resolvido ? pagamento(a) : null;
    if (pago === null) {
      abertas += 1;
      emJogo += a.valor;
      valorAberto += valorDeMercado(a);
    } else {
      resolvidas += 1;
      devolvido += pago;
      apostadoResolvido += a.valor;
      if (acertou(a)) acertos += 1;
    }
  }

  const lucroRealizado = devolvido - apostadoResolvido;
  const disponivel = saldoInicial + lucroRealizado - emJogo;
  const patrimonio = disponivel + valorAberto;

  return {
    saldoInicial,
    disponivel,
    emJogo,
    valorAberto,
    patrimonio,
    lucroRealizado,
    retornoPct: saldoInicial > 0 ? ((patrimonio - saldoInicial) / saldoInicial) * 100 : 0,
    abertas,
    resolvidas,
    acertos,
    taxaAcerto: resolvidas > 0 ? acertos / resolvidas : null,
  };
}

/**
 * A aposta pode ser feita? Devolve o motivo em português quando não pode — a
 * recusa tem que ensinar, não só barrar. O teto pelo disponível é o que impede
 * a banca de virar crédito infinito.
 */
export function validarAposta(
  valor: number,
  precoSim: number,
  lado: Lado,
  disponivel: number,
): { ok: true } | { ok: false; motivo: string } {
  if (!Number.isFinite(valor) || valor < APOSTA_MINIMA) {
    return { ok: false, motivo: `A aposta mínima é R$ ${APOSTA_MINIMA}.` };
  }
  if (valor > disponivel) {
    return {
      ok: false,
      motivo: `Sua banca tem R$ ${disponivel.toFixed(2)} livres. O dinheiro preso em apostas abertas só volta quando elas resolvem.`,
    };
  }
  const preco = precoDoLado(lado, precoSim);
  if (!Number.isFinite(preco) || preco < PRECO_MIN || preco > PRECO_MAX) {
    return {
      ok: false,
      motivo: `Este lado está em ${(preco * 100).toFixed(0)}% — extremo demais para simular com honestidade. Aceitamos entre ${PRECO_MIN * 100}% e ${PRECO_MAX * 100}%.`,
    };
  }
  return { ok: true };
}

/** R$ 1.234,50 — o formato que o usuário brasileiro lê sem traduzir. */
export function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
