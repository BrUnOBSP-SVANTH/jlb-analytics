/**
 * Testes — métricas de calibração (Brier Score, Skill Score, buckets).
 * Lógica que sustenta Dashboard, Leaderboard e track record.
 */
import { describe, it, expect } from "vitest";
import { meanBrierScore, skillScore, calibrationBuckets, analyzeSentiment, type StoredPrediction } from "./predictions";

function pred(p: Partial<StoredPrediction>): StoredPrediction {
  return {
    id: Math.random().toString(36).slice(2),
    marketId: "poly-x",
    question: "q",
    marketProb: 50,
    userProb: 50,
    savedAt: new Date().toISOString(),
    resolved: false,
    outcome: null,
    brierScore: null,
    ...p,
  };
}

describe("meanBrierScore", () => {
  it("retorna null sem previsões resolvidas", () => {
    expect(meanBrierScore([])).toBeNull();
    expect(meanBrierScore([pred({ resolved: false })])).toBeNull();
  });

  it("calcula a média dos Brier resolvidos", () => {
    const preds = [
      pred({ resolved: true, brierScore: 0.1 }),
      pred({ resolved: true, brierScore: 0.3 }),
    ];
    expect(meanBrierScore(preds)).toBeCloseTo(0.2, 5);
  });

  it("ignora previsões não resolvidas no cálculo", () => {
    const preds = [
      pred({ resolved: true, brierScore: 0.2 }),
      pred({ resolved: false, brierScore: null }),
    ];
    expect(meanBrierScore(preds)).toBeCloseTo(0.2, 5);
  });
});

describe("skillScore", () => {
  it("null sem dados", () => {
    expect(skillScore([])).toBeNull();
  });
  it("0 quando Brier = 0.25 (baseline aleatório)", () => {
    expect(skillScore([pred({ resolved: true, brierScore: 0.25 })])).toBeCloseTo(0, 5);
  });
  it("1 quando Brier = 0 (perfeito)", () => {
    expect(skillScore([pred({ resolved: true, brierScore: 0 })])).toBeCloseTo(1, 5);
  });
  it("0.5 quando Brier = 0.125", () => {
    expect(skillScore([pred({ resolved: true, brierScore: 0.125 })])).toBeCloseTo(0.5, 5);
  });
  it("negativo quando pior que o aleatório", () => {
    expect(skillScore([pred({ resolved: true, brierScore: 0.5 })])!).toBeLessThan(0);
  });
});

describe("calibrationBuckets", () => {
  it("agrupa por faixa de 10 e calcula a taxa real de SIM", () => {
    // 2 previsões na faixa 60-70: uma deu SIM, outra NÃO → taxa real 50%
    const preds = [
      pred({ resolved: true, userProb: 62, outcome: true }),
      pred({ resolved: true, userProb: 68, outcome: false }),
      // 1 previsão na faixa 90-100 que deu SIM → 100%
      pred({ resolved: true, userProb: 95, outcome: true }),
    ];
    const buckets = calibrationBuckets(preds);
    const b60 = buckets.find((b) => b.bucket === 65);
    const b90 = buckets.find((b) => b.bucket === 95);
    expect(b60?.actualRate).toBe(50);
    expect(b60?.count).toBe(2);
    expect(b90?.actualRate).toBe(100);
  });

  it("ignora previsões não resolvidas", () => {
    const buckets = calibrationBuckets([pred({ resolved: false, userProb: 60 })]);
    expect(buckets.length).toBe(0);
  });
});

describe("analyzeSentiment — casa palavras inteiras (regressão do bug de substring)", () => {
  // Antes, `includes` casava substring: estes davam falso positivo/negativo.
  it("não marca 'economy' como negativo (continha 'no')", () => {
    expect(analyzeSentiment("Brazil economy outlook 2026").label).toBe("Neutro");
  });
  it("não marca 'support' como positivo (continha 'up')", () => {
    expect(analyzeSentiment("Government support program").label).toBe("Neutro");
  });
  it("não marca 'winter' como positivo (continha 'win')", () => {
    expect(analyzeSentiment("Cold winter forecast").label).toBe("Neutro");
  });
  it("ainda detecta sentimento positivo real", () => {
    expect(analyzeSentiment("Team wins championship, gains record lead").label).toBe("Positivo");
  });
  it("ainda detecta sentimento negativo real", () => {
    expect(analyzeSentiment("Stock crashes as market falls into crisis").label).toBe("Negativo");
  });
  it("texto sem palavras-chave é neutro", () => {
    expect(analyzeSentiment("Election scheduled for October").label).toBe("Neutro");
  });
});
