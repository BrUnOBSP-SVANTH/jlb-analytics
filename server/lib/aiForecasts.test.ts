import { describe, it, expect } from "vitest";
import { parseShortDatedKalshi, parseShortDatedPolymarket, tierForClose, categoryEdgeWeight, selectOfficialUpgrades, type RawKalshiMarket, type RawPolyEvent } from "./aiForecasts.ts";

// ── tierForClose: prioridade pela proximidade de resolução ──────────────────────
const NOW = 1_700_000_000_000;
const inDays = (n: number) => NOW + n * 86_400_000;

describe("tierForClose — prioriza o que resolve cedo (enche a prova)", () => {
  it("liquida em ATÉ 7 dias → prioridade MÁXIMA (6), acima da janela ampla", () => {
    expect(tierForClose(inDays(3), NOW)).toBe(6);
    expect(tierForClose(inDays(7), NOW)).toBe(6);   // borda inclusiva
    expect(tierForClose(inDays(8), NOW)).toBe(5);   // 8 dias já cai pra 5
    expect(tierForClose(inDays(2), NOW)).toBeGreaterThan(tierForClose(inDays(30), NOW)); // urgente > janela ampla
  });
  it("janela de resolução (±60d) é a melhor depois da urgente (5), inclusive fechados há pouco", () => {
    expect(tierForClose(inDays(10), NOW)).toBe(5);
    expect(tierForClose(inDays(-10), NOW)).toBe(5); // fechou há pouco → deve estar resolvendo
    expect(tierForClose(inDays(60), NOW)).toBe(5);  // borda inclusiva
  });
  it("perpétuo (>365d) e sem-data afundam para 1", () => {
    expect(tierForClose(inDays(400), NOW)).toBe(1);
    expect(tierForClose(Infinity, NOW)).toBe(1);
  });
  it("próximos ~6 meses (61–180d) = 4", () => {
    expect(tierForClose(inDays(61), NOW)).toBe(4);
    expect(tierForClose(inDays(180), NOW)).toBe(4);
  });
  it("180–365d = 2; atrasado (>60d fechado) = 3", () => {
    expect(tierForClose(inDays(300), NOW)).toBe(2);
    expect(tierForClose(inDays(-100), NOW)).toBe(3);
  });
  it("data curta SEMPRE ganha do perpétuo na ordenação (o bug que corrigimos)", () => {
    expect(tierForClose(inDays(5), NOW)).toBeGreaterThan(tierForClose(inDays(400), NOW));
  });
});

describe("categoryEdgeWeight — prioriza onde a IA bate o mercado", () => {
  it("mercados EFICIENTES (esporte/e-sports/tênis) = 1 (sem edge)", () => {
    expect(categoryEdgeWeight("Esports")).toBe(1);
    expect(categoryEdgeWeight("Sports")).toBe(1);
    expect(categoryEdgeWeight("Tennis")).toBe(1);
    expect(categoryEdgeWeight("NFL")).toBe(1);
  });
  it("RACIOCÍNIO/notícia (política/economia) = 3 (tem edge)", () => {
    expect(categoryEdgeWeight("Politics")).toBe(3);
    expect(categoryEdgeWeight("Economy")).toBe(3);
    expect(categoryEdgeWeight("Finance")).toBe(3);
  });
  it("neutro (cripto/cultura/outros) = 2", () => {
    expect(categoryEdgeWeight("Crypto")).toBe(2);
    expect(categoryEdgeWeight("Culture")).toBe(2);
    expect(categoryEdgeWeight("other")).toBe(2);
    expect(categoryEdgeWeight("")).toBe(2);
  });
});

// ── selectOfficialUpgrades: promoção inferred → settled (porcentagens oficiais) ──
describe("selectOfficialUpgrades — só promove o que a plataforma liquidou oficialmente", () => {
  const inferred = [
    { id: "f1", market_id: "kalshi-A" },
    { id: "f2", market_id: "poly-B" },
    { id: "f3", market_id: "kalshi-C" }, // sem resultado oficial ainda
  ];

  it("promove apenas os que têm resultado oficial no mapa", () => {
    const settled = new Map<string, boolean>([["kalshi-A", true], ["poly-B", false]]);
    const jobs = selectOfficialUpgrades(inferred, settled);
    expect(jobs.map((j) => j.id)).toEqual(["f1", "f2"]); // f3 fica inferido
  });

  it("carrega o outcome OFICIAL (corrige o palpite de preço divergente)", () => {
    const settled = new Map<string, boolean>([["poly-B", false]]);
    expect(selectOfficialUpgrades(inferred, settled)).toEqual([{ id: "f2", outcome: false }]);
  });

  it("outcome=false é promovido (não é tratado como 'ausente')", () => {
    const jobs = selectOfficialUpgrades([{ id: "x", market_id: "m" }], new Map([["m", false]]));
    expect(jobs).toEqual([{ id: "x", outcome: false }]);
  });

  it("sem nenhum oficial → nada a promover", () => {
    expect(selectOfficialUpgrades(inferred, new Map())).toEqual([]);
  });
});

// ── parseShortDatedKalshi: extração/normalização dos mercados de data curta ──────
const mkt = (over: Partial<RawKalshiMarket> = {}): RawKalshiMarket => ({
  ticker: "KXFOO-26AUG21", title: "Vai subir?", yes_bid_dollars: "0.40", yes_ask_dollars: "0.60",
  volume_fp: "1234", close_time: "2026-08-21T14:00:00Z", ...over,
});

describe("parseShortDatedKalshi — extração de dados fiel", () => {
  it("normaliza um binário limpo (prob do mid, volume, closeMs)", () => {
    const [t] = parseShortDatedKalshi([mkt()]);
    expect(t.ticker).toBe("KXFOO-26AUG21");
    expect(t.prob).toBe(50);                          // mid de 0.40/0.60
    expect(t.volume).toBe(1234);
    expect(t.closeMs).toBe(new Date("2026-08-21T14:00:00Z").getTime());
  });

  it("prob = mid (bid+ask)/2 quando ambos existem", () => {
    expect(parseShortDatedKalshi([mkt({ yes_bid_dollars: "0.30", yes_ask_dollars: "0.50" })])[0].prob).toBe(40);
  });
  it("cai para o last quando falta bid/ask", () => {
    expect(parseShortDatedKalshi([mkt({ yes_bid_dollars: "0", yes_ask_dollars: "0", last_price_dollars: "0.72" })])[0].prob).toBe(72);
  });
  it("SEM preço real (nem mid nem last) → PULA (não vira o padrão-50 que polui a prova)", () => {
    expect(parseShortDatedKalshi([mkt({ yes_bid_dollars: "0", yes_ask_dollars: "0", last_price_dollars: "0" })])).toHaveLength(0);
  });

  it("pula agregados negRisk pelo ticker (MULTIGAME / CROSSCATEGORY)", () => {
    expect(parseShortDatedKalshi([mkt({ ticker: "KXMVESPORTSMULTIGAME-S2026" })])).toHaveLength(0);
    expect(parseShortDatedKalshi([mkt({ ticker: "KXMVECROSSCATEGORY-X" })])).toHaveLength(0);
  });
  it("pula título-lista de agregado ('yes X, yes Y')", () => {
    expect(parseShortDatedKalshi([mkt({ title: "yes Denver, yes Golden State" })])).toHaveLength(0);
  });
  it("usa yes_sub_title quando falta o title; descarta sem ticker", () => {
    expect(parseShortDatedKalshi([mkt({ title: undefined, yes_sub_title: "Fed corta?" })])[0].title).toBe("Fed corta?");
    expect(parseShortDatedKalshi([mkt({ ticker: undefined })])).toHaveLength(0);
  });

  it("capa por série (default 4) para diversidade da prova", () => {
    const golf = Array.from({ length: 6 }, (_, i) => mkt({ ticker: `KXPGA-${i}`, title: `matchup ${i}` }));
    expect(parseShortDatedKalshi(golf)).toHaveLength(4);
    expect(parseShortDatedKalshi(golf, 2)).toHaveLength(2);
  });
  it("séries diferentes não disputam o mesmo cap", () => {
    const mixed = [mkt({ ticker: "KXA-1", title: "a" }), mkt({ ticker: "KXB-1", title: "b" }), mkt({ ticker: "KXA-2", title: "c" })];
    expect(parseShortDatedKalshi(mixed)).toHaveLength(3);
  });

  it("closeMs = Infinity quando falta close_time (não vira 1970)", () => {
    expect(parseShortDatedKalshi([mkt({ close_time: undefined })])[0].closeMs).toBe(Infinity);
  });
  it("trunca título gigante em 300 chars", () => {
    expect(parseShortDatedKalshi([mkt({ title: "x".repeat(400) })])[0].title).toHaveLength(300);
  });
});

// ── parseShortDatedPolymarket: fonte DIVERSA de data curta (esports/cripto/NFL…) ──
const pev = (over: Partial<RawPolyEvent> = {}): RawPolyEvent => ({
  title: "Bitcoin em agosto?", category: "Crypto",
  markets: [{ id: "m1", question: "BTC > 100k?", outcomePrices: JSON.stringify(["0.55", "0.45"]), volume: 1000, endDate: "2026-08-31T00:00:00Z" }],
  ...over,
});

describe("parseShortDatedPolymarket — diversidade de data curta", () => {
  it("normaliza o binário do evento (prob do índice 0, id, volume, categoria)", () => {
    const [t] = parseShortDatedPolymarket([pev()]);
    expect(t.id).toBe("m1");
    expect(t.prob).toBe(55);
    expect(t.volume).toBe(1000);
    expect(t.category).toBe("crypto"); // devolve a categoria (não perde pra "other")
  });

  it("devolve a categoria derivada de tags (pro painel 'por tema' funcionar)", () => {
    const ev = pev({ category: undefined, tags: [{ label: "Esports" }] });
    expect(parseShortDatedPolymarket([ev])[0].category).toBe("esports");
  });

  it("de vários mercados do evento, pega o de MAIOR volume", () => {
    const ev = pev({ markets: [
      { id: "a", question: "A?", outcomePrices: JSON.stringify(["0.30"]), volume: 100 },
      { id: "b", question: "B?", outcomePrices: JSON.stringify(["0.60"]), volume: 900 },
    ] });
    expect(parseShortDatedPolymarket([ev])[0].id).toBe("b");
  });

  it("usa groupItemTitle no rótulo (evento multi-desfecho)", () => {
    const ev = pev({ title: "Onde joga Tyreek Hill?", markets: [{ id: "x", groupItemTitle: "Dolphins", outcomePrices: JSON.stringify(["0.40"]), volume: 50 }] });
    expect(parseShortDatedPolymarket([ev])[0].title).toBe("Onde joga Tyreek Hill?: Dolphins");
  });

  it("pula sem preço (nada de padrão-50), placeholder genérico, quase-resolvido e fechado", () => {
    expect(parseShortDatedPolymarket([pev({ markets: [{ id: "np", question: "Q?", outcomePrices: "", volume: 100 }] })])).toHaveLength(0);
    expect(parseShortDatedPolymarket([pev({ markets: [{ id: "g", question: "Will Team AM win?", outcomePrices: JSON.stringify(["0.5"]), volume: 100 }] })])).toHaveLength(0);
    expect(parseShortDatedPolymarket([pev({ markets: [{ id: "hi", question: "Q?", outcomePrices: JSON.stringify(["0.98"]), volume: 100 }] })])).toHaveLength(0);
    expect(parseShortDatedPolymarket([pev({ markets: [{ id: "c", question: "Q?", outcomePrices: JSON.stringify(["0.5"]), volume: 100, closed: true }] })])).toHaveLength(0);
  });

  it("capa por categoria (default 6); categorias diferentes não competem", () => {
    const crypto = Array.from({ length: 8 }, (_, i) => pev({ category: "Crypto", markets: [{ id: `c${i}`, question: `Q${i}`, outcomePrices: JSON.stringify(["0.5"]), volume: 100 }] }));
    expect(parseShortDatedPolymarket(crypto)).toHaveLength(6);
    const mixed = [pev({ category: "Crypto" }), pev({ category: "Sports", markets: [{ id: "s", question: "S?", outcomePrices: JSON.stringify(["0.5"]), volume: 1 }] })];
    expect(parseShortDatedPolymarket(mixed)).toHaveLength(2);
  });

  it("deriva a categoria de tags quando o evento não tem category (senão tudo vira 'other')", () => {
    // 8 eventos sem category, mas tags distintas → NÃO devem competir pelo mesmo cap
    const evs = ["Esports", "Crypto", "NFL", "Finance", "AI", "Iran", "NBA", "Weather"].map((lab, i) =>
      pev({ category: undefined, tags: [{ label: lab }], markets: [{ id: `t${i}`, question: `Q${i}`, outcomePrices: JSON.stringify(["0.5"]), volume: 100 }] }));
    expect(parseShortDatedPolymarket(evs)).toHaveLength(8); // 8 categorias distintas, nenhuma capada
  });
});
