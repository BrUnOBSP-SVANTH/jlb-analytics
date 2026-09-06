/**
 * Guardrails de calibração da IA — funções puras, compartilhadas e testáveis.
 *
 * O preço de um mercado líquido já agrega muita informação; a IA só deve divergir
 * dele de forma limitada. Estas regras evitam que uma alucinação vire um "fair
 * value" absurdo no track record público (o buraco que deixava passar um desvio
 * de 20pp+). Antes esta lógica vivia inline e duplicada em marketAnalysis,
 * fairValue e crossref — aqui vira um único ponto de verdade, testado.
 */

/**
 * Limita a estimativa da IA a ±maxDev pontos percentuais do preço de mercado e à
 * faixa [min, max] — APERTANDO a banda na cauda (perto de 0/100).
 *
 * Por quê: em pontos percentuais brutos a cauda engana. Mover 5%→20% é QUADRUPLICAR
 * as chances, enquanto 45%→60% é modesto. Foi exatamente na cauda que a IA errou
 * feio no histórico (disse 42–68% onde o mercado dizia 5–7%, e o mercado acertou).
 * Então o desvio permitido encolhe com a "folga até a borda" (mín. 5pp), sem mexer
 * no meio: mercados entre 15% e 85% continuam com a banda cheia de ±maxDev.
 *
 * @param raw    estimativa bruta da IA (0-100)
 * @param market probabilidade do mercado (0-100)
 * @param maxDev desvio máximo permitido vs. mercado, em pp (padrão 15; teto da banda)
 * @param min    piso da faixa (padrão 5)
 * @param max    teto da faixa (padrão 95)
 */
export function clampFairValue(raw: number, market: number, maxDev = 15, min = 5, max = 95): number {
  const dev = Math.min(maxDev, Math.max(5, Math.min(market, 100 - market)));
  return Math.max(min, Math.min(max, Math.max(market - dev, Math.min(market + dev, raw))));
}

/**
 * Fair value quantitativo (pré-IA / fallback do /fair-value): média ponderada
 * entre a base rate histórica da categoria e o preço do mercado, com o peso do
 * mercado crescendo com a liquidez, mais um ajuste de momentum (reversão à média
 * em movimentos extremos, leve momentum em moderados). É o número que a rota
 * devolve quando a IA está indisponível — por isso precisa ser testável.
 */
export function quantFairValue(
  marketProb: number,
  baseRate: number,
  opts: { liquidity?: number; weekPriceChange?: number } = {},
): { preFairValue: number; clampedPreFV: number; liquidityWeight: number; momentumAdjust: number } {
  const { liquidity, weekPriceChange } = opts;

  let momentumAdjust = 0;
  if (weekPriceChange !== undefined) {
    momentumAdjust = Math.abs(weekPriceChange) > 10 ? -weekPriceChange * 0.3 : weekPriceChange * 0.2;
  }

  let liquidityWeight = 0.5; // peso da prob de mercado no fair value
  if (liquidity !== undefined) {
    if (liquidity > 100_000) liquidityWeight = 0.75;
    else if (liquidity > 10_000) liquidityWeight = 0.65;
    else if (liquidity < 1_000) liquidityWeight = 0.35;
  }

  const preFairValue = Math.round(baseRate * (1 - liquidityWeight) + marketProb * liquidityWeight + momentumAdjust);
  const clampedPreFV = Math.max(5, Math.min(95, preFairValue));
  return { preFairValue, clampedPreFV, liquidityWeight, momentumAdjust };
}

/**
 * Tetos de confiança por (domínio, horizonte) — os MESMOS que o prompt do
 * Superforecaster manda "nunca inflacionar", agora IMPOSTOS em código. Antes eram
 * só pedidos ao modelo (a Previsão Guiada era o endpoint mais complexo e o único
 * SEM trava). Combos sem regra explícita caem no teto geral. Mesma filosofia do
 * clampFairValue: não confiar cegamente no número do modelo.
 */
const CONFIDENCE_CAPS: Record<string, Partial<Record<"short" | "medium" | "long", number>>> = {
  crypto:   { short: 62 },                       // mercados quase-eficientes
  finance:  { short: 62 },
  economy:  { medium: 72 },                       // ciclos identificáveis, alto ruído
  politics: { long: 68 },                         // eleições >6 meses, eventos disruptivos
  sports:   { short: 78, medium: 65, long: 65 },  // 1 jogo (alta variância) vs. torneio
  science:  { long: 55 },                         // disrupção tecnológica imprevisível
  climate:  { short: 75, long: 50 },
};
export const CONFIDENCE_CEILING = 95; // teto geral: calibração raramente passa disto

/** Limita a confiança (0-100) ao teto do (domínio, horizonte), ou ao teto geral. */
export function capConfidence(domain: string, horizon: "short" | "medium" | "long", value: number): number {
  const cap = CONFIDENCE_CAPS[domain]?.[horizon] ?? CONFIDENCE_CEILING;
  return Math.max(0, Math.min(cap, value));
}

/**
 * Frases que alegam histórico PRÓPRIO da JLB. São o que o modelo escreve quando
 * quer soar respaldado: "nosso histórico mostra", "acompanhamos 80 mercados",
 * "nossa base proprietária indica".
 */
const ALEGA_HISTORICO_PROPRIO =
  /(nosso|nossa|jlb)[^.!?]{0,40}(hist[óo]rico|base (de dados|propriet[áa]ria)|amostra)|acompanhamos\s+\d+\s+mercados|hist[óo]rico\s+(medido|propriet[áa]rio)/i;

/**
 * Remove alegação de histórico próprio quando ele NÃO EXISTE para aquele mercado.
 *
 * POR QUE EM CÓDIGO, E NÃO SÓ NO PROMPT. O prompt já proíbe. Mesmo assim, na
 * auditoria de 06/09 a IA escreveu "nosso histórico aponta base rate de 50%" num
 * mercado de categoria sem amostra — misturou a base rate genérica com o volume.
 * Instrução em texto é pedido; guardrail é garantia. E aqui o erro é o mais caro
 * de todos: número PRÓPRIO inventado destrói exatamente a razão de o site existir.
 * Um exagero de linguagem se perdoa; um dado nosso fabricado, não.
 *
 * Cirúrgico de propósito: corta a FRASE que alega, não o parágrafo. O resto da
 * análise costuma estar certo, e jogá-lo fora seria trocar um erro por outro.
 */
export function semHistoricoInventado(texto: string, fichaTemHistorico: boolean): string {
  if (fichaTemHistorico || !texto) return texto;
  if (!ALEGA_HISTORICO_PROPRIO.test(texto)) return texto;

  // Corta só onde a frase REALMENTE termina: ponto seguido de espaço e letra
  // maiúscula. Dividir em todo ponto quebrava dentro de número decimal — e o
  // número decimal é justamente o formato dos nossos próprios dados. Flagrado ao
  // testar: "…mostra 89.6% de acerto." virava "O preço está em 30%.6% de acerto",
  // um texto sem sentido servido ao usuário sem erro nenhum no console.
  const frases = texto.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú])/);
  const limpas = frases.filter((f) => !ALEGA_HISTORICO_PROPRIO.test(f));

  // Se sobrou pouco, a alegação era o corpo do texto — melhor dizer a verdade
  // curta do que devolver um fragmento sem sentido.
  const restante = limpas.join(" ").trim();
  if (restante.length < 80) {
    return "Ainda não temos amostra própria suficiente nesta área para publicar um histórico — "
      + "os números acima vêm do mercado e das notícias, não de medição nossa.";
  }
  return `${restante} (Ainda não temos histórico próprio publicável nesta área.)`;
}
