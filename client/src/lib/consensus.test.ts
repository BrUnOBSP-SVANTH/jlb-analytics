/**
 * Testes — motor de consenso (agregação logit extremizada).
 * Cobre a lógica financeira mais crítica do site.
 */
import { describe, it, expect } from "vitest";
import { computeConsensus, marketWeight, aiWeight, communityWeight, type ConsensusSignal } from "./consensus";

describe("computeConsensus", () => {
  it("retorna null sem sinais válidos", () => {
    expect(computeConsensus([])).toBeNull();
    expect(computeConsensus([{ name: "x", prob: 60, weight: 0 }])).toBeNull();
  });

  it("uma fonte só ≈ a própria fonte (sem extremizar)", () => {
    const r = computeConsensus([{ name: "Mercado", prob: 60, weight: 1 }])!;
    expect(r.consensus).toBe(60);
    expect(r.extremizeFactor).toBe(1);
    expect(r.nSources).toBe(1);
    expect(r.agreement).toBe(1); // sem dispersão
  });

  it("extremiza para longe de 50% com ≥2 fontes", () => {
    // Duas fontes idênticas a 70% → consenso > 70 (correção de sub-confiança)
    const r = computeConsensus([
      { name: "A", prob: 70, weight: 1 },
      { name: "B", prob: 70, weight: 1 },
    ])!;
    expect(r.consensus).toBeGreaterThan(70);
    expect(r.extremizeFactor).toBeGreaterThan(1);
  });

  it("extremiza para baixo quando ambas < 50%", () => {
    const r = computeConsensus([
      { name: "A", prob: 30, weight: 1 },
      { name: "B", prob: 30, weight: 1 },
    ])!;
    expect(r.consensus).toBeLessThan(30);
  });

  it("acordo alto quando fontes concordam, baixo quando discordam", () => {
    const agree = computeConsensus([
      { name: "A", prob: 65, weight: 1 },
      { name: "B", prob: 67, weight: 1 },
    ])!;
    const disagree = computeConsensus([
      { name: "A", prob: 30, weight: 1 },
      { name: "B", prob: 80, weight: 1 },
    ])!;
    expect(agree.agreement).toBeGreaterThan(disagree.agreement);
    expect(agree.agreement).toBeGreaterThan(0.7);
  });

  it("intervalo de confiança contém o consenso (low ≤ consenso ≤ high)", () => {
    const r = computeConsensus([
      { name: "A", prob: 40, weight: 1 },
      { name: "B", prob: 75, weight: 1.5 },
    ])!;
    expect(r.low).toBeLessThanOrEqual(r.consensus);
    expect(r.high).toBeGreaterThanOrEqual(r.consensus);
  });

  it("peso maior puxa o consenso na direção da fonte", () => {
    const heavyA = computeConsensus([
      { name: "A", prob: 30, weight: 5 },
      { name: "B", prob: 70, weight: 1 },
    ])!;
    expect(heavyA.consensus).toBeLessThan(50); // dominado por A
  });

  it("normaliza os pesos das fontes (somam ~1)", () => {
    const r = computeConsensus([
      { name: "A", prob: 50, weight: 2 },
      { name: "B", prob: 60, weight: 2 },
    ])!;
    const total = r.sources.reduce((s, x) => s + x.weight, 0);
    expect(total).toBeCloseTo(1, 1);
  });

  it("mantém probabilidades extremas dentro de [0,100]", () => {
    const r = computeConsensus([
      { name: "A", prob: 99, weight: 1 },
      { name: "B", prob: 98, weight: 1 },
    ])!;
    expect(r.consensus).toBeLessThanOrEqual(100);
    expect(r.high).toBeLessThanOrEqual(100);
  });
});

describe("marketWeight", () => {
  it("peso neutro sem liquidez", () => {
    expect(marketWeight(undefined).weight).toBeCloseTo(0.6, 1);
  });
  it("liquidez alta → peso maior que liquidez baixa", () => {
    expect(marketWeight(500_000).weight).toBeGreaterThan(marketWeight(500).weight);
  });
  it("peso nunca passa de ~1", () => {
    expect(marketWeight(10_000_000).weight).toBeLessThanOrEqual(1.01);
  });
});

describe("aiWeight", () => {
  it("usa prior neutro sem histórico", () => {
    expect(aiWeight({}).weight).toBeCloseTo(0.5, 1);
  });
  it("sobe quando a IA bate o mercado com amostra suficiente", () => {
    const good = aiWeight({ skillVsMarket: 0.2, resolvedCount: 20 }).weight;
    expect(good).toBeGreaterThan(0.7);
  });
  it("cai quando a IA fica abaixo do mercado", () => {
    const bad = aiWeight({ skillVsMarket: -0.1, resolvedCount: 20 }).weight;
    expect(bad).toBeLessThan(0.5);
  });
  it("ignora histórico com amostra pequena", () => {
    expect(aiWeight({ skillVsMarket: 0.5, resolvedCount: 3 }).weight).toBeCloseTo(0.5, 1);
  });
  it("confiança alta aumenta o peso; baixa reduz", () => {
    expect(aiWeight({ confidence: "alta" }).weight).toBeGreaterThan(aiWeight({ confidence: "baixa" }).weight);
  });
});

describe("communityWeight", () => {
  it("peso zero sem forecasters", () => {
    expect(communityWeight(0).weight).toBe(0);
    expect(communityWeight(undefined).weight).toBe(0);
  });
  it("cresce com o número de forecasters", () => {
    expect(communityWeight(8).weight).toBeGreaterThan(communityWeight(1).weight);
  });
  it("satura (não passa de ~0.7)", () => {
    expect(communityWeight(1000).weight).toBeLessThanOrEqual(0.7);
  });
});
