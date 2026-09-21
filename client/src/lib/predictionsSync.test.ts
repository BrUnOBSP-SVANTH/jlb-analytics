// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A previsão registrada tem que chegar ao BANCO na hora, sem depender de a
 * pessoa abrir o painel depois.
 *
 * Medido no site publicado em 20/09/2026 com uma conta de teste: registrei uma
 * previsão pela ficha do mercado e ela não estava no Supabase — só no navegador.
 * Quem resolve pelo settlement oficial e manda o push é o SERVIDOR, de 6 em 6
 * horas: previsão que não chegou ao banco nunca é resolvida e nunca vira aviso.
 */

const upsert = vi.fn(() => Promise.resolve({ error: null }));
const getSession = vi.fn();

vi.mock("./supabase", () => ({
  supabase: {
    auth: { getSession: () => getSession() },
    from: () => ({ upsert }),
  },
}));

const { registrarPrevisao } = await import("./predictionsSync");

const previsao = {
  marketId: "poly-1130012",
  question: "Vai chover?",
  marketProb: 40,
  userProb: 55,
};

beforeEach(() => {
  upsert.mockClear();
  getSession.mockReset();
  localStorage.clear();
});

describe("registrarPrevisao — salva local E sincroniza", () => {
  it("com conta: sobe para o banco sem esperar o painel", async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: "u-1" } } } });
    const p = registrarPrevisao(previsao);
    expect(p.marketId).toBe("poly-1130012");
    await vi.waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    const [linhas] = upsert.mock.calls[0] as [Array<Record<string, unknown>>];
    expect(linhas[0]).toMatchObject({ user_id: "u-1", market_id: "poly-1130012", user_prob: 55 });
  });

  it("sem conta: guarda local e não tenta o banco", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    registrarPrevisao(previsao);
    await new Promise((r) => setTimeout(r, 20));
    expect(upsert).not.toHaveBeenCalled();
  });

  it("falha de rede não derruba o registro — a previsão já está salva", async () => {
    getSession.mockRejectedValue(new Error("offline"));
    const p = registrarPrevisao(previsao);
    await new Promise((r) => setTimeout(r, 20));
    expect(p.id).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });
});
