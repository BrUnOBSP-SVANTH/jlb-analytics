import { describe, it, expect } from "vitest";
import {
  fontesSemResposta,
  fraseDasFontes,
  motivoDaListaVazia,
  listar,
} from "./fontesDoCatalogo.ts";

describe("quem respondeu nesta rodada", () => {
  it("fonte com zero item conta como fora — falha e vazio dão no mesmo", () => {
    expect(fontesSemResposta({ reddit: 60, polymarket: 120, kalshi: 100, manifold: 0 })).toEqual(["manifold"]);
  });

  it("todas respondendo, ninguém fora", () => {
    expect(fontesSemResposta({ reddit: 1, polymarket: 1, kalshi: 1, manifold: 1 })).toEqual([]);
  });

  it("fonte ausente do objeto também está fora", () => {
    expect(fontesSemResposta({ polymarket: 10 })).toEqual(["reddit", "kalshi", "manifold"]);
  });
});

describe("o subtítulo promete só o que existe", () => {
  it("com tudo de pé, a frase original", () => {
    expect(fraseDasFontes([])).toBe(
      "O que Polymarket, Kalshi e Manifold estão precificando agora, com a nossa leitura ao lado.",
    );
  });

  it("o caso real: Manifold fora — a frase para de prometê-la e diz que faltou", () => {
    const frase = fraseDasFontes(["manifold"]);
    expect(frase).toBe(
      "O que Polymarket e Kalshi estão precificando agora, com a nossa leitura ao lado. " +
        "Manifold não respondeu nesta atualização.",
    );
    expect(frase).not.toMatch(/Manifold estão/);
  });

  it("sobrando uma só, o verbo acompanha", () => {
    expect(fraseDasFontes(["kalshi", "manifold"])).toContain("O que Polymarket está precificando agora");
    expect(fraseDasFontes(["kalshi", "manifold"])).toContain("Kalshi e Manifold não responderam");
  });

  it("nenhuma de pé: a tela assume, em vez de estimar sozinha", () => {
    expect(fraseDasFontes(["polymarket", "kalshi", "manifold"])).toMatch(/Nenhuma das bolsas respondeu/);
  });

  it("o Reddit não entra na promessa do subtítulo — é conversa, não preço", () => {
    expect(fraseDasFontes(["reddit"])).toBe(fraseDasFontes([]));
  });

  it("lista em português, sem vírgula serial", () => {
    expect(listar(["A", "B", "C"])).toBe("A, B e C");
    expect(listar(["A", "B"])).toBe("A e B");
    expect(listar(["A"])).toBe("A");
  });
});

describe("a lista vazia explica a causa certa", () => {
  it("filtrou uma fonte que caiu: diz que a fonte caiu", () => {
    const m = motivoDaListaVazia("manifold", ["manifold"]);
    expect(m.fonteFora).toBe(true);
    expect(m.titulo).toBe("Manifold não respondeu agora");
    expect(m.detalhe).toMatch(/não inventamos/);
  });

  it("fonte de pé e recorte vazio: segue sendo questão de cobertura", () => {
    const m = motivoDaListaVazia("kalshi", ["manifold"]);
    expect(m.fonteFora).toBe(false);
    expect(m.titulo).toBe("Nenhum mercado com este filtro agora");
  });

  it("em Todos, nunca culpa uma fonte específica", () => {
    expect(motivoDaListaVazia("all", ["manifold"]).fonteFora).toBe(false);
  });
});
