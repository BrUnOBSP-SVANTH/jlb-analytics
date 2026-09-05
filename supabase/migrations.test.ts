import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * As migrations precisam poder rodar DUAS VEZES sem quebrar.
 *
 * O caso real (05/09): a 028 tinha sido aplicada por uma via, o fundador colou o
 * arquivo no editor SQL do Supabase e levou `ERROR 42710: policy already exists`.
 * Nada estava quebrado — mas o erro para a migration no meio, e quem lê acha que
 * o banco ficou ruim.
 *
 * O Postgres tem `IF NOT EXISTS` para tabela e índice, mas NÃO para policy. O
 * jeito é `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY`. Fácil de
 * esquecer no arquivo seguinte — por isso o teste, e não só a correção.
 */
const DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

function arquivos(): { nome: string; sql: string }[] {
  return readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((nome) => ({ nome, sql: readFileSync(join(DIR, nome), "utf-8") }));
}

describe("migrations rodam duas vezes sem quebrar", () => {
  it("toda CREATE POLICY tem o DROP IF EXISTS correspondente", () => {
    const desprotegidas: string[] = [];

    for (const { nome, sql } of arquivos()) {
      const criadas = [...sql.matchAll(/^CREATE POLICY\s+"([^"]+)"/gm)].map((m) => m[1]);
      const dropadas = new Set(
        [...sql.matchAll(/^DROP POLICY IF EXISTS\s+"([^"]+)"/gm)].map((m) => m[1]),
      );
      for (const p of criadas) {
        if (!dropadas.has(p)) desprotegidas.push(`${nome}: "${p}"`);
      }
    }

    expect(desprotegidas, `sem DROP POLICY IF EXISTS antes do CREATE:\n${desprotegidas.join("\n")}`)
      .toEqual([]);
  });

  it("o DROP aponta para a mesma tabela do CREATE que ele protege", () => {
    // Um DROP na tabela errada não protege nada e ainda passaria pelo teste
    // acima — o `IF EXISTS` engole o engano em silêncio.
    const errados: string[] = [];

    for (const { nome, sql } of arquivos()) {
      const pares = [...sql.matchAll(
        /^DROP POLICY IF EXISTS\s+"([^"]+)"\s+ON\s+([\w.]+);\s*\n\s*CREATE POLICY\s+"([^"]+)"\s*\n?\s*ON\s+([\w.]+)/gm,
      )];
      for (const [, nomeDrop, tabelaDrop, nomeCreate, tabelaCreate] of pares) {
        if (nomeDrop !== nomeCreate || tabelaDrop !== tabelaCreate) {
          errados.push(`${nome}: DROP "${nomeDrop}" ON ${tabelaDrop} ≠ CREATE "${nomeCreate}" ON ${tabelaCreate}`);
        }
      }
    }

    expect(errados, errados.join("\n")).toEqual([]);
  });

  it("tabela e índice usam IF NOT EXISTS", () => {
    const faltando: string[] = [];
    for (const { nome, sql } of arquivos()) {
      for (const m of sql.matchAll(/^CREATE (TABLE|(?:UNIQUE )?INDEX)\s+(?!IF NOT EXISTS)(\S+)/gm)) {
        faltando.push(`${nome}: CREATE ${m[1]} ${m[2]}`);
      }
    }
    expect(faltando, `sem IF NOT EXISTS:\n${faltando.join("\n")}`).toEqual([]);
  });
});
