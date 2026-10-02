import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
/** Comentário que explica o defeito cita o defeito — fora antes de afirmar ausência. */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const ler = (arquivo: string) => semComentarios(readFileSync(join(AQUI, arquivo), "utf-8"));

/**
 * 🔴 A DIFERENÇA DE PROBABILIDADE SAÍA EM "%" (01/10/2026).
 *
 * A decomposição do Kelly mostrava "Edge (vantagem) 5,00%" para 55% contra 50%
 * — cinco PONTOS percentuais, não 5% (que seria 52,5% contra 50%). Trocar `%`
 * por `pp` é justamente o erro que a plataforma existe para corrigir, e estava
 * na calculadora que diz quanto apostar. Quem viu foi o vídeo de ajuda, num
 * quadro parado na tela do Kelly.
 */
describe("Kelly: edge é diferença de probabilidade", () => {
  const kelly = ler("KellyCalc.tsx");

  it("a linha do edge usa pp() de shared/formato", () => {
    const linha = /\["Edge \(vantagem\)",[^\]]*\]/.exec(kelly)?.[0];
    expect(linha, "a linha do edge sumiu da decomposição").toBeDefined();
    expect(linha).toMatch(/\bpp\(/);
    expect(linha).not.toMatch(/%`/);
  });
});

/**
 * 🔴 O GUIA DOS MODELOS ESCREVIA "0.65" (01/10/2026).
 *
 * O mesmo defeito do commit 2a53b5c (as explicações da trilha), na outra metade
 * da tela de calculadoras: o guia que abre ao lado de cada calculadora tinha 10
 * números com ponto decimal — "1/0.6 = 1.67", "(0.65 − 1)² = 0.1225", a escala
 * do Brier "0.10–0.15" — enquanto a calculadora, logo acima, mostrava "0,1225".
 * Texto escrito à mão, fora de shared/formato.ts, então só uma varredura do
 * fonte pega.
 */
describe("o guia dos modelos fala pt-BR", () => {
  const guia = ler("GuiaModelos.tsx");
  // Strings entre aspas duplas, que é como o guia guarda o texto.
  const textos = [...guia.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)].map((m) => m[1]);
  // Ponto decimal entre dígitos ("0.65", "1.90"). Milhar pt-BR ("1.234") tem
  // três dígitos depois do ponto — fica de fora, como no teste da trilha.
  const pontoDecimal = /\d\.\d{1,2}(?!\d)|\d\.\d{4,}/;

  it("a leitura achou o texto do guia (âncora)", () => {
    expect(textos.some((t) => t.includes("Critério de Kelly"))).toBe(true);
    expect(textos.length).toBeGreaterThan(60);
  });

  it("nenhum número com ponto decimal no texto", () => {
    // Classe Tailwind tem ponto entre dígitos (`py-0.5`, `w-3.5`) e não é texto.
    const comPonto = textos.filter((t) => pontoDecimal.test(t.replace(/\b[\w:-]+-\d+\.\d+\b/g, " ")));
    expect(comPonto).toEqual([]);
  });
});
