import { describe, it, expect } from "vitest";
import { ehErroDeVersaoAntiga, podeRecarregar, JANELA_SEM_NOVA_RECARGA_MS } from "./versaoNova";

function memoria(): Pick<Storage, "getItem" | "setItem"> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe("ehErroDeVersaoAntiga — reconhece o arquivo de tela que sumiu", () => {
  it("as mensagens reais registradas em produção", () => {
    expect(ehErroDeVersaoAntiga(
      "Failed to fetch dynamically imported module: https://jlb-analytics.onrender.com/assets/Login-DhpfCmto.js",
    )).toBe(true);
    expect(ehErroDeVersaoAntiga(
      "Failed to fetch dynamically imported module: https://jlb-analytics.onrender.com/assets/MarketDetail-4DHKjyVY.js",
    )).toBe(true);
  });

  it("as grafias do Firefox e do Safari", () => {
    expect(ehErroDeVersaoAntiga("error loading dynamically imported module: /assets/x.js")).toBe(true);
    expect(ehErroDeVersaoAntiga("Importing a module script failed.")).toBe(true);
  });

  it("erro de verdade NÃO é confundido — esse tem que aparecer", () => {
    // Também veio da telemetria (02/08): defeito de código, recarregar não resolve.
    expect(ehErroDeVersaoAntiga(
      "Objects are not valid as a React child (found: object with keys {factor, impact}).",
    )).toBe(false);
    expect(ehErroDeVersaoAntiga(undefined)).toBe(false);
  });
});

describe("podeRecarregar — uma vez, nunca em laço", () => {
  it("primeira falha recarrega", () => {
    expect(podeRecarregar(1_000_000, memoria())).toBe(true);
  });

  it("segunda falha logo depois NÃO recarrega de novo", () => {
    const s = memoria();
    expect(podeRecarregar(1_000_000, s)).toBe(true);
    expect(podeRecarregar(1_000_000 + 5_000, s)).toBe(false);
  });

  it("passada a janela, uma publicação nova pode recarregar outra vez", () => {
    const s = memoria();
    podeRecarregar(1_000_000, s);
    expect(podeRecarregar(1_000_000 + JANELA_SEM_NOVA_RECARGA_MS + 1, s)).toBe(true);
  });

  it("sem armazenamento, não recarrega — sem a marca não há garantia contra laço", () => {
    expect(podeRecarregar(1_000_000, null)).toBe(false);
  });

  it("armazenamento que lança erro também não recarrega", () => {
    const quebrado = { getItem: () => { throw new Error("bloqueado"); }, setItem: () => {} };
    expect(podeRecarregar(1_000_000, quebrado)).toBe(false);
  });
});
