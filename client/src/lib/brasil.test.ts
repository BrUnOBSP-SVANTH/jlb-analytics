import { describe, it, expect } from "vitest";
import { ehSobreBrasil } from "./brasil.ts";

/**
 * NEG-04: nos 20 primeiros mercados a auditoria encontrou US Open, primárias
 * americanas, Fed, Irã e Champions League. O único conteúdo brasileiro estava
 * escondido e em inglês.
 *
 * É a pergunta mais óbvia de quem chega — "tem alguma coisa daqui?" — e se a
 * resposta é não, a pessoa abre o Polymarket direto.
 */
describe("é sobre o Brasil?", () => {
  it("reconhece os mercados brasileiros que existem hoje no catálogo", () => {
    // Os três que o catálogo real trazia em 10/09/2026, todos em inglês.
    expect(ehSobreBrasil("Brazil Presidential Election")).toBe(true);
    expect(ehSobreBrasil("Brazil Presidential Election First Round: 2nd Place")).toBe(true);
  });

  it("pega política, economia e esporte", () => {
    expect(ehSobreBrasil("Lula reeleito em 2026?")).toBe(true);
    expect(ehSobreBrasil("Copom sobe a Selic em dezembro?")).toBe(true);
    expect(ehSobreBrasil("Flamengo campeão da Libertadores?")).toBe(true);
  });

  it("casa palavra INTEIRA, nunca pedaço", () => {
    // O risco aqui é concreto, não teórico: "real" mora dentro de "really" e de
    // "real estate", e esta base já foi mordida quatro vezes por substring.
    expect(ehSobreBrasil("Will this really happen?")).toBe(false);
    expect(ehSobreBrasil("US real estate prices in 2027")).toBe(false);
    expect(ehSobreBrasil("Valentine's Day box office")).toBe(false);
  });

  it("erra para o lado de NÃO incluir", () => {
    // Mercado americano na seção Brasil quebra a promessa da seção; mercado
    // brasileiro de fora dela só a deixa menor. O segundo erro é mais barato.
    expect(ehSobreBrasil("2026 Men's US Open Winner")).toBe(false);
    expect(ehSobreBrasil("Fed Decision in September?")).toBe(false);
    expect(ehSobreBrasil("Champions League Winner")).toBe(false);
  });

  it("ignora acento nos dois lados", () => {
    expect(ehSobreBrasil("Brasileirao 2026")).toBe(true);
    expect(ehSobreBrasil("Brasileirão 2026")).toBe(true);
  });

  it("aceita vários campos e aguenta vazio", () => {
    expect(ehSobreBrasil("Election Winner", "politics", "Brazil")).toBe(true);
    expect(ehSobreBrasil(null, undefined, "")).toBe(false);
    expect(ehSobreBrasil()).toBe(false);
  });
});
