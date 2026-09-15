import { describe, it, expect } from "vitest";
import { linhasDoCatalogo } from "./snapshotsDoCatalogo.ts";

describe("linhasDoCatalogo — o arquivo grava o que a tela mostra, e só preço real", () => {
  const base = { id: "3212185", question: "Mercado?", category: "Politics", outcomePrices: '["0.4213","0.5787"]', volume: 1234.567, volume24hr: 10, liquidity: 99 };

  it("converte para a escala da tabela (0–100, duas casas)", () => {
    const [l] = linhasDoCatalogo([base]);
    expect(l).toMatchObject({ market_id: "3212185", source: "polymarket", yes_prob: 42.13, volume: 1234.57, status: "open" });
  });

  it("sem preço, sem linha — nunca um 50 inventado", () => {
    expect(linhasDoCatalogo([{ ...base, outcomePrices: undefined }])).toEqual([]);
    expect(linhasDoCatalogo([{ ...base, outcomePrices: "não é json" }])).toEqual([]);
    expect(linhasDoCatalogo([{ ...base, outcomePrices: '["1.7"]' }])).toEqual([]);
  });

  it("sem id ou sem título não grava (title é NOT NULL)", () => {
    expect(linhasDoCatalogo([{ ...base, id: "" }])).toEqual([]);
    expect(linhasDoCatalogo([{ ...base, question: "", eventTitle: "" }])).toEqual([]);
    expect(linhasDoCatalogo([{ ...base, question: "", eventTitle: "Evento" }])[0].title).toBe("Evento");
  });

  it("id repetido entra uma vez (o Postgres recusa o lote inteiro)", () => {
    expect(linhasDoCatalogo([base, { ...base, outcomePrices: '["0.5","0.5"]' }])).toHaveLength(1);
  });

  it("volume ausente ou inválido vira null, não zero", () => {
    const [l] = linhasDoCatalogo([{ ...base, volume: undefined, volume24hr: NaN }]);
    expect(l.volume).toBeNull();
    expect(l.volume_24h).toBeNull();
  });
});
