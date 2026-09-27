import { describe, it, expect } from "vitest";
import { virgulaDecimal, virgulaDecimalNoObjeto } from "./numerosEmTexto.ts";

describe("vírgula decimal em texto de IA", () => {
  it("conserta a frase EXATA que a varredura pegou no /briefing", () => {
    // Não é exemplo inventado: é o macroNote publicado em 27/09/2026.
    const publicado =
      "No cenário brasileiro, a taxa Selic está em 13.75%, a inflação oficial pelo IPCA marca 4.22% e o dólar custa R$ 5.1991.";
    expect(virgulaDecimal(publicado)).toBe(
      "No cenário brasileiro, a taxa Selic está em 13,75%, a inflação oficial pelo IPCA marca 4,22% e o dólar custa R$ 5,1991.",
    );
  });

  it("não inventa precisão: o número continua o mesmo, só o separador muda", () => {
    // Arredondar o texto de terceiro seria afirmar uma precisão que ele não deu.
    expect(virgulaDecimal("R$ 5.1991")).toBe("R$ 5,1991");
    expect(virgulaDecimal("0.5")).toBe("0,5");
  });
});

describe("o que NÃO pode ser tocado", () => {
  const intocaveis = [
    ["versão", "atualize para a v1.2.3 antes de rodar"],
    ["endereço IP", "o servidor 192.168.0.1 respondeu"],
    ["domínio", "publicado em jlb-analytics.onrender.com"],
    ["arquivo", "veja shared/formato.ts e o index.css"],
    ["ano.mês", "o dado é de 2024.01"],
    ["inteiro solto", "foram 1300 previsões resolvidas"],
    ["já em pt-BR", "a Selic está em 13,75% ao ano"],
  ] as const;

  for (const [nome, texto] of intocaveis) {
    it(`${nome}: passa intacto`, () => {
      expect(virgulaDecimal(texto)).toBe(texto);
    });
  }
});

describe("o objeto inteiro", () => {
  it("alcança texto dentro de array de objetos e não mexe em número", () => {
    const briefing = {
      macroNote: "Selic em 13.75%",
      marketHighlights: [{ market: "Kalshi", prob: 67, insight: "chance de 67.5%" }],
      riskAlert: null,
    };
    const limpo = virgulaDecimalNoObjeto(briefing);
    expect(limpo.macroNote).toBe("Selic em 13,75%");
    expect(limpo.marketHighlights[0].insight).toBe("chance de 67,5%");
    // `prob` é número, não texto: quem o formata para a tela é shared/formato.ts.
    expect(limpo.marketHighlights[0].prob).toBe(67);
    expect(limpo.riskAlert).toBeNull();
  });
});
