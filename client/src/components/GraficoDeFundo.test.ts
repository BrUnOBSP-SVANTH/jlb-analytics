import { describe, it, expect } from "vitest";
import { trajetoria } from "./GraficoDeFundo";

/**
 * O que estes testes protegem não é estética — é a IDENTIDADE do desenho.
 *
 * O fundo do hero existe para mostrar a forma do nosso assunto: um preço que
 * oscila na dúvida e RESOLVE em 0% ou 100%. Se alguém "simplificar" a função e
 * ela virar um passeio aleatório qualquer, o desenho continua bonito e passa a
 * ser o mesmo gráfico genérico de qualquer site — que era exatamente o problema
 * que ele veio resolver. Aí a perda é silenciosa: nada quebra, só deixa de ser
 * nosso.
 */
describe("trajetória do fundo — a forma de um mercado de previsão", () => {
  it("começa na dúvida completa (50%)", () => {
    for (const s of [1, 2, 7]) {
      expect(trajetoria(s, true)[0].y).toBeCloseTo(0.5, 1);
    }
  });

  it("RESOLVE: termina perto de 100% ou de 0%, nunca no meio", () => {
    for (const s of [1, 2, 3, 4, 5, 6, 7]) {
      const sim = trajetoria(s, true);
      const nao = trajetoria(s, false);
      expect(sim[sim.length - 1].y).toBeGreaterThan(0.5);
      expect(nao[nao.length - 1].y).toBeLessThan(0.5);
    }
  });

  it("é determinística — o mesmo desenho a cada carga", () => {
    // Sem isto o fundo mudaria a cada visita, e a página perderia identidade
    // visual (além de impossibilitar este teste).
    expect(trajetoria(3, true)).toEqual(trajetoria(3, true));
    expect(trajetoria(3, true)).not.toEqual(trajetoria(4, true));
  });

  it("nunca sai da faixa de probabilidade", () => {
    // y é probabilidade: fora de 0–1 o desenho vazaria do quadro.
    for (const p of trajetoria(5, true)) {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
    }
  });

  it("oscila no caminho — não é uma reta até o desfecho", () => {
    // Se fosse reta, seria um gráfico de progresso, não de mercado.
    const p = trajetoria(2, true);
    const meio = p.slice(5, 60).map((q) => q.y);
    const variou = Math.max(...meio) - Math.min(...meio);
    expect(variou).toBeGreaterThan(0.03);
  });
});
