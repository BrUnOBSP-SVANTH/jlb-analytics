import { describe, it, expect, vi } from "vitest";
import { comOrcamento, porVolume, desambiguarPorPai, limitePedido } from "./marketCatalog.ts";

describe("comOrcamento — página que demora não pode derrubar a tela", () => {
  it("devolve o resultado quando chega a tempo", async () => {
    await expect(comOrcamento(Promise.resolve("ok"), 50)).resolves.toBe("ok");
  });

  it("devolve null quando estoura o prazo, em vez de esperar", async () => {
    const lenta = new Promise<string>((r) => setTimeout(() => r("tarde"), 200));
    await expect(comOrcamento(lenta, 20)).resolves.toBeNull();
  });
});

describe("porVolume — a régua que tirou o catálogo morto do ar", () => {
  const m = (volume24h: number, volume: number) => ({ volume24h, volume });

  it("mais negociado nas últimas 24h vem primeiro", () => {
    expect([m(10, 999), m(500, 1)].sort(porVolume)[0].volume24h).toBe(500);
  });

  it("empate em 24h (dia parado) desempata pelo histórico", () => {
    expect([m(0, 100), m(0, 900)].sort(porVolume)[0].volume).toBe(900);
  });

  it("trata volume ausente como zero, sem quebrar a ordenação", () => {
    const r = ([{}, m(5, 5)] as Array<{ volume24h?: number; volume?: number }>).sort(porVolume);
    expect(r[0].volume24h).toBe(5);
  });
});

describe("desambiguarPorPai — dois cards iguais parecem defeito", () => {
  type Card = { titulo: string; pai: string; suf?: string };
  const marcar = (xs: Card[]) => desambiguarPorPai(
    xs,
    { titulo: (x) => x.titulo, pai: (x) => x.pai, sufixo: (x) => x.suf },
    (x, t) => ({ ...x, titulo: t }),
  );

  it("marca o título repetido entre PAIS diferentes", () => {
    // Caso real: "Game 1: Both Teams Slay Baron Nashor?" em duas partidas de LoL.
    const r = marcar([
      { titulo: "Game 1", pai: "partida-A", suf: "Galions vs TLN" },
      { titulo: "Game 1", pai: "partida-B", suf: "KOI vs UCAM" },
    ]);
    expect(r[0].titulo).toBe("Game 1 — Galions vs TLN");
    expect(r[1].titulo).toBe("Game 1 — KOI vs UCAM");
  });

  it("NÃO mexe em título que já é único — o card específico não pode virar poluído", () => {
    const r = marcar([{ titulo: "Fed corta juros?", pai: "e1", suf: "x" }]);
    expect(r[0].titulo).toBe("Fed corta juros?");
  });

  it("não marca quando as repetições são do MESMO pai", () => {
    // Aqui a repetição é interna ao evento (escada de faixas): quem resolve é o
    // rótulo da faixa, não o nome do evento — marcar com o pai não distinguiria nada.
    const r = marcar([
      { titulo: "Quantos lançamentos?", pai: "spacex-set", suf: "s" },
      { titulo: "Quantos lançamentos?", pai: "spacex-set", suf: "s" },
    ]);
    expect(r.every((x) => x.titulo === "Quantos lançamentos?")).toBe(true);
  });

  it("sem sufixo disponível, deixa como está em vez de inventar", () => {
    const r = marcar([
      { titulo: "T", pai: "a" },
      { titulo: "T", pai: "b" },
    ]);
    expect(r.map((x) => x.titulo)).toEqual(["T", "T"]);
  });
});

describe("limitePedido", () => {
  it("usa o padrão quando não vem nada e respeita o teto", () => {
    expect(limitePedido(undefined, 150, 300)).toBe(150);
    expect(limitePedido("9999", 150, 300)).toBe(300);
  });

  it("aceita valor válido e ignora lixo", () => {
    expect(limitePedido("42", 150, 300)).toBe(42);
    expect(limitePedido("abc", 150, 300)).toBe(150);
    expect(limitePedido("-5", 150, 300)).toBe(150);   // negativo não zera o catálogo
    expect(limitePedido("0", 150, 300)).toBe(150);
  });
});
