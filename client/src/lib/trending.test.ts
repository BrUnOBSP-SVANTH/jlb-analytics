/**
 * Testes — sanitização de probabilidade dos cards de mercado.
 * Regressão do bug onde um preço inválido virava "NaN%" no card.
 */
import { describe, it, expect } from "vitest";
import { clampProb } from "./trending";

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
