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

/**
 * DES-03 — seis das dezoito calculadoras não validavam nada.
 *
 * Campo ausente ou com texto no lugar de número virava `undefined` no meio da
 * conta. Duas delas quebravam com uma página HTML de 500 (taylor-rule, enso); as
 * outras quatro faziam pior: respondiam 200 com um VEREDITO tirado do nada.
 *
 * Flagrado ao capturar a saída das 18 rotas para comparação, com dois casos meus
 * de nome de campo errado:
 *  · `maturity` devolvia "Iniciante — decisões majoritariamente intuitivas",
 *    score 0 — um diagnóstico sobre a pessoa, montado de dados que não existiam;
 *  · `divergence` devolvia `divergence: null` e ao mesmo tempo `tier:
 *    "extreme"` — classificava como extrema uma divergência inexistente.
 *
 * Num site cujo argumento é não publicar número sem lastro, é o pior defeito
 * possível: ele não falha, ele inventa.
 */
describe("entrada inválida é recusada, não interpretada", () => {
  const SEM_VALIDACAO: Array<[string, Record<string, unknown>, string]> = [
    ["/api/level3/taylor-rule", { inflation: 4.5 },                 "selic_observed"],
    ["/api/level3/enso",        { oni: 1.4 },                        "oni_index"],
    ["/api/level3/elo",         { a: 1800, b: 1650 },                "rating_a"],
    ["/api/level3/poisson",     { attack: 1.6 },                     "home_attack"],
    ["/api/level4/maturity",    { brier_skill: 0.1 },                "brier_skill_score"],
    ["/api/level5/divergence",  { model_prob: 0.7, market_prob: 0.5 }, "model_probability"],
  ];

  for (const [rota, corpoRuim, campo] of SEM_VALIDACAO) {
    it(`🔴 ${rota} devolve 422 dizendo qual campo falta`, async () => {
      const { status, body } = await post(rota, corpoRuim);
      expect(status).toBe(422);
      expect(String(body.error)).toContain(campo);
    });
  }

  it("🔴 nenhuma delas devolve veredito quando o dado não existe", async () => {
    // O caso que mais dói: score, estágio, tier — qualquer conclusão sobre a
    // pessoa ou sobre o mercado montada a partir de campo ausente.
    for (const [rota, corpoRuim] of SEM_VALIDACAO) {
      const { body } = await post(rota, corpoRuim);
      for (const chave of ["stage", "label", "tier", "signal", "score"]) {
        expect(body[chave], `${rota} devolveu "${chave}"`).toBeUndefined();
      }
    }
  });

  it("⚠️ com os campos certos, as seis continuam calculando igual", async () => {
    // A validação não pode ter mudado o resultado de quem manda dado válido.
    const { status: s1, body: b1 } = await post("/api/level3/taylor-rule",
      { selic_observed: 13.75, ipca_12m: 4.5, output_gap_pct: -1.2 });
    expect(s1).toBe(200);
    expect(b1.taylor_implied).toBeCloseTo(6.65, 2);
    expect(b1.divergence_pp).toBeCloseTo(7.1, 2);

    const { status: s2, body: b2 } = await post("/api/level5/divergence",
      { model_probability: 0.7, market_probability: 0.55 });
    expect(s2).toBe(200);
    expect(b2.divergence).toBeCloseTo(0.15, 4);

    const { status: s3, body: b3 } = await post("/api/level3/enso", { oni_index: 1.4 });
    expect(s3).toBe(200);
    expect(b3.phase).toBeTruthy();
  });
});
