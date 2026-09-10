/**
 * Testes — sanitização de probabilidade dos cards de mercado.
 * Regressão do bug onde um preço inválido virava "NaN%" no card.
 */
import { describe, it, expect } from "vitest";
import { clampProb, normalizeCategory, intercalarPorFonte, type TrendingItem, type Source } from "./trending";

describe("clampProb", () => {
  it("usa o fallback para NaN (o bug original)", () => {
    expect(clampProb(NaN)).toBe(0.5);
    expect(clampProb(NaN, 0.3)).toBe(0.3);
  });

  it("usa o fallback para Infinity", () => {
    expect(clampProb(Infinity)).toBe(0.5);
    expect(clampProb(-Infinity)).toBe(0.5);
  });

  it("faz clamp para a faixa 0.01–0.99", () => {
    expect(clampProb(0)).toBe(0.01);
    expect(clampProb(1)).toBe(0.99);
    expect(clampProb(1.5)).toBe(0.99);
    expect(clampProb(-2)).toBe(0.01);
  });

  it("mantém valores válidos intactos", () => {
    expect(clampProb(0.55)).toBe(0.55);
    expect(clampProb(0.02)).toBe(0.02);
  });
});

describe("normalizeCategory — classifica a categoria crua das bolsas", () => {
  // Regressão: a regra antiga usava includes("ai") e mandava mercado sobre a
  // UCRÂNIA para Ciência/Tech — "ukr(ai)ne". Sigla tem que casar palavra inteira.
  it("não casa sigla escondida dentro de outra palavra", () => {
    expect(normalizeCategory("Ukraine")).toBe("geopolitics");
    expect(normalizeCategory("Boiling Point")).not.toBe("macro"); // "oil" em "b(oil)ing"
  });

  it("classifica as categorias que mais caíam em Outros", () => {
    expect(normalizeCategory("Companies")).toBe("business");
    expect(normalizeCategory("Financials")).toBe("business");
    expect(normalizeCategory("MLB")).toBe("sports");
    expect(normalizeCategory("UFC")).toBe("sports");
  });

  // MKT-13: a decisão do Fed e o Estreito de Ormuz apareciam os DOIS como
  // "Negócios", e não existia categoria de macro/juros — que é a especialidade
  // do produto. Um grupo que engole balanço de empresa, taxa de juros e conflito
  // no Oriente Médio não ajuda ninguém a achar nada.
  it("macro e juros têm categoria própria — é a especialidade da casa", () => {
    expect(normalizeCategory("fomc")).toBe("macro");
    expect(normalizeCategory("Fed")).toBe("macro");
    expect(normalizeCategory("Inflation")).toBe("macro");
    expect(normalizeCategory("Selic")).toBe("macro");
    expect(normalizeCategory("Recession")).toBe("macro");
  });

  it("geopolítica não é eleição, e vem antes na régua", () => {
    // "Politics" genérico vai para eleições (é o que a bolsa etiqueta assim na
    // esmagadora maioria dos casos), mas Irã e ataque militar, não.
    expect(normalizeCategory("Iran")).toBe("geopolitics");
    expect(normalizeCategory("Military Strikes")).toBe("geopolitics");
    expect(normalizeCategory("Geopolitics")).toBe("geopolitics");
    expect(normalizeCategory("Politics")).toBe("elections");
    expect(normalizeCategory("Midterms")).toBe("elections");
  });

  it("mantém o que já funcionava", () => {
    expect(normalizeCategory("Sports")).toBe("sports");
    expect(normalizeCategory("Crypto")).toBe("crypto");
    expect(normalizeCategory("Oscars")).toBe("culture");
  });

  it("devolve Outros quando não há sinal, em vez de inventar grupo", () => {
    expect(normalizeCategory("Clavicular")).toBe("other");
    expect(normalizeCategory("")).toBe("other");
    expect(normalizeCategory(undefined)).toBe("other");
  });
});

describe("intercalarPorFonte — a visão padrão mostra a mistura que promete", () => {
  const it_ = (source: Source, id: string, score = 100): TrendingItem =>
    ({ id, source, score, title: id } as TrendingItem);

  it("nenhuma fonte é enterrada pelo desempate", () => {
    // MKT-05, medido em navegador: 20 de 20 cards eram Polymarket, embaixo de um
    // subtítulo que diz "Reddit · Polymarket · Kalshi". Kalshi e Manifold eram
    // baixados (150 e 36 itens) e nunca exibidos.
    const entrada = [
      ...Array.from({ length: 10 }, (_, i) => it_("polymarket", `p${i}`)),
      ...Array.from({ length: 10 }, (_, i) => it_("kalshi", `k${i}`)),
    ];
    const primeiros = intercalarPorFonte(entrada).slice(0, 6).map((x) => x.source);
    expect(primeiros).toContain("kalshi");
    expect(primeiros).toContain("polymarket");
  });

  it("dentro de cada fonte, a ordem de score manda", () => {
    // O rodízio é ENTRE fontes; dentro de uma, o mercado mais relevante continua
    // subindo. Trocar isso esconderia os mercados grandes.
    const entrada = [
      it_("polymarket", "p-alto", 100), it_("polymarket", "p-medio", 50),
      it_("kalshi", "k-alto", 90), it_("kalshi", "k-medio", 40),
    ];
    const saida = intercalarPorFonte(entrada);
    const poly = saida.filter((x) => x.source === "polymarket").map((x) => x.id);
    expect(poly).toEqual(["p-alto", "p-medio"]);
  });

  it("não perde nem duplica item nenhum", () => {
    const entrada = [
      ...Array.from({ length: 7 }, (_, i) => it_("polymarket", `p${i}`)),
      ...Array.from({ length: 3 }, (_, i) => it_("kalshi", `k${i}`)),
      ...Array.from({ length: 1 }, (_, i) => it_("manifold", `m${i}`)),
    ];
    const saida = intercalarPorFonte(entrada);
    expect(saida).toHaveLength(11);
    expect(new Set(saida.map((x) => x.id)).size).toBe(11);
  });

  it("fonte que acaba sai do rodízio sem deixar buraco", () => {
    const entrada = [
      ...Array.from({ length: 5 }, (_, i) => it_("polymarket", `p${i}`)),
      it_("kalshi", "k0"),
    ];
    const saida = intercalarPorFonte(entrada);
    expect(saida.map((x) => x.id)).toEqual(["p0", "k0", "p1", "p2", "p3", "p4"]);
  });

  it("com uma fonte só, devolve a lista intacta", () => {
    const entrada = Array.from({ length: 4 }, (_, i) => it_("polymarket", `p${i}`));
    expect(intercalarPorFonte(entrada).map((x) => x.id)).toEqual(["p0", "p1", "p2", "p3"]);
    expect(intercalarPorFonte([])).toEqual([]);
  });
});
