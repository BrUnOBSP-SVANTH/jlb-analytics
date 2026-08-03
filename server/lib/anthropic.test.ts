import { describe, it, expect, beforeEach, vi } from "vitest";
import { recordAnthropicFailure, recordAnthropicSuccess, anthropicBreakerState, _resetBreaker } from "./anthropic.ts";

/**
 * Circuit breaker do provedor Anthropic — o mecanismo que, com a Anthropic fora,
 * vai direto pro Gemini em vez de pagar um round-trip que falha. Um bug aqui ou
 * martela a Anthropic morta, ou trava tudo no Gemini para sempre. Sem rede.
 */
describe("circuit breaker da Anthropic", () => {
  beforeEach(() => { _resetBreaker(); });

  it("começa fechado, sem falhas", () => {
    const s = anthropicBreakerState();
    expect(s.open).toBe(false);
    expect(s.failures).toBe(0);
    expect(s.cooldownMsLeft).toBe(0);
  });

  it("abre só ao atingir o threshold de 3 falhas seguidas", () => {
    recordAnthropicFailure();
    recordAnthropicFailure();
    expect(anthropicBreakerState().open).toBe(false); // 2 < 3
    recordAnthropicFailure();
    const s = anthropicBreakerState();
    expect(s.open).toBe(true);
    expect(s.failures).toBe(3);
    expect(s.cooldownMsLeft).toBeGreaterThan(0);
  });

  it("um sucesso zera as falhas e fecha o breaker", () => {
    recordAnthropicFailure(); recordAnthropicFailure(); recordAnthropicFailure();
    expect(anthropicBreakerState().open).toBe(true);
    recordAnthropicSuccess();
    const s = anthropicBreakerState();
    expect(s.open).toBe(false);
    expect(s.failures).toBe(0);
  });

  it("half-open: após o cooldown desbloqueia para sondar a Anthropic (falhas seguem altas até um sucesso)", () => {
    vi.useFakeTimers();
    try {
      recordAnthropicFailure(); recordAnthropicFailure(); recordAnthropicFailure();
      expect(anthropicBreakerState().open).toBe(true);
      vi.advanceTimersByTime(60_001); // passa o cooldown de 60s
      const s = anthropicBreakerState();
      expect(s.open).toBe(false);   // deixa testar a Anthropic de novo
      expect(s.failures).toBe(3);   // só o sucesso zera de fato
    } finally {
      vi.useRealTimers();
    }
  });

  it("half-open + nova falha reabre o cooldown", () => {
    vi.useFakeTimers();
    try {
      recordAnthropicFailure(); recordAnthropicFailure(); recordAnthropicFailure();
      vi.advanceTimersByTime(60_001);
      expect(anthropicBreakerState().open).toBe(false);
      recordAnthropicFailure(); // sondagem half-open também falhou → reabre
      expect(anthropicBreakerState().open).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
