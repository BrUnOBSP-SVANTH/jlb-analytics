import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { numeroDoCampo } from "./campoNumerico";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("numeroDoCampo", () => {
  it("vazio é NENHUM número — não zero", () => {
    // Zero inventado faria a calculadora afirmar "EV zero — posição justa"
    // sobre um campo que a pessoa só estava trocando.
    expect(numeroDoCampo("")).toBeNull();
    expect(numeroDoCampo("   ")).toBeNull();
  });

  it("aceita ponto e vírgula", () => {
    expect(numeroDoCampo("1.8")).toBe(1.8);
    expect(numeroDoCampo("1,8")).toBe(1.8);
    expect(numeroDoCampo("60")).toBe(60);
    expect(numeroDoCampo("-100")).toBe(-100);
  });

  it("ilegível é nenhum número", () => {
    expect(numeroDoCampo("abc")).toBeNull();
    expect(numeroDoCampo("1,2,3")).toBeNull();
  });
});

/**
 * 🔴 O CAMPO QUE BRIGA COM QUEM DIGITA (01/10/2026).
 *
 * Medido no navegador: 5 dos 48 campos numéricos do site não aceitavam trocar
 * um número do jeito comum — apagar e digitar. Na calculadora de Valor Esperado,
 * "55" virava "5560"; na de Kelly, 60% virava 99% e a recomendação de quanto
 * apostar saía calculada sobre o número errado, sem aviso.
 *
 * As duas formas do defeito num `<input type="number">` controlado:
 *   · `if (isNaN(v)) return`        → apagar é ignorado e o número antigo volta;
 *   · `parseFloat(texto) || 1`      → apagar põe um número que ninguém digitou.
 *
 * Esta guarda varre todos os componentes. Ela não substitui a medição no
 * navegador (`pnpm varredura` faz isso nas telas abertas); ela pega o padrão no
 * código, inclusive em aba que a varredura não abre.
 */
describe("nenhum campo numérico reescreve o que a pessoa digita", () => {
  const arquivos: string[] = [];
  const andar = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) andar(p);
      else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) arquivos.push(p);
    }
  };
  andar(SRC);

  it("varreu o cliente (âncora: sem ela, zero culpados seria mentira)", () => {
    expect(arquivos.length).toBeGreaterThan(100);
  });

  it("nenhum onChange de campo numérico força um número no lugar do vazio", () => {
    const culpados: string[] = [];
    for (const f of arquivos) {
      const fonte = readFileSync(f, "utf-8");
      // Cada <input ... type="number" ... /> com o onChange dele.
      //
      // ⚠️ NÃO `[^>]*` para atravessar a tag: o onChange é uma arrow function, e
      // o `>` do `=>` interrompia a busca. A primeira versão desta guarda fazia
      // isso e deixou passar exatamente a Kelly — a prova repondo o defeito é que
      // mostrou. O avanço aqui só para no `/>` que fecha a tag.
      for (const m of fonte.matchAll(/<input\b(?:(?!\/>)[\s\S])*?type="number"(?:(?!\/>)[\s\S])*?\/>/g)) {
        const tag = m[0];
        const onChange = /onChange=\{([\s\S]*?)\}\s*(?:className|\/>|[a-zA-Z-]+=)/.exec(tag)?.[1] ?? "";
        // `|| <número>` logo depois de converter o valor do campo.
        if (/(parseFloat|parseInt|Number)\([^)]*target\.value[^)]*\)\s*\|\|\s*-?\d/.test(onChange)) {
          culpados.push(`${f.replace(/\\/g, "/").split("/src/")[1]} — ${onChange.trim().slice(0, 70)}`);
        }
      }
      // A outra forma: a função de update que desiste quando não é número.
      if (/type="number"/.test(fonte) && /const\s+update\s*=[\s\S]{0,160}?if\s*\(\s*(Number\.)?isNaN\([^)]*\)\s*\)\s*return/.test(fonte)) {
        culpados.push(`${f.replace(/\\/g, "/").split("/src/")[1]} — update que ignora o campo vazio`);
      }
    }
    expect(culpados, culpados.join("\n")).toEqual([]);
  });
});
