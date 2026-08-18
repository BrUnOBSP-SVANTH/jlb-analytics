import { describe, it, expect } from "vitest";
import { parseYesPrice, polyEventUrl, kalshiMarketUrl, kalshiYesProb } from "./marketNormalize.ts";

describe("parseYesPrice — preço do 'Yes' (índice 0) do Polymarket", () => {
  it("extrai o primeiro preço de um outcomePrices válido", () => {
    expect(parseYesPrice(JSON.stringify(["0.62", "0.38"]))).toBe(0.62);
    expect(parseYesPrice(JSON.stringify(["0.9"]))).toBe(0.9);
  });
  it("nunca lança: undefined, JSON inválido e array vazio → 0", () => {
    expect(parseYesPrice(undefined)).toBe(0);
    expect(parseYesPrice("não é json")).toBe(0);
    expect(parseYesPrice("[]")).toBe(0);
  });
});

describe("polyEventUrl — corretor de link do Polymarket", () => {
  it("monta /pt/event/{eventSlug}", () => {
    expect(polyEventUrl("fed-decision-in-september")).toBe("https://polymarket.com/pt/event/fed-decision-in-september");
  });
  it("sem eventSlug → undefined (não expõe página 404)", () => {
    expect(polyEventUrl(undefined)).toBeUndefined();
    expect(polyEventUrl("")).toBeUndefined();
  });
});

describe("kalshiMarketUrl — corretor de link do Kalshi", () => {
  it("monta /markets/{série}/{evento} em MINÚSCULAS (maiúsculo dá 404)", () => {
    expect(kalshiMarketUrl("KXGOVWINOMD", "KXGOVWINOMD-26")).toBe("https://kalshi.com/markets/kxgovwinomd/kxgovwinomd-26");
  });
});

describe("kalshiYesProb — prob do 'Yes' (0.1–99.9) a partir dos preços em dólar", () => {
  it("usa o mid (bid+ask)/2 quando ambos existem", () => {
    expect(kalshiYesProb("0.40", "0.60")).toBe(50);
    expect(kalshiYesProb("0.30", "0.50")).toBe(40);
  });
  it("cai para o last quando falta bid OU ask", () => {
    expect(kalshiYesProb("0", "0", "0.72")).toBe(72);
    expect(kalshiYesProb("0.5", "0", "0.70")).toBe(70); // ask ausente → last
  });
  it("sem preço nenhum → 50", () => {
    expect(kalshiYesProb("0", "0", "0")).toBe(50);
    expect(kalshiYesProb()).toBe(50);
  });
  it("arredonda a 1 casa decimal", () => {
    expect(kalshiYesProb("0.333", "0.335")).toBe(33.4);
  });
  it("clampa nas bordas (nunca 0/100 — a extremidade é do settlement)", () => {
    expect(kalshiYesProb("1", "1")).toBe(99.9);       // mid 100 → 99.9
    expect(kalshiYesProb("0", "0", "0.0001")).toBe(0.1); // ~0 → 0.1
  });
});
