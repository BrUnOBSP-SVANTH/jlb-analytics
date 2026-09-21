import { describe, it, expect, vi } from "vitest";
import { isStaleMonth } from "./aiCredits.ts";

// Regressão do bloqueio permanente: usuário free em 30/30 levava 429 antes do
// UPDATE, então o trigger de reset mensal nunca disparava. A leitura precisa
// tratar mês antigo como cota zerada.
describe("isStaleMonth", () => {
  const now = new Date("2026-07-15T12:00:00Z");

  it("mês anterior é stale (cota deve zerar)", () => {
    expect(isStaleMonth("2026-06-01", now)).toBe(true);
  });

  it("ano anterior é stale", () => {
    expect(isStaleMonth("2025-12-01", now)).toBe(true);
  });

  it("mês corrente NÃO é stale", () => {
    expect(isStaleMonth("2026-07-01", now)).toBe(false);
  });

  it("aceita timestamp completo do Postgres", () => {
    expect(isStaleMonth("2026-06-01T00:00:00+00:00", now)).toBe(true);
    expect(isStaleMonth("2026-07-01T00:00:00+00:00", now)).toBe(false);
  });
});

/**
 * O cabeçalho da cota diz a VERDADE — inclusive quando a resposta veio do cache.
 *
 * O chat mostra o contador a partir destes cabeçalhos (ChatPanel). Eles eram
 * escritos ANTES de o handler rodar, sempre como `usado + 1`: no acerto de
 * cache, que não cobra nada (cobrança diferida), a tela dizia que a pessoa
 * gastou uma análise que ela não gastou.
 */
describe("cabeçalho da cota vs. acerto de cache", () => {
  const ANTES = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };

  async function pedir(comCacheHit: boolean): Promise<Record<string, string>> {
    process.env.SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "chave-de-teste";
    vi.resetModules();

    // Supabase de mentira: token válido, usuário com 2 de 4 análises usadas.
    // A reserva (migração 036) confere e debita num passo só.
    let usado = 2;
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async (entrada: RequestInfo | URL) => {
      const u = String(entrada);
      if (u.includes("/auth/v1/user")) {
        return new Response(JSON.stringify({ id: "u-1", email: "ana@gmail.com", email_confirmed_at: "2026-09-01T00:00:00Z" }), { status: 200 });
      }
      if (u.includes("/rpc/reservar_credito_ia")) {
        usado += 1;
        return new Response(JSON.stringify([{ reservado: true, usado, plano: "free" }]), { status: 200 });
      }
      if (u.includes("/rpc/devolver_credito_ia")) { usado -= 1; return new Response("", { status: 204 }); }
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    try {
      const { aiCreditsMiddleware } = await import("./aiCredits.ts");
      const express = (await import("express")).default;
      const app = express();
      app.post("/ia", aiCreditsMiddleware, (_req, res) => {
        if (comCacheHit) res.locals.aiCacheHit = true;
        res.json({ ok: true });
      });
      const servidor = app.listen(0);
      const porta = (servidor.address() as { port: number }).port;
      const r = await fetchOriginal(`http://localhost:${porta}/ia`, {
        method: "POST", headers: { Authorization: "Bearer token-valido" },
      });
      servidor.close();
      return Object.fromEntries(r.headers.entries());
    } finally {
      globalThis.fetch = fetchOriginal;
      if (ANTES.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = ANTES.url;
      if (ANTES.key === undefined) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = ANTES.key;
    }
  }

  it("geração real: o contador anda (2 → 3)", async () => {
    const h = await pedir(false);
    expect(h["x-ai-credits-used"]).toBe("3");
    expect(h["x-ai-credits-limit"]).toBe("4");
  });

  it("resposta do cache: o contador NÃO anda — não foi cobrado", async () => {
    const h = await pedir(true);
    expect(h["x-ai-credits-used"]).toBe("2");
  });
});
