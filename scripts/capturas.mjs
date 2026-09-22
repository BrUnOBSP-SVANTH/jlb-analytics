#!/usr/bin/env node
/**
 * pnpm capturas — fotografa as telas em todas as larguras e nos dois temas.
 *
 * POR QUE EXISTE. A `varredura` mede o que QUEBRA (erro de JS, 5xx, texto
 * espremido). Ela não vê o que está certo no código e errado aos olhos: número
 * sem nome, título trocado, card cortado. A auditoria de 21/09 pede prova
 * visual antes e depois de cada lote de tela — e comparar duas pastas de
 * imagens é o jeito honesto de mostrar que a mudança fez o que diz.
 *
 * Uso:
 *   node scripts/capturas.mjs <pasta> [--url http://localhost:3001] [--rotas /,/mercados]
 *
 * O tema vem de `localStorage.jlb-theme`, lido por /theme-init.js antes da
 * primeira pintura — por isso é gravado ANTES de navegar (addInitScript).
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const pasta = args[0];
if (!pasta) { console.error("uso: node scripts/capturas.mjs <pasta> [--url …] [--rotas …]"); process.exit(1); }
const valor = (nome, padrao) => {
  const i = args.indexOf(nome);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};

const BASE = valor("--url", process.env.JLB_URL ?? "http://localhost:3001").replace(/\/$/, "");
const ROTAS = valor("--rotas", "/,/mercados,/noticias,/track-record,/previsao,/educacao,/planos,/dashboard").split(",");
const LARGURAS = valor("--larguras", "360,390,768,1150,1440").split(",").map(Number);
const TEMAS = ["dark", "light"];

const navegador = await chromium.launch();
let n = 0;

for (const tema of TEMAS) {
  const ctx = await navegador.newContext({ locale: "pt-BR", serviceWorkers: "block" });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("jlb-theme", t);
      localStorage.setItem("jlb_onboarding_v3", "done");   // o tour cobriria a tela
      localStorage.setItem("jlb_consentimento_v1", "essencial"); // não polui a telemetria
    } catch { /* aba privada */ }
  }, tema);
  const page = await ctx.newPage();

  for (const largura of LARGURAS) {
    await page.setViewportSize({ width: largura, height: Math.round(largura * 1.9) });
    for (const rota of ROTAS) {
      const destino = join(pasta, tema, String(largura));
      mkdirSync(destino, { recursive: true });
      const nome = (rota === "/" ? "home" : rota.replace(/^\//, "").replace(/\//g, "-")) + ".png";
      try {
        await page.goto(BASE + rota, { waitUntil: "domcontentloaded", timeout: 60_000 });
        // Dá tempo do conteúdo que vem de API aparecer — é ele que a auditoria olha.
        await page.waitForTimeout(3500);
        await page.screenshot({ path: join(destino, nome), fullPage: false });
        n++;
      } catch (e) {
        console.log(`⚠️  ${tema}/${largura}${rota}: ${String(e.message).split("\n")[0].slice(0, 80)}`);
      }
    }
    process.stdout.write(`  ${tema} ${largura}px ✓\n`);
  }
  await ctx.close();
}

await navegador.close();
console.log(`\n${n} capturas em ${pasta}`);
