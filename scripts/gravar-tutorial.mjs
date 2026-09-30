/**
 * gravar-tutorial.mjs — filma o site REAL ensinando a usá-lo.
 *
 * POR QUE FILMAR EM VEZ DE GRAVAR A TELA NA MÃO. Um tutorial gravado à mão
 * morre na primeira mudança de layout, e o sintoma é cruel: o vídeo continua
 * no ar ensinando a clicar num botão que não existe mais. Em 27/09/2026 o
 * cabeçalho das 22 telas foi reescrito de uma vez — um vídeo da véspera já
 * estaria errado, e ninguém reassiste o próprio tutorial para descobrir.
 *
 * Aqui o Chromium do Playwright dirige o site de verdade, contra dados de
 * verdade, seguindo as cenas de `cenasDoTutorial.ts`. Mudou a tela? `pnpm
 * tutorial` de novo e o filme está correto outra vez.
 *
 * O QUE O PLAYWRIGHT NÃO FAZ, e por isso tem código aqui:
 *
 *   · ele NÃO grava o cursor do mouse — o vídeo sairia com elementos reagindo
 *     sozinhos, sem nada apontando para eles. Por isso o ponteiro e o efeito de
 *     clique são desenhados dentro da página (`ENCENACAO`);
 *   · ele NÃO grava áudio. O vídeo sai mudo, com a legenda de cada cena na
 *     tela; a narração é gravada por cima, seguindo os tempos do TUTORIAL.md.
 *
 * Uso: pnpm build && pnpm tutorial
 * Cenas com `precisaConta` só filmam a tela de dentro se houver
 * `TUTORIAL_EMAIL` e `TUTORIAL_SENHA` no ambiente — use uma conta de teste,
 * NUNCA a conta real do fundador: o que estiver na tela vai para o vídeo.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { CENAS, roteiroEmMarkdown, segundosDaCena } from "./cenasDoTutorial.ts";
import { processarAudioTutorial, mixarVideoEAudio } from "./processar-audio-tutorial.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = path.join(ROOT, "tutorial-saida");
const PORT = 3313; // 3312 é do prerender — dois scripts na mesma porta se atropelam
const BASE = `http://localhost:${PORT}`;
const LARGURA = 1280;
const ALTURA = 720;

const email = process.env.TUTORIAL_EMAIL?.trim() || "tutorial@jlbanalytics.com.br";
const senha = process.env.TUTORIAL_SENHA?.trim() || "TutorialJLB2026!";
const temConta = Boolean(email && senha);

/**
 * O que é injetado em toda página antes do React subir.
 *
 * As duas primeiras linhas não são enfeite: numa aba nova o tour de onboarding
 * é um `fixed inset-0` que cobre a tela inteira, e o aviso de cookies come o
 * rodapé. Os dois apareceriam em TODAS as cenas do vídeo.
 */
const ENCENACAO = `
  try {
    localStorage.setItem("jlb_onboarding_v3", "done");
    localStorage.setItem("jlb_consentimento_v1", "essencial");
  } catch (e) { /* modo privado — segue sem */ }

  window.addEventListener("DOMContentLoaded", () => {
    const estilo = document.createElement("style");
    estilo.textContent = \`
      #jlb-ponteiro {
        position: fixed; z-index: 2147483647; pointer-events: none;
        width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%;
        background: rgba(255,255,255,.92); border: 2px solid rgba(0,0,0,.55);
        box-shadow: 0 2px 10px rgba(0,0,0,.45); transition: transform .08s linear;
        left: -50px; top: -50px;
      }
      #jlb-ponteiro.clicando { transform: scale(.7); }
      .jlb-onda {
        position: fixed; z-index: 2147483646; pointer-events: none;
        width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,.9);
        animation: jlb-onda .55s ease-out forwards;
      }
      @keyframes jlb-onda {
        to { transform: scale(4.5); opacity: 0; }
      }
      #jlb-legenda {
        position: fixed; z-index: 2147483645; pointer-events: none;
        left: 50%; bottom: 28px; transform: translateX(-50%);
        max-width: 78vw; padding: 10px 20px; border-radius: 10px;
        background: rgba(12,10,9,.86); color: #fff;
        font: 500 17px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
        text-align: center; opacity: 0; transition: opacity .35s ease;
        backdrop-filter: blur(6px);
      }
      #jlb-legenda.vendo { opacity: 1; }
    \`;
    document.head.appendChild(estilo);

    const ponteiro = document.createElement("div");
    ponteiro.id = "jlb-ponteiro";
    const legenda = document.createElement("div");
    legenda.id = "jlb-legenda";
    document.body.append(ponteiro, legenda);

    document.addEventListener("mousemove", (e) => {
      ponteiro.style.left = e.clientX + "px";
      ponteiro.style.top = e.clientY + "px";
    }, true);

    document.addEventListener("mousedown", (e) => {
      ponteiro.classList.add("clicando");
      const onda = document.createElement("div");
      onda.className = "jlb-onda";
      onda.style.left = e.clientX + "px";
      onda.style.top = e.clientY + "px";
      document.body.appendChild(onda);
      setTimeout(() => onda.remove(), 600);
    }, true);
    document.addEventListener("mouseup", () => ponteiro.classList.remove("clicando"), true);

    window.__legenda = (texto) => {
      legenda.textContent = texto;
      legenda.classList.toggle("vendo", Boolean(texto));
    };
  });
`;

const nodeArgs = fs.existsSync(path.join(ROOT, ".env"))
  ? ["--env-file=.env", "dist/index.js"]
  : ["dist/index.js"];

const servidor = spawn("node", nodeArgs, {
  cwd: ROOT,
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), APP_URL: BASE },
  stdio: "ignore",
});

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("o servidor não subiu para a gravação (rodou `pnpm build` antes?)");
}

/** Leva o ponteiro até o centro do elemento, devagar o bastante para se ver. */
async function mirar(page, alvo) {
  const caixa = await alvo.boundingBox();
  if (!caixa) throw new Error("elemento sem posição na tela");
  const x = caixa.x + caixa.width / 2;
  const y = caixa.y + caixa.height / 2;
  await page.mouse.move(x, y, { steps: 22 });
  await page.waitForTimeout(280);
  return { x, y, caixa };
}

async function rolarAte(page, fracao) {
  await page.evaluate((f) => {
    const alcance = document.body.scrollHeight - window.innerHeight;
    window.scrollTo({ top: Math.max(0, alcance * f), behavior: "smooth" });
  }, fracao);
  await page.waitForTimeout(1400);
}

/** O primeiro card de mercado da lista — o nome muda toda hora, a posição não. */
async function abrirPrimeiroMercado(page) {
  const card = page.locator('a[href^="/mercados/"]').first();
  await card.waitFor({ state: "visible", timeout: 15_000 });
  await card.scrollIntoViewIfNeeded();
  await mirar(page, card);
  await card.click();
  await page.waitForURL(/\/mercados\/[^/]+$/, { timeout: 15_000 });
  await page.waitForTimeout(1200);
}

async function executarPasso(page, passo) {
  switch (passo.acao) {
    case "esperar":
      return page.waitForTimeout(passo.ms);

    case "rolar":
      return rolarAte(page, passo.ate);

    case "clicar": {
      const alvo = passo.papel === "tab"
        ? page.getByRole("tab", { name: passo.nome })
        : page.getByRole(passo.papel, { name: passo.nome });
      await alvo.first().scrollIntoViewIfNeeded();
      await mirar(page, alvo.first());
      await alvo.first().click();
      return page.waitForTimeout(700);
    }

    case "digitar": {
      const campo = page.getByPlaceholder(new RegExp(passo.campo, "i")).first();
      await mirar(page, campo);
      await campo.click();
      // `delay` é o que faz parecer digitação e não colagem — num tutorial a
      // pessoa precisa ver a letra entrando para saber que o campo é digitável.
      await campo.type(passo.texto, { delay: 90 });
      return page.waitForTimeout(500);
    }

    case "arrastar": {
      const slider = page.getByLabel(passo.campo).first();
      await slider.scrollIntoViewIfNeeded();
      const { caixa } = await mirar(page, slider);
      const destinoX = caixa.x + caixa.width * passo.para;
      const meioY = caixa.y + caixa.height / 2;
      await page.mouse.down();
      await page.mouse.move(destinoX, meioY, { steps: 30 });
      await page.mouse.up();
      return page.waitForTimeout(600);
    }

    case "abrirPrimeiroMercado":
      return abrirPrimeiroMercado(page);

    default:
      throw new Error(`passo desconhecido: ${JSON.stringify(passo)}`);
  }
}

async function entrar(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).first().fill(email);
  await page.getByLabel(/senha/i).first().fill(senha);
  await page.getByRole("button", { name: /entrar/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20_000 });
}

try {
  await esperarServidor();
  fs.rmSync(SAIDA, { recursive: true, force: true });
  fs.mkdirSync(path.join(SAIDA, "storyboard"), { recursive: true });

  const navegador = await chromium.launch();
  const contexto = await navegador.newContext({
    viewport: { width: LARGURA, height: ALTURA },
    recordVideo: { dir: SAIDA, size: { width: LARGURA, height: ALTURA } },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    // As seções do site entram com animação ao aparecer na viewport. Sem isto,
    // o que estiver fora da dobra é filmado em branco — foi a mesma pegadinha
    // dos screenshots da varredura.
    reducedMotion: "reduce",
  });
  await contexto.addInitScript(ENCENACAO);

  const page = await contexto.newPage();
  page.on("pageerror", (e) => console.error("  [erro na página]", String(e).slice(0, 160)));

  let entrou = false;
  if (temConta) {
    try {
      await entrar(page);
      entrou = true;
      console.log("conta de teste: entrou");
    } catch (e) {
      console.warn(`⚠ não consegui entrar (${String(e).slice(0, 80)}) — seguindo como visitante`);
    }
  } else {
    console.log("sem TUTORIAL_EMAIL/TUTORIAL_SENHA — as cenas de conta filmam a tela do visitante");
  }

  const pulados = [];
  for (const cena of CENAS) {
    if (cena.precisaConta && !entrou) pulados.push(cena.id);

    const inicioCena = Date.now();
    await page.goto(BASE + cena.rota, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("#root h1, #root h2", { timeout: 20_000 });
    await page.evaluate((t) => window.__legenda?.(t), cena.legenda);
    await page.waitForTimeout(700);

    for (const passo of cena.passos) {
      try {
        await executarPasso(page, passo);
      } catch (e) {
        // Uma cena que falha não pode derrubar o filme inteiro: o resto continua
        // correto, e o aviso diz exatamente qual trecho vai sair capenga.
        console.warn(`  ⚠ ${cena.id}: passo ${passo.acao} falhou — ${String(e).split("\n")[0].slice(0, 110)}`);
      }
    }

    await page.screenshot({ path: path.join(SAIDA, "storyboard", `${cena.id}.png`) });

    // Segura a cena na tela para que o tempo visual corresponda exatamente à narração
    const duracaoEsperadaMs = segundosDaCena(cena) * 1000;
    const decorrido = Date.now() - inicioCena;
    if (decorrido < duracaoEsperadaMs) {
      await page.waitForTimeout(duracaoEsperadaMs - decorrido);
    }

    await page.evaluate(() => window.__legenda?.(""));
    await page.waitForTimeout(200);
    const duracaoReal = ((Date.now() - inicioCena) / 1000).toFixed(1);
    console.log(`ok: ${cena.id} (${cena.rota}) — duração: ${duracaoReal}s`);
  }

  const video = page.video();
  await contexto.close(); // é o fechamento que finaliza o arquivo de vídeo
  const bruto = await video?.path();
  const brutoDestino = path.join(SAIDA, "tutorial_bruto.webm");
  if (bruto && fs.existsSync(bruto)) {
    fs.renameSync(bruto, brutoDestino);
    const mb = (fs.statSync(brutoDestino).size / 1024 / 1024).toFixed(1);
    console.log(`\nvídeo bruto capturado: ${brutoDestino} (${mb} MB, sem áudio)`);

    // 1. Prepara dados para a síntese de voz
    const cenasComDuracao = CENAS.map((c) => ({
      id: c.id,
      narracao: c.narracao,
      duracaoSegundos: segundosDaCena(c),
    }));

    // 2. Sintetiza a narração neural e alinha os tempos de cada capítulo
    const narracaoWav = await processarAudioTutorial(cenasComDuracao, SAIDA);

    // 3. Muxa a trilha sonora com o vídeo nos dois formatos modernos
    const destinoWebm = path.join(SAIDA, "tutorial.webm");
    const destinoMp4 = path.join(SAIDA, "tutorial.mp4");
    mixarVideoEAudio(brutoDestino, narracaoWav, destinoWebm, destinoMp4);

    // 4. Copia os vídeos finalizados diretamente para client/public do site
    const publicWebm = path.join(ROOT, "client", "public", "tutorial.webm");
    const publicMp4 = path.join(ROOT, "client", "public", "tutorial.mp4");
    fs.copyFileSync(destinoWebm, publicWebm);
    fs.copyFileSync(destinoMp4, publicMp4);
    console.log(`\n🎉 Sucesso! Vídeos com narração sincronizada publicados em client/public/:`);
    console.log(`   - ${publicWebm}`);
    console.log(`   - ${publicMp4}`);
  }
  await navegador.close();

  fs.writeFileSync(path.join(ROOT, "TUTORIAL.md"), roteiroEmMarkdown(), "utf-8");
  console.log(`roteiro: TUTORIAL.md · storyboard: ${path.join(SAIDA, "storyboard")}`);
  if (pulados.length) {
    console.log(`\n⚠ filmadas como visitante (falta conta de teste): ${pulados.join(", ")}`);
  }
} finally {
  servidor.kill();
}
