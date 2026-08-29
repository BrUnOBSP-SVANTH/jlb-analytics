import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callGroq, groqEnabled } from "./groq.ts";

const realFetch = globalThis.fetch;
const OLD_KEY = process.env.GROQ_API_KEY;

beforeEach(() => { process.env.GROQ_API_KEY = "test-key"; });
afterEach(() => {
  globalThis.fetch = realFetch;
  if (OLD_KEY === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = OLD_KEY;
});

function mockResponse(body: unknown, ok = true, status = 200) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok, status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as unknown as typeof fetch;
}

describe("groqEnabled — inerte sem chave", () => {
  it("false quando a chave está ausente", () => {
    delete process.env.GROQ_API_KEY;
    expect(groqEnabled()).toBe(false);
  });

  it("true com chave configurada", () => {
    expect(groqEnabled()).toBe(true);
  });
});

describe("callGroq", () => {
  it("extrai o texto da resposta", async () => {
    mockResponse({ choices: [{ message: { content: '{"fairValue": 42}' } }] });
    const out = await callGroq({ messages: [{ role: "user", content: "oi" }], maxTokens: 80 });
    expect(out).toBe('{"fairValue": 42}');
  });

  it("lança sem chave — quem chama decide o próximo provedor", async () => {
    delete process.env.GROQ_API_KEY;
    await expect(callGroq({ messages: [{ role: "user", content: "oi" }], maxTokens: 80 }))
      .rejects.toThrow(/GROQ_API_KEY ausente/);
  });

  it("lança em erro HTTP (para o chamador registrar a falha)", async () => {
    mockResponse({ error: "rate limited" }, false, 429);
    await expect(callGroq({ messages: [{ role: "user", content: "oi" }], maxTokens: 80 }))
      .rejects.toThrow(/Groq HTTP 429/);
  });

  it("resposta vazia é ERRO, não string vazia — senão o JSON quebraria adiante", async () => {
    mockResponse({ choices: [{ message: { content: "   " }, finish_reason: "length" }] });
    await expect(callGroq({ messages: [{ role: "user", content: "oi" }], maxTokens: 80 }))
      .rejects.toThrow(/resposta vazia/);
  });

  it("envia o system como primeira mensagem (formato OpenAI)", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
      text: async () => "",
    });
    globalThis.fetch = spy as unknown as typeof fetch;
    await callGroq({ messages: [{ role: "user", content: "oi" }], system: "seja breve", maxTokens: 80 });
    const body = JSON.parse((spy.mock.calls[0][1] as { body: string }).body) as { messages: Array<{ role: string; content: string }> };
    expect(body.messages[0]).toEqual({ role: "system", content: "seja breve" });
    expect(body.messages[1]).toEqual({ role: "user", content: "oi" });
  });

  it("dá folga no orçamento de saída (truncar volta vazio)", async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
      text: async () => "",
    });
    globalThis.fetch = spy as unknown as typeof fetch;
    await callGroq({ messages: [{ role: "user", content: "oi" }], maxTokens: 80 });
    const body = JSON.parse((spy.mock.calls[0][1] as { body: string }).body) as { max_tokens: number };
    expect(body.max_tokens).toBeGreaterThanOrEqual(1024);
  });
});
