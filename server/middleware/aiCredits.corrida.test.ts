import { describe, it, expect, vi } from "vitest";

/**
 * A cota grátis não pode ser furada — nem por pedidos SIMULTÂNEOS, nem por
 * várias contas da MESMA caixa de e-mail, nem por e-mail temporário, nem por
 * falha do banco.
 *
 * 1. Simultâneos: a trava conferia o saldo ANTES da análise e só debitava
 *    DEPOIS (5 a 25s depois). Medido contra o middleware antigo: com 3 de 4
 *    usadas, 5 pedidos simultâneos passaram os 5. Duas abas bastavam.
 * 2. Várias contas: a cota era por conta, e no Gmail joao+1@, joao+2@ e
 *    j.o.a.o@ caem na mesma caixa. Agora a cota é da identidade (e-mail
 *    normalizado, migração 037).
 *
 * O Supabase aqui é de mentira, mas com a semântica do de verdade: a reserva
 * confere e debita num passo só, por IDENTIDADE (conferido no banco real,
 * dentro de transações desfeitas, nas migrações 036 e 037).
 */

type Conta = { id: string; email: string; confirmado?: boolean };
const CONTAS: Record<string, Conta> = {
  a: { id: "u-a", email: "joao.silva+1@gmail.com" },
  b: { id: "u-b", email: "joaosilva+2@gmail.com" },       // MESMA caixa que "a"
  c: { id: "u-c", email: "maria@outlook.com" },           // outra pessoa
  temp: { id: "u-t", email: "x@mailinator.com" },
  semConfirmar: { id: "u-s", email: "ana@gmail.com", confirmado: false },
};

interface Cenario {
  pedidos: string[];              // tokens, disparados TODOS ao mesmo tempo
  usadoInicial?: number;          // saldo já gasto pela caixa de "a"/"b"
  cacheHit?: boolean;
  bancoFora?: boolean;
}

async function disparar(c: Cenario): Promise<{ status: number[]; saldoPorCaixa: Map<string, number> }> {
  // Guarda o que havia antes: APAGAR no fim vazaria para o próximo arquivo de
  // teste que rodar no mesmo processo (o pool reaproveita processos).
  const antes = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "chave-de-teste";
  vi.resetModules();

  const { identidadeDaCota } = await import("../lib/identidadeCota.ts");
  const saldo = new Map<string, number>();
  if (c.usadoInicial) saldo.set(identidadeDaCota(CONTAS.a.email)!, c.usadoInicial);

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const u = String(entrada);
    if (u.includes("/auth/v1/user")) {
      const token = String(new Headers(init?.headers).get("Authorization") ?? "").replace("Bearer ", "");
      const conta = CONTAS[token];
      if (!conta) return new Response("{}", { status: 401 });
      return new Response(JSON.stringify({
        id: conta.id, email: conta.email,
        email_confirmed_at: conta.confirmado === false ? null : "2026-09-01T00:00:00Z",
      }), { status: 200 });
    }
    if (u.includes("/rpc/reservar_credito_ia")) {
      if (c.bancoFora) return new Response("erro", { status: 500 });
      const p = JSON.parse(String(init?.body ?? "{}")) as { p_limite: number; p_identidade: string };
      const usado = saldo.get(p.p_identidade) ?? 0;
      if (usado < p.p_limite) {
        saldo.set(p.p_identidade, usado + 1);
        return new Response(JSON.stringify([{ reservado: true, usado: usado + 1, plano: "free" }]), { status: 200 });
      }
      return new Response(JSON.stringify([{ reservado: false, usado, plano: "free" }]), { status: 200 });
    }
    if (u.includes("/rpc/devolver_credito_ia")) {
      const p = JSON.parse(String(init?.body ?? "{}")) as { p_identidade: string };
      saldo.set(p.p_identidade, Math.max(0, (saldo.get(p.p_identidade) ?? 0) - 1));
      return new Response("", { status: 204 });
    }
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
    const status = await Promise.all(c.pedidos.map((token) =>
      fetchOriginal(`http://localhost:${porta}/ia`, { method: "POST", headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.status)));
    await new Promise((r) => setTimeout(r, 100)); // deixa as devoluções chegarem
    servidor.close();
    return { status, saldoPorCaixa: saldo };
  } finally {
    globalThis.fetch = fetchOriginal;
    if (antes.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = antes.url;
    if (antes.key === undefined) delete process.env.SUPABASE_SERVICE_KEY; else process.env.SUPABASE_SERVICE_KEY = antes.key;
  }
}

const quantos = (status: number[], codigo: number) => status.filter((s) => s === codigo).length;
const vezes = (token: string, n: number) => Array.from({ length: n }, () => token);

describe("cota grátis contra pedidos simultâneos", () => {
  it("com 3 de 4 usadas, 5 pedidos ao mesmo tempo: só UM passa", async () => {
    const { status } = await disparar({ pedidos: vezes("a", 5), usadoInicial: 3 });
    expect(quantos(status, 200)).toBe(1);
    expect(quantos(status, 429)).toBe(4);
  });

  it("com a cota zerada, 6 simultâneos: passam exatamente os 4 do mês", async () => {
    const { status } = await disparar({ pedidos: vezes("a", 6) });
    expect(quantos(status, 200)).toBe(4);
  });
});

describe("cota é da PESSOA, não da conta", () => {
  it("duas contas da mesma caixa (joao.silva+1@ e joaosilva+2@) dividem as mesmas 4", async () => {
    const { status } = await disparar({ pedidos: [...vezes("a", 3), ...vezes("b", 3)] });
    expect(quantos(status, 200)).toBe(4);
    expect(quantos(status, 429)).toBe(2);
  });

  it("pessoa diferente tem a própria cota — ninguém paga pelo abuso alheio", async () => {
    const { status } = await disparar({ pedidos: [...vezes("a", 4), ...vezes("c", 4)] });
    expect(quantos(status, 200)).toBe(8);
  });
});

describe("contas que não podem usar a IA", () => {
  it("e-mail temporário: 403, e nenhum crédito é reservado", async () => {
    const { status, saldoPorCaixa } = await disparar({ pedidos: vezes("temp", 3) });
    expect(status).toEqual([403, 403, 403]);
    expect(saldoPorCaixa.size).toBe(0);
  });

  it("e-mail não confirmado: 403", async () => {
    const { status } = await disparar({ pedidos: ["semConfirmar"] });
    expect(status).toEqual([403]);
  });
});

describe("cobrança justa continua valendo", () => {
  it("resposta do cache devolve o crédito reservado", async () => {
    const { status, saldoPorCaixa } = await disparar({ pedidos: ["a"], usadoInicial: 2, cacheHit: true });
    expect(status).toEqual([200]);
    expect([...saldoPorCaixa.values()]).toEqual([2]);
  });
});

describe("banco fora do ar", () => {
  it("fecha (503) em vez de liberar a IA sem cota", async () => {
    const { status } = await disparar({ pedidos: vezes("a", 3), bancoFora: true });
    expect(status).toEqual([503, 503, 503]);
  });
});
