import { describe, it, expect } from "vitest";
import { topKeywords, looksEnglish, rankHits, dedupeByTitle, overlapsQuery, noticiaFresca, janelaDeNoticia, entidadesDoConfronto, dominioDoMercado, tsqueryDeGrupos, overlapsGrupos } from "./cerebro.ts";

describe("topKeywords", () => {
  it("prioriza substantivos próprios (entidades do mercado)", () => {
    const kw = topKeywords("mercado prevê que Trump vence eleição americana");
    expect(kw.split(" ")[0]).toBe("Trump");
  });

  it("ignora stopwords EN e PT", () => {
    const kw = topKeywords("Will the market announce something about inflation");
    expect(kw).not.toMatch(/\b(Will|the|announce|about)\b/i);
    expect(kw).toContain("inflation");
  });

  it("não repete termos e respeita o limite", () => {
    const kw = topKeywords("Selic Selic selic juros juros câmbio inflação PIB");
    const words = kw.split(" ");
    expect(words.length).toBeLessThanOrEqual(4);
    expect(new Set(words.map((w) => w.toLowerCase())).size).toBe(words.length);
  });

  it("retorna vazio quando só há stopwords/termos curtos", () => {
    expect(topKeywords("the a of e um")).toBe("");
  });

  // Regressão (31/08): o corte por tamanho engolia siglas e times de e-sport,
  // que são justamente os termos mais distintivos da categoria.
  it("preserva siglas e nomes curtos (LCK, T1, BO5, BTC)", () => {
    const kw = topKeywords("LoL: T1 vs Gen.G (BO5) - LCK Finals", 6);
    expect(kw).toContain("LCK");
    expect(kw).toContain("T1");
    expect(topKeywords("Preço do BTC acima de 115 mil", 6)).toContain("BTC");
  });

  it("ainda descarta palavras curtas comuns (vs, de, do)", () => {
    const kw = topKeywords("Flamengo vs Palmeiras no Maracanã", 6);
    expect(kw.split(" ")).not.toContain("vs");
  });
});

describe("overlapsQuery — impede que palavra genérica case mercados alheios", () => {
  const ruidoNba = {
    title: "Replays Boris Diaw lockdown defense against LeBron in the 2014 Finals",
    summary: "NBA destaque",
  };
  const noticiaReal = {
    title: "T1 avança para a final da LCK após vencer Gen.G",
    summary: "LCK playoffs BO5",
  };
  // O bug real: "LoL: T1 vs Gen.G (BO5) - LCK Finals" sobrava com UM termo
  // ("Finals") e um destaque de basquete entrava como contexto do mercado.
  const termos = topKeywords("LoL: T1 vs Gen.G (BO5) - LCK Finals", 6).split(" ");

  it("rejeita o hit que só casa a palavra genérica", () => {
    expect(overlapsQuery(ruidoNba, termos)).toBe(false);
  });

  it("aceita o hit que casa as entidades da pergunta", () => {
    expect(overlapsQuery(noticiaReal, termos)).toBe(true);
  });

  // Regressão (31/08): casamento era por SUBSTRING. O mercado de Dota "Inner
  // Circle (BO3) - EPL Masters" puxou um artigo sobre depósitos de USDC porque
  // "epl" cabe dentro de "deployer". Termo tem que casar palavra inteira.
  it("não casa termo escondido dentro de outra palavra", () => {
    const cripto = {
      title: "Hyperliquid’s next big revenue boost activates today",
      summary: "under the deal coinbase (treasury deployer) and circle struck back in may",
    };
    expect(overlapsQuery(cripto, ["Inner", "Circle", "BO3", "EPL"])).toBe(false);
  });
});

describe("looksEnglish", () => {
  it("detecta título de mercado em inglês", () => {
    expect(looksEnglish("Will Iran announce withdrawal from MOU negotiations by July 7?")).toBe(true);
    expect(looksEnglish("Will the US announce a blockade on Iran?")).toBe(true);
  });

  it("não marca pergunta em português", () => {
    expect(looksEnglish("A Selic vai cair abaixo de 10% nos próximos 6 meses?")).toBe(false);
    expect(looksEnglish("Como o IPCA deve se comportar dado o câmbio atual?")).toBe(false);
  });

  it("texto curto demais não dispara", () => {
    expect(looksEnglish("Fed decision")).toBe(false);
  });
});

describe("rankHits", () => {
  const hits = [
    { title: "IPO da SpaceX movimenta Wall Street", summary: "ações de tecnologia" },
    { title: "Selic e inflação pressionam mercados", summary: "Copom avalia juros e inflação no Brasil" },
    { title: "Eleição americana agita apostas", summary: "Trump lidera pesquisas" },
  ];

  it("coloca o hit com mais termos da consulta primeiro (ignorando acentos)", () => {
    const ranked = rankHits(hits, ["Selic", "inflacao", "juros"]);
    expect(ranked[0].title).toContain("Selic");
  });

  it("síntese ganha desempate sobre artigo com mesma sobreposição", () => {
    const mixed = [
      { title: "Juros em alta", summary: "", kind: "artigo" },
      { title: "Juros em alta na semana", summary: "", kind: "síntese" },
    ];
    const ranked = rankHits(mixed, ["juros"]);
    expect(ranked[0].kind).toBe("síntese");
  });

  it("sem termos válidos, preserva a ordem original", () => {
    const ranked = rankHits(hits, ["ab", "de"]);
    expect(ranked.map((h) => h.title)).toEqual(hits.map((h) => h.title));
  });

  it("com mesma relevância, o mais recente vem primeiro", () => {
    const hoje = new Date().toISOString();
    const antigo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const ranked = rankHits([
      { title: "Selic sobe", summary: "juros", date: antigo },
      { title: "Selic sobe de novo", summary: "juros", date: hoje },
    ], ["selic", "juros"]);
    expect(ranked[0].date).toBe(hoje);
  });

  it("recência NÃO atropela um termo a mais de relevância", () => {
    const hoje = new Date().toISOString();
    const antigo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const ranked = rankHits([
      { title: "Selic e inflação subindo", summary: "juros altos", date: antigo }, // 3 termos, antigo
      { title: "Selic hoje", summary: "", date: hoje },                            // 1 termo, fresco
    ], ["selic", "inflacao", "juros"]);
    expect(ranked[0].title).toContain("inflação"); // relevância vence a recência
  });
});

describe("dedupeByTitle", () => {
  it("remove o mesmo artigo sindicalizado com variação de caixa/acentos", () => {
    const hits = [
      { title: "Petróleo sobe com tensão no Golfo" },
      { title: "PETRÓLEO SOBE COM TENSÃO NO GOLFO" },
      { title: "Outro assunto qualquer" },
    ];
    expect(dedupeByTitle(hits)).toHaveLength(2);
  });
});

describe("noticiaFresca — notícia velha não pode mexer em preço", () => {
  const diasAtras = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  // Medido em 03/09: com contexto do Cérebro, o desvio da IA previa o erro do
  // mercado com correlação −0,35 (IC 95% não cruza zero) — a notícia empurrava
  // para o lado ERRADO. Causa: idade mediana de 7 dias, com casos de 21 e 54.
  it("aceita notícia dos últimos dias", () => {
    expect(noticiaFresca(diasAtras(0))).toBe(true);
    expect(noticiaFresca(diasAtras(2))).toBe(true);
  });

  it("rejeita a notícia que o mercado já precificou", () => {
    expect(noticiaFresca(diasAtras(7))).toBe(false);   // a idade MEDIANA que tínhamos
    expect(noticiaFresca(diasAtras(54))).toBe(false);  // o pior caso observado
  });

  it("sem data, não arrisca", () => {
    // Não dá para saber se é de hoje ou do mês passado; em preço, a dúvida custa.
    expect(noticiaFresca(undefined)).toBe(false);
    expect(noticiaFresca("data-invalida")).toBe(false);
  });

  it("ignora data no futuro (dado sujo da fonte)", () => {
    expect(noticiaFresca(diasAtras(-5))).toBe(false);
  });
});

describe("janelaDeNoticia — a janela acompanha o relógio do mercado", () => {
  const daquiA = (dias: number) => Date.now() + dias * 86_400_000;

  it("mercado de amanhã fica no mínimo medido (3 dias)", () => {
    // O relógio dele é de horas; notícia de 3 dias já é passado. É a faixa onde
    // a medição foi feita (56 dos 59 mercados com notícia resolvem em ≤3d).
    expect(janelaDeNoticia(daquiA(1))).toBe(3);
    expect(janelaDeNoticia(daquiA(8))).toBe(3);
  });

  it("mercado distante aceita notícia mais antiga, proporcional ao prazo", () => {
    // Uma eleição de 2028 anda em semanas: notícia de 10 dias ainda é o estado
    // atual do assunto, não história.
    expect(janelaDeNoticia(daquiA(40))).toBeCloseTo(10, 0);
  });

  it("nunca passa do teto de 14 dias, por mais longe que o mercado esteja", () => {
    expect(janelaDeNoticia(daquiA(365))).toBe(14);
    expect(janelaDeNoticia(daquiA(3000))).toBe(14);
  });

  it("sem data de fechamento, ou já vencido, usa o mínimo", () => {
    expect(janelaDeNoticia(undefined)).toBe(3);
    expect(janelaDeNoticia(daquiA(-5))).toBe(3);
    expect(janelaDeNoticia(NaN)).toBe(3);
  });
});

describe("entidadesDoConfronto — o nome do jogo não pode roubar a vaga do time", () => {
  // Bug real (05/09): "Counter-Strike: Spirit vs Team Falcons" devolvia ZERO
  // artigos e a IA escrevia "não temos notícias sobre este confronto" — com as
  // notícias no nosso próprio banco. "Strike" entrava como termo e afundava a busca.
  it("descarta o prefixo do jogo e devolve os dois lados", () => {
    expect(entidadesDoConfronto("Counter-Strike: Spirit vs Team Falcons")).toBe("Spirit Falcons");
    expect(entidadesDoConfronto("CS2: Team Spirit vs Team Falcons")).toBe("Spirit Falcons");
    expect(entidadesDoConfronto("LoL: T1 vs Gen.G")).toBe("T1 Gen.G");
  });

  it("descarta torneio depois do travessão e formato entre parênteses", () => {
    expect(entidadesDoConfronto("Dota: Inner Circle (BO3) - EPL Masters")).toBeNull(); // sem "vs" não é confronto
    // A liga (LCK) entra JUNTO com os times: artigo do torneio é assunto do
    // confronto mesmo sem citar os dois. O formato (BO5) não, porque não
    // identifica ninguém.
    expect(entidadesDoConfronto("LoL: T1 vs Gen.G (BO5) - LCK Finals")).toBe("T1 Gen.G LCK");
  });

  it("tira palavras genéricas que casariam qualquer coisa", () => {
    // "Team" sozinho casa qualquer título de esporte do acervo.
    expect(entidadesDoConfronto("Team Spirit vs Team Falcons")).not.toMatch(/Team/);
  });

  it("aceita as outras formas de escrever confronto", () => {
    expect(entidadesDoConfronto("Flamengo x Palmeiras")).toBe("Flamengo Palmeiras");
    expect(entidadesDoConfronto("Alcaraz versus Sinner")).toBe("Alcaraz Sinner");
  });

  it("não é confronto: devolve null e deixa o extrator genérico trabalhar", () => {
    expect(entidadesDoConfronto("Will the Fed cut rates in December?")).toBeNull();
    expect(entidadesDoConfronto("Preço do BTC acima de 115 mil")).toBeNull();
  });

  it("topKeywords usa as entidades quando é confronto", () => {
    expect(topKeywords("Counter-Strike: Spirit vs Team Falcons")).toBe("Spirit Falcons");
    // E segue igual quando não é.
    expect(topKeywords("mercado prevê que Trump vence eleição americana").split(" ")[0]).toBe("Trump");
  });
});

describe("dominioDoMercado — a trava que impede o nome solto de virar ruído", () => {
  // Sem a trava, "Spirit" casaria "Spirit Airlines" (temos esse artigo, da
  // Decrypt) e um mercado de CS2 receberia notícia de companhia aérea.
  it("e-sports só aceita artigo de e-sports/games", () => {
    const d = dominioDoMercado("esports");
    expect(d?.has("esports")).toBe(true);
    expect(d?.has("cripto")).toBe(false);
  });

  it("reconcilia os nomes das duas pontas (mercado em inglês, artigo em português)", () => {
    expect(dominioDoMercado("sports")?.has("esportes")).toBe(true);
    expect(dominioDoMercado("bitcoin")?.has("cripto")).toBe(true);
    expect(dominioDoMercado("politics")?.has("política")).toBe(true);
  });

  it("categoria desconhecida devolve null — e aí a regra estrita continua valendo", () => {
    expect(dominioDoMercado("categoria-que-nao-existe")).toBeNull();
    expect(dominioDoMercado(undefined)).toBeNull();
  });
});

describe("tsqueryDeGrupos — E entre conceitos, OU dentro do conceito", () => {
  it("junta as variantes com OU e os conceitos com E", () => {
    const q = tsqueryDeGrupos([["Election", "eleição"], ["Brazil", "brasil"]]);
    expect(q).toContain("|");
    expect(q).toContain("&");
    expect(q).toMatch(/eleição/);
  });

  it("ANO não vira conceito exigido", () => {
    // "Presidential Election Winner 2028" exigia que o artigo dissesse 2028, e
    // reportagem sobre a eleição de 2028 quase nunca repete o ano. Era o termo
    // que sozinho zerava a consulta.
    const q = tsqueryDeGrupos([["Election", "eleição"], ["2028"], ["Winner", "vencedor"]]);
    expect(q).not.toContain("2028");
  });

  it("exige NO MÁXIMO dois conceitos", () => {
    // Medido: exigindo todos, só 14% dos mercados de maior volume achavam algo;
    // limitando a dois, 60%. Dois já é a régua de precisão do filtro.
    const q = tsqueryDeGrupos([["alpha"], ["bravo"], ["charlie"], ["delta"]]);
    expect(q.split("&").length).toBe(2);
  });

  it("nunca produz expressão inválida", () => {
    // to_tsquery quebra a consulta inteira com HTTP 400 se a sintaxe falhar.
    expect(tsqueryDeGrupos([])).toBe("");
    expect(tsqueryDeGrupos([[""], ["  "]])).toBe("");
    expect(tsqueryDeGrupos([["a"], ["2026"]])).not.toMatch(/&\s*$|^\s*&/);
  });

  it("descarta pontuação que quebraria o to_tsquery", () => {
    expect(tsqueryDeGrupos([["Gen.G"], ["T1"]])).not.toContain(".");
  });
});

describe("overlapsGrupos — variante do mesmo conceito não conta duas vezes", () => {
  it("casar três variantes do MESMO conceito não substitui o segundo assunto", () => {
    // Sem isto, enriquecer "election" com "eleição/eleitoral" faria um artigo de
    // um assunto só casar três termos e furar o filtro que protege do ruído.
    // O artigo abaixo fala de eleição três vezes e do Brasil nenhuma.
    const artigo = { title: "Eleição municipal movimenta a cidade", summary: "eleitoral eleições" };
    const grupos = [["election", "eleição", "eleitoral", "eleições"], ["brazil", "brasil"]];
    expect(overlapsGrupos(artigo, grupos)).toBe(false);
  });

  it("dois assuntos distintos passam", () => {
    const artigo = { title: "Eleição presidencial no Brasil", summary: "" };
    expect(overlapsGrupos(artigo, [["election", "eleição"], ["brazil", "brasil"]])).toBe(true);
  });
});
