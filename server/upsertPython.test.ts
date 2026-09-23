import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Todo upsert dos coletores Python precisa dizer POR QUAL COLUNA resolver.
 *
 * O QUE ACONTECEU (Auditoria 21/09, INF-02). `cerebro_synthesizer.py` gravava a
 * síntese com `Prefer: resolution=merge-duplicates` e sem `?on_conflict=`. O
 * PostgREST então resolve pela CHAVE PRIMÁRIA — que ali é `id`, um uuid novo a
 * cada rodada — enquanto a coluna realmente única é `slug` (sha1 de
 * categoria:data, que se repete dentro do mesmo dia DE PROPÓSITO, porque a
 * rodada seguinte deve substituir a anterior).
 *
 * Resultado: a primeira síntese do dia entrava, e TODA rodada seguinte morria
 * com 23505 — "Falha ao salvar síntese de macro/cripto/esportes/política/
 * ciência/mercados". Medido em 23/09 contra o banco de produção: 2ª rodada sem
 * `on_conflict` = HTTP 409; com `on_conflict=slug` = HTTP 200.
 *
 * O mesmo erro já tinha custado caro no `rss_collector.py`, e o comentário de
 * lá diz isso. O sintetizador tinha ficado para trás — daí o teste, que olha
 * TODOS os arquivos em vez de um.
 *
 * (Mora em `server/` porque é onde o vitest procura; o alvo é `python/`.)
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = join(RAIZ, "python");

function upsertsSemOnConflict(): string[] {
  const problemas: string[] = [];
  for (const nome of readdirSync(PYTHON).filter((f) => f.endsWith(".py"))) {
    const linhas = readFileSync(join(PYTHON, nome), "utf-8").split(/\r?\n/);
    linhas.forEach((linha, i) => {
      const url = linha.match(/rest\/v1\/([a-z_]+)([^"'\s]*)/);
      if (!url) return;
      // ⚠️ Só UPSERT. A mesma tabela costuma ser LIDA no mesmo arquivo (GET), e
      // leitura não tem conflito nenhum para resolver — cobrar `on_conflict`
      // dela seria alarme falso, que é o jeito mais rápido de ensinar alguém a
      // ignorar este teste. O que caracteriza o upsert é o cabeçalho
      // `merge-duplicates`, montado logo abaixo da URL.
      const ehUpsert = linhas.slice(i, i + 15).some((l) => l.includes("merge-duplicates"));
      if (ehUpsert && !url[2].includes("on_conflict=")) {
        problemas.push(`${nome}:${i + 1} — ${url[1]} sem on_conflict`);
      }
    });
  }
  return problemas;
}

describe("INF-02 — upsert do Python resolve pela coluna certa", () => {
  it("os coletores existem e usam upsert (senão o teste não prova nada)", () => {
    const comUpsert = readdirSync(PYTHON)
      .filter((f) => f.endsWith(".py"))
      .filter((f) => readFileSync(join(PYTHON, f), "utf-8").includes("merge-duplicates"));
    expect(comUpsert.length).toBeGreaterThan(0);
    // E a régua precisa achar os upserts: se o detector parar de reconhecê-los,
    // o teste passaria sem olhar nada.
    expect(comUpsert.some((f) => /rest\/v1\/[a-z_]+\?on_conflict=/.test(readFileSync(join(PYTHON, f), "utf-8")))).toBe(true);
  });

  it("🔴 nenhum upsert fica sem `on_conflict`", () => {
    const problemas = upsertsSemOnConflict();
    expect(
      problemas,
      "upsert que o PostgREST vai resolver pela PK em vez da coluna única — a partir "
      + "da segunda gravação do dia isso vira 23505, em silêncio:\n" + problemas.join("\n"),
    ).toEqual([]);
  });

  it("a síntese do Cérebro resolve por slug", () => {
    // O caso concreto do achado.
    const fonte = readFileSync(join(PYTHON, "cerebro_synthesizer.py"), "utf-8");
    expect(fonte).toContain("cerebro_analyses?on_conflict=slug");
  });
});
