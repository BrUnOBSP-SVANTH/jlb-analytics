/**
 * Vocabulário PT↔EN dos mercados de previsão — usado nos DOIS lados.
 *
 * POR QUE ISTO EXISTE, e por que é aqui. Os títulos dos mercados chegam em
 * inglês ("Brazil Presidential Election"); o nosso acervo de notícias é gravado
 * em português, porque o coletor traduz os títulos na entrada. Resultado: buscar
 * o título cru no acervo não acha nada.
 *
 * MEDIDO em 05/09: dos 200 mercados de maior volume do site, só 57 (28,5%)
 * encontravam contexto. Entre os secos estavam os MAIORES — "Democratic
 * Presidential Nominee 2028", "Brazil Presidential Election", "Fed Decision in
 * September?". Não era falta de notícia: era a pergunta em um idioma e a
 * resposta em outro.
 *
 * A saída óbvia seria traduzir a consulta. Só que os três tradutores gratuitos
 * (Google, MyMemory, Groq) respondem 429 com frequência — e uma busca que depende
 * de serviço externo instável falha justamente quando o site tem movimento.
 * Este dicionário resolve o caso recorrente sem rede: o vocabulário de mercado de
 * previsão é pequeno e repetitivo (eleição, presidente, juros, campeão, meses).
 * A tradução externa continua existindo como complemento, não como dependência.
 */

/** Português → inglês. É a direção que a busca do usuário usa na tela. */
export const SINONIMOS: Record<string, string[]> = {
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
  candidato: ["nominee", "candidate"], indicado: ["nominee"], invadir: ["invade", "invasion"],
  acordo: ["deal", "agreement"], tratado: ["treaty"], refem: ["hostage"],
  // economia
  juros: ["rate", "fed", "interest", "fomc"], taxa: ["rate"], fed: ["fed", "fomc"],
  inflacao: ["inflation", "cpi"], recessao: ["recession"], desemprego: ["unemployment"],
  dolar: ["dollar", "usd"], ouro: ["gold"], petroleo: ["oil"], bolsa: ["stock", "index"],
  acoes: ["stock", "shares"], acao: ["stock"], imposto: ["tax"], tarifa: ["tariff"],
  lucro: ["earnings", "profit"], empresa: ["company", "companies"],
  corte: ["cut", "cuts"], decisao: ["decision"], reuniao: ["meeting"],
  // esportes
  tenis: ["tennis", "us open", "atp", "wta"], futebol: ["soccer", "football"],
  basquete: ["basketball", "nba"], beisebol: ["baseball", "mlb"], hoquei: ["hockey", "nhl"],
  jogo: ["game", "match"], partida: ["game", "match"], campeao: ["champion", "winner", "title"],
  campeonato: ["championship", "league"], copa: ["cup", "world cup"], final: ["final", "finals"],
  temporada: ["season"], vencedor: ["winner", "champion"], vitoria: ["victory", "win"],
  torneio: ["tournament", "open"], rodada: ["round"], medalha: ["medal"], olimpiada: ["olympic"],
  tecnico: ["coach", "manager"], contratacao: ["signing", "transfer"], lesao: ["injury"],
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
 * Países e lugares que aparecem nos títulos. Ficam à parte porque não são
 * sinônimo, são nome — e o acervo brasileiro sempre os escreve em português.
 */
const LUGARES: Record<string, string> = {
  brazil: "brasil", "united states": "estados unidos", russia: "rússia", ukraine: "ucrânia",
  china: "china", france: "frança", germany: "alemanha", spain: "espanha", italy: "itália",
  japan: "japão", "south korea": "coreia", "north korea": "coreia", israel: "israel",
  iran: "irã", venezuela: "venezuela", argentina: "argentina", mexico: "méxico",
  india: "índia", turkey: "turquia", "saudi arabia": "arábia", egypt: "egito",
  england: "inglaterra", "united kingdom": "reino unido", canada: "canadá",
};

/**
 * A grafia ACENTUADA de cada chave. Não é preciosismo: é o que faz a busca
 * funcionar.
 *
 * As chaves de `SINONIMOS` são sem acento porque a busca da TELA normaliza os
 * dois lados antes de comparar. Já o índice de texto do banco guarda o acento —
 * medido em 05/09: `websearch_to_tsquery('portuguese','eleição')` acha 89
 * artigos e `'eleicao'` acha ZERO. Sem esta tabela, toda palavra portuguesa
 * acentuada entrava na consulta do servidor como termo morto, e a tradução do
 * dicionário não movia nada — foi exatamente o que aconteceu na primeira versão.
 *
 * Só entram aqui as que MUDAM com o acento; o resto usa a própria chave.
 */
const PT_ACENTUADO: Record<string, string> = {
  eleicao: "eleição", eleicoes: "eleições", votacao: "votação", camara: "câmara",
  primaria: "primária", previa: "prévia", secretario: "secretário",
  renuncia: "renúncia", sancao: "sanção", decisao: "decisão", reuniao: "reunião",
  inflacao: "inflação", recessao: "recessão", acoes: "ações", acao: "ação",
  petroleo: "petróleo", dolar: "dólar", imposto: "imposto",
  tenis: "tênis", hoquei: "hóquei", campeao: "campeão", campeonato: "campeonato",
  olimpiada: "olimpíada", medalha: "medalha", lesao: "lesão", tecnico: "técnico",
  contratacao: "contratação", musica: "música", furacao: "furacão",
  espaco: "espaço", marco: "março", remedio: "remédio", cinema: "cinema",
  premio: "prêmio", vitoria: "vitória", russia: "rússia", ucrania: "ucrânia",
};

/** A forma que vai para a consulta do banco: acentuada quando a palavra pede. */
function grafiaDeBusca(chave: string): string {
  return PT_ACENTUADO[chave] ?? chave;
}

/** Inglês → português. Derivado da tabela acima, invertida uma vez só. */
const EN_PARA_PT: Record<string, string[]> = (() => {
  const mapa: Record<string, Set<string>> = {};
  for (const [pt, ingleses] of Object.entries(SINONIMOS)) {
    for (const en of ingleses) {
      (mapa[en] ??= new Set()).add(grafiaDeBusca(pt));
    }
  }
  for (const [en, pt] of Object.entries(LUGARES)) {
    (mapa[en] ??= new Set()).add(pt);
  }
  const saida: Record<string, string[]> = {};
  for (const [en, pts] of Object.entries(mapa)) saida[en] = Array.from(pts);
  return saida;
})();

/** Tira acento e caixa — o formato em que as duas tabelas são consultadas. */
export function semAcento(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/**
 * O termo em português, quando conhecemos. Devolve lista vazia para o que não
 * está no dicionário — nome próprio (Trump, Bitcoin, Everton) não precisa de
 * tradução, e inventar uma seria pior que não ter.
 */
export function paraPortugues(termo: string): string[] {
  return EN_PARA_PT[semAcento(termo)] ?? [];
}

/** O termo em inglês, quando conhecemos. Usado pela busca da tela. */
export function paraIngles(termo: string): string[] {
  return SINONIMOS[semAcento(termo)] ?? [];
}

/**
 * Enriquece uma lista de termos com os equivalentes em português. Mantém os
 * originais: nome próprio casa em qualquer idioma, e a notícia em inglês que
 * ainda não foi traduzida continua alcançável.
 */
export function enriquecerComPortugues(termos: string[]): string[] {
  const saida = new Set<string>();
  for (const t of termos) {
    if (!t) continue;
    saida.add(t);
    for (const pt of paraPortugues(t)) saida.add(pt);
  }
  return Array.from(saida);
}
