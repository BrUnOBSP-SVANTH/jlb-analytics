/**
 * desfechos — monta a lista de possibilidades de um mercado multi-resultado.
 *
 * POR QUE ISTO É UMA FUNÇÃO, E TESTADA. A lista chega do servidor como três
 * arrays paralelos (rótulos, preços, identificadores) e aqui ela é FILTRADA
 * (some quem está abaixo de 0,5%) e REORDENADA por probabilidade. Se o
 * identificador não viajar junto com o rótulo nessas duas operações, a tela passa
 * a mostrar o histórico de um candidato sob o nome de outro.
 *
 * Esse erro não quebra nada: o gráfico desenha, as cores aparecem, o número bate.
 * Ele só mente. E numa eleição, mentir sobre quem estava subindo é o pior tipo de
 * erro que este site pode cometer — por isso a regra virou função e ganhou teste.
 */

export interface Desfecho {
  label: string;
  /** 0–1. */
  prob: number;
  /** Identificador do desfecho na plataforma; "" quando a fonte não mandou. */
  token: string;
}

/** Abaixo disto o desfecho é ruído: polui a lista e some no gráfico. */
export const PROB_MINIMA = 0.005;

function jsonArray<T>(cru: string | undefined): T[] {
  try {
    const v = JSON.parse(cru ?? "[]") as unknown;
    return Array.isArray(v) ? v as T[] : [];
  } catch { return []; }
}

/**
 * Junta os três arrays paralelos numa lista só, filtra o ruído e ordena por
 * probabilidade. Devolve `null` quando não é multi-resultado (2 ou menos
 * rótulos), porque aí a tela mostra SIM/NÃO e não a lista.
 */
export function montarDesfechos(
  outcomesJson?: string,
  pricesJson?: string,
  tokensJson?: string,
): Desfecho[] | null {
  const labels = jsonArray<string>(outcomesJson);
  const precos = jsonArray<string | number>(pricesJson).map(Number);
  const tokens = jsonArray<string>(tokensJson);

  // 2 ou menos rótulos = mercado binário comum.
  if (labels.length <= 2) return null;
  // Preço faltando para algum rótulo: a lista sairia com buraco, e um buraco
  // aqui vira "0%" na tela, que é uma afirmação falsa e não uma ausência.
  if (precos.length < labels.length) return null;

  const juntos = labels.map((label, i) => ({
    label,
    prob: Number.isFinite(precos[i]) ? precos[i] : 0,
    token: tokens[i] ?? "",
  }));

  return juntos
    .filter((o) => o.prob > PROB_MINIMA)
    .sort((a, b) => b.prob - a.prob);
}
