/**
 * Coordenadas de SVG — escritas para a MÁQUINA ler, não para a pessoa.
 *
 * O DEFEITO (auditoria de 14/09/2026, item 1 — crítico). Numa auditoria anterior
 * 178 `toFixed` do site viraram `num()`, o formatador pt-BR de shared/formato.ts.
 * Para texto na tela, certo. Mas dois geradores de `path` foram junto:
 *
 *     `M${num(x, 1)},${num(y, 1)}`  →  "M0,0,8,1 L0,6,8,1 …"
 *
 * `num(7.8, 1)` devolve "7,8" — com VÍRGULA. No atributo `d`, vírgula é
 * separador: cada ponto virou dois, o segundo espúrio, e o Y lido ficou preso
 * entre 0 e 9. Todo minigráfico de /mercados desenhava uma barra sólida em vez
 * de linha (11 de 11 medidos), e o "Como cada um chegou aqui" espremia as séries
 * nos 4% do topo. Nada quebrava: nem tipo, nem teste, nem console.
 *
 * A regra: coordenada de SVG usa PONTO decimal e nunca separador de milhar,
 * seja qual for o idioma da interface. Número que a pessoa lê passa por `num()`;
 * número que o navegador lê passa por aqui.
 */

/** Uma coordenada: ponto decimal, sem milhar, sem "-0", sem NaN no atributo. */
export function coordSvg(v: number, casas = 1): string {
  if (!Number.isFinite(v)) return "0";
  const fixo = Number(v.toFixed(casas));
  return String(fixo === 0 ? 0 : fixo);
}

/** "M x,y L x,y …" — exatamente dois números por comando. */
export function linhaSvg(pontos: ReadonlyArray<{ x: number; y: number }>, casas = 1): string {
  return pontos
    .map((p, i) => `${i === 0 ? "M" : "L"}${coordSvg(p.x, casas)},${coordSvg(p.y, casas)}`)
    .join(" ");
}
