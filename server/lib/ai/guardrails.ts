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
 * faixa [min, max]. Reproduz exatamente a composição antes inline:
 *   max(min, min(max, max(market - maxDev, min(market + maxDev, raw))))
 *
 * @param raw    estimativa bruta da IA (0-100)
 * @param market probabilidade do mercado (0-100)
 * @param maxDev desvio máximo permitido vs. mercado, em pp (padrão 15)
 * @param min    piso da faixa (padrão 5)
 * @param max    teto da faixa (padrão 95)
 */
export function clampFairValue(raw: number, market: number, maxDev = 15, min = 5, max = 95): number {
  return Math.max(min, Math.min(max, Math.max(market - maxDev, Math.min(market + maxDev, raw))));
}
