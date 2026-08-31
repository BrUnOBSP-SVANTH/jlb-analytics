import { describe, it, expect } from "vitest";
import { topKeywords, looksEnglish, rankHits, dedupeByTitle, overlapsQuery } from "./cerebro.ts";

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
