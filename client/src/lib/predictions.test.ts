/**
 * Testes — métricas de calibração (Brier Score, Skill Score, buckets).
 * Lógica que sustenta Dashboard, Leaderboard e track record.
 */
import { describe, it, expect } from "vitest";
import { meanBrierScore, skillScore, calibrationBuckets, analyzeSentiment, edge, kellyFraction, meanMarketBrier, confidenceCalibration, type StoredPrediction } from "./predictions";

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

describe("meanMarketBrier — baseline do mercado (você bate o mercado?)", () => {
  it("null sem resolvidas", () => { expect(meanMarketBrier([])).toBeNull(); });
  it("usa marketProb, não userProb", () => {
    // mercado 80%, deu SIM → (1 - 0.8)^2 = 0.04
    expect(meanMarketBrier([pred({ resolved: true, outcome: true, marketProb: 80, userProb: 10 })])).toBeCloseTo(0.04, 5);
  });
});

describe("confidenceCalibration — diagnóstico de excesso de confiança", () => {
  it("null sem previsão com lado (userProb=50) ou sem dados", () => {
    expect(confidenceCalibration([])).toBeNull();
    expect(confidenceCalibration([pred({ resolved: true, outcome: true, userProb: 50 })])).toBeNull();
  });
  it("detecta SUPERCONFIANÇA: muita certeza, pouco acerto", () => {
    const preds = [
      pred({ resolved: true, outcome: false, userProb: 90 }),
      pred({ resolved: true, outcome: false, userProb: 90 }),
      pred({ resolved: true, outcome: false, userProb: 90 }),
      pred({ resolved: true, outcome: true, userProb: 90 }),
    ];
    const cc = confidenceCalibration(preds)!;
    expect(cc.avgConfidence).toBe(90);
    expect(cc.accuracy).toBe(25);   // 1 de 4
    expect(cc.gap).toBe(65);
    expect(cc.verdict).toBe("superconfiante");
  });
  it("detecta BEM CALIBRADO: certeza ≈ acerto", () => {
    const preds = Array.from({ length: 10 }, (_, i) => pred({ resolved: true, outcome: i < 7, userProb: 70 }));
    const cc = confidenceCalibration(preds)!;
    expect(cc.avgConfidence).toBe(70);
    expect(cc.accuracy).toBe(70);
    expect(cc.verdict).toBe("calibrado");
  });
  it("conta a confiança do LADO escolhido (userProb<50 = lado NÃO)", () => {
    // 20% → 80% de certeza no NÃO; deu NÃO → acertou
    const cc = confidenceCalibration([pred({ resolved: true, outcome: false, userProb: 20 })])!;
    expect(cc.avgConfidence).toBe(80);
    expect(cc.accuracy).toBe(100);
    expect(cc.verdict).toBe("cauteloso"); // gap -20
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

describe("edge — diferença em pontos percentuais (sua prob − mercado)", () => {
  it("positivo quando você acredita mais que o mercado", () => {
    expect(edge(60, 45)).toBe(15);
  });
  it("negativo quando você acredita menos", () => {
    expect(edge(40, 50)).toBe(-10);
  });
});

describe("kellyFraction — fração da banca (capada em ¼ Kelly)", () => {
  it("prob 60% vs mercado 50% → 20% da banca", () => {
    expect(kellyFraction(60, 50)).toBeCloseTo(0.2, 6);
  });
  it("sem edge (prob = preço) → 0", () => {
    expect(kellyFraction(50, 50)).toBe(0);
  });
  it("edge negativo → 0 (nunca aposta contra o próprio valor)", () => {
    expect(kellyFraction(40, 50)).toBe(0);
  });
  it("edge enorme é capado em 0.25 (¼ Kelly conservador)", () => {
    expect(kellyFraction(90, 50)).toBe(0.25);
  });
  it("marketProb inválido (0 ou 100) → 0, sem divisão por zero", () => {
    expect(kellyFraction(60, 0)).toBe(0);
    expect(kellyFraction(60, 100)).toBe(0);
  });
});
