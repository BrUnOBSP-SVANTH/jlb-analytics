import { describe, it, expect } from "vitest";
import { idDeLiquidacao, idCanonicoDeMercado } from "./liquidacao.ts";

describe("idCanonicoDeMercado — um formato só para o id do mercado", () => {
  it("o caso real de 20/09: a previsão da ficha gravava o id cru", () => {
    expect(idCanonicoDeMercado("polymarket", "1130012")).toBe("poly-1130012");
    // E sem o prefixo ela nunca seria resolvida:
    expect(idDeLiquidacao({ marketId: "1130012" })).toBeNull();
    expect(idDeLiquidacao({ marketId: idCanonicoDeMercado("polymarket", "1130012") })).toBe("poly-1130012");
  });

  it("'poly', não 'polymarket' — é o prefixo que o banco guarda", () => {
    expect(idCanonicoDeMercado("polymarket", "559653")).toBe("poly-559653");
    expect(idCanonicoDeMercado("poly", "559653")).toBe("poly-559653");
  });

  it("Kalshi e Manifold seguem a mesma regra", () => {
    expect(idCanonicoDeMercado("kalshi", "KXNFLGAME-26SEP21NYGLAR-NYG")).toBe("kalshi-KXNFLGAME-26SEP21NYGLAR-NYG");
    expect(idCanonicoDeMercado("manifold", "abc123")).toBe("manifold-abc123");
  });

  it("id que já vem no formato passa intacto — chamar duas vezes é seguro", () => {
    expect(idCanonicoDeMercado("polymarket", "poly-1130012")).toBe("poly-1130012");
    expect(idCanonicoDeMercado("kalshi", idCanonicoDeMercado("kalshi", "KX-1"))).toBe("kalshi-KX-1");
  });

  it("fonte desconhecida NÃO ganha prefixo inventado", () => {
    // Prefixo errado liquidaria a previsão contra o mercado de outra plataforma.
    expect(idCanonicoDeMercado("reddit", "123")).toBe("123");
    expect(idCanonicoDeMercado(undefined, "123")).toBe("123");
  });

  it("id vazio continua vazio", () => {
    expect(idCanonicoDeMercado("polymarket", "")).toBe("");
  });
});
