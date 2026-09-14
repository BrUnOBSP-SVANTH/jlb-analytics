import { describe, it, expect, afterEach } from "vitest";
import { shouldFallback, geminiEnabled, motivoDaFalha } from "./gemini.ts";

/**
 * O coração anti-queda: shouldFallback decide QUANDO trocar Anthropic → Gemini.
 * Um furo aqui (uma mensagem de erro real que não bate) faz o site ficar SEM IA
 * em vez de cair no fallback. Esta tabela trava o comportamento contra as
 * mensagens de erro que a Anthropic/undici realmente produzem.
 */
describe("shouldFallback — quando trocar de provedor", () => {
  // Erros de provedor indisponível/limite → DEVE cair no Gemini.
  const CAI = [
    "Your credit balance is too low to access the Claude API",
    "rate_limit_error: Number of request tokens has exceeded",
    "Anthropic HTTP 429: too many requests",
    "Anthropic HTTP 529: overloaded_error",
    "overloaded_error: the API is temporarily overloaded",
    "Anthropic HTTP 500: internal server error",
    "Anthropic HTTP 503: service unavailable",
    "The operation was aborted due to timeout",
    "The operation timed out",           // variante com espaço do AbortSignal.timeout
    "signal timed out",
    "This operation was aborted",
  ];

  // Erros do NOSSO lado (prompt/entrada) → NÃO adianta trocar de provedor.
  const NAO_CAI = [
    "invalid_request_error: max_tokens is too large",
    "Anthropic HTTP 400: bad request",
    "messages: at least one message is required",
    "extractJson: nenhum JSON encontrado",
  ];

  it.each(CAI)("cai no fallback: %s", (msg) => {
    expect(shouldFallback(new Error(msg))).toBe(true);
  });

  it.each(NAO_CAI)("NÃO cai no fallback: %s", (msg) => {
    expect(shouldFallback(new Error(msg))).toBe(false);
  });

  it("aceita valor não-Error (string/objeto) sem lançar", () => {
    expect(shouldFallback("HTTP 503")).toBe(true);
    expect(shouldFallback({ nada: 1 })).toBe(false);
    expect(shouldFallback(null)).toBe(false);
  });
});

describe("geminiEnabled — inerte sem chave", () => {
  const prev = process.env.GEMINI_API_KEY;
  afterEach(() => { if (prev === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = prev; });

  it("false sem chave, true com chave", () => {
    delete process.env.GEMINI_API_KEY;
    expect(geminiEnabled()).toBe(false);
    process.env.GEMINI_API_KEY = "test-key";
    expect(geminiEnabled()).toBe(true);
  });
});

describe("motivoDaFalha — o log precisa dizer POR QUE caiu", () => {
  it("extrai a frase da Anthropic em vez de cortar antes dela", () => {
    // Mensagem REAL de 14/09. O corte antigo em 90 caracteres imprimia
    // '..."message":"Your c' e parava exatamente antes do motivo.
    const real = new Error('Claude HTTP 400: {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}');
    const m = motivoDaFalha(real);
    expect(m).toMatch(/^HTTP 400: Your credit balance is too low/);
    expect(m).not.toMatch(/invalid_request_error/);
  });

  it("mensagem sem JSON passa inteira (até o limite)", () => {
    expect(motivoDaFalha(new Error("The operation was aborted due to timeout"))).toBe("The operation was aborted due to timeout");
  });

  it("aceita o que não é Error", () => {
    expect(motivoDaFalha("anthropic circuit open")).toBe("anthropic circuit open");
  });
});
