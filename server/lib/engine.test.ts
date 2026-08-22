import { describe, it, expect } from "vitest";
import {
  buildEnginePrompt, shapeForecast, normalizeConfidence,
  validateEngineInput, parseKeys, isValidPartnerKey,
} from "./engine.ts";

describe("normalizeConfidence", () => {
  it("mapeia pt/en para low|medium|high; default medium", () => {
    expect(normalizeConfidence("alta")).toBe("high");
    expect(normalizeConfidence("HIGH")).toBe("high");
    expect(normalizeConfidence("baixa")).toBe("low");
    expect(normalizeConfidence("qualquer")).toBe("medium");
    expect(normalizeConfidence(undefined)).toBe("medium");
  });
});

describe("buildEnginePrompt", () => {
  it("inclui a pergunta e a âncora quando há preço de mercado", () => {
    const p = buildEnginePrompt({ question: "BTC > 100k em agosto?", marketProbability: 55 }, 55);
    expect(p).toContain("BTC > 100k em agosto?");
    expect(p).toContain("ÂNCORA DE MERCADO: 55%");
    expect(p).toContain("fairValue");
  });
  it("omite a âncora quando não há mercado; inclui categoria e contexto", () => {
    const p = buildEnginePrompt({ question: "Vai chover amanhã em SP?", category: "Clima", context: "Frente fria chegando." }, null);
    expect(p).not.toContain("ÂNCORA DE MERCADO");
    expect(p).toContain("CATEGORIA: Clima");
    expect(p).toContain("Frente fria chegando.");
  });
});

describe("shapeForecast", () => {
  it("com âncora: clampa (banda aperta na cauda) e calcula o edge", () => {
    // âncora 6%, IA disse 68 → clamp na cauda p/ 12 (folga=6 → dev=6 → 6+6) → edge +6
    const f = shapeForecast(68, "media", "só uma ideia", 6);
    expect(f.probability).toBe(12);
    expect(f.edge).toBe(6);
    expect(f.confidence).toBe("medium");
  });
  it("no meio da faixa, respeita ±15pp", () => {
    expect(shapeForecast(90, "alta", "", 45).probability).toBe(60); // 45+15
  });
  it("sem âncora: 5–95 e edge null", () => {
    const f = shapeForecast(150, "baixa", "", null);
    expect(f.probability).toBe(95);
    expect(f.edge).toBeNull();
  });
  it("fairValue inválido → lança (rota devolve 502)", () => {
    expect(() => shapeForecast("nada", "media", "", 50)).toThrow();
  });
  it("trunca a justificativa em 500 chars", () => {
    expect(shapeForecast(50, "media", "x".repeat(800), 50).rationale).toHaveLength(500);
  });
});

describe("validateEngineInput", () => {
  it("aceita entrada válida e normaliza os opcionais", () => {
    const r = validateEngineInput({ question: "  Vai passar a lei X? ", marketProbability: "40", category: "Política", context: "ctx" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.question).toBe("Vai passar a lei X?");
      expect(r.input.marketProbability).toBe(40);
      expect(r.input.category).toBe("Política");
    }
  });
  it("rejeita pergunta curta/ausente e longa demais", () => {
    expect(validateEngineInput({ question: "curta" }).ok).toBe(false);
    expect(validateEngineInput({}).ok).toBe(false);
    expect(validateEngineInput({ question: "x".repeat(501) }).ok).toBe(false);
  });
  it("rejeita marketProbability fora de 0–100", () => {
    expect(validateEngineInput({ question: "pergunta boa aqui", marketProbability: 140 }).ok).toBe(false);
    expect(validateEngineInput({ question: "pergunta boa aqui", marketProbability: "abc" }).ok).toBe(false);
  });
});

describe("auth de parceiro (fail-closed)", () => {
  it("parseKeys separa por vírgula e limpa vazios", () => {
    expect(parseKeys("k1abcdef, k2abcdef ,")).toEqual(["k1abcdef", "k2abcdef"]);
    expect(parseKeys(undefined)).toEqual([]);
  });
  it("sem chaves configuradas, NADA é aceito", () => {
    expect(isValidPartnerKey("k1abcdef", parseKeys(""))).toBe(false);
  });
  it("aceita só chave conhecida com tamanho mínimo", () => {
    const keys = parseKeys("partner-key-123");
    expect(isValidPartnerKey("partner-key-123", keys)).toBe(true);
    expect(isValidPartnerKey("errada", keys)).toBe(false);
    expect(isValidPartnerKey(undefined, keys)).toBe(false);
    expect(isValidPartnerKey("curta", parseKeys("curta"))).toBe(false); // < 8 chars
  });
});
