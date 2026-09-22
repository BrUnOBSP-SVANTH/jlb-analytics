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
      // ⚠️ O nome da policy pode vir COM ou SEM aspas, e a versão anterior deste
      // teste só enxergava as com aspas — a 041 criou uma sem, que passaria
      // batido e quebraria na segunda execução com 42710.
      const nomeDaPolicy = (m: RegExpMatchArray) => m[1] ?? m[2];
      const criadas = [...sql.matchAll(/^CREATE POLICY\s+(?:"([^"]+)"|([a-z0-9_]+))/gim)].map(nomeDaPolicy);
      const dropadas = new Set(
        [...sql.matchAll(/^DROP POLICY IF EXISTS\s+(?:"([^"]+)"|([a-z0-9_]+))/gim)].map(nomeDaPolicy),
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

/**
 * SEG-01 — as travas que impedem forjar o ranking público.
 *
 * Aqui o teste lê o FONTE da migration, como o resto deste arquivo: ele prende
 * a regra para que ninguém a desfaça sem perceber. A prova de que o banco de
 * produção está mesmo trancado é outra, e roda contra o banco de verdade:
 * `node scripts/provar-travas.mjs` tenta forjar uma previsão com um JWT de
 * usuário e exige que o banco recuse.
 */
describe("SEG-01 — a previsão nasce pendente e não muda mais", () => {
  const sql = () => arquivos().find((a) => a.nome.startsWith("041_"))!.sql;

  it("o navegador perde o UPDATE nas duas tabelas do ranking", () => {
    // Era o buraco: `authenticated` podia alterar `outcome`, `resolved` e
    // `brier_score` das PRÓPRIAS previsões — e o Leaderboard lê justamente a
    // média desses números.
    expect(sql()).toMatch(/REVOKE UPDATE ON public\.predictions FROM anon, authenticated/);
    expect(sql()).toMatch(/REVOKE UPDATE ON public\.paper_bets\s+FROM anon, authenticated/);
    expect(sql()).toMatch(/DROP POLICY IF EXISTS predictions_update_own/);
  });

  it("apagar só o que ainda está em aberto", () => {
    // Apagar a previsão DEPOIS de saber que errou é o cherry-picking que a
    // plataforma promete não fazer.
    expect(sql()).toMatch(/CREATE POLICY predictions_delete_own_pendente[\s\S]*?resolved = false/);
  });

  it("o gatilho zera o que o cliente não pode decidir", () => {
    const s = sql();
    for (const coluna of ["resolved", "outcome", "resolved_at", "resolution_source", "resolution_price"]) {
      expect(s.includes(`NEW.${coluna}`), `${coluna} precisa ser forçada no INSERT`).toBe(true);
    }
    // E a data é a do servidor: `created_at` decide a ordem do histórico e
    // sustenta o "previu ANTES do resultado".
    expect(s).toMatch(/NEW\.created_at\s+:= now\(\)/);
  });

  it("⚠️ o servidor continua podendo resolver — senão nada nunca liquida", () => {
    // A trava não pode trancar quem tem a obrigação de gravar o resultado: o
    // job de 6h usa a chave de serviço.
    expect(sql()).toMatch(/IF current_user = 'service_role' THEN\s+RETURN NEW;/);
  });

  it("a banca simulada nasce em aberto pelo mesmo motivo", () => {
    const s = sql();
    expect(s).toMatch(/trg_aposta_nasce_aberta/);
    for (const coluna of ["resolved", "outcome", "payout", "settled_at"]) {
      expect(s.includes(`NEW.${coluna}`), `${coluna} precisa ser forçada no INSERT de paper_bets`).toBe(true);
    }
  });

  it("a trava é verificável de fora, e só pela chave de serviço", () => {
    const s = sql();
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.travas_de_escrita/);
    expect(s).toMatch(/REVOKE ALL ON FUNCTION public\.travas_de_escrita\(\) FROM anon, authenticated/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.travas_de_escrita\(\) TO service_role/);
  });
});
