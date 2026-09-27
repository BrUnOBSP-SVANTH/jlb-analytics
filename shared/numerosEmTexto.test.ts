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

/**
 * 🔴 O CASO QUE QUEBROU A TELA EM PRODUÇÃO, no dia em que esta função nasceu.
 *
 * O briefing publicava "Gerado em Invalid Date". O `generatedAt` voltava da
 * API como `2026-09-27T12:09:04,937Z` — vírgula antes dos milissegundos —, e
 * `new Date()` rejeita o formato.
 *
 * Era esta função. Em `12:09:04.937` o "04" não tem dígito nem ponto antes
 * (tem dois pontos), e o "937" é seguido de "Z": passava nas três guardas. A
 * guarda de ano não pegava porque só olha grupos de quatro dígitos.
 *
 * O defeito de fundo não foi a regex, e é isso que estes testes prendem: foi
 * aplicar um corretor de TEXTO a todo campo de string de um objeto, inclusive
 * os que a máquina escreve para a máquina ler.
 */
describe("carimbo de tempo não é prosa", () => {
  const carimbos = [
    "2026-09-27T12:09:04.937Z",
    "2026-09-27T12:09:04Z",
    "2026-09-27 12:09:04.937",
    "2026-09-27T12:09:04.937+00:00",
  ];

  for (const iso of carimbos) {
    it(`${iso} passa intacto`, () => {
      expect(virgulaDecimal(iso)).toBe(iso);
      // E o que importa de verdade: continua sendo uma data válida.
      expect(Number.isNaN(new Date(virgulaDecimal(iso)).getTime())).toBe(false);
    });
  }

  it("horário DENTRO de uma frase também sobrevive, e o número ao lado é corrigido", () => {
    expect(virgulaDecimal("às 12:09:04.937 a Selic estava em 13.75%"))
      .toBe("às 12:09:04.937 a Selic estava em 13,75%");
  });

  it("o objeto do briefing sai com generatedAt utilizável", () => {
    const guardado = { macroNote: "Selic em 13.75%", generatedAt: "2026-09-27T12:09:04.937Z" };
    const limpo = virgulaDecimalNoObjeto(guardado);
    expect(limpo.macroNote).toBe("Selic em 13,75%");
    expect(new Date(limpo.generatedAt).toISOString()).toBe("2026-09-27T12:09:04.937Z");
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
