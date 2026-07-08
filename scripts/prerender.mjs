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

// Rotas de conteúdo estável — as data-heavy (apostas/noticias) ficam de fora:
// o conteúdo delas é vivo e o snapshot estaria sempre velho.
const ROUTES = [
  "/", "/educacao", "/nivel/1", "/nivel/2", "/nivel/3", "/nivel/4", "/nivel/5",
  "/calculadoras", "/simulador", "/backtester", "/previsao",
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
    const html = await page.content();
    fs.writeFileSync(path.join(OUT, slug(route)), "<!doctype html>\n" + html.replace(/^<!doctype html>\s*/i, ""), "utf-8");
    console.log(`ok: ${route} → prerendered/${slug(route)} (${Math.round(html.length / 1024)}KB)`);
  }

  await browser.close();
  console.log(`\n${ROUTES.length} rotas pré-renderizadas.`);
} finally {
  server.kill();
}
