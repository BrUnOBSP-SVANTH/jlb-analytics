import { describe, it, expect } from "vitest";
import { CHECAGEM_POR_NIVEL, checagemDoNivel, passouNaChecagem, ACERTOS_PARA_CONCLUIR } from "./checagemNiveis.ts";

/**
 * APR-02 — um nível era dado como concluído quando QUALQUER calculadora dele
 * devolvia resultado. Já foi pior (bastava abrir a página), mas apertar
 * "calcular" com os valores que já estavam no campo não é aprendizado: é um
 * clique com mais passos. E "nível concluído" é o que mede a trilha, vale 10
 * pontos e diz à pessoa onde ela está.
 *
 * Medido no navegador em 24/09, no /nivel/1: acertando as três, o nível conclui
 * e o progresso vai a 12 pontos (10 do exercício + 2 da visita); errando as
 * três, "Quase lá" e nenhum nível concluído.
 */
describe("a checagem existe, está inteira e é honesta", () => {
  it("os cinco níveis têm três perguntas cada", () => {
    for (let n = 1; n <= 5; n++) {
      expect(checagemDoNivel(n), `nível ${n}`).toHaveLength(3);
    }
    expect(checagemDoNivel(9)).toEqual([]);
  });

  it("🔴 toda pergunta tem alternativa certa VÁLIDA e explicação", () => {
    // Um índice fora da faixa faria a pergunta ser impossível de acertar — e o
    // sintoma seria "ninguém conclui o nível", que ninguém associa a isto.
    for (const [nivel, perguntas] of Object.entries(CHECAGEM_POR_NIVEL)) {
      for (const p of perguntas) {
        const onde = `nível ${nivel}: "${p.pergunta.slice(0, 30)}"`;
        expect(p.alternativas.length, onde).toBeGreaterThanOrEqual(3);
        expect(p.correta, onde).toBeGreaterThanOrEqual(0);
        expect(p.correta, onde).toBeLessThan(p.alternativas.length);
        expect(p.explicacao.length, onde).toBeGreaterThan(40);
        // Alternativa repetida deixaria duas respostas certas.
        expect(new Set(p.alternativas).size, onde).toBe(p.alternativas.length);
      }
    }
  });

  it("⚠️ chutar não é caminho: quatro alternativas, não duas", () => {
    // Com V/F, chutar as três passa 50% das vezes. Com quatro, 16%.
    for (const perguntas of Object.values(CHECAGEM_POR_NIVEL)) {
      for (const p of perguntas) expect(p.alternativas.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("a régua é 2 de 3", () => {
    expect(ACERTOS_PARA_CONCLUIR).toBe(2);
    expect(passouNaChecagem(0)).toBe(false);
    expect(passouNaChecagem(1)).toBe(false);
    expect(passouNaChecagem(2)).toBe(true);
    expect(passouNaChecagem(3)).toBe(true);
  });

  it("nenhuma pergunta escreve número fora do padrão brasileiro", () => {
    // Mesma régua do TXT-01: este é conteúdo de ENSINO de número.
    const PONTO_DECIMAL = /(?<![\d.])\d{1,3}\.\d{1,2}(?![\d])/;
    for (const perguntas of Object.values(CHECAGEM_POR_NIVEL)) {
      for (const p of perguntas) {
        for (const texto of [p.pergunta, p.explicacao, ...p.alternativas]) {
          expect(PONTO_DECIMAL.test(texto), texto.slice(0, 50)).toBe(false);
        }
      }
    }
  });
});

describe("quem conclui o nível é a checagem, não a calculadora", () => {
  it("🔴 o hook das calculadoras não conclui mais nível", async () => {
    const { readFileSync } = await import("node:fs");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../hooks/useModels.ts"), "utf-8");
    const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(semComentarios).not.toMatch(/concluirNivel\(/);
  });
});
