import { describe, it, expect } from "vitest";
import { filtrarAlertas, ehLiquidacao, MAX_ALERTAS } from "./alertas.ts";
import type { MarketAlert } from "@/hooks/useMarketAlerts";

const min = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

function a(over: Partial<MarketAlert> = {}): MarketAlert {
  return {
    id: "m1", key: "poly-m1", title: "Mercado", source: "polymarket",
    prob: 53, prevProb: 50, delta: 3, receivedAt: min(1), ...over,
  };
}

/**
 * O que estes testes protegem não é o sino: é a atenção do usuário. Um badge
 * permanentemente em "9+" treina a pessoa a ignorar notificação — e aí o alerta
 * que valia a pena some junto com o ruído.
 */
describe("o sino mostra evento, não tique de preço", () => {
  it("mercado que foi a 100% não é 'variação' — é o fim", () => {
    expect(ehLiquidacao(a({ prob: 100, prevProb: 50, delta: 50 }))).toBe(true);
    expect(ehLiquidacao(a({ prob: 0, prevProb: 40, delta: -40 }))).toBe(true);
    expect(ehLiquidacao(a({ prob: 97 }))).toBe(false);
    expect(filtrarAlertas([a({ prob: 100, delta: 50 }), a({ id: "m2", key: "poly-m2" })])).toHaveLength(1);
  });

  it("o mesmo mercado em 3 minutos é UM alerta", () => {
    const r = filtrarAlertas([
      a({ receivedAt: min(1), delta: 3 }),
      a({ receivedAt: min(4), delta: 5 }),
      a({ receivedAt: min(7), delta: 4 }),
    ]);
    expect(r).toHaveLength(1);
  });

  it("dentro da janela fica o MAIOR movimento, com o horário do mais recente", () => {
    // Quem abre o sino quer o tamanho do que aconteceu; o último tique costuma
    // ser o menor pedaço do movimento.
    const recente = min(1);
    const r = filtrarAlertas([
      a({ receivedAt: recente, delta: 3, prob: 53 }),
      a({ receivedAt: min(10), delta: 9, prob: 59 }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].delta).toBe(9);
    expect(r[0].prob).toBe(59);
    expect(r[0].receivedAt).toBe(recente);   // o "há 1 min" continua verdadeiro
  });

  it("fora da janela são dois eventos de verdade", () => {
    const r = filtrarAlertas([a({ receivedAt: min(1) }), a({ receivedAt: min(90) })]);
    expect(r).toHaveLength(2);
  });

  it("mercados diferentes nunca se fundem", () => {
    const r = filtrarAlertas([a(), a({ id: "m2", key: "poly-m2" }), a({ id: "m3", key: "kalshi-m3", source: "kalshi" })]);
    expect(r).toHaveLength(3);
  });

  it("lista curta: o sino cabe numa olhada", () => {
    const muitos = Array.from({ length: 60 }, (_, i) => a({ id: `m${i}`, key: `poly-m${i}` }));
    expect(filtrarAlertas(muitos)).toHaveLength(MAX_ALERTAS);
    expect(MAX_ALERTAS).toBeLessThan(50);   // 50 era o número que cravava o badge em "9+"
  });

  it("ordena do mais recente para o mais antigo", () => {
    const r = filtrarAlertas([
      a({ id: "velho", key: "poly-velho", receivedAt: min(120) }),
      a({ id: "novo", key: "poly-novo", receivedAt: min(2) }),
    ]);
    expect(r.map((x) => x.id)).toEqual(["novo", "velho"]);
  });
});
