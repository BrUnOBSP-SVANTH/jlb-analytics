import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NIVEIS, nivelPorNumero, rotuloDoNivel } from "./niveis.ts";

/**
 * O mesmo nível não pode ter nomes diferentes em telas diferentes.
 *
 * O QUE A AUDITORIA DE 21/09 ACHOU (TXT-02): o Nível 4 era "Vieses" na home,
 * na busca e no menu; "Psicologia" no rodapé; e "Vieses e Psicologia" no
 * dashboard, no /educacao e na navegação entre níveis. O Nível 2 era "Leitura
 * de Dados" ou "Dados"; o 3, "Modelos Básicos" ou "Modelos"; o 5, "Análise
 * Integrada" ou "Integrado".
 *
 * Quem clica em "Psicologia" no rodapé e chega numa página chamada "Vieses e
 * Psicologia" não sabe se errou o caminho. Numa trilha de aprendizagem o nome
 * do que se estuda é parte do conteúdo — é a âncora entre uma sessão e a
 * seguinte.
 */
const CLIENTE = join(dirname(fileURLToPath(import.meta.url)), "..", "client", "src");

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida);
    else if (/\.tsx?$/.test(nome) && !nome.includes(".test.")) saida.push(caminho);
  }
  return saida;
}

/** Sem comentários: eles CITAM os nomes antigos para explicar o conserto. */
const semComentarios = (texto: string) =>
  texto.replace(/\/\*[\s\S]*?\*\//g, " ")
    .split(/\r?\n/).map((l) => l.replace(/^\s*\/\/.*$/, " ")).join("\n");

describe("os nomes dos níveis são escritos uma vez só", () => {
  it("a tabela tem os cinco, em ordem, sem buraco", () => {
    expect(NIVEIS.map((n) => n.n)).toEqual([1, 2, 3, 4, 5]);
    expect(NIVEIS.every((n) => n.titulo && n.curto && n.resumo)).toBe(true);
  });

  it("o nome curto é o completo TRUNCADO, nunca um sinônimo", () => {
    // Foi assim que "Psicologia" nasceu: alguém precisou de algo curto e
    // escolheu outra palavra do título em vez da primeira.
    for (const nv of NIVEIS) {
      expect(nv.titulo.toLowerCase(), `nível ${nv.n}`).toContain(nv.curto.toLowerCase());
    }
  });

  it("o rótulo sai no formato que as listas usam", () => {
    expect(rotuloDoNivel(4)).toBe("Nível 4 — Vieses e Psicologia");
    expect(rotuloDoNivel(4, true)).toBe("Nível 4 — Vieses");
    // Número fora da trilha não inventa nível:
    expect(nivelPorNumero(9)).toBeUndefined();
    expect(rotuloDoNivel(9)).toBe("Nível 9");
  });

  it("🔴 nenhuma tela escreve 'Nível N — <nome>' na mão", () => {
    // É o padrão que produziu as divergências: cada lista escrevia o seu.
    const infratores: string[] = [];
    for (const caminho of arquivos(CLIENTE)) {
      const texto = semComentarios(readFileSync(caminho, "utf-8"));
      for (const m of texto.matchAll(/["'`]Nível\s+([1-5])\s+—\s+([^"'`]+)["'`]/g)) {
        infratores.push(`${caminho.replace(CLIENTE, "")}: "Nível ${m[1]} — ${m[2]}"`);
      }
    }
    expect(
      infratores,
      "nome de nível escrito à mão — use `rotuloDoNivel()` de shared/niveis.ts:\n" + infratores.join("\n"),
    ).toEqual([]);
  });

  it("🔴 nenhuma tela usa um nome de nível que a fonte única não conhece", () => {
    // Pega o caso mais sorrateiro: a lista continua na tela, mas com o nome
    // trocado ("Psicologia" em vez de "Vieses e Psicologia").
    const conhecidos = new Set(NIVEIS.flatMap((n) => [n.titulo.toLowerCase(), n.curto.toLowerCase()]));
    const suspeitos = ["psicologia", "integrado", "vieses", "dados", "modelos"];
    const infratores: string[] = [];
    for (const caminho of arquivos(CLIENTE)) {
      const texto = semComentarios(readFileSync(caminho, "utf-8"));
      for (const m of texto.matchAll(/title:\s*["']([^"']+)["'],\s*href:\s*["']\/nivel\/([1-5])["']/g)) {
        const [, titulo, n] = m;
        const esperado = nivelPorNumero(Number(n))!.titulo;
        if (titulo !== esperado && suspeitos.some((s) => titulo.toLowerCase().includes(s))) {
          infratores.push(`${caminho.replace(CLIENTE, "")}: nível ${n} como "${titulo}" (é "${esperado}")`);
        }
      }
    }
    void conhecidos;
    expect(infratores, infratores.join("\n")).toEqual([]);
  });
});
