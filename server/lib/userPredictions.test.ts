import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * O job que resolve previsões de usuário no SERVIDOR (a cada 6h, com push).
 *
 * Em 14/09/2026 a regra do desfecho foi escrita só no cliente, e este job
 * continuou resolvendo tudo pelo market_id. Com a migration 030 no ar, a
 * primeira previsão de "Aston Villa" no banco levaria o resultado do LÍDER,
 * gravado como oficial, e um push de "✅ Você acertou". Este teste prende a
 * regra de shared/liquidacao.ts no caminho do servidor.
 */

const settlementsDoLote = vi.fn();
vi.mock("./resolveOutcomes.ts", () => ({ fetchRealOutcomesBatch: (ids: string[]) => settlementsDoLote(ids) }));
vi.mock("./push.ts", () => ({ pushEnabled: () => false, pushToUser: async () => 0 }));

const PENDENTES = [
  // binária comum
  { id: "bin", user_id: "u1", market_id: "poly-1", market_question: "Fed corta?", market_prob: 40, user_prob: 60, outcome_id: null },
  // desfecho do Polymarket: token CLOB, não liquida por aqui
  { id: "poly-villa", user_id: "u2", market_id: "poly-2772176", market_question: "UCL 2027 — Aston Villa", market_prob: 2, user_prob: 5, outcome_id: "71315234608491" },
  // desfecho do Kalshi: ticker próprio
  { id: "kalshi-ars", user_id: "u3", market_id: "kalshi-KXUCL-27-BAR", market_question: "UCL 2027 — Arsenal", market_prob: 14, user_prob: 30, outcome_id: "KXUCL-27-ARS" },
];

let patches: Array<{ id: string; outcome: boolean }>;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SUPABASE_URL", "https://teste.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_KEY", "chave-de-teste");
  patches = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") return new Response(JSON.stringify(PENDENTES), { status: 200 });
    const id = decodeURIComponent(String(url).split("id=eq.")[1] ?? "");
    patches.push({ id, outcome: (JSON.parse(String(init.body)) as { outcome: boolean }).outcome });
    return new Response(null, { status: 204 });
  }));
  // O líder (Barcelona) venceu no Polymarket e no Kalshi; o Arsenal, não.
  settlementsDoLote.mockImplementation(async () => ({
    outcomes: new Map<string, boolean>([
      ["poly-1", true],
      ["poly-2772176", true],
      ["kalshi-KXUCL-27-BAR", true],
      ["kalshi-KXUCL-27-ARS", false],
    ]),
    unavailable: new Set<string>(),
  }));
});

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); settlementsDoLote.mockReset(); });

describe("resolveUserPredictions — cada previsão pelo id que a liquida", () => {
  it("consulta o ticker do desfecho, e nunca o mercado de uma previsão de desfecho", async () => {
    const { resolveUserPredictions } = await import("./userPredictions.ts");
    await resolveUserPredictions();
    const [ids] = settlementsDoLote.mock.calls[0] as [string[]];
    expect(ids.sort()).toEqual(["kalshi-KXUCL-27-ARS", "poly-1"]);
  });

  it("grava o resultado DO DESFECHO — o Arsenal perdeu, mesmo com o líder ganhando", async () => {
    const { resolveUserPredictions } = await import("./userPredictions.ts");
    const r = await resolveUserPredictions();
    expect(patches).toContainEqual({ id: "bin", outcome: true });
    expect(patches).toContainEqual({ id: "kalshi-ars", outcome: false });
    expect(r.resolved).toBe(2);
  });

  it("desfecho do Polymarket fica pendente: não recebe o resultado do líder", async () => {
    const { resolveUserPredictions } = await import("./userPredictions.ts");
    await resolveUserPredictions();
    expect(patches.map((p) => p.id)).not.toContain("poly-villa");
  });
});
