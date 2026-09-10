/**
 * Varredura de telas — `pnpm varredura`
 *
 * Abre TODAS as rotas do site num navegador de verdade e registra o que quebra:
 * erro de JavaScript, promessa rejeitada sem tratamento, requisição que falhou e
 * tela que não renderizou conteúdo.
 *
 * Por que isto acha o que o `pnpm doctor` não acha: o doctor confere invariantes
 * que alguém pensou em conferir (RLS, mercados vencidos, segredos no bundle).
 * Um erro de runtime numa tela que ninguém abriu há semanas não aparece em
 * nenhuma dessas listas — aparece aqui, porque aqui a tela é aberta.
 *
 * Roda contra o servidor local com o build de produção servido por ele.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.JLB_URL ?? "http://localhost:3001";

const ROTAS = [
  "/", "/apostas", "/noticias", "/portfolio", "/previsao", "/briefing",
  "/track-record", "/dashboard", "/perfil", "/leaderboard", "/duelos",
  "/educacao", "/nivel/1", "/nivel/2", "/nivel/3", "/nivel/4", "/nivel/5",
  "/simulador", "/calculadoras", "/sobre", "/imprensa", "/termos",
  "/privacidade", "/login", "/rota-que-nao-existe",
];

/**
 * Ruído conhecido que NÃO é bug do site. Manter a lista curta e justificada:
 * silenciar demais transforma a varredura em teatro.
 */
const IGNORAR = [
  /favicon/i,                              // ícone ausente não quebra nada
  /net::ERR_ABORTED/i,                     // navegação cancelada ao trocar de rota
  /Failed to load resource.*40[13]/i,      // rota que exige login, esperado
  /429/,                                   // cota de IA — já reportada pelo doctor
];
const ehRuido = (t) => IGNORAR.some((r) => r.test(t));

const b = await chromium.launch();
const problemas = [];
let telasOk = 0;

for (const rota of ROTAS) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  const achados = [];

  p.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (!ehRuido(t)) achados.push(`console: ${t.slice(0, 150)}`);
  });
  p.on("pageerror", (e) => achados.push(`ERRO JS: ${String(e.message).slice(0, 150)}`));
  p.on("requestfailed", (r) => {
    const t = `${r.url()} — ${r.failure()?.errorText ?? "?"}`;
    if (!ehRuido(t)) achados.push(`rede: ${t.slice(0, 150)}`);
  });
  p.on("response", (r) => {
    if (r.status() >= 500) achados.push(`HTTP ${r.status()}: ${r.url().slice(0, 120)}`);
  });

  try {
    await p.goto(BASE + rota, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await p.getByText("Pular tour").click({ timeout: 4000 }).catch(() => {});
    // Aceita a medição para não deixar o aviso cobrindo a tela nas checagens.
    await p.getByRole("button", { name: "Aceitar a medição" }).click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(5000);

    // A tela renderizou algo? Página branca não gera erro nenhum e é o pior bug.
    const texto = (await p.evaluate(() => document.body?.innerText ?? "")).trim();
    if (texto.length < 120) achados.push(`TELA VAZIA (${texto.length} caracteres de texto)`);

    /**
     * Acessibilidade estrutural — o que a auditoria de 09/09 chamou de TRV-13 e
     * TRV-05. Nenhum destes derruba a tela, nenhum aparece no console, e todos
     * são invisíveis para quem enxerga:
     *
     *  · CONTEÚDO INVISÍVEL: bloco de texto parado em opacidade baixa. Era o
     *    achado crítico — cards e seções inteiras em ~0,15, um viewport em
     *    branco em cinco rotas.
     *  · SALTO DE TÍTULO: h1 → h3 tira a referência de quem navega por landmark.
     *  · SEM H1: página sem título principal.
     */
    const a11y = await p.evaluate(() => {
      let invisiveis = 0;
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if (parseFloat(cs.opacity) >= 0.9 || cs.display === "none" || cs.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 20) continue;
        if ((el.textContent ?? "").trim().length < 20) continue;
        // Prévia BORRADA de propósito (conteúdo atrás de um nível) não é o
        // defeito que procuramos: ela é desenhada assim, não tem foco nem
        // seleção, e some ao destravar. O defeito é conteúdo que DEVERIA estar
        // visível e não está.
        if (cs.filter.includes("blur") || cs.pointerEvents === "none") continue;
        invisiveis++;
      }
      const hs = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]));
      const saltos = [];
      for (let i = 1; i < hs.length; i++) if (hs[i] - hs[i - 1] > 1) saltos.push(`h${hs[i - 1]}→h${hs[i]}`);
      return { invisiveis, saltos, h1: hs.filter((x) => x === 1).length };
    });
    if (a11y.invisiveis > 0) achados.push(`CONTEÚDO INVISÍVEL: ${a11y.invisiveis} blocos com opacidade baixa`);
    if (a11y.saltos.length > 0) achados.push(`SALTO DE TÍTULO: ${a11y.saltos.join(", ")}`);
    if (a11y.h1 === 0) achados.push("SEM H1: a página não tem título principal");
  } catch (e) {
    achados.push(`não carregou: ${String(e.message).slice(0, 120)}`);
  }

  await ctx.close();

  if (achados.length === 0) {
    telasOk++;
    process.stdout.write(`  ok  ${rota}\n`);
  } else {
    problemas.push({ rota, achados });
    process.stdout.write(`  !!  ${rota}  (${achados.length})\n`);
  }
}

await b.close();

console.log(`\n${telasOk}/${ROTAS.length} telas limpas`);
if (problemas.length > 0) {
  console.log(`\n═══ ${problemas.length} TELAS COM PROBLEMA ═══`);
  for (const { rota, achados } of problemas) {
    console.log(`\n${rota}`);
    for (const a of [...new Set(achados)].slice(0, 6)) console.log(`  · ${a}`);
  }
  process.exitCode = 1;
}
