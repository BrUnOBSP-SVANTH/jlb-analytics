import { describe, it, expect } from "vitest";
import { termosDistintivos, pareceRelacionado, filtrarRelacionados } from "./relevancia.ts";

/**
 * O caso que originou tudo (DET-08): num mercado sobre a decisão do Fed, o chip
 * do Cérebro trazia "Bitcoin's $80K Comeback Has a September Deadline".
 *
 * Não era aleatoriedade. O código buscava pelas TRÊS PRIMEIRAS palavras com mais
 * de três letras do título — para "Fed Decision in September?" isso dá
 * "Decision & September", e qualquer artigo de setembro casa.
 */
describe("termos distintivos do mercado", () => {
  it("descarta o vocabulário de pergunta de mercado", () => {
    // "Decision" e "September" são o que TODO título de mercado tem; o que
    // identifica este mercado é "Fed" — e "Fed" tem 3 letras, então nem entra.
    // Sem termo distintivo, a resposta honesta é não mostrar nada.
    expect(termosDistintivos("Fed Decision in September?")).toEqual([]);
  });

  it("fica com nome próprio e termo técnico", () => {
    const t = termosDistintivos("Democratic Presidential Nominee 2028");
    expect(t).toContain("Presidential");
    expect(t).toContain("Democratic");
    expect(t).not.toContain("Nominee");   // genérico de mercado
    expect(t).not.toContain("2028");      // ano sozinho não identifica
  });

  it("mais longa primeiro — palavra longa costuma ser a que distingue", () => {
    expect(termosDistintivos("Bitcoin Ethereum Solana", 2)).toEqual(["Ethereum", "Bitcoin"]);
  });

  it("não repete a mesma palavra", () => {
    expect(termosDistintivos("Brasil x Brasil Brasil")).toEqual(["Brasil"]);
  });

  it("aguenta título só de palavras genéricas", () => {
    expect(termosDistintivos("Will the market decide?")).toEqual([]);
    expect(termosDistintivos("")).toEqual([]);
  });
});

describe("a notícia tem a ver com o mercado?", () => {
  it("o falso positivo da auditoria não passa mais", () => {
    const artigos = [{ title: "Bitcoin's $80K Comeback Has a September Deadline" }];
    expect(filtrarRelacionados(artigos, "Fed Decision in September?")).toEqual([]);
  });

  it("o que tem a ver de verdade passa", () => {
    const artigos = [
      { title: "Powell sinaliza corte na reunião do Federal Reserve" },
      { title: "Bitcoin's $80K Comeback Has a September Deadline" },
    ];
    const r = filtrarRelacionados(artigos, "Federal Reserve rate decision");
    expect(r).toHaveLength(1);
    expect(r[0].title).toContain("Federal Reserve");
  });

  it("casa palavra INTEIRA, nunca pedaço", () => {
    // Esta base já foi mordida quatro vezes por casamento de substring: "ai"
    // dentro de "ukraine", "oil" dentro de "boiling". A régua aqui é a mesma.
    expect(pareceRelacionado("Boiling point reached", ["oils"])).toBe(false);
    expect(pareceRelacionado("Ukraine talks resume", ["rain"])).toBe(false);
    expect(pareceRelacionado("Ukraine talks resume", ["Ukraine"])).toBe(true);
  });

  it("ignora acento na comparação", () => {
    // O índice de full-text é português e guarda acento; o título do mercado
    // costuma vir em inglês. Comparar sem acento evita perder o match certo.
    expect(pareceRelacionado("A eleição no Brasil", ["eleicao"])).toBe(true);
    expect(pareceRelacionado("A eleicao no Brasil", ["eleição"])).toBe(true);
  });

  it("sem termo distintivo, nada passa", () => {
    // É a decisão central: uma notícia irrelevante ao lado de um mercado custa
    // mais credibilidade do que a ausência dela.
    expect(pareceRelacionado("Qualquer notícia", [])).toBe(false);
  });
});
