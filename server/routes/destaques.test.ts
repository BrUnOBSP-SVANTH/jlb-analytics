import { describe, it, expect } from "vitest";
import { montarDestaques } from "./destaques.ts";

const mercado = (over: Record<string, unknown> = {}) => ({
  id: "1", question: "Vai chover?", outcomePrices: '["0.42","0.58"]', volume: 1000, ...over,
});

describe("montarDestaques — o pouco que a home precisa", () => {
  it("devolve preço em 0–1 e o total das duas fontes", () => {
    const { destaques, totais } = montarDestaques([mercado()], 120);
    expect(destaques[0]).toEqual({ id: "1", titulo: "Vai chover?", prob: 0.42, volume: 1000 });
    expect(totais).toEqual({ polymarket: 1, kalshi: 120 });
  });

  it("o título do evento manda quando diz mais que a pergunta", () => {
    // Em mercado agrupado a pergunta é a do desfecho líder, e sozinha engana.
    const [d] = montarDestaques([mercado({ question: "25 bps", eventTitle: "Decisão do Fed em setembro" })], 0).destaques;
    expect(d.titulo).toBe("Decisão do Fed em setembro");
    // Evento curto ou igual à pergunta não substitui.
    expect(montarDestaques([mercado({ eventTitle: "Clima" })], 0).destaques[0].titulo).toBe("Vai chover?");
  });

  it("mercado sem preço real não vai para a tela", () => {
    const { destaques, totais } = montarDestaques([
      mercado({ id: "a", outcomePrices: undefined }),
      mercado({ id: "b", outcomePrices: "não é json" }),
      mercado({ id: "c" }),
      mercado({ id: "" }),
    ], 5);
    expect(destaques.map((d) => d.id)).toEqual(["c"]);
    // O total conta o catálogo inteiro — é o número que a home anuncia.
    expect(totais.polymarket).toBe(4);
  });

  it("corta no limite pedido", () => {
    const muitos = Array.from({ length: 30 }, (_, i) => mercado({ id: String(i) }));
    expect(montarDestaques(muitos, 0, 8).destaques).toHaveLength(8);
  });

  it("volume cai para o de 24h quando não há total", () => {
    const [d] = montarDestaques([mercado({ volume: undefined, volume24hr: 77 })], 0).destaques;
    expect(d.volume).toBe(77);
  });
});

describe("preço decidido não entra na vitrine", () => {
  it("tira o que já acabou (>=97% ou <=3%) e segue preenchendo", () => {
    const m = (id: string, p: string) => ({ id, question: "q" + id, outcomePrices: `["${p}","x"]`, volume: 1 });
    const { destaques } = montarDestaques([
      m("acabado", "0.995"),   // jogo decidido — era o que abria a fileira em 16/09
      m("zerado", "0.01"),
      m("vivo", "0.42"),
      m("vivo2", "0.66"),
    ], 0, 8);
    expect(destaques.map((d) => d.id)).toEqual(["vivo", "vivo2"]);
  });

  it("a borda continua valendo: 96% entra, 97% não", () => {
    const m = (id: string, p: string) => ({ id, question: "q", outcomePrices: `["${p}","x"]`, volume: 1 });
    expect(montarDestaques([m("a", "0.96")], 0).destaques).toHaveLength(1);
    expect(montarDestaques([m("b", "0.97")], 0).destaques).toHaveLength(0);
  });
});
