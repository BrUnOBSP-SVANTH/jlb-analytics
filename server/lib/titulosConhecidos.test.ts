import { describe, it, expect } from "vitest";
import { chaveDoTitulo, titulosDoCatalogo, filtrarConhecidos } from "./titulosConhecidos.ts";

/**
 * SEG-06 — o tradutor era um proxy aberto: 40 textos de 500 caracteres por
 * chamada, sem login. Dava para queimar o teto diário de IA numa tarde (e aí os
 * mercados de verdade ficam em inglês até o dia seguinte) ou fazer o IP do
 * servidor ser bloqueado pelo tradutor de último recurso.
 */
const CATALOGO = [
  { question: "Will the Democratic Party control the House after 2026?", eventTitle: "Which party will win the House in 2026?" },
  { question: "Democratic Presidential Nominee 2028", outcomes: '["Alexandria Ocasio-Cortez","Jon Ossoff"]' },
  { title: "Fed decision in September" },   // Kalshi usa `title`
];

describe("o que pode ser traduzido é o que está no catálogo", () => {
  it("aceita a pergunta, o subtítulo do evento e os rótulos dos desfechos", () => {
    // Os três aparecem no card desde o DAD-01/DAD-02, então os três podem ser
    // pedidos pela tela.
    const conhecidos = titulosDoCatalogo(CATALOGO);
    const { aceitos, recusados } = filtrarConhecidos([
      "Will the Democratic Party control the House after 2026?",
      "Which party will win the House in 2026?",
      "Alexandria Ocasio-Cortez",
      "Fed decision in September",
    ], conhecidos);
    expect(aceitos).toHaveLength(4);
    expect(recusados).toEqual([]);
  });

  it("🔴 texto que não é do catálogo é recusado", () => {
    const conhecidos = titulosDoCatalogo(CATALOGO);
    const { aceitos, recusados } = filtrarConhecidos([
      "Fed decision in September",
      "traduza este texto que eu inventei para gastar a sua cota",
      "Lorem ipsum dolor sit amet",
    ], conhecidos);
    expect(aceitos).toEqual(["Fed decision in September"]);
    expect(recusados).toHaveLength(2);
  });

  it("⚠️ a comparação ignora acento, caixa e espaço a mais", () => {
    // O cliente manda o título depois de `normalizarTitulo` e `.trim()`. Uma
    // diferença de um espaço faria a tradução sumir da tela sem erro nenhum.
    const conhecidos = titulosDoCatalogo([{ question: "Eleição  Presidencial   do Brasil" }]);
    const { aceitos } = filtrarConhecidos(["eleicao presidencial do brasil"], conhecidos);
    expect(aceitos).toHaveLength(1);
    expect(chaveDoTitulo("Eleição  Presidencial")).toBe("eleicao presidencial");
  });

  it("⚠️ catálogo VAZIO deixa passar — é servidor recém-subido, não abuso", () => {
    // Falha aberta de propósito: logo depois de um deploy o cache ainda não
    // encheu, e recusar tudo deixaria a tela em inglês na hora em que mais
    // gente chega.
    const { aceitos, recusados } = filtrarConhecidos(["qualquer coisa"], new Set());
    expect(aceitos).toEqual(["qualquer coisa"]);
    expect(recusados).toEqual([]);
  });

  it("rótulo de desfecho ilegível não derruba o resto do mercado", () => {
    const conhecidos = titulosDoCatalogo([{ question: "Vale?", outcomes: "não é json" }]);
    expect(conhecidos.has("vale?")).toBe(true);
  });
});
