/**
 * Testes — sanitização de probabilidade dos cards de mercado.
 * Regressão do bug onde um preço inválido virava "NaN%" no card.
 */
import { describe, it, expect } from "vitest";
import { clampProb, normalizeCategory } from "./trending";

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
    expect(normalizeCategory("Ukraine")).toBe("politics");
    expect(normalizeCategory("Boiling Point")).not.toBe("business"); // "oil" em "b(oil)ing"
  });

  it("classifica as categorias que mais caíam em Outros", () => {
    expect(normalizeCategory("Companies")).toBe("business");
    expect(normalizeCategory("Financials")).toBe("business");
    expect(normalizeCategory("fomc")).toBe("business");
    expect(normalizeCategory("Iran")).toBe("politics");
    expect(normalizeCategory("Military Strikes")).toBe("politics");
    expect(normalizeCategory("MLB")).toBe("sports");
    expect(normalizeCategory("UFC")).toBe("sports");
  });

  it("mantém o que já funcionava", () => {
    expect(normalizeCategory("Politics")).toBe("politics");
    expect(normalizeCategory("Sports")).toBe("sports");
    expect(normalizeCategory("Crypto")).toBe("crypto");
    expect(normalizeCategory("Oscars")).toBe("pop");
  });

  it("devolve Outros quando não há sinal, em vez de inventar grupo", () => {
    expect(normalizeCategory("Clavicular")).toBe("other");
    expect(normalizeCategory("")).toBe("other");
    expect(normalizeCategory(undefined)).toBe("other");
  });
});
