/**
 * curvaCalibracao — "quando dizemos 70%, o que acontece de verdade?"
 *
 * É a prova mais concreta que uma plataforma de previsão pode oferecer, e o site
 * não a mostrava. Havia um gráfico de calibração no Dashboard, mas das previsões
 * DO USUÁRIO — nada sobre as nossas.
 *
 * A leitura é direta e não exige estatística: se a faixa "70 a 80%" aconteceu 74%
 * das vezes, acertamos o tom. Se aconteceu 40%, prometemos mais do que entregamos.
 * Qualquer pessoa entende a tabela sem saber o que é Brier.
 *
 * ⚠️ Cada faixa leva a PRÓPRIA margem de erro. Uma faixa com 12 casos e outra com
 * 200 não merecem a mesma confiança, e mostrar só a porcentagem esconderia isso —
 * exatamente o erro que corrigimos no selo geral (taxa de erro ≠ margem de erro).
 */
import { intervaloWilson } from "./incerteza.ts";

export interface FaixaCalibracao {
  /** Rótulo legível: "70–80%". */
  faixa: string;
  /** Quantas previsões caíram aqui. */
  n: number;
  /** Média do que PROMETEMOS na faixa. */
  prometido: number;
  /** Com que frequência realmente ACONTECEU. */
  aconteceu: number | null;
  margemPp: number | null;
  /** Diferença em pontos: positivo = aconteceu mais do que prometemos. */
  desvioPp: number | null;
  /** `true` quando o desvio cabe dentro da margem — ou seja, faixa calibrada. */
  dentroDaMargem: boolean | null;
}

const FAIXAS: Array<[number, number]> = [
  [0, 10], [10, 20], [20, 30], [30, 40], [40, 50],
  [50, 60], [60, 70], [70, 80], [80, 90], [90, 101],
];

/** Amostra mínima para a faixa virar afirmação em vez de anedota. */
const MIN_POR_FAIXA = 8;

export function montarCurva(
  linhas: Array<{ prob: number; aconteceu: boolean }>,
): FaixaCalibracao[] {
  return FAIXAS.map(([lo, hi]) => {
    const dentro = linhas.filter((l) => l.prob >= lo && l.prob < hi);
    const n = dentro.length;
    const prometido = n > 0 ? dentro.reduce((s, l) => s + l.prob, 0) / n : (lo + hi) / 2;
    const rotulo = `${lo}–${Math.min(100, hi)}%`;

    if (n < MIN_POR_FAIXA) {
      // Sem amostra não inventamos porcentagem: a faixa aparece vazia, o que já
      // informa (é honesto dizer "ainda não temos casos suficientes aqui").
      return { faixa: rotulo, n, prometido: Number(prometido.toFixed(1)), aconteceu: null, margemPp: null, desvioPp: null, dentroDaMargem: null };
    }
    const acertos = dentro.filter((l) => l.aconteceu).length;
    const ic = intervaloWilson(acertos, n);
    const aconteceu = (acertos / n) * 100;
    const desvio = aconteceu - prometido;
    return {
      faixa: rotulo,
      n,
      prometido: Number(prometido.toFixed(1)),
      aconteceu: Number(aconteceu.toFixed(1)),
      margemPp: ic?.margemPp ?? null,
      desvioPp: Number(desvio.toFixed(1)),
      // Calibrado = o que prometemos cabe dentro do intervalo do que aconteceu.
      dentroDaMargem: ic ? prometido >= ic.baixo && prometido <= ic.alto : null,
    };
  });
}
