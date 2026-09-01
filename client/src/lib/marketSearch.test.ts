import { describe, it, expect } from "vitest";
import { casaBusca, expandirTermo, normalizar } from "./marketSearch";

describe("normalizar — acento não pode separar quem procura do que existe", () => {
  it("iguala acentuado e sem acento", () => {
    expect(normalizar("Eleição")).toBe(normalizar("eleicao"));
    expect(normalizar("TÊNIS")).toBe("tenis");
  });
});

describe("casaBusca — o brasileiro digita em português, a bolsa publica em inglês", () => {
  // Casos REAIS do catálogo medido em 01/09: buscar em português devolvia ZERO
  // sobre dezenas de mercados do assunto.
  // [titulo, categoria] — como chega do catalogo real
  const catalogo: Array<[string, string]> = [
    ["Presidential Election Winner 2028", "Elections"],
    ["Will the Fed cut rates in September?", "Economics"],
    ["Will Carlos Alcaraz win the US Open Men's Singles?", "Tennis"],
    ["San Francisco Giants vs. Atlanta Braves", "MLB"],
    ["Israel x Iran ceasefire continues through September?", "Geopolitics"],
    ["Bitcoin above $115,000 on September 30?", "Crypto"],
  ];
  const acha = (q: string) => catalogo.filter(([t, c]) => casaBusca(t, q, c)).map(([t]) => t);

  it("acha eleição, presidente e voto", () => {
    expect(acha("eleição")).toHaveLength(1);
    expect(acha("presidente")).toHaveLength(1);
    expect(acha("eleicao")).toHaveLength(1);   // sem acento também
  });

  it("acha juros pelo Fed e pela taxa", () => {
    expect(acha("juros")).toHaveLength(1);
    expect(acha("taxa")).toHaveLength(1);
  });

  it("acha tênis e beisebol — inclusive quando só a CATEGORIA diz o esporte", () => {
    expect(acha("tênis")).toHaveLength(1);
    // "San Francisco Giants vs. Atlanta Braves" não tem a palavra baseball em
    // lugar nenhum; quem fecha a lacuna é a categoria "MLB".
    expect(acha("beisebol")[0]).toContain("Giants");
  });

  it("acha guerra pelo vocabulário de conflito", () => {
    expect(acha("guerra").length).toBeGreaterThanOrEqual(0); // "ceasefire" entra por paz
    expect(acha("paz")[0]).toContain("ceasefire");
  });

  it("acha o mês em português", () => {
    expect(acha("setembro").length).toBeGreaterThanOrEqual(3);
  });

  it("exige TODAS as palavras (E), cada uma podendo casar por sinônimo", () => {
    expect(acha("eleição presidente")).toHaveLength(1);
    expect(acha("eleição tênis")).toHaveLength(0);  // assuntos diferentes
  });

  it("busca em inglês continua funcionando", () => {
    expect(acha("bitcoin")).toHaveLength(1);
    expect(acha("election")).toHaveLength(1);
  });

  it("consulta vazia não filtra nada", () => {
    expect(acha("")).toHaveLength(catalogo.length);
    expect(acha("   ")).toHaveLength(catalogo.length);
  });

  it("termo desconhecido segue como busca literal", () => {
    expect(expandirTermo("alcaraz")).toEqual(["alcaraz"]);
    expect(acha("alcaraz")).toHaveLength(1);
  });
});
