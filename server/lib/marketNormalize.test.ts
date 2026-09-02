import { describe, it, expect } from "vitest";
import { parseYesPrice, polyEventUrl, kalshiMarketUrl, kalshiYesProb, rankOutcomes, kalshiTemPrecoReal } from "./marketNormalize.ts";

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

describe("rankOutcomes — ranking dos desfechos negRisk (fidelidade do settlement)", () => {
  const items = [
    { label: "A", prob: 0.2, ref: "idA" },
    { label: "B", prob: 0.6, ref: "idB" }, // líder de probabilidade
    { label: "C", prob: 0.1, ref: "idC" },
  ];

  it("ordena por probabilidade decrescente", () => {
    expect(rankOutcomes(items).map((o) => o.label)).toEqual(["B", "A", "C"]);
  });

  it("INVARIANTE: ranked[0].ref (id) é o mesmo desfecho de ranked[0].prob (outcomePrices[0])", () => {
    const r = rankOutcomes(items);
    expect(r[0].ref).toBe("idB");   // id que o settlement vai resolver
    expect(r[0].prob).toBe(0.6);    // outcomePrices[0] — MESMO desfecho, não o líder de volume
  });

  it("descarta rótulo vazio e probabilidade desprezível (≤0.5%)", () => {
    const r = rankOutcomes([
      { label: "", prob: 0.9, ref: 1 },      // sem rótulo
      { label: "X", prob: 0.004, ref: 2 },   // ~0 (ruído)
      { label: "Y", prob: 0.3, ref: 3 },
    ]);
    expect(r.map((o) => o.ref)).toEqual([3]);
  });

  it("respeita o cap (default 12, configurável)", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `L${i}`, prob: (i + 1) / 100, ref: i }));
    expect(rankOutcomes(many)).toHaveLength(12);
    expect(rankOutcomes(many, 5)).toHaveLength(5);
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

describe("kalshiTemPrecoReal / spread — preço inventado não vai para a tela", () => {
  // Medido em 02/09: 629 dos 14.339 mercados ativos do Kalshi não têm cotação e
  // recebiam 50% do fallback, exibido como se fosse preço de mercado. Era também
  // a causa de "Brazil Presidential Election First Round" somar 554% entre os
  // desfechos — doze deles marcando 50% cada.
  it("rejeita mercado sem cotação nenhuma", () => {
    expect(kalshiTemPrecoReal(undefined, undefined, undefined)).toBe(false);
    expect(kalshiTemPrecoReal("0", "0", "0")).toBe(false);
  });

  it("aceita mid quando o spread é estreito (mediana real é 7pp)", () => {
    expect(kalshiTemPrecoReal("0.45", "0.52")).toBe(true);
    expect(kalshiYesProb("0.45", "0.52")).toBeCloseTo(48.5, 1);
  });

  it("rejeita o mid de spread absurdo — 1¢/99¢ não é preço, é ausência dele", () => {
    expect(kalshiTemPrecoReal("0.01", "0.99")).toBe(false);
    // com um negócio real registrado, o last salva o mercado
    expect(kalshiTemPrecoReal("0.01", "0.99", "0.20")).toBe(true);
    expect(kalshiYesProb("0.01", "0.99", "0.20")).toBeCloseTo(20, 1);
  });

  it("nunca devolve 0% nem 100% — a extremidade fica para o settlement oficial", () => {
    expect(kalshiYesProb("0.999", "0.999")).toBeLessThan(100);
    expect(kalshiYesProb(undefined, undefined, "0.0001")).toBeGreaterThan(0);
  });
});
