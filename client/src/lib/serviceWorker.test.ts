import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * As regras do `client/public/sw.js`, verificadas no fonte.
 *
 * O arquivo mora em `client/public/`, fora do glob do vitest, e é JavaScript
 * servido cru — por isso o teste mora aqui e LÊ o arquivo. O comportamento real
 * no navegador está em `e2e/service-worker.spec.ts`; este aqui existe para
 * quebrar na hora do `pnpm test`, antes de qualquer build.
 *
 * O defeito que ele impede de voltar: o SW servia o HTML do cache com um nome de
 * cache que nunca mudava. Depois de um deploy o navegador seguia rodando o build
 * antigo, e nenhuma correção publicada chegava a quem já tinha visitado — foi o
 * que manteve o login quebrado para o fundador depois de consertado.
 */

const SW = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "sw.js"),
  "utf-8",
);

/** Comentário fora: o cabeçalho do sw.js CITA o código antigo para explicá-lo. */
const codigo = SW.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

describe("service worker", () => {
  it("navegação (o HTML) vai sempre à rede", () => {
    expect(codigo).toMatch(/request\.mode\s*===\s*["']navigate["']\s*\)\s*return/);
  });

  it("não pré-cacheia a raiz — era a linha que congelava a home", () => {
    expect(codigo).not.toMatch(/cache\.addAll\(/);
    expect(codigo).not.toMatch(/STATIC_ASSETS/);
  });

  it("só intercepta /assets/, que tem hash no nome e nunca muda", () => {
    expect(codigo).toMatch(/if\s*\(\s*!url\.pathname\.startsWith\(["']\/assets\/["']\)\s*\)\s*return/);
  });

  it("não guarda /api/ — resposta autenticada não pode ir para o cache", () => {
    expect(codigo).not.toMatch(/["']\/api\/["']/);
  });

  it("só guarda resposta ok — a versão antiga guardava 404", () => {
    expect(codigo).toMatch(/if\s*\(\s*\w+\.ok\s*\)\s*cache\.put/);
  });

  it("o nome do cache nunca volta a ser o envenenado", () => {
    const nome = codigo.match(/const CACHE_NAME\s*=\s*["']([^"']+)["']/)?.[1];
    expect(nome).toBeDefined();
    // O `activate` apaga todo cache de nome DIFERENTE. Reusar "jlb-v1" deixaria
    // o cache antigo vivo em quem já visitou o site — a auto-cura depende disto.
    expect(nome).not.toBe("jlb-v1");
  });

  it("o activate apaga os caches de outras versões", () => {
    expect(codigo).toMatch(/keys\.filter\(\(k\)\s*=>\s*k\s*!==\s*CACHE_NAME\)/);
    expect(codigo).toMatch(/caches\.delete/);
  });

  it("os alertas de watchlist (Web Push) continuam aqui", () => {
    // O SW não pode sumir por inteiro: usePushNotifications depende dele.
    expect(codigo).toMatch(/addEventListener\(["']push["']/);
    expect(codigo).toMatch(/addEventListener\(["']notificationclick["']/);
  });
});
