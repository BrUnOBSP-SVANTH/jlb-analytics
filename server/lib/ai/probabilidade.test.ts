import { describe, it, expect } from "vitest";
import { exigirProbabilidade, ProbabilidadeInvalida } from "./marketAnalysis.ts";

/**
 * A análise só roda com preço na escala 0..1.
 *
 * Em 14/09 o `pnpm qualidade` passou o `yesProb` do Kalshi cru (23, na escala
 * 0–100) e a análise escreveu um texto inteiro sobre "2300% de chance ao SIM".
 * Pela rota, esse texto iria para um cache de 3 horas servido a todos.
 */
describe("exigirProbabilidade", () => {
  it("aceita a escala 0..1, inclusive as pontas", () => {
    expect(exigirProbabilidade(0)).toBe(0);
    expect(exigirProbabilidade(0.23)).toBe(0.23);
    expect(exigirProbabilidade(1)).toBe(1);
  });

  it("recusa o preço do Kalshi cru e diz a causa provável", () => {
    expect(() => exigirProbabilidade(23)).toThrow(ProbabilidadeInvalida);
    expect(() => exigirProbabilidade(23)).toThrow(/escala 0–100; divida por 100/);
  });

  it("recusa preço AUSENTE — o antigo `?? 0.5` inventava 50%", () => {
    expect(() => exigirProbabilidade(undefined)).toThrow(ProbabilidadeInvalida);
    expect(() => exigirProbabilidade(null)).toThrow(ProbabilidadeInvalida);
  });

  it("recusa o que não é número finito", () => {
    for (const v of [NaN, Infinity, -0.1, 1.01, "0.5", {}]) {
      expect(() => exigirProbabilidade(v)).toThrow(ProbabilidadeInvalida);
    }
  });

  it("acima de 100 não sugere dividir: não é erro de escala, é dado quebrado", () => {
    expect(() => exigirProbabilidade(2300)).toThrow(ProbabilidadeInvalida);
    expect(() => exigirProbabilidade(2300)).not.toThrow(/divida por 100/);
  });
});
