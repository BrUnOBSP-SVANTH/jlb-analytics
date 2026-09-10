/**
 * A régua que decide se uma notícia tem a ver com o mercado (DET-08).
 *
 * O QUE ISTO CONSERTA. Num mercado sobre a decisão do Fed, a auditoria
 * encontrou o chip do Cérebro trazendo "Bitcoin's $80K Comeback Has a Sept…".
 * Não é aleatório: o código pegava as TRÊS PRIMEIRAS palavras com mais de três
 * letras do título e buscava por elas. Para "Fed Decision in September?" isso dá
 * "Decision & September" — e qualquer artigo publicado em setembro casa.
 *
 * Uma notícia irrelevante ao lado de um mercado custa mais credibilidade do que
 * a ausência dela: quem lê conclui que o cruzamento é decorativo, e a partir daí
 * ignora também os que estão certos. Sem match, não mostra chip nenhum.
 *
 * Duas correções, e as duas importam:
 *   1. as palavras BUSCADAS passam a ser as distintivas, não as primeiras;
 *   2. o resultado é CONFERIDO depois de voltar — o full-text search casa por
 *      radical e traz vizinhos que não deveriam entrar.
 */

/**
 * Palavras que aparecem em metade dos títulos de mercado e não distinguem nada.
 *
 * Meses e números entram aqui porque eram exatamente o que produzia o falso
 * positivo: "September" casava com todo artigo de setembro.
 */
const GENERICAS = new Set([
  // estrutura de pergunta de mercado
  "will", "does", "what", "which", "when", "who", "whom", "have", "has", "had",
  "above", "below", "before", "after", "between", "during", "than", "more", "less",
  "decision", "decide", "decides", "decided", "winner", "win", "wins", "won",
  "nominee", "election", "market",
  "markets", "price", "prices", "chance", "odds", "yes", "no", "the", "and", "for",
  // meses, em inglês e português
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto",
  "setembro", "outubro", "novembro", "dezembro",
  // português de pergunta
  "qual", "quem", "quando", "sera", "será", "vai", "acima", "abaixo", "entre",
  "decisao", "decisão", "decidir", "vencedor", "mercado", "preco", "preço", "chance",
]);

const semAcento = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * As palavras que realmente identificam este mercado.
 *
 * Devolve no máximo `max` termos, os mais longos primeiro — palavra longa
 * costuma ser nome próprio ou termo técnico, que é o que distingue.
 */
export function termosDistintivos(titulo: string, max = 3): string[] {
  const palavras = (titulo ?? "")
    .replace(/[^a-zA-ZÀ-ú0-9 ]/g, " ")
    .split(/\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 3)
    .filter((p) => !GENERICAS.has(p.toLowerCase()))
    .filter((p) => !/^\d+$/.test(p));   // "2028" sozinho não identifica mercado

  // Sem duplicata, mais longa primeiro, ordem de aparição como desempate.
  const vistas = new Set<string>();
  const unicas = palavras.filter((p) => {
    const k = p.toLowerCase();
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });

  return [...unicas].sort((a, b) => b.length - a.length).slice(0, max);
}

/**
 * O artigo compartilha algum termo distintivo com o mercado?
 *
 * Confere DEPOIS de o full-text search responder, porque o FTS casa por radical
 * e por proximidade — ele traz vizinhos que não deveriam entrar, e a régua de
 * exibição precisa ser mais estreita que a régua de busca.
 *
 * Palavra INTEIRA, nunca pedaço: casar por substring já mordeu esta base quatro
 * vezes ("ai" dentro de "ukraine", "oil" dentro de "boiling").
 */
export function pareceRelacionado(tituloArtigo: string, termos: string[]): boolean {
  if (termos.length === 0) return false;
  const alvo = semAcento((tituloArtigo ?? "").toLowerCase());
  return termos.some((t) => {
    const termo = semAcento(t.toLowerCase());
    if (termo.length < 4) return false;
    return new RegExp(`(?<![a-z0-9])${termo}(?![a-z0-9])`).test(alvo);
  });
}

/** Filtra a lista devolvida pela busca, deixando só o que de fato se relaciona. */
export function filtrarRelacionados<T extends { title: string }>(
  artigos: T[],
  tituloMercado: string,
): T[] {
  const termos = termosDistintivos(tituloMercado);
  return artigos.filter((a) => pareceRelacionado(a.title, termos));
}
