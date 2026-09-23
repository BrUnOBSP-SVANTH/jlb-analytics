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

/**
 * SEG-05 — o "consenso da comunidade" publicava a previsão individual.
 *
 * Com o piso de 3 pessoas, `min_prob`, `median_prob` e `max_prob` SÃO as três
 * previsões, em ordem. E `predictions` tem SELECT restrito ao dono justamente
 * para isso não acontecer — a view, sendo SECURITY DEFINER, passava por cima.
 */
describe("SEG-05 — consenso com k-anonimato", () => {
  const sql = () => arquivos().find((a) => a.nome.startsWith("044_"))!.sql;

  it("o piso sobe para 5 previsores", () => {
    expect(sql()).toMatch(/WHERE n >= 5/);
  });

  it("extremos só a partir de 10 — são eles que apontam a pessoa", () => {
    expect(sql()).toMatch(/CASE WHEN n >= 10 THEN minimo END/);
    expect(sql()).toMatch(/CASE WHEN n >= 10 THEN maximo END/);
  });

  it("o anônimo perde o SELECT direto na view", () => {
    expect(sql()).toMatch(/REVOKE SELECT ON public\.market_community_forecast FROM anon, authenticated/);
  });

  it("a tela pergunta pela FUNÇÃO, não pela view", () => {
    const hook = readFileSync(new URL("../client/src/hooks/useMarketDetail.ts", import.meta.url), "utf-8");
    expect(hook).toContain("consenso_da_comunidade");
    expect(hook).not.toMatch(/from\("market_community_forecast"\)/);
  });
});

/**
 * Função SECURITY DEFINER precisa revogar de PUBLIC, não só dos papéis.
 *
 * 🔴 O erro que a 041 cometeu e a 046 consertou: no Postgres a função nasce com
 * `EXECUTE` para `PUBLIC`, e `anon`/`authenticated` HERDAM desse grant. Revogar
 * nominalmente dos dois deixa a função aberta — e `travas_de_escrita`, que é um
 * mapa de onde estão as travas de segurança, ficou pública por um dia.
 *
 * Quem achou foi o advisor do Supabase, não um teste: os testes liam o arquivo
 * da migration, e o arquivo declarava a intenção certa. Este aqui olha a FORMA
 * da revogação, que é onde estava o engano.
 */
describe("SECURITY DEFINER — revogar de PUBLIC é o que fecha", () => {
  /** Sem os comentários: a 046 CITA a linha errada no cabeçalho, para explicar
   *  o engano, e um teste que lesse a prosa acusaria o próprio conserto. */
  const semComentarios = (sql: string) => sql.split(/\r?\n/).map((l) => l.replace(/--.*$/, " ")).join(" ");

  it("toda função SECURITY DEFINER que revoga de anon também revoga de PUBLIC", () => {
    const codigo = arquivos().map((a) => ({ nome: a.nome, sql: semComentarios(a.sql) }));
    const revogaDePublic = (funcao: string) =>
      codigo.some(({ sql }) => sql.includes(`REVOKE ALL ON FUNCTION ${funcao}`) && /FROM PUBLIC/i.test(
        sql.slice(sql.indexOf(`REVOKE ALL ON FUNCTION ${funcao}`)).split(";")[0]));

    const faltando: string[] = [];
    for (const { nome, sql } of codigo) {
      for (const m of sql.matchAll(/REVOKE ALL ON FUNCTION\s+(public\.[a-z_]+)\([^)]*\)\s+FROM\s+([^;]+);/gi)) {
        const [, funcao, papeis] = m;
        if (/public/i.test(papeis)) continue;   // este já é o revoke de PUBLIC
        if (!revogaDePublic(funcao)) faltando.push(`${nome}: ${funcao}`);
      }
    }
    expect(
      faltando,
      `função que revoga só dos papéis nomeados — \`anon\` herda de PUBLIC e continua podendo executar: ${faltando.join(" · ")}`,
    ).toEqual([]);
  });

  it("a régua acha mesmo as revogações (senão passaria sem olhar nada)", () => {
    const todas = arquivos().flatMap(({ sql }) =>
      [...semComentarios(sql).matchAll(/REVOKE ALL ON FUNCTION/gi)]);
    expect(todas.length).toBeGreaterThan(0);
  });
});
