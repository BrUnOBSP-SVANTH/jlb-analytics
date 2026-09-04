import { describe, it, expect } from "vitest";
import { intervaloWilson, comparaComMercado } from "./incerteza.ts";

describe("intervaloWilson — a margem de erro que o site publica", () => {
  it("amostra grande dá margem estreita; amostra pequena, margem larga", () => {
    // É o ponto inteiro de publicar a margem: 79% com 900 resoluções e 79% com 20
    // são afirmações MUITO diferentes, e o número sozinho não conta isso.
    const grande = intervaloWilson(711, 900)!;
    const pequena = intervaloWilson(16, 20)!;
    expect(grande.margemPp).toBeLessThan(4);
    expect(pequena.margemPp).toBeGreaterThan(10);
  });

  it("nunca passa de 100% nem cai abaixo de 0%", () => {
    // A fórmula normal comum estoura a faixa nas pontas ("97% ± 5" = 102%).
    // Wilson se comporta — e taxa de acerto alta vive justamente na ponta.
    const quaseTudo = intervaloWilson(99, 100)!;
    expect(quaseTudo.alto).toBeLessThanOrEqual(100);
    const quaseNada = intervaloWilson(1, 100)!;
    expect(quaseNada.baixo).toBeGreaterThanOrEqual(0);
  });

  it("sem amostra, devolve nulo em vez de número inventado", () => {
    expect(intervaloWilson(0, 0)).toBeNull();
    expect(intervaloWilson(5, NaN)).toBeNull();
  });
});

describe("comparaComMercado — empate é uma afirmação, não uma desculpa", () => {
  it("intervalos que se sobrepõem = empate, mesmo com números diferentes", () => {
    // 79,0% vs 79,3% em ~880 casos: a diferença é menor que a margem. Dizer
    // "perdemos por 0,3" seria ler ruído como resultado.
    const r = comparaComMercado(695, 880, 698, 880)!;
    expect(r.veredito).toBe("empate");
    expect(r.explicacao).toMatch(/menor que a margem/i);
  });

  it("reconhece vantagem real quando os intervalos não se tocam", () => {
    expect(comparaComMercado(900, 1000, 600, 1000)!.veredito).toBe("melhor");
    expect(comparaComMercado(600, 1000, 900, 1000)!.veredito).toBe("pior");
  });

  it("sem dado de um dos lados, não opina", () => {
    expect(comparaComMercado(10, 20, 0, 0)).toBeNull();
  });
});
