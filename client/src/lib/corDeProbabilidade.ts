/**
 * De que cor se pinta uma probabilidade. Um lugar só, e a resposta é: de
 * nenhuma cor de julgamento.
 *
 * 🔴 O QUE ACONTECIA ATÉ 27/09/2026. Oito componentes repetiam, cada um por
 * conta própria, a mesma regra:
 *
 *     pct >= 70 ? "text-positive" : pct <= 30 ? "text-negative" : "text-gold"
 *
 * Isto é: chance alta saía VERDE, chance baixa saía VERMELHA. Três problemas,
 * em ordem crescente de gravidade.
 *
 * 1. As duas cores já tinham dono. Em todo o resto do produto — chip de
 *    variação, edge, banca, track record — `positive` e `negative` querem dizer
 *    SUBIU e CAIU. No card de notícias dava para ver "▼1,0pp" em vermelho ao
 *    lado de "56%" em dourado, e "▲6,5pp" em verde ao lado de "73%" em verde:
 *    duas semânticas diferentes, as mesmas duas cores, no mesmo card, a três
 *    centímetros uma da outra.
 *
 * 2. Enchia a tela de cor à toa. Quatro cards lado a lado, quatro números
 *    enormes em verde e vermelho — e aí a cor não destaca mais nada, porque
 *    está em tudo.
 *
 * 3. O pior: PROBABILIDADE NÃO TEM LADO BOM. 87% de "vai chover" não é uma boa
 *    notícia, é uma chance alta; para quem está no NÃO é exatamente o oposto. O
 *    verde dizia "isto está indo bem" sobre um número que não vai bem nem mal.
 *    Num site cujo argumento é ler probabilidade sem viés, era a plataforma
 *    cometendo o erro que ela existe para corrigir.
 *
 * A REGRA AGORA: o nível é dado — fala no tom do dado. O movimento continua
 * verde e vermelho, porque aí existe direção de verdade.
 *
 * ⚠️ Isto vale para probabilidade de MERCADO. Percentil de calibração
 * (dashboard/PredictionLog) segue verde quando é alto, e está certo: ali alto é
 * literalmente melhor, é a pessoa acertando mais.
 */

/** Cor do número/rótulo de uma probabilidade. */
export const COR_DA_PROBABILIDADE = "text-dado";

/** Cor do preenchimento da barra de uma probabilidade. */
export const BARRA_DA_PROBABILIDADE = "bg-dado";

/**
 * Cor de um número que MUDOU agora — o "flash" de preço ao vivo.
 *
 * Aqui verde e vermelho são corretos e são o ponto: não descrevem o nível,
 * descrevem a direção do movimento que acabou de acontecer. E somem em
 * seguida, então não competem com nada de forma permanente.
 */
export function corDoMovimento(direcao: "up" | "down" | null | undefined): string {
  if (direcao === "up") return "text-positive";
  if (direcao === "down") return "text-negative";
  return COR_DA_PROBABILIDADE;
}
