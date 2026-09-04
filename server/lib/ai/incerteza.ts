/**
 * incerteza — a margem de erro das nossas próprias estatísticas.
 *
 * POR QUE EXISTE. O site já publicava "79% de acerto" e chamava de "margem de
 * erro" os 21% restantes. São coisas diferentes: 21% é a TAXA DE ERRO (quantas
 * vezes erramos). Margem de erro é outra pergunta — quanto esse 79% pode variar só
 * por sorte da amostra. Sem ela, o leitor não tem como saber se 79% é um número
 * sólido ou um acaso de poucas resoluções.
 *
 * E isso não é detalhe acadêmico neste projeto: em 29/08 promovemos uma calibração
 * com "+3,1% de ganho" que virou −7,7% ao vivo, exatamente porque olhamos a
 * direção do número sem perguntar se ele se distinguia de zero. Publicar a margem
 * é aplicar ao usuário o mesmo rigor que passamos a exigir de nós.
 */

/**
 * Intervalo de Wilson para uma proporção (ex.: taxa de acerto).
 *
 * Wilson e não a fórmula normal comum: com proporção perto de 0 ou 100%, ou com
 * amostra pequena, a normal produz intervalo que sai da faixa 0–100 (algo como
 * "97% ± 5" chegando a 102%). Wilson se comporta nas pontas, que é justamente
 * onde uma taxa de acerto alta vive.
 */
export function intervaloWilson(acertos: number, total: number, z = 1.96): { baixo: number; alto: number; margemPp: number } | null {
  if (!Number.isFinite(acertos) || !Number.isFinite(total) || total <= 0) return null;
  const p = acertos / total;
  const z2 = z * z;
  const denom = 1 + z2 / total;
  const centro = (p + z2 / (2 * total)) / denom;
  const meio = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denom;
  const baixo = Math.max(0, (centro - meio) * 100);
  const alto = Math.min(100, (centro + meio) * 100);
  return {
    baixo: Number(baixo.toFixed(1)),
    alto: Number(alto.toFixed(1)),
    // A margem que aparece na tela ("79% ± 2,7"). Metade da largura do intervalo.
    margemPp: Number(((alto - baixo) / 2).toFixed(1)),
  };
}

/**
 * A nossa taxa de acerto é distinguível da do mercado, ou é empate dentro da
 * margem?
 *
 * Resposta honesta e contraintuitiva: quando os intervalos se sobrepõem, o certo
 * NÃO é dizer "estamos perdendo por 0,4%". É dizer que empatamos — e, com amostra
 * grande, que empatamos com precisão. "Empate medido" é uma afirmação mais forte
 * e mais verdadeira que uma diferença que o dado não sustenta.
 */
export function comparaComMercado(
  nossoAcertos: number, nossoTotal: number,
  mercadoAcertos: number, mercadoTotal: number,
): { veredito: "empate" | "melhor" | "pior"; explicacao: string } | null {
  const a = intervaloWilson(nossoAcertos, nossoTotal);
  const b = intervaloWilson(mercadoAcertos, mercadoTotal);
  if (!a || !b) return null;
  if (a.baixo > b.alto) {
    return { veredito: "melhor", explicacao: "Nossa taxa de acerto é maior que a do mercado mesmo considerando a margem de erro." };
  }
  if (a.alto < b.baixo) {
    return { veredito: "pior", explicacao: "Nossa taxa de acerto é menor que a do mercado mesmo considerando a margem de erro." };
  }
  return {
    veredito: "empate",
    explicacao: "Estamos empatados com o mercado: a diferença entre os dois números é menor que a margem de erro, ou seja, não dá para dizer que algum é melhor.",
  };
}
