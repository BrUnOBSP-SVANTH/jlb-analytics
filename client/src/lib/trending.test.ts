/**
 * Testes — sanitização de probabilidade dos cards de mercado.
 * Regressão do bug onde um preço inválido virava "NaN%" no card.
 */
import { describe, it, expect } from "vitest";
import { clampProb, normalizeCategory, intercalarPorFonte, manifoldAoVivo, buildManifoldItem, whyTrendingMarket, folgaDoLider, comMaiuscula, type TrendingItem, type Source } from "./trending";

describe("clampProb", () => {
  it("usa o fallback para NaN (o bug original)", () => {
    expect(clampProb(NaN)).toBe(0.5);
    expect(clampProb(NaN, 0.3)).toBe(0.3);
  });

  it("usa o fallback para Infinity", () => {
    expect(clampProb(Infinity)).toBe(0.5);
    expect(clampProb(-Infinity)).toBe(0.5);
  });

  it("faz clamp para a faixa 0.01–0.99", () => {
    expect(clampProb(0)).toBe(0.01);
    expect(clampProb(1)).toBe(0.99);
    expect(clampProb(1.5)).toBe(0.99);
    expect(clampProb(-2)).toBe(0.01);
  });

  it("mantém valores válidos intactos", () => {
    expect(clampProb(0.55)).toBe(0.55);
    expect(clampProb(0.02)).toBe(0.02);
  });
});

describe("normalizeCategory — classifica a categoria crua das bolsas", () => {
  // Regressão: a regra antiga usava includes("ai") e mandava mercado sobre a
  // UCRÂNIA para Ciência/Tech — "ukr(ai)ne". Sigla tem que casar palavra inteira.
  it("não casa sigla escondida dentro de outra palavra", () => {
    expect(normalizeCategory("Ukraine")).toBe("geopolitics");
    expect(normalizeCategory("Boiling Point")).not.toBe("macro"); // "oil" em "b(oil)ing"
  });

  it("classifica as categorias que mais caíam em Outros", () => {
    expect(normalizeCategory("Companies")).toBe("business");
    expect(normalizeCategory("Financials")).toBe("business");
    expect(normalizeCategory("MLB")).toBe("sports");
    expect(normalizeCategory("UFC")).toBe("sports");
  });

  // MKT-13: a decisão do Fed e o Estreito de Ormuz apareciam os DOIS como
  // "Negócios", e não existia categoria de macro/juros — que é a especialidade
  // do produto. Um grupo que engole balanço de empresa, taxa de juros e conflito
  // no Oriente Médio não ajuda ninguém a achar nada.
  it("macro e juros têm categoria própria — é a especialidade da casa", () => {
    expect(normalizeCategory("fomc")).toBe("macro");
    expect(normalizeCategory("Fed")).toBe("macro");
    expect(normalizeCategory("Inflation")).toBe("macro");
    expect(normalizeCategory("Selic")).toBe("macro");
    expect(normalizeCategory("Recession")).toBe("macro");
  });

  it("geopolítica não é eleição, e vem antes na régua", () => {
    // "Politics" genérico vai para eleições (é o que a bolsa etiqueta assim na
    // esmagadora maioria dos casos), mas Irã e ataque militar, não.
    expect(normalizeCategory("Iran")).toBe("geopolitics");
    expect(normalizeCategory("Military Strikes")).toBe("geopolitics");
    expect(normalizeCategory("Geopolitics")).toBe("geopolitics");
    expect(normalizeCategory("Politics")).toBe("elections");
    expect(normalizeCategory("Midterms")).toBe("elections");
  });

  it("mantém o que já funcionava", () => {
    expect(normalizeCategory("Sports")).toBe("sports");
    expect(normalizeCategory("Crypto")).toBe("crypto");
    expect(normalizeCategory("Oscars")).toBe("culture");
  });

  it("devolve Outros quando não há sinal, em vez de inventar grupo", () => {
    expect(normalizeCategory("Clavicular")).toBe("other");
    expect(normalizeCategory("")).toBe("other");
    expect(normalizeCategory(undefined)).toBe("other");
  });
});

describe("intercalarPorFonte — a visão padrão mostra a mistura que promete", () => {
  const it_ = (source: Source, id: string, score = 100): TrendingItem =>
    ({ id, source, score, title: id } as TrendingItem);

  it("nenhuma fonte é enterrada pelo desempate", () => {
    // MKT-05, medido em navegador: 20 de 20 cards eram Polymarket, embaixo de um
    // subtítulo que diz "Reddit · Polymarket · Kalshi". Kalshi e Manifold eram
    // baixados (150 e 36 itens) e nunca exibidos.
    const entrada = [
      ...Array.from({ length: 10 }, (_, i) => it_("polymarket", `p${i}`)),
      ...Array.from({ length: 10 }, (_, i) => it_("kalshi", `k${i}`)),
    ];
    const primeiros = intercalarPorFonte(entrada).slice(0, 6).map((x) => x.source);
    expect(primeiros).toContain("kalshi");
    expect(primeiros).toContain("polymarket");
  });

  it("dentro de cada fonte, a ordem de score manda", () => {
    // O rodízio é ENTRE fontes; dentro de uma, o mercado mais relevante continua
    // subindo. Trocar isso esconderia os mercados grandes.
    const entrada = [
      it_("polymarket", "p-alto", 100), it_("polymarket", "p-medio", 50),
      it_("kalshi", "k-alto", 90), it_("kalshi", "k-medio", 40),
    ];
    const saida = intercalarPorFonte(entrada);
    const poly = saida.filter((x) => x.source === "polymarket").map((x) => x.id);
    expect(poly).toEqual(["p-alto", "p-medio"]);
  });

  it("não perde nem duplica item nenhum", () => {
    const entrada = [
      ...Array.from({ length: 7 }, (_, i) => it_("polymarket", `p${i}`)),
      ...Array.from({ length: 3 }, (_, i) => it_("kalshi", `k${i}`)),
      ...Array.from({ length: 1 }, (_, i) => it_("manifold", `m${i}`)),
    ];
    const saida = intercalarPorFonte(entrada);
    expect(saida).toHaveLength(11);
    expect(new Set(saida.map((x) => x.id)).size).toBe(11);
  });

  it("fonte que acaba sai do rodízio sem deixar buraco", () => {
    const entrada = [
      ...Array.from({ length: 5 }, (_, i) => it_("polymarket", `p${i}`)),
      it_("kalshi", "k0"),
    ];
    const saida = intercalarPorFonte(entrada);
    expect(saida.map((x) => x.id)).toEqual(["p0", "k0", "p1", "p2", "p3", "p4"]);
  });

  it("com uma fonte só, devolve a lista intacta", () => {
    const entrada = Array.from({ length: 4 }, (_, i) => it_("polymarket", `p${i}`));
    expect(intercalarPorFonte(entrada).map((x) => x.id)).toEqual(["p0", "p1", "p2", "p3"]);
    expect(intercalarPorFonte([])).toEqual([]);
  });
});

// ── Manifold "ao vivo": atividade, não idade (auditoria 14/09, item 5) ─────────
describe("manifoldAoVivo — sai o parado, fica o antigo que ainda negocia", () => {
  const AGORA = Date.UTC(2026, 8, 14);
  const DIA = 86_400_000;

  it("mercado criado há 1010 dias, com atividade ontem e prazo em 2030, é ao vivo", () => {
    expect(manifoldAoVivo({ closeTime: Date.UTC(2030, 0, 1), lastUpdatedTime: AGORA - DIA }, AGORA)).toBe(true);
  });

  it("prazo encerrado não é ao vivo, mesmo com atividade recente", () => {
    expect(manifoldAoVivo({ closeTime: AGORA - 1, lastUpdatedTime: AGORA - 60_000 }, AGORA)).toBe(false);
  });

  it("sem atividade há mais de uma semana não é ao vivo", () => {
    expect(manifoldAoVivo({ closeTime: Date.UTC(2030, 0, 1), lastUpdatedTime: AGORA - 8 * DIA }, AGORA)).toBe(false);
    expect(manifoldAoVivo({ closeTime: Date.UTC(2030, 0, 1), lastUpdatedTime: AGORA - 6 * DIA }, AGORA)).toBe(true);
  });

  it("o relógio do card é a última atividade; 'nova' é a criação", () => {
    const agora = Date.now();
    const item = buildManifoldItem({
      id: "x", question: "Pergunta?", probability: 0.4, volume: 1000, url: "https://manifold.markets/x",
      createdTime: agora - 1010 * DIA, lastUpdatedTime: agora - 2 * 3_600_000,
    });
    expect(item?.ageHours).toBeGreaterThan(1.9);
    expect(item?.ageHours).toBeLessThan(2.1);
    expect(item?.badge).toBeUndefined();
  });
});


describe("whyTrendingMarket — a régua do binário não serve para vários desfechos", () => {
  // Um mercado sem volume de 24h e sem variação: assim a frase medida é só a
  // conclusão sobre o nível, que é o que o achado DAD-04 trata.
  const base = { volume: 500_000, source: "polymarket" as const };

  it("🔴 líder de 19% NÃO é consenso forte — era o que a tela dizia", () => {
    // Fotografado em 21/09: "Consenso forte no Polymarket (líder com 19%)".
    // A regra binária `yesProb < 0,20` pegava o LÍDER de um mercado de doze
    // candidatos e o chamava de consenso. É o oposto: ninguém domina.
    const frase = whyTrendingMarket({
      ...base, yesProb: 0.19, multiDesfecho: true,
      desfechos: [0.19, 0.17, 0.13, 0.12, 0.09, 0.07],
    });
    expect(frase).not.toContain("Consenso forte");
    expect(frase).toContain("nenhum desfecho domina");
    expect(frase).toContain("líder com 19%");   // e continua dizendo de quem é o número
  });

  it("o mesmo valia no Kalshi, com líder de 10%", () => {
    const frase = whyTrendingMarket({
      ...base, source: "kalshi", yesProb: 0.10, multiDesfecho: true,
      desfechos: [0.10, 0.09, 0.08, 0.07],
    });
    expect(frase).not.toContain("Consenso forte");
    expect(frase).toContain("Kalshi");
  });

  it("líder de 90% é consenso mesmo com vários desfechos", () => {
    const frase = whyTrendingMarket({ ...base, yesProb: 0.90, multiDesfecho: true, desfechos: [0.90, 0.05, 0.03] });
    expect(frase).toContain("Consenso forte");
  });

  it("⚠️ dois rótulos empatados (Mais 51% · Menos 49%) é cara ou coroa, não favorito", () => {
    // "Map 2 Total Rounds: Over/Under 21.5" não é SIM/NÃO, então entra pela
    // régua de vários desfechos — mas com dois rótulos e 2pp de folga, chamar o
    // primeiro de "favorito claro" trocaria um exagero por outro.
    const frase = whyTrendingMarket({ ...base, yesProb: 0.51, multiDesfecho: true, desfechos: [0.51, 0.49] });
    expect(frase).toContain("equilibrado");
    expect(frase).not.toContain("Favorito claro");
  });

  it("líder no meio da tabela: favorito claro, mas em aberto", () => {
    const frase = whyTrendingMarket({ ...base, yesProb: 0.55, multiDesfecho: true, desfechos: [0.55, 0.20, 0.15] });
    expect(frase).toContain("Favorito claro");
    expect(frase).toContain("em aberto");
  });
});

describe("'equilibrado' é a folga entre os dois primeiros, não a distância de 50%", () => {
  const base = { volume: 500_000, source: "polymarket" as const };

  it("53/47 é disputa apertada", () => {
    expect(whyTrendingMarket({ ...base, yesProb: 0.53 })).toContain("equilibrado");
  });

  it("61/39 já não é — há um favorito", () => {
    expect(whyTrendingMarket({ ...base, yesProb: 0.61 })).not.toContain("equilibrado");
  });

  it("no binário a folga é o dobro da distância de 50% — a conta fecha", () => {
    expect(folgaDoLider([0.53, 0.47])).toBeCloseTo(0.06, 4);
    expect(folgaDoLider([0.61, 0.39])).toBeCloseTo(0.22, 4);
    expect(folgaDoLider([0.9, 0.1])).toBeCloseTo(0.8, 4);
  });

  it("com vários desfechos, a folga é entre o 1º e o 2º — a ordem da lista não importa", () => {
    // Com doze candidatos ninguém chega perto de 50%, e a distância de 50% não
    // diz nada. "6 pontos à frente do segundo", sim.
    expect(folgaDoLider([0.13, 0.19, 0.17])).toBeCloseTo(0.02, 4);
    expect(folgaDoLider([])).toBe(0);
    expect(folgaDoLider([0.42])).toBeCloseTo(0.42, 4);   // um desfecho só: a folga é ele
  });
});

describe("a frase começa com maiúscula", () => {
  it("quando só há a variação da semana, não começa minúscula no meio do card", () => {
    // Antes: "probabilidade subiu 4pp na semana." — com minúscula, no card.
    const frase = whyTrendingMarket({
      volume: 1_000, source: "polymarket", yesProb: 0.42, weekPriceChange: 0.04,
    });
    expect(frase.startsWith("Probabilidade")).toBe(true);
  });

  it("não mexe no resto do texto (sigla e nome próprio ficam)", () => {
    expect(comMaiuscula("eUA anunciam")).toBe("EUA anunciam");
    expect(comMaiuscula("")).toBe("");
    expect(comMaiuscula("Já maiúscula")).toBe("Já maiúscula");
  });

  it("mercado sem nada a dizer continua sem frase — card limpo", () => {
    // A filosofia antiga continua: melhor nenhuma frase do que uma inútil.
    expect(whyTrendingMarket({ volume: 1_000, source: "polymarket", yesProb: 0.42 })).toBe("");
  });
});
