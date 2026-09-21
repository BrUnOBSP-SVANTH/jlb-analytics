// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Toda chamada de IA avisa a interface — é o que faz o contador de análises
 * sair do lugar.
 *
 * Antes, a barra de navegação lia a cota UMA vez (quando a sessão carregava) e
 * nunca mais: a pessoa gastava uma análise e seguia lendo "4 restantes" até
 * recarregar a página. O débito ia para o banco; a tela não contava.
 */

vi.mock("./supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

const { apiFetch, EVENTO_IA_USADA } = await import("./api");

let avisos = 0;
const contar = () => { avisos++; };

beforeEach(() => {
  avisos = 0;
  window.addEventListener(EVENTO_IA_USADA, contar);
});
afterEach(() => {
  window.removeEventListener(EVENTO_IA_USADA, contar);
  vi.unstubAllGlobals();
});

const responder = (status: number) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status })));

describe("apiFetch avisa quando a IA foi usada", () => {
  it("rota de IA que responde bem: avisa", async () => {
    responder(200);
    await apiFetch("/api/ai/analyze", { method: "POST" });
    expect(avisos).toBe(1);
  });

  it("cota esgotada (429) também avisa — é quando o número mais precisa aparecer", async () => {
    responder(429);
    await apiFetch("/api/ai/analyze", { method: "POST" });
    expect(avisos).toBe(1);
  });

  it("rota que não é de IA não mexe na cota, então não avisa", async () => {
    responder(200);
    await apiFetch("/api/snapshots/history/polymarket/123");
    expect(avisos).toBe(0);
  });

  it("erro de servidor na IA não avisa — nada foi cobrado", async () => {
    responder(503);
    await apiFetch("/api/ai/analyze", { method: "POST" });
    expect(avisos).toBe(0);
  });
});
