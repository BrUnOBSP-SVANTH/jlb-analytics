import { describe, it, expect } from "vitest";
import { parseShortDatedKalshi, tierForClose, selectOfficialUpgrades, type RawKalshiMarket } from "./aiForecasts.ts";

// ── tierForClose: prioridade pela proximidade de resolução ──────────────────────
const NOW = 1_700_000_000_000;
const inDays = (n: number) => NOW + n * 86_400_000;

describe("tierForClose — prioriza o que resolve cedo (enche a prova)", () => {
  it("janela de resolução (±60d) é a melhor (5), inclusive fechados há pouco", () => {
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
