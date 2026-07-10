import { describe, it, expect } from "vitest";
import { topKeywords, looksEnglish } from "./cerebro.ts";

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
