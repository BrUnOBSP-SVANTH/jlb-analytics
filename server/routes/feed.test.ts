import { describe, it, expect } from "vitest";
import { readOf, assembleFeed, type PolyMarket, type KalshiMarket } from "./feed.ts";

// Fábricas de mercado com defaults sãos — cada teste sobrescreve só o que importa.
const poly = (over: Partial<PolyMarket> = {}): PolyMarket => ({
  id: "p1", question: "Vai chover?", outcomePrices: JSON.stringify(["0.60", "0.40"]),
  category: "politics", volume: 1000, externalUrl: "https://polymarket.com/pt/event/x", ...over,
});
const kalshi = (over: Partial<KalshiMarket> = {}): KalshiMarket => ({
  ticker: "K1", title: "Fed sobe juros?", yesProb: 55,
  category: "econ", volume: 500, externalUrl: "https://kalshi.com/markets/a/b", ...over,
});

describe("readOf — leitura editorial determinística", () => {
  it("sem delta vira 'estável'", () => {
    expect(readOf(62, null)).toBe("O mercado precifica 62% de chance. Estável na última semana.");
  });
  it("delta abaixo de 0.5 pt ainda é estável (ruído)", () => {
    expect(readOf(50, 0.3)).toContain("Estável");
  });
  it("delta positivo → 'Subiu', com 1 casa decimal e prob arredondada", () => {
    expect(readOf(61.4, 16.5)).toBe("O mercado precifica 61% de chance. Subiu 16.5 pts em 7 dias.");
  });
  it("delta negativo → 'Caiu' pelo valor absoluto", () => {
    expect(readOf(12, -33)).toBe("O mercado precifica 12% de chance. Caiu 33.0 pts em 7 dias.");
  });
});

describe("assembleFeed — montagem do feed", () => {
  it("monta itens de poly + kalshi com prob e leitura corretas", () => {
    const items = assembleFeed([poly()], [kalshi()], new Map(), new Map(), 10);
    expect(items).toHaveLength(2);
    const p = items.find((i) => i.source === "polymarket")!;
    expect(p.prob).toBe(60);              // outcomePrices[0] 0.60 * 100
    expect(p.delta7d).toBeNull();
    expect(p.read).toBe(readOf(60, null));
    const k = items.find((i) => i.source === "kalshi")!;
    expect(k.prob).toBe(55);              // yesProb já é 0-100
    expect(k.marketId).toBe("K1");
  });

  it("descarta mercado sem externalUrl (link inválido não vira notícia)", () => {
    expect(assembleFeed([poly({ externalUrl: undefined })], [], new Map(), new Map(), 10)).toHaveLength(0);
  });

  it("descarta quase-resolvidos: poly ≥97% e kalshi ≤3%", () => {
    const items = assembleFeed(
      [poly({ id: "hi", outcomePrices: JSON.stringify(["0.98"]) })],
      [kalshi({ ticker: "lo", yesProb: 2 })],
      new Map(), new Map(), 10,
    );
    expect(items).toHaveLength(0);
  });

  it("lê o delta7d do mapa de movimento por id (poly) e ticker (kalshi)", () => {
    const items = assembleFeed(
      [poly({ id: "p1" })], [kalshi({ ticker: "k1" })],
      new Map([["p1", 12.5]]), new Map([["k1", -4]]), 10,
    );
    expect(items.find((i) => i.marketId === "p1")!.delta7d).toBe(12.5);
    expect(items.find((i) => i.marketId === "k1")!.delta7d).toBe(-4);
  });

  it("ordena pelos MAIORES movimentos (|delta|), sem-movimento por último", () => {
    const items = assembleFeed(
      [poly({ id: "a", volume: 10 }), poly({ id: "b", volume: 10 }), poly({ id: "c", volume: 10 })],
      [],
      new Map([["a", 5], ["b", -20]]),   // b se moveu mais em módulo; c não tem histórico
      new Map(), 10,
    );
    expect(items.map((i) => i.marketId)).toEqual(["b", "a", "c"]);
  });

  it("volume desempata quando ninguém se moveu", () => {
    const items = assembleFeed(
      [poly({ id: "a", volume: 100 }), poly({ id: "b", volume: 999 })],
      [], new Map(), new Map(), 10,
    );
    expect(items.map((i) => i.marketId)).toEqual(["b", "a"]);
  });

  it("respeita o limite", () => {
    const many = Array.from({ length: 5 }, (_, i) => poly({ id: `p${i}` }));
    expect(assembleFeed(many, [], new Map(), new Map(), 3)).toHaveLength(3);
  });

  it("outcomePrices inválido cai para 50% (nunca quebra)", () => {
    const items = assembleFeed([poly({ outcomePrices: "não é json" })], [], new Map(), new Map(), 10);
    expect(items[0].prob).toBe(50);
  });
});
