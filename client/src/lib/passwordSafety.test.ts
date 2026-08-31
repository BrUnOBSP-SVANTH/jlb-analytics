import { describe, it, expect, vi, afterEach } from "vitest";
import { checkPasswordRules, countBreaches, MIN_PASSWORD_LEN } from "./passwordSafety.ts";

describe("checkPasswordRules — barra o óbvio antes de gastar rede", () => {
  it("rejeita senha curta", () => {
    const r = checkPasswordRules("Ab1x");
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(String(MIN_PASSWORD_LEN));
  });

  it("rejeita só letras e só números", () => {
    expect(checkPasswordRules("abcdefghij").ok).toBe(false);
    expect(checkPasswordRules("9876543210").ok).toBe(false);
  });

  it("rejeita sequências e palavras previsíveis mesmo com tamanho ok", () => {
    expect(checkPasswordRules("senha12345").ok).toBe(false);
    expect(checkPasswordRules("qwerty1234").ok).toBe(false);
    expect(checkPasswordRules("aaaaaaaaaa").ok).toBe(false);
  });

  it("aceita senha razoável", () => {
    expect(checkPasswordRules("girassol47bravo").ok).toBe(true);
  });
});

describe("countBreaches — k-anonimato e falha aberta", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; });

  it("envia SÓ o prefixo de 5 caracteres do hash (senha nunca sai)", async () => {
    const spy = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    globalThis.fetch = spy as unknown as typeof fetch;
    await countBreaches("girassol47bravo");
    const url = String(spy.mock.calls[0][0]);
    const prefix = url.split("/range/")[1];
    expect(prefix).toHaveLength(5);
    expect(url).not.toContain("girassol");     // a senha em si nunca trafega
  });

  it("conta os vazamentos quando o sufixo casa", async () => {
    // SHA-1("123456") = 7C4A8D09CA3762AF61E59520943DC26494F8941B
    //                   prefixo 7C4A8 | sufixo D09CA3762AF61E59520943DC26494F8941B
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "D09CA3762AF61E59520943DC26494F8941B:210461208\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:1",
    }) as unknown as typeof fetch;
    expect(await countBreaches("123456")).toBe(210461208);
  });

  it("devolve 0 quando o sufixo não aparece na lista", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, text: async () => "0000000000000000000000000000000000A:5",
    }) as unknown as typeof fetch;
    expect(await countBreaches("girassol47bravo")).toBe(0);
  });

  it("API fora do ar → null (falha ABERTA, não trava o cadastro)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    expect(await countBreaches("girassol47bravo")).toBeNull();
  });
});
