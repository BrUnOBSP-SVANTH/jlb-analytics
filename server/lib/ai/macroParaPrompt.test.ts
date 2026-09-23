import { describe, it, expect } from "vitest";
import { macroParaPrompt } from "./macroParaPrompt.ts";

/** Espaço NÃO separável (U+00A0): é o que o `Intl` pt-BR põe entre "R$" e o
 *  número. Montado pelo código do caractere, e não colado literalmente: um
 *  caractere invisível no meio de uma regex é impossível de ler depois. */
const NBSP = new RegExp(String.fromCharCode(0xa0), "g");

describe("IAC-04 — sem dado, o prompt diz 'indisponível'", () => {
  it("🔴 fonte fora do ar NÃO vira número inventado", () => {
    // O defeito: `Selic ${selic ?? "~10.5"}%` — quando o Banco Central falhava,
    // a IA recebia "~10,5%" como se fosse a realidade e escrevia análise em
    // cima. E o número de reserva ENVELHECE: ficou parado enquanto a Selic real
    // subia, sem nenhum erro aparecer, porque não faltava nada — havia um
    // número.
    const texto = macroParaPrompt({ selic: null, ipca: null, usd: null });
    expect(texto).toBe("Selic indisponível | IPCA indisponível | USD/BRL indisponível");
    expect(texto).not.toMatch(/10[.,]5|4[.,]8|5[.,]85/);
  });

  it("uma fonte que falha não derruba as outras", () => {
    // ⚠️ O `Intl` do pt-BR separa "R$" do número com espaço NÃO SEPARÁVEL
    // (U+00A0), não com espaço comum — por isso a comparação normaliza. Duas
    // strings visualmente idênticas podem não ser iguais.
    const texto = macroParaPrompt({ selic: 13.75, ipca: null, usd: 5.1117 }).replace(NBSP, " ");
    expect(texto).toBe("Selic 13,75% a.a. | IPCA indisponível | USD/BRL R$ 5,11");
  });

  it("NaN e Infinity contam como ausência", () => {
    expect(macroParaPrompt({ selic: NaN })).toBe("Selic indisponível");
    expect(macroParaPrompt({ usd: Infinity })).toBe("USD/BRL indisponível");
  });
});

describe("IAC-04 — o número vai formatado em pt-BR", () => {
  it("🔴 'Selic em 13.75%' e 'dólar a R$ 5.1117' saíam assim na tela", () => {
    // O texto publicado é gerado a partir DESTE prompt: número que entra com
    // ponto decimal e quatro casas sai com ponto decimal e quatro casas.
    const texto = macroParaPrompt({ selic: 13.75, ipca: 4.87, usd: 5.1117 }).replace(NBSP, " ");
    expect(texto).toContain("13,75%");
    expect(texto).toContain("4,87%");
    expect(texto).toContain("R$ 5,11");
    expect(texto).not.toContain("13.75");
    expect(texto).not.toContain("5.1117");
  });

  it("só entra no texto o que foi pedido", () => {
    // A previsão manda Selic e IPCA; o briefing manda os três.
    expect(macroParaPrompt({ selic: 13.75, ipca: 4.87 })).not.toContain("USD");
    expect(macroParaPrompt({})).toBe("");
  });
});
