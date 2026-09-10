/**
 * Referências externas — os números que o site cita de terceiros.
 *
 * O QUE ISTO CONSERTA (LDR-01). O JLB publicava TRÊS valores diferentes para a
 * mesma referência, em três telas:
 *
 *   Previsão Guiada   "Superforecasters do GJP têm Brier Score médio de 0.10"
 *   Guia de Modelos   "Benchmark: Superforecasters do GJP têm BS ≈ 0.14"
 *   Calculadora Brier "< 0.05 — Superforecasters (Good Judgment Project)"
 *
 * É o número que ancora a régua de qualidade do site inteiro: é contra ele que
 * o usuário lê o próprio Brier e conclui se está indo bem. Publicar três
 * versões dele é pior do que não publicar nenhuma, porque quem cruza duas telas
 * descobre que o site não sabe do que está falando.
 *
 * Regra desta pasta: toda constante aqui carrega a FONTE no comentário. Se não
 * dá para citar de onde veio, não entra — vira alegação nossa, e alegação nossa
 * mora no track record, medida, não numa referência.
 */

/**
 * Brier Score médio dos superforecasters do Good Judgment Project.
 *
 * FONTE: Good Judgment Inc. — "The Superforecasters' Track Record"
 * (goodjudgment.com/resources/the-superforecasters-track-record/). No torneio da
 * IARPA (2011–2015), os 2% do topo entre ~25 mil participantes sustentaram Brier
 * médio consistentemente ABAIXO de 0,12 no conjunto principal de questões —
 * cerca de 20% a 30% melhor que a mediana dos participantes.
 *
 * Publicamos 0,10 como a referência arredondada dessa faixa. Os outros dois
 * números que circulavam pelo site não se sustentam: 0,14 é pior que a faixa
 * medida, e 0,05 é melhor do que qualquer resultado publicado do GJP.
 *
 * Contexto que o número sozinho não dá, e que as telas devem repetir: 0 é a
 * previsão perfeita e 0,25 é o que se consegue dizendo 50% em tudo. Brier só
 * compara dentro do MESMO conjunto de perguntas — 0,10 em perguntas fáceis não
 * é melhor que 0,20 em perguntas difíceis.
 */
export const BRIER_SUPERFORECASTER = 0.10;

/** O Brier de quem responde 50% em tudo. A régua de "estudar adiantou?". */
export const BRIER_DO_CHUTE = 0.25;

/** Como o site escreve a referência, para não variar de tela para tela. */
export const FONTE_SUPERFORECASTER = "Good Judgment Project (IARPA, 2011–2015)";

/**
 * As faixas de leitura do Brier, em UMA tabela.
 *
 * Estavam duplicadas na calculadora e no guia de modelos, com cortes
 * diferentes — e é a mesma escala.
 */
export const FAIXAS_BRIER: { ate: number; rotulo: string }[] = [
  { ate: BRIER_SUPERFORECASTER, rotulo: "no nível dos superforecasters" },
  { ate: 0.15, rotulo: "forecaster experiente — calibração muito boa" },
  { ate: 0.20, rotulo: "bom — acima da maioria das pessoas" },
  { ate: BRIER_DO_CHUTE, rotulo: "razoável — ainda melhor que chutar" },
  { ate: Infinity, rotulo: "pior que responder 50% em tudo" },
];

/** A leitura em palavras de um Brier qualquer. */
export function lerBrier(brier: number): string {
  return FAIXAS_BRIER.find((f) => brier < f.ate)?.rotulo ?? FAIXAS_BRIER[FAIXAS_BRIER.length - 1].rotulo;
}

/**
 * A amostra mínima para um número virar afirmação — a mesma régua no site todo.
 *
 * Mora aqui porque o servidor já a aplica (`server/lib/amostraIA.ts` a
 * reexporta) e as telas precisam ESCREVER o número no texto que explica a régua.
 * Ter a constante em dois lugares foi como a página acabou prometendo "a partir
 * de 20 resolvidas" enquanto os endpoints cortavam em 15 e em 30 (TRK-03).
 */
export const MIN_AMOSTRA = 20;
