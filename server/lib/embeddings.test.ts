import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { embedText, rawEmbed, EMBED_DIMS } from "./embeddings.ts";

const OK = { embedding: { values: Array.from({ length: EMBED_DIMS }, () => 0.1) } };

function mockFetch(status: number, json: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(json),
    text: () => Promise.resolve(typeof json === "string" ? json : JSON.stringify(json)),
  });
}

describe("embedText", () => {
  const prevKey = process.env.GEMINI_API_KEY;
  beforeEach(() => { process.env.GEMINI_API_KEY = "test-key"; });
  afterEach(() => { vi.unstubAllGlobals(); process.env.GEMINI_API_KEY = prevKey; });

  it("retorna o vetor no caminho feliz", async () => {
    vi.stubGlobal("fetch", mockFetch(200, OK));
    const v = await embedText("selic 2026");
    expect(v).not.toBeNull();
    expect(v?.length).toBe(EMBED_DIMS);
  });

  it("retorna null sem chave (inerte)", async () => {
    process.env.GEMINI_API_KEY = "";
    expect(await embedText("x")).toBeNull();
  });

  it("retorna null com texto vazio", async () => {
    expect(await embedText("   ")).toBeNull();
  });

  it("retorna null em erro HTTP, sem lançar", async () => {
    vi.stubGlobal("fetch", mockFetch(429, "rate limited"));
    expect(await embedText("x")).toBeNull();
  });

  it("retorna null se as dimensões vierem erradas", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { embedding: { values: [1, 2, 3] } }));
    expect(await embedText("x")).toBeNull();
  });

  // rawEmbed expõe o status HTTP para o backfill distinguir cota estourada (429)
  // de falha pontual e parar cedo em vez de martelar a API do Gemini.
  it("rawEmbed devolve status 429 quando a cota estoura", async () => {
    vi.stubGlobal("fetch", mockFetch(429, "quota exceeded"));
    const r = await rawEmbed("x", "RETRIEVAL_DOCUMENT");
    expect(r.vector).toBeNull();
    expect(r.status).toBe(429);
  });

  it("rawEmbed devolve status 200 e vetor no caminho feliz", async () => {
    vi.stubGlobal("fetch", mockFetch(200, OK));
    const r = await rawEmbed("selic");
    expect(r.status).toBe(200);
    expect(r.vector?.length).toBe(EMBED_DIMS);
  });
});
