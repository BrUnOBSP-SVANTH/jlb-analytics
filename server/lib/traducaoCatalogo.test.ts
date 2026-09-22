import { describe, it, expect } from "vitest";
import { titulosDoCatalogo } from "./traducaoCatalogo.ts";

describe("titulosDoCatalogo — o que a pré-tradução manda para a IA", () => {
  it("pega a pergunta E o título do evento, porque os dois aparecem no card", () => {
    // Desde o DAD-01 o evento vira SUBTÍTULO. Traduzir só a pergunta deixaria a
    // linha de cima em inglês, no mesmo card.
    const t = titulosDoCatalogo([{
      question: "Will the Democratic Party control the House after the 2026 Midterm elections?",
      eventTitle: "Which party will win the House in 2026?",
    }]);
    expect(t).toHaveLength(2);
    expect(t).toContain("Which party will win the House in 2026?");
  });

  it("aceita o Kalshi, que chama o campo de `title`", () => {
    expect(titulosDoCatalogo([{ title: "Fed decision in September" }])).toEqual(["Fed decision in September"]);
  });

  it("título repetido entre mercados irmãos vira UM pedido só", () => {
    // O caso comum: dez mercados do mesmo evento compartilham o eventTitle.
    const irmaos = Array.from({ length: 10 }, (_, i) => ({
      question: `Candidate ${i} wins?`, eventTitle: "Brazil Presidential Election",
    }));
    const t = titulosDoCatalogo(irmaos);
    expect(t.filter((x) => x === "Brazil Presidential Election")).toHaveLength(1);
    expect(t).toHaveLength(11);
  });

  it("ignora campo vazio, só espaço ou ausente", () => {
    expect(titulosDoCatalogo([{ question: "   " }, { eventTitle: "" }, {}])).toEqual([]);
  });

  it("corta em 500 caracteres, o mesmo teto do tradutor", () => {
    const [t] = titulosDoCatalogo([{ question: "x".repeat(900) }]);
    expect(t).toHaveLength(500);
  });
});
