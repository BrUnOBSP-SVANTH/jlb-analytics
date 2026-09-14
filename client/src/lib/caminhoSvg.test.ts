import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { coordSvg, linhaSvg } from "./caminhoSvg";

/** Quantos números o navegador enxerga num atributo `d` (vírgula e espaço separam). */
function numerosNoPath(d: string): number[] {
  return d.replace(/[MLZ]/g, " ").split(/[\s,]+/).filter(Boolean).map(Number);
}

describe("linhaSvg — o que a auditoria de 14/09 mandou prender", () => {
  const pontos = [
    { x: 0, y: 8.12 }, { x: 7.8, y: 30.4 }, { x: 592.35, y: 101.7 }, { x: 96, y: 0.04 },
  ];

  it("exatamente 2 números por ponto", () => {
    expect(numerosNoPath(linhaSvg(pontos))).toHaveLength(2 * pontos.length);
  });

  it("os números são os pontos, na ordem — nenhum espúrio", () => {
    expect(numerosNoPath(linhaSvg(pontos))).toEqual([0, 8.1, 7.8, 30.4, 592.4, 101.7, 96, 0]);
  });

  it("Y cabe na altura: o defeito prendia o Y entre 0 e 9 num gráfico de 220", () => {
    const H = 220;
    const altos = [{ x: 4, y: 12.5 }, { x: 300, y: 187.25 }, { x: 592, y: 216 }];
    const ys = numerosNoPath(linhaSvg(altos)).filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(H);
    expect(Math.max(...ys)).toBeGreaterThan(9);
  });

  it("coordenada nunca sai com vírgula, milhar, -0 ou NaN", () => {
    expect(coordSvg(1234.56)).toBe("1234.6");
    expect(coordSvg(-0.01)).toBe("0");
    expect(coordSvg(NaN)).toBe("0");
    expect(coordSvg(7.8)).not.toContain(",");
  });
});

/**
 * E o motivo de o defeito ter existido: `num()` dentro de coordenada. Varre o
 * fonte, sem comentários (o comentário de caminhoSvg.ts cita o padrão errado para
 * explicá-lo, e sem tirar comentários o teste acusaria a própria documentação).
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
function arquivos(dir = SRC, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const c = join(dir, nome);
    if (statSync(c).isDirectory()) arquivos(c, saida);
    else if (nome.endsWith(".tsx")) saida.push(c);
  }
  return saida;
}
const semComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

describe("nenhum gerador de path usa o formatador pt-BR", () => {
  it("nem `\"L\"}${num(` nem `},${num(` em componente", () => {
    const culpados = arquivos()
      .filter((f) => /"L"\}\$\{num\(|\},\$\{num\(/.test(semComentarios(readFileSync(f, "utf-8"))))
      .map((f) => relative(SRC, f));
    expect(culpados).toEqual([]);
  });
});
