import { describe, it, expect } from "vitest";
import { calcularVantagem, precoCalculavel, PRECO_MINIMO, PRECO_MAXIMO } from "./edge";

/**
 * Os números deste arquivo saíram de um mercado REAL: `poly-2772176`, UEFA
 * Champions League 2027, 12 desfechos, Barcelona a 18,5%. Foi nele que a
 * calculadora foi flagrada imprimindo `0.0%` de EV quando o valor certo era
 * +2,7% — por isso os casos são esses e não valores redondos de laboratório.
 */
describe("calcularVantagem", () => {
  it("estimativa igual ao preço: tudo zero, e nada de -0", () => {
    const v = calcularVantagem(0.185, 0.185);
    expect(v.edgePp).toBe(0);
    expect(v.ev).toBe(0);
    expect(Object.is(v.ev, -0)).toBe(false);
    expect(v.kellyCheio).toBe(0);
    expect(v.neutro).toBe(true);
  });

  it("o caso que a tela errava: mercado 18,5% e estimativa 19,0% dá EV +2,7%", () => {
    const v = calcularVantagem(0.19, 0.185);
    expect(v.ev! * 100).toBeCloseTo(2.7, 1);
    // Kelly bate com o preço exato — era o único dos dois que já estava certo.
    expect(v.kellyCheio! * 100).toBeCloseTo(0.61, 2);
  });

  it("critério de aceite 3: Barcelona a 18,5% com estimativa de 25%", () => {
    const v = calcularVantagem(0.25, 0.185);
    expect(v.edgePp).toBeCloseTo(6.5, 4);
    expect(v.ev! * 100).toBeCloseTo(35.1, 1);
    expect(v.kellyCheio! * 100).toBeCloseTo(8.0, 1);
    expect(v.kellyMeio! * 100).toBeCloseTo(4.0, 1);
    expect(v.neutro).toBe(false);
  });

  it("estimativa abaixo do mercado: Kelly vira 0, nunca negativo", () => {
    const v = calcularVantagem(0.10, 0.185);
    expect(v.kellyCheio).toBe(0);
    expect(v.kellyMeio).toBe(0);
    expect(v.abaixoDoMercado).toBe(true);
    expect(v.ev!).toBeLessThan(0);
  });

  it("meio ponto percentual é o piso: abaixo disso é ruído, não vantagem", () => {
    expect(calcularVantagem(0.5049, 0.5).neutro).toBe(true);
    expect(calcularVantagem(0.506, 0.5).neutro).toBe(false);
  });

  it("preço extremo não tem conta — devolve null em vez de Infinity", () => {
    for (const p of [0, 0.001, 0.995, 1]) {
      const v = calcularVantagem(0.5, p);
      expect(v.ev).toBeNull();
      expect(v.kellyCheio).toBeNull();
      expect(v.kellyMeio).toBeNull();
    }
  });

  it("o edge em pontos percentuais existe mesmo sem EV — é subtração, não divisão", () => {
    const v = calcularVantagem(0.5, 0.001);
    expect(v.ev).toBeNull();
    expect(v.edgePp).toBeCloseTo(49.9, 4);
  });

  it("nunca devolve NaN, Infinity ou -0 para entrada suja", () => {
    for (const [q, p] of [[NaN, 0.5], [0.5, NaN], [Infinity, 0.5]] as const) {
      const v = calcularVantagem(q, p);
      expect(Number.isFinite(v.edgePp)).toBe(true);
      expect(v.ev === null || Number.isFinite(v.ev)).toBe(true);
    }
  });
});

describe("precoCalculavel", () => {
  it("aceita a faixa útil e recusa as pontas", () => {
    expect(precoCalculavel(PRECO_MINIMO)).toBe(true);
    expect(precoCalculavel(PRECO_MAXIMO)).toBe(true);
    expect(precoCalculavel(0.0049)).toBe(false);
    expect(precoCalculavel(0.991)).toBe(false);
    expect(precoCalculavel(NaN)).toBe(false);
  });
});

describe("neutro: os três cartões dizem a mesma coisa", () => {
  /**
   * UXP-02. O limiar sempre disse que abaixo de meio ponto percentual não há
   * vantagem a declarar — mas quem zerava era a tela, e só em dois dos três
   * cartões. O caso medido: mercado 52,0%, estimativa 52,4%.
   */
  it("🔴 edge abaixo do limiar não produz Kelly nem EV", () => {
    const v = calcularVantagem(0.524, 0.52);
    expect(v.neutro).toBe(true);
    expect(v.kellyCheio).toBe(0);   // antes: 0,00833 → "0,8% da banca"
    expect(v.kellyMeio).toBe(0);
    expect(v.ev).toBe(0);
    expect(v.abaixoDoMercado).toBe(false);
  });

  it("logo acima do limiar a conta volta a valer", () => {
    // 0,6 pp passa do limiar: aqui zerar seria esconder vantagem de verdade.
    const v = calcularVantagem(0.526, 0.52);
    expect(v.neutro).toBe(false);
    expect(v.kellyCheio).toBeGreaterThan(0);
    expect(v.ev).toBeGreaterThan(0);
  });

  it("neutro para BAIXO também zera, e não vira 'abaixo do mercado'", () => {
    const v = calcularVantagem(0.517, 0.52);
    expect(v.neutro).toBe(true);
    expect(v.kellyCheio).toBe(0);
    expect(v.ev).toBe(0);
  });
});
