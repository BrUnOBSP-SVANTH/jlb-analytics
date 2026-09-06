import { describe, it, expect } from "vitest";
import { curvaSim, curvaNao } from "./GraficoDeFundo";

/**
 * O que estes testes protegem não é estética — é a HONESTIDADE do desenho.
 *
 * O gráfico do hero ilustra o fato central de um mercado binário: SIM e NÃO são
 * complementares e somam 100% sempre. Se alguém "melhorar" as curvas de olho e
 * elas deixarem de somar 100, o site passa a ilustrar com um gráfico falso a
 * própria coisa que ele ensina. E a falha seria silenciosa: continuaria bonito.
 */
describe("gráfico do hero — SIM e NÃO são complementares", () => {
  const sim = curvaSim();
  const nao = curvaNao(sim);

  it("as duas curvas somam 100% em TODOS os pontos", () => {
    // É a regra do mercado binário. Não pode valer "quase sempre".
    for (let i = 0; i < sim.length; i++) {
      expect(sim[i].y + nao[i].y).toBeCloseTo(1, 10);
      expect(sim[i].x).toBe(nao[i].x);
    }
  });

  it("conta uma VIRADA: o SIM começa descrente e termina alto", () => {
    // É o que dá história ao desenho. Um mercado que só sobe é barra de
    // progresso; o que prende é o evento que ninguém dava como provável e
    // aconteceu. E como o NÃO é o espelho, as duas desenham um X.
    expect(sim[0].y).toBeLessThan(0.2);
    expect(sim[sim.length - 1].y).toBeGreaterThan(0.9);
    expect(nao[0].y).toBeGreaterThan(0.8);
    expect(nao[nao.length - 1].y).toBeLessThan(0.1);
  });

  it("as curvas se cruzam — existe um ponto onde valem o mesmo", () => {
    // O cruzamento é o que o desenho marca com um círculo. Sem ele, o gráfico
    // perde justamente o momento que dá sentido aos dois lados.
    const cruzou = sim.some((p, i) => Math.abs(p.y - nao[i].y) < 0.03 && p.x > 0.1);
    expect(cruzou).toBe(true);
  });

  it("não é uma reta — oscila enquanto a notícia não chega", () => {
    // Uma diagonal limpa seria barra de progresso, não mercado.
    const inicio = sim.slice(0, 60).map((p) => p.y);
    const variou = Math.max(...inicio) - Math.min(...inicio);
    expect(variou).toBeGreaterThan(0.03);
  });

  it("estabiliza no fim — perto do desfecho o preço para de balançar", () => {
    // O balanço tem que sumir: mercado prestes a resolver não oscila mais.
    const fim = sim.slice(-25).map((p) => p.y);
    expect(Math.max(...fim) - Math.min(...fim)).toBeLessThan(0.09);
  });

  it("nunca sai da faixa de probabilidade", () => {
    for (const p of [...sim, ...nao]) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it("é determinística — o mesmo gráfico a cada visita", () => {
    expect(curvaSim()).toEqual(curvaSim());
  });
});
