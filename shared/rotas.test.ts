import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ROTAS_PUBLICAS, ROTAS_PRIVADAS, APELIDOS, destinoDoApelido, rotaExiste, sitemapXml } from "./rotas.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf-8");
const semComentarios = (t: string) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

describe("destinoDoApelido e rotaExiste", () => {
  it("apelido vai para o endereço atual, inclusive o detalhe do mercado", () => {
    expect(destinoDoApelido("/apostas")).toBe("/mercados");
    expect(destinoDoApelido("/premium/")).toBe("/planos");
    expect(destinoDoApelido("/apostas/poly-123")).toBe("/mercados/poly-123");
    expect(destinoDoApelido("/mercados")).toBeNull();
    expect(destinoDoApelido("/toString")).toBeNull(); // chave herdada de Object
  });

  it("o soft-404: arquivo e caminho inventado não são rotas", () => {
    for (const p of ["/favicon.ico", "/arquivo-que-nao-existe.png", "/service-worker.js", "/rota-inexistente-xyz", "/mercados/a/b"]) {
      expect(rotaExiste(p)).toBe(false);
    }
    for (const p of ["/", "/mercados", "/mercados/poly-3212185", "/track-record/", "/dashboard", "/duelos"]) {
      expect(rotaExiste(p)).toBe(true);
    }
  });

  it("todo apelido aponta para uma rota que existe, e nenhum é rota ele mesmo", () => {
    for (const [de, para] of Object.entries(APELIDOS)) {
      expect(rotaExiste(para)).toBe(true);
      expect(rotaExiste(de)).toBe(false);
    }
  });
});

describe("roteador, sitemap e manifest leem a mesma tabela", () => {
  it("toda rota da tabela tem <Route> no App.tsx, e todo <Route> fixo está na tabela", () => {
    const app = semComentarios(ler("client/src/App.tsx"));
    const noApp = new Set(Array.from(app.matchAll(/<Route\s+path="([^"]+)"/g), (m) => m[1]));
    const tabela = [...ROTAS_PUBLICAS.map((r) => r.caminho), ...ROTAS_PRIVADAS];
    for (const caminho of tabela) expect(noApp, `${caminho} sem <Route> no App.tsx`).toContain(caminho);

    const permitidosForaDaTabela = new Set(["/mercados/:id", "/apostas/:id", "/404"]);
    for (const caminho of noApp) {
      if (permitidosForaDaTabela.has(caminho)) continue;
      expect(tabela, `<Route path="${caminho}"> não está em shared/rotas.ts`).toContain(caminho);
    }
  });

  it("os apelidos não são mais window.location.replace", () => {
    // Recarregava o site inteiro a cada link antigo (item 12).
    expect(semComentarios(ler("client/src/App.tsx"))).not.toMatch(/window\.location\.replace/);
  });

  it("client/public/sitemap.xml é o gerado pela tabela (rode `pnpm sitemap`)", () => {
    expect(ler("client/public/sitemap.xml").replace(/\r\n/g, "\n")).toBe(sitemapXml());
  });

  it("o sitemap não lista endereço que só redireciona", () => {
    for (const r of ROTAS_PUBLICAS) expect(destinoDoApelido(r.caminho)).toBeNull();
  });

  it("os atalhos do app instalado abrem rotas de verdade", () => {
    const manifest = JSON.parse(ler("client/public/manifest.json")) as { shortcuts?: { url: string }[] };
    for (const s of manifest.shortcuts ?? []) {
      expect(destinoDoApelido(s.url), `${s.url} é apelido`).toBeNull();
      expect(rotaExiste(s.url), `${s.url} não existe`).toBe(true);
    }
  });
});
