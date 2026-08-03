import { describe, it, expect, beforeEach } from "vitest";
import { recordAiCall, recordEmbedding, recordClamp, aiMetricsSnapshot, _resetAiMetrics } from "./metrics.ts";

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

  it("conta embeddings ok vs. cota estourada (429), ignorando status locais", () => {
    recordEmbedding(200);
    recordEmbedding(200);
    recordEmbedding(429); // cota diária do Gemini estourou
    recordEmbedding(0);   // sem chave/texto → não é chamada, não conta
    const s = aiMetricsSnapshot();
    expect(s.embeddings.ok).toBe(2);
    expect(s.embeddings.rateLimited).toBe(1);
  });

  it("conta quando o guardrail de calibração morde", () => {
    recordClamp();
    recordClamp();
    expect(aiMetricsSnapshot().clampHits).toBe(2);
  });
});
