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
export function normalizar(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * PT (sem acento) → termos que aparecem de fato nos títulos em inglês.
 * Um termo pode abrir vários: quem busca "juros" quer Fed, taxa e juros.
 */
const SINONIMOS: Record<string, string[]> = {
  // política
  eleicao: ["election", "electoral"], eleicoes: ["election"], eleitoral: ["election", "electoral"],
  presidente: ["president", "presidential"], presidencial: ["presidential"],
  senado: ["senate", "senator"], deputado: ["house", "representative"], camara: ["house"],
  voto: ["vote", "ballot"], votacao: ["vote", "popular vote"], urna: ["ballot"],
  governador: ["governor"], prefeito: ["mayor"], primaria: ["primary"], previa: ["primary"],
  democrata: ["democratic", "democrat"], republicano: ["republican"],
  secretario: ["secretary"], ministro: ["minister", "secretary"],
  impeachment: ["impeach"], renuncia: ["resign"], guerra: ["war", "military", "strike"],
  paz: ["peace", "ceasefire"], "cessar fogo": ["ceasefire"], sancao: ["sanction"],
  // economia
  juros: ["rate", "fed", "interest", "fomc"], taxa: ["rate"], fed: ["fed", "fomc"],
  inflacao: ["inflation", "cpi"], recessao: ["recession"], desemprego: ["unemployment"],
  dolar: ["dollar", "usd"], ouro: ["gold"], petroleo: ["oil"], bolsa: ["stock", "index"],
  acoes: ["stock", "shares"], acao: ["stock"], imposto: ["tax"], tarifa: ["tariff"],
  lucro: ["earnings", "profit"], empresa: ["company", "companies"],
  // esportes
  tenis: ["tennis", "us open", "atp", "wta"], futebol: ["soccer", "football"],
  basquete: ["basketball", "nba"], beisebol: ["baseball", "mlb"], hoquei: ["hockey", "nhl"],
  jogo: ["game", "match"], partida: ["game", "match"], campeao: ["champion", "winner", "title"],
  campeonato: ["championship", "league"], copa: ["cup", "world cup"], final: ["final", "finals"],
  temporada: ["season"], vencedor: ["winner", "champion"], vitoria: ["victory", "win"],
  torneio: ["tournament", "open"], rodada: ["round"], medalha: ["medal"], olimpiada: ["olympic"],
  // cripto e tech
  cripto: ["crypto", "bitcoin", "ethereum"], moeda: ["coin", "currency"],
  // cultura e ciência
  filme: ["movie", "film"], cinema: ["movie", "film", "box office"], premio: ["award", "prize"],
  musica: ["music", "song"], clima: ["climate", "weather", "temperature"], tempo: ["weather"],
  furacao: ["hurricane"], vacina: ["vaccine"], remedio: ["drug", "medicine"],
  espaco: ["space", "nasa", "spacex"], foguete: ["rocket", "launch"],
  // meses (aparecem MUITO nos títulos: september 59, december 44…)
  janeiro: ["january", "jan"], fevereiro: ["february", "feb"], marco: ["march", "mar"],
  abril: ["april", "apr"], maio: ["may"], junho: ["june", "jun"], julho: ["july", "jul"],
  agosto: ["august", "aug"], setembro: ["september", "sep"], outubro: ["october", "oct"],
  novembro: ["november", "nov"], dezembro: ["december", "dec"],
  // comparadores comuns nos títulos
  acima: ["above", "over", "at least"], abaixo: ["below", "under"], maior: ["most", "highest"],
  antes: ["before"], depois: ["after"], "pelo menos": ["at least"],
};

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
