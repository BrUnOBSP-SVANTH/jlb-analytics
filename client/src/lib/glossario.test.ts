import { describe, it, expect } from "vitest";
import { buscarVerbete, VERBETES } from "./glossario";

describe("glossário — a explicação tem que ser em linguagem de gente", () => {
  it("acha o verbete com acento, sem acento, maiúscula e plural", () => {
    expect(buscarVerbete("Brier")?.termo).toBe("Brier");
    expect(buscarVerbete("BRIER")?.termo).toBe("Brier");
    expect(buscarVerbete("calibração")?.termo).toBe("Calibração");
    expect(buscarVerbete("calibracao")?.termo).toBe("Calibração");
  });

  it("devolve indefinido para termo sem verbete, em vez de inventar", () => {
    // O componente usa isso para NÃO prometer explicação que não existe.
    expect(buscarVerbete("supercalifragilistico")).toBeUndefined();
  });

  // A razão de o glossário ter sido reescrito: a versão anterior definia Brier
  // como "(1/n) Σ(previsão − resultado)²" — explicar com somatório não é explicar.
  it("nenhuma explicação simples usa notação matemática", () => {
    const comFormula = VERBETES.filter((v) => /[Σ∑√²×÷]|\(1\/n\)/.test(v.simples));
    expect(comFormula.map((v) => v.termo)).toEqual([]);
  });

  it("toda explicação simples é uma frase de verdade, não um rótulo", () => {
    for (const v of VERBETES) {
      expect(v.simples.length, v.termo).toBeGreaterThan(40);
      expect(v.simples, v.termo).toMatch(/[.!?]$/);
    }
  });

  it("a fórmula, quando existe, fica no campo técnico — não some", () => {
    // Precisão não foi perdida: só saiu da frente de quem não a pediu.
    expect(buscarVerbete("brier")?.tecnico).toBeTruthy();
    expect(buscarVerbete("skill")?.tecnico).toContain("Brier");
  });
});
