import { describe, it, expect } from "vitest";
import { mercadoMereceAlerta, VOLUME_MINIMO_KALSHI, VOLUME_MINIMO_POLYMARKET } from "./alertasMercado.ts";

describe("mercadoMereceAlerta — o sino não toca por mercado vazio", () => {
  it("o caso da auditoria: tênis de mesa polonês com 936 contratos fica de fora", () => {
    expect(mercadoMereceAlerta("kalshi", 936)).toBe(false);
    expect(mercadoMereceAlerta("kalshi", 7_326)).toBe(true); // a mediana do catálogo passa
  });

  it("cada fonte tem a sua unidade", () => {
    expect(VOLUME_MINIMO_KALSHI).toBe(5_000);        // contratos
    expect(VOLUME_MINIMO_POLYMARKET).toBe(10_000);   // dólares
    expect(mercadoMereceAlerta("polymarket", 6_000)).toBe(false);
    expect(mercadoMereceAlerta("kalshi", 6_000)).toBe(true);
  });

  it("sem volume não toca — alerta é interrupção", () => {
    for (const v of [undefined, null, NaN, "50000"]) expect(mercadoMereceAlerta("kalshi", v)).toBe(false);
  });
});
