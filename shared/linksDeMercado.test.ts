import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { urlDoEventoPoly, urlDoEventoKalshi, HOME_POLYMARKET, HOME_KALSHI } from "./linksDeMercado.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === "dist") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) arquivos(p, saida);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) saida.push(p);
  }
  return saida;
}

/**
 * O MESMO DEFEITO VOLTOU DUAS VEZES — este arquivo é a terceira tentativa.
 *
 * Em agosto: o link de saída dava "página não encontrada" porque a URL era
 * montada à mão em cinco lugares. Conserto: centralizar no servidor. Verificado
 * 8 de 8 ao vivo.
 *
 * Em 26/09: o fundador reportou de novo. Medido, com slugs que EXISTEM e estão
 * abertos — `/pt/event/{slug}` dava 404 em 8 de 8, `/event/{slug}` dava 200 em
 * 8 de 8. O Polymarket tinha removido as rotas de idioma, e o teste de unidade
 * que "provava" o conserto de agosto continuou verde o tempo todo: ele prendia
 * o formato que NÓS escrevíamos.
 *
 * Duas coisas viraram regra, e são o que estes testes cobram:
 *  · ninguém escreve o endereço de uma plataforma fora deste módulo — da última
 *    vez ele estava em seis arquivos, e as cópias do cliente ficaram para trás;
 *  · formato de URL de terceiro é DADO EXTERNO. Quem confere de verdade é o
 *    `pnpm doctor`, que abre uma amostra dos links a cada rodada. Teste de
 *    unidade não percebe que o mundo mudou.
 */
describe("o endereço de saída mora num lugar só", () => {
  it("🔴 nenhum arquivo escreve polymarket.com ou kalshi.com à mão", () => {
    const foraDoModulo: string[] = [];
    for (const f of arquivos(join(RAIZ, "client", "src")).concat(arquivos(join(RAIZ, "server")))) {
      const conteudo = readFileSync(f, "utf-8");
      // A API (gamma-api, api.elections) é outra coisa: é de onde o dado vem,
      // não para onde a pessoa vai.
      const semApi = conteudo.replace(/https:\/\/(gamma-api|clob)\.polymarket\.com[^"'`\s]*/g, "")
                             .replace(/https:\/\/api\.elections\.kalshi\.com[^"'`\s]*/g, "");
      if (/https:\/\/(www\.)?(polymarket|kalshi)\.com/.test(semApi)) {
        foraDoModulo.push(relative(RAIZ, f).replace(/\\/g, "/"));
      }
    }
    expect(foraDoModulo).toEqual([]);
  });

  it("🔴 o Polymarket não tem prefixo de idioma", () => {
    // Era `/pt/event/`. Virou 404 quando eles removeram as rotas de idioma — e
    // até a home `/pt` sumiu (conferido: 404).
    expect(urlDoEventoPoly("brazil-presidential-election")).toBe("https://polymarket.com/event/brazil-presidential-election");
    expect(HOME_POLYMARKET).toBe("https://polymarket.com");
    expect(urlDoEventoPoly("x")).not.toContain("/pt/");
    expect(HOME_POLYMARKET).not.toContain("/pt");
  });

  it("sem slug não há link — não se expõe uma página 404", () => {
    expect(urlDoEventoPoly(undefined)).toBeUndefined();
    expect(urlDoEventoPoly("")).toBeUndefined();
    expect(urlDoEventoPoly("   ")).toBeUndefined();
  });

  it("⚠️ o Kalshi vai em MINÚSCULAS — maiúscula dá 404", () => {
    expect(urlDoEventoKalshi("KXGOVWINOMD", "KXGOVWINOMD-26"))
      .toBe("https://kalshi.com/markets/kxgovwinomd/kxgovwinomd-26");
    expect(urlDoEventoKalshi("", "x")).toBeUndefined();
    expect(urlDoEventoKalshi("x", undefined)).toBeUndefined();
    expect(HOME_KALSHI).toBe("https://kalshi.com");
  });
});

describe("o link não sobrevive ao próprio conserto dentro do cache", () => {
  it("🔴 a cópia guardada tem o endereço RECALCULADO ao ser servida", () => {
    /**
     * Descoberto ao consertar isto: a rota, quando serve a cópia do banco,
     * entregava o `externalUrl` que estava gravado nela — ou seja, o endereço
     * velho continuava saindo por até seis horas DEPOIS de o conserto entrar.
     *
     * Vale para todo valor derivado guardado em cache: o dado bruto envelhece
     * devagar, a regra que o transforma muda de uma vez. Guarda-se o dado; a
     * apresentação se refaz na leitura.
     */
    const rota = readFileSync(join(RAIZ, "server/routes/polymarket.ts"), "utf-8");
    // Âncora no CÓDIGO, não na frase: `source: "arquivo"` aparece antes num
    // comentário, e a primeira versão deste teste mediu o comentário.
    const i = rota.indexOf("markets: copia.itens");
    expect(i, "não achei o trecho que serve a cópia").toBeGreaterThan(-1);
    const trecho = rota.slice(i, i + 400);
    expect(trecho).toMatch(/externalUrl: urlDoEventoPoly\(m\.eventSlug\)/);
  });

  it("⚠️ o doctor abre os links de verdade", () => {
    // É a única checagem que percebe uma mudança do outro lado. Sem ela, o
    // defeito volta e todos os testes continuam verdes.
    const doctor = readFileSync(join(RAIZ, "scripts/jlb-doctor.mjs"), "utf-8");
    expect(doctor).toMatch(/async function checkLinksExternos/);
    expect(doctor).toMatch(/NÃO ABREM/);
    // E diz QUAL instância olhou: uma rodada já acusou links "quebrados" que
    // estavam consertados, porque mediu um servidor antigo ainda de pé.
    expect(doctor).toMatch(/auditando \$\{base\}/);
  });
});
