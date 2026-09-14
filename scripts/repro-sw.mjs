/**
 * Reproduz o service worker servindo um site congelado.
 *
 * POR QUE ESTE ROTEIRO EXISTE. Todo teste de navegador deste repositório abre um
 * contexto NOVO — varredura, screenshots, e2e. Contexto novo não tem service
 * worker registrado, então nenhum deles jamais viu o defeito que deixou o site
 * impossível de usar: a varredura dava 27/27 telas limpas enquanto o fundador
 * olhava uma tela branca.
 *
 * O que ele faz, que nenhum outro faz: usa um PERFIL PERSISTENTE, deixa o SW
 * assumir o controle, REFAZ O BUILD (que troca os hashes dos arquivos, como um
 * deploy faz) e recarrega SEM limpar nada. É a sequência exata que o usuário
 * vive.
 *
 *   node scripts/repro-sw.mjs            → contra localhost:3001
 *   node scripts/repro-sw.mjs <url>      → contra outra origem (sem refazer build)
 *
 * Saída: PASSOU se a página monta depois do "deploy", FALHOU se fica em branco.
 */
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3001";
const REFAZER_BUILD = !process.argv[2];
const perfil = mkdtempSync(join(tmpdir(), "jlb-sw-"));

/** Arquivo mexido para forçar um hash novo. Fica no grafo inicial de toda rota. */
const ARQUIVO_MARCA = "client/src/main.tsx";
/** Conteúdo original, restaurado no `finally` mesmo se o roteiro morrer. */
let original = null;

/** A página montou? Título estático + #root vazio = o shell congelado. */
async function estado(p) {
  return p.evaluate(() => ({
    filhosDoRoot: document.getElementById("root")?.children.length ?? 0,
    titulo: document.title,
    controlado: !!navigator.serviceWorker?.controller,
    texto: (document.body?.innerText ?? "").trim().length,
    // Qual bundle a página REALMENTE carregou (o que o SW entregou).
    script: [...document.querySelectorAll("script[src]")].map((s) => s.getAttribute("src")).find((s) => s?.includes("index-")) ?? null,
  }));
}

/**
 * Qual bundle o SERVIDOR está entregando agora. Buscado por fora do navegador,
 * então nenhum service worker pode mentir aqui.
 *
 * Comparar os dois é o teste que importa: montar a tela não basta, porque o SW
 * cacheia o HTML E os assets — o site abre bonito rodando código de semanas
 * atrás, e nenhum conserto publicado chega ao usuário.
 */
async function scriptNoServidor() {
  const html = await (await fetch(BASE + "/", { headers: { "Cache-Control": "no-cache" } })).text();
  return html.match(/src="([^"]*index-[^"]*\.js)"/)?.[1] ?? null;
}

let ctx;
try {
  ctx = await chromium.launchPersistentContext(perfil, { viewport: { width: 1280, height: 900 } });
  const p = ctx.pages()[0] ?? await ctx.newPage();
  const erros = [];
  p.on("console", (m) => { if (m.type() === "error") erros.push(m.text().slice(0, 160)); });
  p.on("requestfailed", (r) => erros.push(`FALHOU ${r.url().slice(-60)}`));
  p.on("response", (r) => { if (r.status() === 404) erros.push(`404 ${r.url().slice(-60)}`); });

  // ── 1. Primeira visita: o SW instala e assume ───────────────────────────
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await p.waitForFunction(() => !!navigator.serviceWorker?.controller, { timeout: 20_000 })
    .catch(() => console.log("  (aviso: o SW não assumiu o controle em 20s)"));
  await p.waitForTimeout(2500);
  const antes = await estado(p);
  console.log("1) primeira visita  :", JSON.stringify(antes));
  // Sem SW no controle o teste não prova nada — passaria por ausência. Aborta.
  if (!antes.controlado) {
    console.log("\nINVÁLIDO — o service worker não assumiu a página. Build de produção? (NODE_ENV=production npx vite build)");
    process.exitCode = 2;
    throw new Error("sem-sw");
  }

  // ── 2. "Deploy": o build troca os hashes dos arquivos ───────────────────
  if (REFAZER_BUILD) {
    // O hash do Vite vem do CONTEÚDO: rebuild sem mudança gera o mesmo nome.
    // Mexemos de verdade num arquivo do grafo inicial, e desfazemos no `finally`.
    console.log("2) mudando o fonte e refazendo o build (como um deploy de verdade)...");
    original = readFileSync(ARQUIVO_MARCA, "utf-8");
    // ⚠️ Comentário NÃO serve: o minificador o remove, o bundle sai byte a byte
    // igual e o hash não muda — a primeira versão passava sem ter simulado deploy
    // nenhum. Atribuir a um global tem efeito colateral e sobrevive à minificação.
    writeFileSync(ARQUIVO_MARCA, original + `\nwindow.__REPRO_BUILD = "${Date.now()}";\n`);
    // NODE_ENV=production EXPLÍCITO: o `.env` local traz NODE_ENV=development, o
    // Vite o carrega no build e gera React de DESENVOLVIMENTO — onde
    // `import.meta.env.PROD` é false e o SW nem é registrado. O teste passaria
    // por não haver SW, e não por o SW estar certo. (Variável do ambiente vence
    // a do `.env` no Vite.)
    execSync("npx vite build", { stdio: "ignore", env: { ...process.env, NODE_ENV: "production" } });
  } else {
    console.log("2) (pulado — alvo externo, use depois de um deploy real)");
  }

  // ── 3. Recarrega SEM limpar nada. É aqui que o usuário quebra ───────────
  erros.length = 0;
  await p.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await p.waitForTimeout(4000);
  const depois = await estado(p);
  const noServidor = await scriptNoServidor();
  console.log("3) depois do deploy :", JSON.stringify(depois));
  console.log("   servidor entrega  :", noServidor);
  if (erros.length) console.log("   erros:", erros.slice(0, 4));

  const montou = depois.filhosDoRoot > 0 && depois.texto > 120;
  const atual = !noServidor || !depois.script || depois.script.endsWith(noServidor) || noServidor.endsWith(depois.script);

  if (!montou) console.log("\nFALHOU — tela branca: o service worker serviu um shell quebrado.");
  else if (!atual) console.log(`\nFALHOU — a tela monta, mas com o build ANTIGO.\n         navegador: ${depois.script}\n         servidor : ${noServidor}\n         Nenhuma correção publicada chega a este usuário.`);
  else console.log("\nPASSOU — a página monta e está rodando o build atual.");
  process.exitCode = montou && atual ? 0 : 1;
} catch (e) {
  if (e?.message !== "sem-sw") throw e;
} finally {
  if (original !== null) writeFileSync(ARQUIVO_MARCA, original);
  await ctx?.close();
  // No Windows o Chrome ainda segura chrome_debug.log por um instante depois do
  // close, e o EBUSY derrubava o processo MASCARANDO o resultado do teste.
  try { rmSync(perfil, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); }
  catch { /* perfil temporário: o sistema limpa depois */ }
}
