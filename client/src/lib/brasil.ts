/**
 * Quais mercados são sobre o Brasil (NEG-04).
 *
 * O QUE ISTO CONSERTA. A auditoria olhou os 20 primeiros mercados e encontrou
 * US Open, primárias americanas, Fed, Irã e Champions League. O único conteúdo
 * sobre o Brasil aparecia escondido em "Em alta agora", em inglês, e nada na
 * navegação levava até ele.
 *
 * É a pergunta mais óbvia de quem chega: "tem alguma coisa daqui?". Se a
 * resposta é não, a pessoa fecha a aba e abre o Polymarket direto — e aí não há
 * educação quantitativa nenhuma para oferecer a ela.
 *
 * Medido no catálogo real (10/09/2026): dos 150 mercados que a lista carrega,
 * 3 são sobre o Brasil, todos sobre a eleição e todos com título em inglês.
 * Poucos, mas existem — e estavam invisíveis por não ter como filtrar.
 *
 * ⚠️ O que este arquivo NÃO faz: criar mercado. O artefato sugere montar
 * mercados próprios de Selic e câmbio a partir de dados do BCB e do IBGE — isso
 * mudaria a natureza do produto (de quem MEDE mercados para quem OFERECE
 * mercados) e é decisão do fundador, não minha.
 */

/**
 * Termos que identificam um mercado brasileiro.
 *
 * Casam como PALAVRA INTEIRA, nunca pedaço — casar por substring já mordeu esta
 * base quatro vezes ("ai" dentro de "ukraine", "oil" dentro de "boiling"). Aqui
 * o risco é concreto: "real" está dentro de "really" e de "real estate", e
 * "PT" dentro de dezenas de palavras.
 */
const TERMOS = [
  // país e moeda
  "brazil", "brazilian", "brasil", "brasileiro", "brasileira",
  // política
  "lula", "bolsonaro", "planalto", "brasilia", "brasília", "congresso",
  // economia
  "selic", "copom", "bacen", "ipca", "ibovespa", "bovespa", "petrobras", "vale",
  // esporte
  "brasileirao", "brasileirão", "libertadores", "flamengo", "palmeiras",
  "corinthians", "neymar", "seleção", "selecao",
];

/** Casa palavra inteira, sem acento, em minúsculas. */
function contem(texto: string, termo: string): boolean {
  const limpo = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const alvo = termo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return new RegExp(`(?<![a-z0-9])${alvo}(?![a-z0-9])`).test(limpo);
}

/**
 * Este texto (título de mercado, categoria) fala do Brasil?
 *
 * Erra para o lado de NÃO incluir: um mercado americano na seção Brasil é pior
 * que um mercado brasileiro de fora dela — o primeiro quebra a promessa da
 * seção, o segundo só a deixa menor.
 */
export function ehSobreBrasil(...textos: (string | null | undefined)[]): boolean {
  const junto = textos.filter(Boolean).join(" ");
  if (!junto.trim()) return false;
  return TERMOS.some((t) => contem(junto, t));
}
