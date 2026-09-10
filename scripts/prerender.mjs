/**
 * prerender.mjs — snapshots HTML das rotas estáticas para SEO (dynamic rendering).
 *
 * Crawlers sem JS (Bing, redes sociais, LLMs de busca) hoje veem um <div> vazio.
 * Este script sobe o build de produção, renderiza cada rota no Chromium do
 * Playwright e salva o HTML completo em prerendered/ — o Express serve esses
 * snapshots APENAS para bots (usuários continuam no SPA normal).
 *
 * Uso: pnpm build && pnpm prerender   (commitar a pasta prerendered/)
 * Rodar de novo quando o conteúdo educacional mudar.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "prerendered");
const PORT = 3312;
const BASE = `http://localhost:${PORT}`;

/**
 * Rotas de conteúdo estável.
 *
 * NEG-03 da auditoria: "links compartilhados no WhatsApp não carregam título nem
 * imagem". O mecanismo existia, mas a lista não tinha justamente as rotas que as
 * pessoas mandam por mensagem — `/track-record` (a prova de valor) e
 * `/imprensa` (a página feita para ser compartilhada). No Brasil, link sem
 * prévia no WhatsApp é praticamente link não clicado.
 *
 * `/backtester` saiu: é rota morta, redireciona para /calculadoras desde que a
 * tela foi retirada. Estava gerando um snapshot de uma página que ninguém abre.
 *
 * As data-heavy (/mercados, /noticias) continuam de fora de propósito: o
 * conteúdo delas muda a cada minuto e o snapshot estaria sempre velho — prévia
 * errada é pior que prévia genérica.
 */
const ROUTES = [
  "/", "/educacao", "/nivel/1", "/nivel/2", "/nivel/3", "/nivel/4", "/nivel/5",
  "/calculadoras", "/simulador", "/previsao",
  "/track-record", "/imprensa", "/leaderboard", "/planos",
  "/sobre", "/termos", "/privacidade",
];

const slug = (route) => (route === "/" ? "index" : route.replace(/^\//, "").replace(/\//g, "-")) + ".html";

const server = spawn("node", ["dist/index.js"], {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), APP_URL: BASE },
  stdio: "ignore",
});

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("servidor não subiu para o prerender");
}

try {
  await waitForServer();
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("  [pageerror]", String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") console.error("  [console]", m.text().slice(0, 200)); });

  for (const route of ROUTES) {
    // domcontentloaded: o WebSocket de cotações mantém a rede ativa p/ sempre —
    // networkidle nunca chega. O waitForSelector é quem garante o conteúdo.
    await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("#root h1, #root h2", { timeout: 15_000 });
    await page.waitForTimeout(400); // estabiliza contadores/efeitos rápidos
    // As meta tags são escritas em tempo de execução por `useSEO.ts`. Como o
    // snapshot é tirado DEPOIS de o React rodar, ele sai com o título, a
    // descrição e o Open Graph daquela rota — que é exatamente o que faltava:
    // antes o crawler recebia a prévia genérica da home para qualquer link.
    const titulo = await page.title();
    const og = await page.evaluate(() =>
      document.head.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "");
    if (og && !og.startsWith(titulo.slice(0, 20))) {
      console.warn(`  ⚠ og:title não acompanhou a rota ${route}: "${og.slice(0, 60)}"`);
    }
    const html = await page.content();
    fs.writeFileSync(path.join(OUT, slug(route)), "<!doctype html>\n" + html.replace(/^<!doctype html>\s*/i, ""), "utf-8");
    console.log(`ok: ${route} → ${slug(route)} (${Math.round(html.length / 1024)}KB) — "${titulo.slice(0, 60)}"`);
  }

  await browser.close();
  console.log(`\n${ROUTES.length} rotas pré-renderizadas.`);
} finally {
  server.kill();
}
