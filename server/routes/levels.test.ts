/**
 * Testes de integração — calculadoras dos Níveis 1-5 (server/routes/levels.ts).
 * Sobe o router num Express efêmero e valida a MATEMÁTICA (o caminho de dinheiro
 * educacional) e as validações de input. levels.ts é a implementação ÚNICA (dev
 * e prod) desde a remoção do pipeline.py — precisa de rede de segurança.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import levelsRouter from "./levels.ts";

let server: Server;
let base = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", levelsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      base = `http://localhost:${typeof addr === "object" && addr ? addr.port : 0}`;
      resolve();
    });
  });
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function post(path: string, body: unknown) {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json()) as Record<string, number & string & number[]> };
}

describe("Nível 1 — margem da casa (house-edge)", () => {
  it("odds justas 2.0/2.0 → overround 1, margem 0", async () => {
    const { status, body } = await post("/api/level1/house-edge", { decimal_odds: [2.0, 2.0] });
    expect(status).toBe(200);
    expect(body.overround).toBeCloseTo(1, 5);
    expect(body.margin_pct).toBeCloseTo(0, 3);
  });
  it("odds 1.9/1.9 → margem ~5.26% e probs justas somam 1", async () => {
    const { body } = await post("/api/level1/house-edge", { decimal_odds: [1.9, 1.9] });
    expect(body.margin_pct).toBeCloseTo(5.263, 2);
    expect(body.fair_probs[0] + body.fair_probs[1]).toBeCloseTo(1, 4);
  });
  it("rejeita menos de 2 odds (422)", async () => {
    expect((await post("/api/level1/house-edge", { decimal_odds: [2.0] })).status).toBe(422);
  });
  it("rejeita odd <= 1 (422)", async () => {
    expect((await post("/api/level1/house-edge", { decimal_odds: [1.0, 2.0] })).status).toBe(422);
  });
});

describe("Nível 2 — intervalo de confiança", () => {
  it("mean 100, std 15, n 100 → se 1.5, margem ~2.94 (Normal)", async () => {
    const { body } = await post("/api/level2/confidence-interval", { mean: 100, std: 15, n: 100 });
    expect(body.se).toBeCloseTo(1.5, 4);
    expect(body.margin).toBeCloseTo(2.94, 1);
    expect(body.dist_used).toBe("Normal");
  });
  it("rejeita n < 2 (422)", async () => {
    expect((await post("/api/level2/confidence-interval", { mean: 1, std: 1, n: 1 })).status).toBe(422);
  });
});

describe("Nível 3 — Elo", () => {
  it("ratings iguais, sem casa → 50/50", async () => {
    const { body } = await post("/api/level3/elo", { rating_a: 1500, rating_b: 1500, home_advantage: false });
    expect(body.p_a_wins).toBeCloseTo(0.5, 4);
    expect(body.p_a_wins + body.p_b_wins).toBeCloseTo(1, 4);
  });
  it("100 pts de vantagem, sem casa → ~64%", async () => {
    const { body } = await post("/api/level3/elo", { rating_a: 1600, rating_b: 1500, home_advantage: false });
    expect(body.p_a_wins).toBeCloseTo(0.6401, 3);
  });
});

describe("Nível 4 — Brier Score", () => {
  it("previsão perfeita → Brier 0, Skill 1", async () => {
    const { body } = await post("/api/level4/brier", { forecasts: [1, 1, 0, 0, 1], outcomes: [1, 1, 0, 0, 1] });
    expect(body.brier_score).toBeCloseTo(0, 5);
    expect(body.skill_score).toBeCloseTo(1, 5);
  });
  it("50% em eventos certos → Brier 0.25, Skill 0", async () => {
    const { body } = await post("/api/level4/brier", { forecasts: [0.5, 0.5, 0.5, 0.5, 0.5], outcomes: [1, 1, 1, 1, 1] });
    expect(body.brier_score).toBeCloseTo(0.25, 4);
    expect(body.skill_score).toBeCloseTo(0, 4);
  });
  it("rejeita menos de 5 previsões (422)", async () => {
    expect((await post("/api/level4/brier", { forecasts: [1, 0], outcomes: [1, 0] })).status).toBe(422);
  });
  it("rejeita previsão fora de [0,1] (422)", async () => {
    expect((await post("/api/level4/brier", { forecasts: [1.2, 0, 0, 0, 1], outcomes: [1, 0, 0, 0, 1] })).status).toBe(422);
  });
});

describe("Nível 5 — divergência modelo-mercado", () => {
  it("div pequena (1pp) → negligible/neutral", async () => {
    const { body } = await post("/api/level5/divergence", { model_probability: 0.5, market_probability: 0.49 });
    expect(body.tier).toBe("negligible");
    expect(body.signal).toBe("neutral");
  });
  it("div 10pp → strong/positive (contexto padrão)", async () => {
    const { body } = await post("/api/level5/divergence", { model_probability: 0.6, market_probability: 0.5 });
    expect(body.tier).toBe("strong");
    expect(body.signal).toBe("positive");
    expect(body.divergence_pct).toBeCloseTo(10, 2);
  });
  it("mesma div 10pp em cripto (mercado eficiente) → rebaixada a moderate", async () => {
    const { body } = await post("/api/level5/divergence", { model_probability: 0.6, market_probability: 0.5, context: "cripto" });
    expect(body.tier).toBe("moderate");
  });
});

describe("Nível 5 — ensemble ponderado por skill", () => {
  it("pesos iguais → média simples (0.7)", async () => {
    const { body } = await post("/api/level5/ensemble", {
      model_probabilities: { a: 0.6, b: 0.8 },
      model_skill_scores: { a: 0.2, b: 0.2 },
    });
    expect(body.ensemble_probability).toBeCloseTo(0.7, 4);
    expect(body.method).toBe("skill_weighted");
  });
  it("exclui modelo com Skill Score <= 0", async () => {
    const { body } = await post("/api/level5/ensemble", {
      model_probabilities: { a: 0.6, b: 0.9 },
      model_skill_scores: { a: 0.2, b: 0 },
    });
    expect(body.ensemble_probability).toBeCloseTo(0.6, 4);
    expect(body.excluded_models).toContain("b");
  });
  it("todos com SS <= 0 → fallback de média simples (0.5)", async () => {
    const { body } = await post("/api/level5/ensemble", {
      model_probabilities: { a: 0.4, b: 0.6 },
      model_skill_scores: { a: 0, b: -0.1 },
    });
    expect(body.method).toBe("simple_mean_fallback");
    expect(body.ensemble_probability).toBeCloseTo(0.5, 4);
  });
});
