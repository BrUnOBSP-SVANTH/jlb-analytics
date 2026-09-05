/**
 * marketSearch — busca bilíngue nos mercados.
 *
 * POR QUE EXISTE. Medido em 01/09/2026 sobre os 600 mercados reais em catálogo:
 * **0% dos títulos estão em português**. As bolsas são americanas e publicam em
 * inglês. A busca do site era `titulo.toLowerCase().includes(q)`, então para o
 * público brasileiro — que é o público do pivô — ela simplesmente não funcionava:
 *
 *     "eleição"     → 0 resultados   (mas "election"  → 51)
 *     "presidente"  → 0              (mas "president" → 32)
 *     "juros"       → 0              (mas "rate"      →  9)
 *     "tênis", "dólar", "guerra", "clima", "copa", "futebol" → 0
 *
 * Não é um problema de ranqueamento, é de idioma: o usuário digitava a palavra
 * certa e o site respondia "nada encontrado" sobre um catálogo que tinha dezenas
 * de mercados do assunto.
 *
 * O dicionário abaixo NÃO é chute: saiu das palavras mais frequentes do catálogo
 * real (election 44, senate 42, margin 39, victory 39, winner 35, president 24…),
 * mapeadas para o que um brasileiro digitaria.
 */

/** minúsculas + sem acento — "eleição", "eleicao" e "ELEIÇÃO" viram a mesma coisa. */
import { SINONIMOS } from "@shared/vocabulario";

export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * PT (sem acento) → termos que aparecem de fato nos títulos em inglês.
 * Um termo pode abrir vários: quem busca "juros" quer Fed, taxa e juros.
 */
// O dicionário mora em shared/vocabulario.ts: o SERVIDOR usa a mesma lista para
// achar notícia em português a partir de título em inglês. Duas cópias sairiam
// do ar uma da outra, e a busca da tela discordaria da busca da análise.


/**
 * Um termo digitado → ele mesmo + as traduções conhecidas.
 * Termo desconhecido segue sozinho (busca literal continua funcionando).
 */
export function expandirTermo(termo: string): string[] {
  const t = normalizar(termo).trim();
  if (!t) return [];
  return [t, ...(SINONIMOS[t] ?? []).map(normalizar)];
}

/**
 * O título casa a consulta? TODAS as palavras digitadas precisam aparecer (E),
 * mas cada uma pode casar por qualquer sinônimo (OU) — "eleição presidente"
 * exige os dois assuntos, e acha "Presidential Election Winner".
 */
export function casaBusca(titulo: string, consulta: string, extra?: string): boolean {
  // `extra` = a CATEGORIA do mercado. Entra na busca porque muito título não diz
  // o assunto: "San Francisco Giants vs. Atlanta Braves" não contém a palavra
  // "baseball" em lugar nenhum, e quem procura "beisebol" quer justamente esse
  // jogo. A categoria ("MLB") é o que fecha essa lacuna.
  const alvo = normalizar(`${titulo} ${extra ?? ""}`);
  const palavras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return true;
  return palavras.every((p) => expandirTermo(p).some((v) => alvo.includes(v)));
}
