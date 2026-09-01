import { describe, it, expect } from "vitest";
import { isBRtext } from "./previsaoMarkets";

describe("isBRtext — sinaliza mercado relevante para o Brasil", () => {
  it("reconhece os sinais reais de Brasil", () => {
    for (const t of [
      "Brasil vai ganhar a Copa?",
      "Selic acima de 12%?",
      "Lula reeleito em 2026?",
      "Flamengo campeão da Libertadores",
      "Eleições 2026: quem vence?",
      "Time brasileiro no Mundial de Clubes",
      "Cotação do dólar acima de R$ 6",
      "Itaú compra o Nubank?",
    ]) expect(isBRtext(t), t).toBe(true);
  });

  // Endurecido por PREVENÇÃO: nos 572 títulos reais de 01/09 não havia falso
  // positivo, mas "pix" cabe dentro de "Pixar"/"pixel" e mercado de cinema é o
  // que o Polymarket tem de sobra. Casar substring já nos mordeu três vezes.
  it("não confunde termo escondido dentro de outra palavra", () => {
    for (const t of [
      "Will Pixar release a sequel in 2026?",
      "Best pixel art game of 2026",
      "Will Lulacoin hit $1?",
    ]) expect(isBRtext(t), t).toBe(false);
  });

  it("mantém o casamento por radical onde ele é necessário", () => {
    // "brasileir" precisa pegar brasileiro/brasileira/brasileirão; "eleic", as flexões.
    expect(isBRtext("Campeonato Brasileirão 2026")).toBe(true);
    expect(isBRtext("Resultado da eleição municipal")).toBe(true);
  });
});
