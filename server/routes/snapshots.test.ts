import { describe, it, expect, afterEach } from "vitest";
import { autorizadoComChaveDeServico } from "./snapshots.ts";

const original = process.env.SUPABASE_SERVICE_KEY;
afterEach(() => { process.env.SUPABASE_SERVICE_KEY = original; });

describe("autorizadoComChaveDeServico — quem pode mandar o servidor gravar", () => {
  it("só passa com a chave exata", () => {
    process.env.SUPABASE_SERVICE_KEY = "chave-de-servico-123";
    expect(autorizadoComChaveDeServico("Bearer chave-de-servico-123")).toBe(true);
    expect(autorizadoComChaveDeServico("Bearer chave-de-servico-124")).toBe(false);
    expect(autorizadoComChaveDeServico("chave-de-servico-123")).toBe(false); // sem o "Bearer "
    expect(autorizadoComChaveDeServico("Bearer chave-de-servico-123 ")).toBe(false);
  });

  it("sem cabeçalho, ou com cabeçalho que não é texto, não passa", () => {
    process.env.SUPABASE_SERVICE_KEY = "chave-de-servico-123";
    for (const v of ["", undefined, null, 42, ["Bearer chave-de-servico-123"]]) {
      expect(autorizadoComChaveDeServico(v)).toBe(false);
    }
  });

  it("servidor SEM chave configurada nega todo mundo", () => {
    // O caminho que reabriria o buraco: cair no vazio e deixar passar.
    delete process.env.SUPABASE_SERVICE_KEY;
    expect(autorizadoComChaveDeServico("Bearer ")).toBe(false);
    expect(autorizadoComChaveDeServico("")).toBe(false);
  });
});
