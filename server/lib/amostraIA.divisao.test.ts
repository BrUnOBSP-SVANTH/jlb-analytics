import { describe, it, expect } from "vitest";
import { resumir, type Amostra, type LinhaIA } from "./amostraIA.ts";

/**
 * IAC-02 — o placar precisa mostrar a divisão COMPLETA contra o mercado.
 *
 * A página publicava "14% melhor calibrada que o mercado". Isso se lê de dois
 * jeitos errados: como "14% melhor" (uma magnitude) e como "nos outros 86% a IA
 * perdeu". Boa parte dos 86% é EMPATE EXATO — a IA e o preço com o mesmo Brier.
 *
 * Os três números juntos respondem a pergunta, e a soma fecha.
 */
const linha = (over: Partial<LinhaIA>): LinhaIA => ({
  market_id: "poly-1", source: "polymarket", title: "t", category: "outros",
  market_prob: 50, ai_fair_value: 50, resolved: true, outcome: true,
  brier: 0.2, market_brier: 0.2, resolution_source: "settled", created_at: "2026-09-01",
  ...over,
} as LinhaIA);

const amostra = (resolvidas: LinhaIA[]): Amostra => ({
  todas: resolvidas, resolvidas, emAberto: [], semDesfecho: [],
} as unknown as Amostra);

describe("divisão contra o mercado: melhor, empate e pior", () => {
  it("🔴 empate não é derrota — e era assim que a tela deixava entender", () => {
    const r = resumir(amostra([
      linha({ brier: 0.10, market_brier: 0.20 }),   // melhor
      linha({ brier: 0.20, market_brier: 0.20 }),   // EMPATE
      linha({ brier: 0.20, market_brier: 0.20 }),   // EMPATE
      linha({ brier: 0.30, market_brier: 0.20 }),   // pior
    ]));
    expect(r.bateuMercado).toBe(1);
    expect(r.empatouMercado).toBe(2);
    expect(r.perdeuMercado).toBe(1);
  });

  it("a soma fecha com os comparáveis — senão a divisão mente", () => {
    const r = resumir(amostra([
      linha({ brier: 0.1, market_brier: 0.2 }),
      linha({ brier: 0.2, market_brier: 0.2 }),
      linha({ brier: 0.3, market_brier: 0.2 }),
    ]));
    expect(r.bateuMercado + r.empatouMercado + r.perdeuMercado).toBe(r.comparaveis);
    expect(r.comparaveis).toBe(3);
  });

  it("linha sem Brier fica FORA dos comparáveis, não vira derrota", () => {
    // Resolvida sem desfecho utilizável não tem Brier. Contá-la como "pior"
    // seria o mesmo erro de denominador que o TRK-02 corrigiu.
    const r = resumir(amostra([
      linha({ brier: 0.1, market_brier: 0.2 }),
      linha({ brier: null, market_brier: 0.2 }),
      linha({ brier: 0.2, market_brier: null }),
    ]));
    expect(r.comparaveis).toBe(1);
    expect(r.perdeuMercado).toBe(0);
  });
});

describe("os dois denominadores do placar", () => {
  it("a taxa de acerto divide pelas com LADO, não por todas as resolvidas", () => {
    // 50% exato não aponta lado nenhum: não erra nem acerta direção. Misturar
    // os dois conjuntos foi o achado — numerador de um, denominador de outro.
    const r = resumir(amostra([
      linha({ ai_fair_value: 70, outcome: true }),    // com lado, acertou
      linha({ ai_fair_value: 30, outcome: false }),   // com lado, acertou
      linha({ ai_fair_value: 50, outcome: true }),    // SEM lado
    ]));
    expect(r.resolvidas).toBe(3);
    expect(r.comLado).toBe(2);
    expect(r.taxaAcerto).toBe(100);
  });
});
