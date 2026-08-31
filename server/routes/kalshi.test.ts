import { describe, it, expect } from "vitest";
import { tituloLimpo } from "./kalshi.ts";

describe("tituloLimpo — não exibe título com buraco de interpolação", () => {
  // Caso real visto no site em 31/08/2026: o Kalshi publicou o título sem o nome
  // do candidato. Exibir isso é pior que não exibir — parece defeito nosso, e o
  // usuário não tem como saber de que mercado se trata.
  it("rejeita título com espaço duplo (nome faltando na origem)", () => {
    expect(tituloLimpo("Will  become President of the United States")).toBeUndefined();
  });

  it("aceita título normal e apara as bordas", () => {
    expect(tituloLimpo("  2028 Democratic presidential nominee  "))
      .toBe("2028 Democratic presidential nominee");
  });

  it("rejeita vazio para o chamador cair na próxima alternativa", () => {
    expect(tituloLimpo("")).toBeUndefined();
    expect(tituloLimpo("   ")).toBeUndefined();
    expect(tituloLimpo(undefined)).toBeUndefined();
  });
});
