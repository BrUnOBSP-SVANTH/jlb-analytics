import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A regra que este teste existe para verificar sozinho.
 *
 * `limpezaStorage.ts` apaga chaves antigas do navegador a cada carga do site,
 * em `main.tsx`, ANTES do React montar. A lista só pode conter nomes que
 * ninguém mais lê — o próprio arquivo diz isso: "apagar dado que alguém ainda
 * lê é bem pior que deixar lixo".
 *
 * Confiar no comentário não bastou. `jlb_calibration_history_v1` entrou na
 * lista com uma justificativa que parecia boa (migrou para o servidor), mas o
 * Dashboard mantinha a série local de propósito para quem não está logado. O
 * resultado: o snapshot era gravado e apagado na abertura seguinte, e o gráfico
 * de calibração de visitante nunca teve dado. Nada quebrava.
 *
 * O defeito é invisível por natureza — não dá erro, não falha requisição, não
 * aparece em varredura. Só um teste que cruza a lista com o código-fonte pega.
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

function arquivos(dir = SRC, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) { arquivos(caminho, saida); continue; }
    if (/\.(ts|tsx)$/.test(nome) && !nome.endsWith(".test.ts") && !nome.endsWith(".test.tsx")) {
      saida.push(caminho);
    }
  }
  return saida;
}

/** Comentário fora antes de casar padrão: o comentário que EXPLICA a correção
 *  cita o nome da chave, e sem isto o teste acusaria a própria documentação. */
const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const FONTE = join(SRC, "lib", "limpezaStorage.ts");

/** Os nomes entre aspas dentro do array OBSOLETAS. */
function chavesObsoletas(): string[] {
  const texto = semComentarios(readFileSync(FONTE, "utf-8"));
  const bloco = texto.match(/const OBSOLETAS\s*=\s*\[([\s\S]*?)\]/);
  if (!bloco) throw new Error("não achei o array OBSOLETAS em limpezaStorage.ts");
  return [...bloco[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("limpezaStorage", () => {
  const obsoletas = chavesObsoletas();

  it("a lista não está vazia nem virou curinga", () => {
    expect(obsoletas.length).toBeGreaterThan(0);
    for (const c of obsoletas) expect(c).not.toMatch(/[*?]/);
  });

  it.each(obsoletas)("ninguém mais lê nem escreve `%s`", (chave) => {
    const vivos: string[] = [];
    for (const f of arquivos()) {
      if (f === FONTE) continue;                       // a própria lista não conta
      if (semComentarios(readFileSync(f, "utf-8")).includes(`"${chave}"`)) {
        vivos.push(relative(SRC, f));
      }
    }
    expect(
      vivos,
      `A chave "${chave}" está na lista de apagar, mas ainda é usada em: ${vivos.join(", ")}. ` +
      `Ou tire-a da lista, ou migre quem a usa ANTES de apagá-la.`,
    ).toEqual([]);
  });
});
