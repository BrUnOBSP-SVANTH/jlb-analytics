import { describe, it, expect } from "vitest";
import { derivePolymarketOutcome, deriveKalshiOutcome, stripPrefix } from "./resolveOutcomes.ts";

// Caminho de CREDIBILIDADE: a regra que decide se a previsão acertou vem daqui.
// Um erro aqui envenena a "taxa de acerto do site" — por isso testamos a fundo.

describe("deriveKalshiOutcome — settlement oficial da Kalshi", () => {
  it("result 'yes' → SIM venceu (true)", () => {
    expect(deriveKalshiOutcome("yes")).toBe(true);
  });
  it("result 'no' → NÃO venceu (false)", () => {
    expect(deriveKalshiOutcome("no")).toBe(false);
  });
  it("result vazio ou ausente → null (ainda não liquidado, nunca chuta)", () => {
    expect(deriveKalshiOutcome("")).toBeNull();
    expect(deriveKalshiOutcome(undefined)).toBeNull();
  });
  it("valor inesperado não vira falso resultado", () => {
    expect(deriveKalshiOutcome("scalar")).toBeNull();
  });
});

describe("derivePolymarketOutcome — settlement via UMA + preços liquidados", () => {
  const YES = '["Yes","No"]';
  const NO = '["Yes","No"]';

  it("resolvido com Yes a 1.00 → true", () => {
    expect(derivePolymarketOutcome(true, "resolved", YES, '["1","0"]')).toBe(true);
  });
  it("resolvido com No a 1.00 → false", () => {
    expect(derivePolymarketOutcome(true, "resolved", NO, '["0","1"]')).toBe(false);
  });
  it("closed sem UMA final, mas preços liquidados EXATOS (1/0) → resolve", () => {
    // Após a resolução final o Gamma zera os preços em 1/0 mesmo que o campo UMA venha vazio.
    expect(derivePolymarketOutcome(true, undefined, YES, '["1","0"]')).toBe(true);
  });
  it("closed com UMA em DISPUTA e preço fracionário extremo (0.995) → null (não é oficial)", () => {
    // O bug: 'closed' sozinho não garante liquidação; disputa pode inverter o desfecho.
    expect(derivePolymarketOutcome(true, "disputed", YES, '["0.995","0.005"]')).toBeNull();
    expect(derivePolymarketOutcome(true, "proposed", YES, '["0.98","0.02"]')).toBeNull();
  });
  it("mercado ABERTO nunca resolve, mesmo com preço alto", () => {
    expect(derivePolymarketOutcome(false, undefined, YES, '["0.96","0.04"]')).toBeNull();
  });
  it("fechado mas SEM preço liquidado (nenhum lado ≥0.99) → null", () => {
    expect(derivePolymarketOutcome(true, "resolved", YES, '["0.7","0.3"]')).toBeNull();
  });
  it("multi-resultado (rótulos fora de Yes/No) não vira desfecho binário", () => {
    expect(derivePolymarketOutcome(true, "resolved", '["Trump","Biden","Other"]', '["1","0","0"]')).toBeNull();
  });
  it("JSON inválido nos preços não lança nem chuta → null", () => {
    expect(derivePolymarketOutcome(true, "resolved", YES, "not-json")).toBeNull();
  });
});

describe("stripPrefix — normaliza o id interno para o id cru da plataforma", () => {
  it("remove poly-/kalshi-/manifold-", () => {
    expect(stripPrefix("poly-0x123")).toBe("0x123");
    expect(stripPrefix("kalshi-PRES-24")).toBe("PRES-24");
    expect(stripPrefix("manifold-abc")).toBe("abc");
  });
  it("id sem prefixo passa intacto", () => {
    expect(stripPrefix("PRES-24")).toBe("PRES-24");
  });
});
