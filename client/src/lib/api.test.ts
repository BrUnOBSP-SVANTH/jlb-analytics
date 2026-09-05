import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Teste ESTRUTURAL: toda rota que exige conta precisa ser chamada com `apiFetch`.
 *
 * O bug real (05/09): o usuário logava, ia usar a IA, e o site pedia login de
 * novo — sem parar. A sessão estava salva; o que faltava era o cabeçalho
 * `Authorization` na chamada. Sete das nove chamadas de IA usavam `fetch` puro,
 * então o servidor as via como anônimas e devolvia 401.
 *
 * Corrigir as sete não bastava: bastaria a próxima tela usar `fetch` de novo
 * para o bug voltar, e o sintoma (um pedido de login que não acaba) não parece
 * um bug de cabeçalho — parece sessão quebrada, e manda quem investiga para o
 * lugar errado. Por isso o teste LÊ AS ROTAS DO SERVIDOR: uma rota protegida
 * nova já entra coberta, sem ninguém precisar lembrar de atualizar a lista.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** As rotas de IA que o servidor protege com o middleware de conta+cota. */
function rotasProtegidas(): string[] {
  const src = readFileSync(join(RAIZ, "server", "routes", "ai.ts"), "utf-8");
  // `[\s\S]{0,120}?` e não `[^)]*?`: entre a rota e o middleware costuma haver um
  // `ipLimit("x", 10, 60_000)` — que tem parêntese e cortaria a busca cedo demais,
  // deixando metade das rotas protegidas fora do teste sem ninguém notar.
  return [...src.matchAll(/router\.(?:post|get)\(\s*"([^"]+)"[\s\S]{0,120}?aiCreditsMiddleware/g)]
    .map((m) => `/api/ai${m[1]}`);
}

function arquivosDoCliente(dir: string, saida: string[] = []): string[] {
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) arquivosDoCliente(caminho, saida);
    else if (/\.tsx?$/.test(entrada) && !/\.test\.tsx?$/.test(entrada)) saida.push(caminho);
  }
  return saida;
}

describe("chamadas a rotas que exigem conta", () => {
  it("o servidor realmente protege rotas de IA (o teste teria virado enfeite se não)", () => {
    expect(rotasProtegidas().length).toBeGreaterThanOrEqual(8);
  });

  it("nenhuma usa `fetch` puro — todas passam por apiFetch", () => {
    const protegidas = rotasProtegidas();
    const infratores: string[] = [];

    for (const arquivo of arquivosDoCliente(join(RAIZ, "client", "src"))) {
      const src = readFileSync(arquivo, "utf-8");
      // `fetch(` não precedido de `api` — o \b não basta, "apiFetch(" contém "Fetch(".
      for (const m of src.matchAll(/(?<!api)\bfetch\(\s*[`"]([^`"]+)[`"]/g)) {
        const url = m[1];
        if (!protegidas.some((r) => url.startsWith(r))) continue;
        // Escape válido: o arquivo monta o cabeçalho na mão (ChatPanel faz isso
        // porque já tem a sessão em mãos para o streaming).
        const trecho = src.slice(m.index ?? 0, (m.index ?? 0) + 450);
        if (trecho.includes("Authorization")) continue;
        infratores.push(`${relative(RAIZ, arquivo)} → ${url}`);
      }
    }

    expect(
      infratores,
      `estas chamadas vão SEM identificação e o servidor vai responder 401 `
      + `(sintoma: pedido de login que não acaba). Troque \`fetch\` por \`apiFetch\` de @/lib/api:\n`
      + infratores.join("\n"),
    ).toEqual([]);
  });
});
