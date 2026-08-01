import { describe, it, expect, beforeEach } from "vitest";
import { recordAiCall, aiMetricsSnapshot, _resetAiMetrics } from "./metrics.ts";

describe("métricas de IA", () => {
  beforeEach(() => _resetAiMetrics());

  it("conta chamadas por provedor", () => {
    recordAiCall("anthropic", 100);
    recordAiCall("gemini", 200);
    recordAiCall("gemini", 300);
    const s = aiMetricsSnapshot();
    expect(s.calls).toBe(3);
    expect(s.anthropic).toBe(1);
    expect(s.gemini).toBe(2);
  });

  it("taxa de fallback é sobre as chamadas respondidas (não sobre erros)", () => {
    recordAiCall("anthropic");
    recordAiCall("gemini");
    recordAiCall("gemini"); // 2 gemini de 3 respondidas = 67%
    expect(aiMetricsSnapshot().fallbackRatePct).toBe(67);
  });

  it("média de latência ignora chamadas sem latência informada", () => {
    recordAiCall("anthropic", 100);
    recordAiCall("gemini", 300);
    recordAiCall("gemini"); // sem latência → não entra na média
    expect(aiMetricsSnapshot().avgLatencyMs).toBe(200); // (100+300)/2
  });

  it("erros contam na taxa de erro, não na de fallback", () => {
    recordAiCall("error");
    recordAiCall("anthropic");
    const s = aiMetricsSnapshot();
    expect(s.errors).toBe(1);
    expect(s.errorRatePct).toBe(50);   // 1 erro de 2 chamadas
    expect(s.fallbackRatePct).toBe(0);  // 0 gemini de 1 respondida
  });

  it("estado vazio não divide por zero", () => {
    const s = aiMetricsSnapshot();
    expect(s.calls).toBe(0);
    expect(s.avgLatencyMs).toBeNull();
    expect(s.fallbackRatePct).toBe(0);
    expect(s.errorRatePct).toBe(0);
  });
});
