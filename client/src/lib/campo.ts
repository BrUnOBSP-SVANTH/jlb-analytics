/**
 * O id que liga um `<label>` ao campo dele.
 *
 * O QUE ACONTECIA (Auditoria 21/09, APR-03). As calculadoras da trilha
 * escreviam `<label>Rótulo</label>` seguido de `<input>` — sem `htmlFor` e sem
 * `id`. Na tela parece um rótulo; para o navegador não é. Um `<label>` só se
 * associa ao campo de duas formas: envolvendo-o, ou por `htmlFor`. Sem isso,
 * quem usa leitor de tela ouve "caixa de edição" e mais nada.
 *
 * Eram 21 campos nas cinco páginas de nível — numa trilha que ENSINA a
 * calcular, onde saber qual campo é qual é a tarefa inteira. E a perda não é só
 * de quem não enxerga: clicar no rótulo deixa de focar o campo, que é o
 * comportamento que todo mundo espera de formulário.
 *
 * O id vem do próprio rótulo para funcionar dentro de `.map()`, onde os campos
 * nascem de uma lista e não têm nome fixo no código.
 */
export function idDoCampo(rotulo: string, prefixo = "campo"): string {
  const limpo = String(rotulo ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // tira acento
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefixo}-${limpo || "sem-nome"}`;
}
