import { describe, it, expect, vi } from "vitest";

/**
 * A cota grátis não pode ser furada — nem por pedidos SIMULTÂNEOS, nem por
 * falha do banco.
 *
 * A trava conferia o saldo ANTES da análise e só debitava DEPOIS que ela
 * terminava — de 5 a 25 segundos depois, que é o tempo da IA responder. Nesse
 * intervalo, qualquer outro pedido lia o MESMO saldo e também passava. Medido
 * em 21/09/2026 contra o middleware antigo: com 3 de 4 usadas, 5 pedidos
 * simultâneos passaram os 5. Duas abas clicando "Analisar" juntas bastavam.
 *
 * O Supabase aqui é de mentira, mas com a semântica do de verdade: a reserva
 * confere e debita num passo só (o UPDATE ... WHERE usado < limite, que o
 * Postgres serializa pela trava de linha — conferido no banco real, dentro de
 * uma transação desfeita, na migração 036).
 */
interface Cenario {
  simultaneos: number;
  usadoInicial: number;
  cacheHit?: boolean;
  bancoFora?: boolean;
}

async function disparar(c: Cenario): Promise<{ status: number[]; usadoFinal: number }> {
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "chave-de-teste";
  vi.resetModules();

  let usado = c.usadoInicial;
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const u = String(entrada);
    if (u.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "u-1" }), { status: 200 });
    if (u.includes("/rpc/reservar_credito_ia")) {
      if (c.bancoFora) return new Response("erro", { status: 500 });
      const p = JSON.parse(String(init?.body ?? "{}")) as { p_limite: number };
      if (usado < p.p_limite) { usado += 1; return new Response(JSON.stringify([{ reservado: true, usado, plano: "free" }]), { status: 200 }); }
      return new Response(JSON.stringify([{ reservado: false, usado, plano: "free" }]), { status: 200 });
    }
    if (u.includes("/rpc/devolver_credito_ia")) { usado = Math.max(0, usado - 1); return new Response("", { status: 204 }); }
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const { aiCreditsMiddleware } = await import("./aiCredits.ts");
    const express = (await import("express")).default;
    const app = express();
    // A "IA" leva um tempo para responder — é esse intervalo que abria a brecha.
    app.post("/ia", aiCreditsMiddleware, async (_req, res) => {
      if (c.cacheHit) { res.locals.aiCacheHit = true; return res.json({ cached: true }); }
      await new Promise((r) => setTimeout(r, 150));
      res.json({ ok: true });
    });
    const servidor = app.listen(0);
    const porta = (servidor.address() as { port: number }).port;
    const status = await Promise.all(Array.from({ length: c.simultaneos }, () =>
      fetchOriginal(`http://localhost:${porta}/ia`, { method: "POST", headers: { Authorization: "Bearer t" } })
        .then((r) => r.status)));
    await new Promise((r) => setTimeout(r, 100)); // deixa as devoluções chegarem
    servidor.close();
    return { status, usadoFinal: usado };
  } finally {
    globalThis.fetch = fetchOriginal;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_KEY;
  }
}

const quantos = (status: number[], codigo: number) => status.filter((s) => s === codigo).length;

describe("cota grátis contra pedidos simultâneos", () => {
  it("com 3 de 4 usadas, 5 pedidos ao mesmo tempo: só UM passa", async () => {
    const { status, usadoFinal } = await disparar({ simultaneos: 5, usadoInicial: 3 });
    expect(quantos(status, 200)).toBe(1);
    expect(quantos(status, 429)).toBe(4);
    expect(usadoFinal).toBe(4);
  });

  it("com a cota zerada, 6 simultâneos: passam exatamente os 4 do mês", async () => {
    const { status, usadoFinal } = await disparar({ simultaneos: 6, usadoInicial: 0 });
    expect(quantos(status, 200)).toBe(4);
    expect(usadoFinal).toBe(4);
  });
});

describe("cobrança justa continua valendo", () => {
  it("resposta do cache devolve o crédito reservado", async () => {
    const { status, usadoFinal } = await disparar({ simultaneos: 1, usadoInicial: 2, cacheHit: true });
    expect(status).toEqual([200]);
    expect(usadoFinal).toBe(2);
  });
});

describe("banco fora do ar", () => {
  it("fecha (503) em vez de liberar a IA sem cota", async () => {
    // Antes: qualquer falha ao falar com o banco deixava passar — com o
    // Supabase instável, a IA virava ilimitada para qualquer conta.
    const { status } = await disparar({ simultaneos: 3, usadoInicial: 0, bancoFora: true });
    expect(status).toEqual([503, 503, 503]);
  });
});
