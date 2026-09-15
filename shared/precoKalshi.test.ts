import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { pctDoKalshi } from "./precoKalshi.ts";

describe("pctDoKalshi — a escala vem da origem, não do valor", () => {
  it("abaixo de 1% continua abaixo de 1%", () => {
    // Os três casos que a adivinhação `> 1 ? x : x * 100` errava.
    expect(pctDoKalshi(0.8)).toBe(0.8);
    expect(pctDoKalshi(1)).toBe(1);
    expect(pctDoKalshi(0.5)).toBe(0.5);
  });

  it("o resto da escala passa intacto", () => {
    expect(pctDoKalshi(0.1)).toBe(0.1);
    expect(pctDoKalshi(42.5)).toBe(42.5);
    expect(pctDoKalshi(99.9)).toBe(99.9);
  });

  it("o que não é preço vira null, e não 50", () => {
    for (const v of [NaN, Infinity, -1, 101, undefined, null, "42"]) {
      expect(pctDoKalshi(v)).toBeNull();
    }
  });
});

describe("ninguém volta a adivinhar a escala pelo valor", () => {
  const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
  const semComentarios = (t: string) =>
    t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

  function fontes(dir: string, saida: string[] = []): string[] {
    for (const nome of readdirSync(dir)) {
      if (nome === "node_modules" || nome.startsWith(".")) continue;
      const caminho = join(dir, nome);
      if (statSync(caminho).isDirectory()) { fontes(caminho, saida); continue; }
      if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(caminho);
    }
    return saida;
  }

  it("não existe `yesProb > 1 ? yesProb : yesProb * 100` no código", () => {
    // O padrão exato das quatro ocorrências de 14/09. Para Polymarket (0–1) a
    // conversão é `* 100`; para Kalshi (0–100), `pctDoKalshi`. Nunca os dois
    // decididos pelo tamanho do número.
    const achados: string[] = [];
    for (const dir of ["server", "client/src", "shared"]) {
      for (const f of fontes(join(RAIZ, dir))) {
        const texto = semComentarios(readFileSync(f, "utf-8"));
        if (/yesProb\s*>\s*1\s*\?\s*[\w.]*yesProb\s*:\s*[\w.]*yesProb\s*\*\s*100/.test(texto)) {
          achados.push(relative(RAIZ, f));
        }
      }
    }
    expect(achados).toEqual([]);
  });
});
