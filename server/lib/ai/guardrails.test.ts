import { describe, it, expect } from "vitest";
import { clampFairValue, quantFairValue } from "./guardrails.ts";

describe("clampFairValue — dentro do permitido, passa igual", () => {
  it("não mexe quando a estimativa está a ≤15pp do mercado", () => {
    expect(clampFairValue(58, 45)).toBe(58); // +13pp, ok
    expect(clampFairValue(35, 45)).toBe(35); // -10pp, ok
    expect(clampFairValue(45, 45)).toBe(45); // igual ao mercado
  });
});

describe("clampFairValue — trava o desvio em ±15pp do mercado", () => {
  it("corta estimativa muito acima para market+15", () => {
    // mercado 45, IA disse 90 → deveria virar 60 (o buraco do '42% vs 21%')
    expect(clampFairValue(90, 45)).toBe(60);
  });
  it("corta estimativa muito abaixo para market-15", () => {
    // mercado 80, IA disse 10 → 65
    expect(clampFairValue(10, 80)).toBe(65);
  });
  it("no limite exato de ±15pp não corta", () => {
    expect(clampFairValue(60, 45)).toBe(60);
    expect(clampFairValue(30, 45)).toBe(30);
  });
});

describe("clampFairValue — respeita a faixa 5-95", () => {
  it("piso 5 vence mesmo dentro do ±15pp", () => {
    // mercado 12, IA disse 0 → market-15 = -3, mas piso é 5
    expect(clampFairValue(0, 12)).toBe(5);
  });
  it("teto 95 vence mesmo dentro do ±15pp", () => {
    // mercado 92, IA disse 100 → market+15 = 107, mas teto é 95
    expect(clampFairValue(100, 92)).toBe(95);
  });
});

describe("clampFairValue — maxDev configurável (crossref usa ±20)", () => {
  it("permite desvio de até 20pp quando maxDev=20", () => {
    // mercado 40, IA disse 65 → +25pp cortado para 60 (market+20)
    expect(clampFairValue(65, 40, 20)).toBe(60);
    // dentro de 20pp passa
    expect(clampFairValue(58, 40, 20)).toBe(58);
  });
});

describe("clampFairValue — casos de borda", () => {
  it("mercado extremo baixo mantém o piso", () => {
    expect(clampFairValue(50, 3)).toBe(18); // market+15 = 18
    expect(clampFairValue(1, 3)).toBe(5);   // piso
  });
  it("mercado extremo alto mantém o teto", () => {
    expect(clampFairValue(50, 97)).toBe(82); // market-15 = 82
    expect(clampFairValue(99, 97)).toBe(95); // teto
  });
});

describe("quantFairValue — fair value quantitativo (fallback do /fair-value)", () => {
  it("sem liquidez/momentum: média 50/50 entre base rate e mercado", () => {
    // 30*0.5 + 50*0.5 = 40
    expect(quantFairValue(50, 30).clampedPreFV).toBe(40);
  });
  it("alta liquidez pesa mais o mercado (0.75)", () => {
    // 30*0.25 + 50*0.75 = 45
    expect(quantFairValue(50, 30, { liquidity: 200_000 }).clampedPreFV).toBe(45);
  });
  it("baixa liquidez pesa mais a base rate (0.35)", () => {
    // 30*0.65 + 50*0.35 = 37
    expect(quantFairValue(50, 30, { liquidity: 500 }).clampedPreFV).toBe(37);
  });
  it("momentum moderado soma leve tendência", () => {
    // 40 + 5*0.2 = 41
    expect(quantFairValue(50, 30, { weekPriceChange: 5 }).clampedPreFV).toBe(41);
  });
  it("movimento extremo vira reversão à média (sinal invertido)", () => {
    // 40 + (-20*0.3) = 34
    expect(quantFairValue(50, 30, { weekPriceChange: 20 }).clampedPreFV).toBe(34);
  });
  it("respeita o piso 5 em mercado/base rate extremos", () => {
    const r = quantFairValue(2, 2);
    expect(r.preFairValue).toBe(2);
    expect(r.clampedPreFV).toBe(5);
  });
});
