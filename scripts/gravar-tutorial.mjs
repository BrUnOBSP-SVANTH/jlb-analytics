/**
 * gravar-tutorial.mjs — filma o site REAL usando cada função, e confere o resultado.
 *
 * POR QUE FILMAR EM VEZ DE GRAVAR A TELA NA MÃO. Um tutorial gravado à mão
 * morre na primeira mudança de layout, e o sintoma é cruel: o vídeo continua
 * no ar ensinando a clicar num botão que não existe mais. Aqui o Chromium do
 * Playwright dirige o site de verdade, contra dados de verdade, seguindo os
 * filmes de `cenasDoTutorial.ts`. Mudou a tela? `pnpm tutorial` de novo.
 *
 * 🔴 E AGORA ELE TESTA (01/10/2026). Cada `verificar` do roteiro é o resultado
 * que a tela TEM de mostrar depois da ação — "+R$ 20,00", "Margem da casa:
 * 7,44%". Não apareceu no prazo → aquele filme não é produzido, e o relatório
 * do fim diz qual cena e qual passo falharam. A versão anterior engolia o erro
 * com um aviso e seguia gravando: um vídeo mostrando uma função quebrada saía
 * igual a um que funcionava.
 *
 * A primeira rodada provou o ponto: ao apertar "Calcular margem" no Nível 1, a
 * tela dizia "7,44%" e logo abaixo "7.44%" e "R$7.44". A `pnpm varredura` nunca
 * viu, porque o texto só existe depois do clique.
 *
 * O QUE O PLAYWRIGHT NÃO FAZ, e por isso tem código aqui:
 *   · não grava o cursor — o ponteiro e a onda do clique são desenhados na
 *     página (`ENCENACAO`), senão os elementos reagiriam sozinhos;
 *   · não grava áudio — a voz é sintetizada ANTES (processar-audio-tutorial.mjs),
 *     e cada cena dura pelo menos o tempo da própria fala. É isso que mantém a
 *     narração em cima da imagem mesmo quando uma análise de IA demora 40s.
 *
 * Uso:
 *   pnpm build && pnpm tutorial                 → todos os filmes
 *   pnpm tutorial geral trilha                  → só esses
 *   pnpm tutorial geral --sem-audio             → rápido: sem voz (para testar o roteiro)
 *
 * Filmes com `precisaConta` exigem `TUTORIAL_EMAIL` e `TUTORIAL_SENHA` no
 * ambiente (o `.env` é lido). Use uma conta de TESTE, nunca a do fundador: o que
 * estiver na tela vai para o vídeo.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { FILMES, roteiroEmMarkdown, segundosDaCena } from "./cenasDoTutorial.ts";
import { sintetizarNarracoes, montarTrilha, mixarVideoEAudio, converterSemAudio, duracaoDoArquivo } from "./processar-audio-tutorial.mjs";
import { escreverIndiceDoPlayer } from "./indiceDoTutorial.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = path.join(ROOT, "tutorial-saida");
/** Onde os vídeos prontos ficam para o player do site local (fora do Git). */
const PUBLICO = path.join(ROOT, "client", "public", "tutorial");
const PORT = 3313; // 3312 é do prerender — dois scripts na mesma porta se atropelam
const BASE = `http://localhost:${PORT}`;
const LARGURA = 1280;
const ALTURA = 720;

/**
 * 🔴 A SENHA ESTAVA AQUI, EM TEXTO PURO, E FOI PARA O GITHUB PÚBLICO
 * (commit f76ec1c, 30/09/2026), como valor padrão "para funcionar sem
 * configurar". A conta existia e estava ativa. Sem padrão o script diz o que
 * falta e pula o filme — o comportamento certo para ferramenta de
 * desenvolvimento. O pre-commit passou a barrar senha em texto.
 */
const email = process.env.TUTORIAL_EMAIL?.trim();
const senha = process.env.TUTORIAL_SENHA?.trim();
const temConta = Boolean(email && senha);

const args = process.argv.slice(2);
const semAudio = args.includes("--sem-audio");
const pedidos = args.filter((a) => !a.startsWith("--"));
const desconhecidos = pedidos.filter((id) => !FILMES.some((f) => f.id === id));
if (desconhecidos.length) {
  console.error(`filme(s) que não existem: ${desconhecidos.join(", ")}. Existem: ${FILMES.map((f) => f.id).join(", ")}`);
  process.exit(2);
}
const filmesDaVez = pedidos.length ? FILMES.filter((f) => pedidos.includes(f.id)) : FILMES;

/**
 * O que é injetado em toda página antes do React subir.
 *
 * As duas primeiras linhas não são enfeite: numa aba nova o tour de onboarding
 * é um `fixed inset-0` que cobre a tela inteira, e o aviso de cookies come o
 * rodapé. Os dois apareceriam em TODAS as cenas.
 *
 * ⚠️ A legenda é um CARTÃO DE CAPÍTULO que aparece no começo da cena e some. Na
 * versão anterior ela ficava fixa no rodapé o tempo todo e cobria justamente o
 * parágrafo que a narração estava explicando (visível no storyboard da cena da
 * análise de IA). As cores aqui são literais de propósito: este overlay não é o
 * site, é a moldura do vídeo, e precisa ler igual em qualquer tema.
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
      @keyframes jlb-onda { to { transform: scale(4.5); opacity: 0; } }
      #jlb-capitulo {
        position: fixed; z-index: 2147483645; pointer-events: none;
        left: 32px; bottom: 32px; max-width: 46vw;
        padding: 12px 18px 13px; border-radius: 10px;
        background: rgba(15,12,7,.9); color: #f4efe6;
        border-left: 3px solid #dbb155;
        font: 600 18px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
        opacity: 0; transform: translateY(8px);
        transition: opacity .35s ease, transform .35s ease;
      }
      #jlb-capitulo.vendo { opacity: 1; transform: none; }
      .jlb-conferido {
        position: fixed; z-index: 2147483644; pointer-events: none;
        border: 3px solid #4ade80; border-radius: 8px;
        box-shadow: 0 0 0 4px rgba(74,222,128,.22);
        animation: jlb-conferido 1.8s ease forwards;
      }
      @keyframes jlb-conferido { 0% { opacity: 0 } 15% { opacity: 1 } 75% { opacity: 1 } 100% { opacity: 0 } }
    \`;
    document.head.appendChild(estilo);

    const ponteiro = document.createElement("div");
    ponteiro.id = "jlb-ponteiro";
    const capitulo = document.createElement("div");
    capitulo.id = "jlb-capitulo";
    document.body.append(ponteiro, capitulo);

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

    window.__capitulo = (texto) => {
      capitulo.textContent = texto;
      capitulo.classList.add("vendo");
      clearTimeout(window.__capituloTimer);
      window.__capituloTimer = setTimeout(() => capitulo.classList.remove("vendo"), 2800);
    };
    /** Desenha a moldura verde em volta do que foi conferido. */
    window.__conferido = (x, y, w, h) => {
      const m = document.createElement("div");
      m.className = "jlb-conferido";
      Object.assign(m.style, { left: (x - 6) + "px", top: (y - 6) + "px", width: (w + 12) + "px", height: (h + 12) + "px" });
      document.body.appendChild(m);
      setTimeout(() => m.remove(), 1900);
    };
  });
`;

/** Um passo que falhou: carrega a cena e o passo para o relatório. */
class PassoFalhou extends Error {
  constructor(cena, passo, causa) {
    super(`${cena.id} → ${descreverPasso(passo)}: ${String(causa?.message ?? causa).split("\n")[0].slice(0, 160)}`);
    this.name = "PassoFalhou";
  }
}

function descreverPasso(p) {
  switch (p.acao) {
    case "clicar": return `clicar ${p.papel} "${p.nome}"`;
    case "digitar": return `digitar "${p.texto}" em "${p.campo}"${p.indice ? ` [${p.indice}]` : ""}`;
    case "arrastar": return `arrastar "${p.campo}"`;
    case "verificar": return `verificar /${p.texto}/`;
    case "rolarAte": return `rolar até "${p.texto}"`;
    default: return p.acao;
  }
}

// ── servidor ─────────────────────────────────────────────────────────────────
// `--env-file=.env`: sem ele o servidor sobe sem Supabase nem IA, e a gravação
// mostra telas vazias e "fonte não respondeu" no lugar dos dados.
const servidor = spawn("node", [...(fs.existsSync(path.join(ROOT, ".env")) ? ["--env-file=.env"] : []), "dist/index.js"], {
  cwd: ROOT,
  // Sem JLB_TAREFAS: o servidor da gravação NÃO roda os crons. Um servidor local
  // rodando tarefas com as chaves de produção já esgotou a cota de IA do site.
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), APP_URL: BASE, JLB_TAREFAS: "" },
  stdio: "ignore",
});

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("o servidor não subiu para a gravação (rodou `pnpm build` antes?)");
}

// ── ações ────────────────────────────────────────────────────────────────────

/** Leva o ponteiro até o centro do elemento, devagar o bastante para se ver. */
async function mirar(page, alvo) {
  await alvo.scrollIntoViewIfNeeded();
  const caixa = await alvo.boundingBox();
  if (!caixa) throw new Error("elemento sem posição na tela");
  const x = caixa.x + caixa.width / 2;
  const y = caixa.y + caixa.height / 2;
  await page.mouse.move(x, y, { steps: 22 });
  await page.waitForTimeout(260);
  return { x, y, caixa };
}

async function rolarPara(page, fracao) {
  await page.evaluate((f) => {
    const alcance = document.body.scrollHeight - window.innerHeight;
    window.scrollTo({ top: Math.max(0, alcance * f), behavior: "smooth" });
  }, fracao);
  await page.waitForTimeout(1400);
}

/** O primeiro card de mercado da lista — o nome muda toda hora, a posição não. */
async function abrirPrimeiroMercado(page) {
  const card = page.locator('a[href^="/mercados/"]').first();
  // 45s: com o servidor recém-subido o catálogo é montado no primeiro pedido.
  await card.waitFor({ state: "visible", timeout: 45_000 });
  await mirar(page, card);
  await card.click();
  await page.waitForURL(/\/mercados\/[^/]+$/, { timeout: 20_000 });
  await page.waitForTimeout(1200);
}

/** Campo por rótulo; se não houver rótulo com esse texto, por placeholder. */
async function campo(page, rotulo, indice = 0) {
  const porRotulo = page.getByLabel(rotulo);
  if (await porRotulo.count() > indice) return porRotulo.nth(indice);
  return page.getByPlaceholder(rotulo).nth(indice);
}

async function verificar(page, passo) {
  const re = new RegExp(passo.texto, "i");
  const alvo = page.getByText(re).first();
  try {
    await alvo.waitFor({ state: "visible", timeout: passo.prazoMs ?? 15_000 });
  } catch {
    // A mensagem diz o que a tela TINHA — é o que explica a falha sem precisar
    // reabrir o vídeo.
    const tela = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    throw new Error(`não apareceu na tela em ${(passo.prazoMs ?? 15_000) / 1000}s. Início da tela: "${tela.slice(0, 150)}…"`);
  }
  // O que foi conferido TEM de aparecer no vídeo — é a promessa de "mostrar e
  // testar". Na primeira rodada a explicação da checagem do Nível 1 foi achada
  // pelo teste e ficou abaixo da dobra: o teste passou e o vídeo não mostrou o
  // que a narração estava descrevendo. Fora da tela → rola até ele.
  let caixa = await alvo.boundingBox();
  const naTela = (c) => c && c.y >= 60 && c.y + c.height <= ALTURA - 20;
  if (!naTela(caixa)) {
    await alvo.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
    await page.waitForTimeout(1100);
    caixa = await alvo.boundingBox();
  }
  if (caixa) {
    await page.evaluate(({ x, y, width, height }) => window.__conferido?.(x, y, width, height), caixa);
  }
  await page.waitForTimeout(700);
}

async function executarPasso(page, passo) {
  switch (passo.acao) {
    case "esperar":
      return page.waitForTimeout(passo.ms);
    case "rolar":
      return rolarPara(page, passo.ate);
    case "rolarAte": {
      const alvo = page.getByText(new RegExp(passo.texto, "i")).first();
      await alvo.waitFor({ state: "visible", timeout: 20_000 });
      await alvo.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
      return page.waitForTimeout(1300);
    }
    case "clicar": {
      const alvo = page.getByRole(passo.papel, { name: passo.nome, exact: Boolean(passo.exato) }).nth(passo.indice ?? 0);
      await alvo.waitFor({ state: "visible", timeout: 15_000 });
      await mirar(page, alvo);
      await alvo.click();
      return page.waitForTimeout(700);
    }
    case "digitar": {
      const c = await campo(page, passo.campo, passo.indice ?? 0);
      await c.waitFor({ state: "visible", timeout: 15_000 });
      await mirar(page, c);
      await c.click();
      // Seleciona o que estava escrito e digita POR CIMA — é o gesto de quem
      // troca um número, e é o que o vídeo precisa mostrar. (Foi digitando assim
      // que o gravador descobriu, em 01/10/2026, que a calculadora de Valor
      // Esperado não deixava apagar o "55": a digitação virava "5560".)
      await c.press("Control+a");
      // `delay` é o que faz parecer digitação e não colagem — num tutorial a
      // pessoa precisa ver a letra entrando para saber que o campo é digitável.
      await c.pressSequentially(passo.texto, { delay: 90 });
      return page.waitForTimeout(500);
    }
    case "arrastar": {
      const slider = page.getByLabel(passo.campo).first();
      const { caixa } = await mirar(page, slider);
      await page.mouse.down();
      await page.mouse.move(caixa.x + caixa.width * passo.para, caixa.y + caixa.height / 2, { steps: 30 });
      await page.mouse.up();
      return page.waitForTimeout(600);
    }
    case "abrirPrimeiroMercado":
      return abrirPrimeiroMercado(page);
    case "verificar":
      return verificar(page, passo);
    default:
      throw new Error(`passo desconhecido: ${JSON.stringify(passo)}`);
  }
}

/**
 * Entra numa aba SEM gravação e devolve a sessão para os filmes reaproveitarem.
 * Na versão anterior o login acontecia dentro do vídeo: ele abria com a tela de
 * login, e toda a narração ficava atrasada pelos segundos que o login levou.
 */
async function sessaoDaConta(navegador) {
  const ctx = await navegador.newContext({ locale: "pt-BR" });
  await ctx.addInitScript(ENCENACAO);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).first().fill(email);
  await page.getByLabel(/senha/i).first().fill(senha);
  await page.getByRole("button", { name: /entrar/i }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25_000 });
  const estado = await ctx.storageState();
  await ctx.close();
  return estado;
}

/** Grava um filme. Lança `PassoFalhou` no primeiro passo que não der certo. */
async function gravarFilme(navegador, filme, sessao, falas) {
  const dir = path.join(SAIDA, filme.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "storyboard"), { recursive: true });

  const contexto = await navegador.newContext({
    viewport: { width: LARGURA, height: ALTURA },
    recordVideo: { dir, size: { width: LARGURA, height: ALTURA } },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    // As seções entram com animação ao aparecer; sem isto o que está fora da
    // dobra é filmado em branco (a mesma pegadinha dos screenshots da varredura).
    reducedMotion: "reduce",
    ...(sessao ? { storageState: sessao } : {}),
  });
  await contexto.addInitScript(ENCENACAO);
  const page = await contexto.newPage();
  const errosJs = [];
  page.on("pageerror", (e) => errosJs.push(String(e).slice(0, 160)));
  const t0 = Date.now(); // o vídeo começa quando a página nasce

  const tempos = [];
  let falha = null;
  try {
    for (const cena of filme.cenas) {
      const inicio = (Date.now() - t0) / 1000;
      if (!cena.mesmaPagina) {
        await page.goto(BASE + cena.rota, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await page.waitForSelector("#root h1, #root h2", { timeout: 25_000 });
        await page.waitForTimeout(500);
      }
      // A voz entra quando o cartão do capítulo aparece, não quando a navegação
      // começa: o carregamento da página (0,5 a 3 s, conforme a tela) fica em
      // silêncio. Antes a fala começava junto com o clique e chegava antes da tela.
      const voz = (Date.now() - t0) / 1000;
      await page.evaluate((t) => window.__capitulo?.(t), cena.legenda);
      await page.waitForTimeout(600);

      for (const passo of cena.passos) {
        try { await executarPasso(page, passo); }
        catch (e) { throw new PassoFalhou(cena, passo, e); }
      }

      // A cena dura pelo menos o tempo da própria fala (+0,6s de respiro). Sem
      // voz (`--sem-audio`), vale a estimativa.
      const fala = falas?.get(cena.id) ?? segundosDaCena(cena);
      const minimo = voz + fala + 0.6;
      const agora = (Date.now() - t0) / 1000;
      if (agora < minimo) await page.waitForTimeout((minimo - agora) * 1000);

      await page.screenshot({ path: path.join(dir, "storyboard", `${cena.id}.png`) });
      // A capa do player: o FIM da cena que o roteiro escolheu, quando o
      // resultado já foi conferido na tela (ver `capa` em cenasDoTutorial.ts).
      if (cena.id === filme.capa) {
        await page.screenshot({ path: path.join(dir, "capa.jpg"), type: "jpeg", quality: 82 });
      }
      tempos.push({ id: cena.id, inicio, voz });
      console.log(`  ✓ ${cena.id.padEnd(20)} ${(((Date.now() - t0) / 1000) - inicio).toFixed(1)}s`);
    }
  } catch (e) {
    falha = e;
    await page.screenshot({ path: path.join(dir, "FALHOU.png") }).catch(() => {});
  }

  // O vídeo do Playwright só escreve quadro quando a tela muda: na espera final
  // da última cena a página fica parada, e o arquivo saía ~3 s mais curto que
  // o relógio. Mexer o ponteiro faz a tela repintar e os últimos quadros
  // chegarem ao arquivo. (A mixagem ainda estica o vídeo, se faltar algo.)
  if (!falha) {
    for (let i = 0; i < 12; i++) {
      await page.mouse.move(640 + (i % 2), 400);
      await page.waitForTimeout(120);
    }
  }
  // O fim é lido ANTES de fechar. Fechar o contexto é o que finaliza o arquivo
  // de vídeo, e isso levou de 1 a 10 s conforme a máquina: medido depois, esse
  // tempo virava silêncio com a tela congelada no fim do filme.
  const fimTotal = (Date.now() - t0) / 1000;
  const video = page.video();
  await contexto.close(); // é o fechamento que finaliza o arquivo de vídeo
  const bruto = await video?.path();

  if (falha) {
    // Nada de vídeo de um filme que falhou: o arquivo bruto vai embora, e o
    // FALHOU.png fica para mostrar o estado da tela no momento.
    if (bruto) fs.rmSync(bruto, { force: true });
    throw falha;
  }

  // Cada cena termina onde a próxima começa; a última, no fim do vídeo.
  const medidas = tempos.map((t, i) => ({
    id: t.id,
    inicio: t.inicio,
    voz: t.voz,
    fim: i + 1 < tempos.length ? tempos[i + 1].inicio : fimTotal,
  }));
  return { bruto, medidas, errosJs, duracao: fimTotal };
}

// ── execução ─────────────────────────────────────────────────────────────────

const relatorio = [];
try {
  await esperarServidor();
  fs.mkdirSync(SAIDA, { recursive: true });
  fs.mkdirSync(PUBLICO, { recursive: true });
  const navegador = await chromium.launch();

  let sessao = null;
  if (temConta && filmesDaVez.some((f) => f.precisaConta)) {
    try {
      sessao = await sessaoDaConta(navegador);
      console.log("conta de teste: entrou");
    } catch (e) {
      console.warn(`⚠ não consegui entrar com TUTORIAL_EMAIL (${String(e).split("\n")[0].slice(0, 90)})`);
    }
  }

  for (const filme of filmesDaVez) {
    console.log(`\n━━ ${filme.id} — ${filme.titulo}`);
    if (filme.precisaConta && !sessao) {
      // Pulado, e dito por quê. Nunca mais filmar o convite para entrar com a
      // narração da tela de dentro por cima.
      const motivo = temConta ? "o login da conta de teste falhou" : "falta TUTORIAL_EMAIL e TUTORIAL_SENHA no .env";
      console.log(`  ⏭  pulado: ${motivo}`);
      relatorio.push({ filme: filme.id, status: "pulado", motivo });
      continue;
    }

    const dir = path.join(SAIDA, filme.id);
    try {
      let falas = null;
      if (!semAudio) {
        console.log("  voz…");
        falas = sintetizarNarracoes(filme.cenas, path.join(SAIDA, `${filme.id}-audios`));
      }
      const { bruto, medidas, errosJs, duracao } = await gravarFilme(navegador, filme, sessao, falas);

      const mp4 = path.join(dir, `${filme.id}.mp4`);
      if (semAudio) {
        converterSemAudio(bruto, mp4);
      } else {
        const trilha = montarTrilha(
          medidas.map((m) => ({ id: m.id, duracaoSegundos: m.fim - m.inicio, atrasoSegundos: m.voz - m.inicio })),
          path.join(SAIDA, `${filme.id}-audios`),
          path.join(dir, "narracao.wav"),
        );
        mixarVideoEAudio(bruto, trilha, mp4);
      }
      fs.rmSync(bruto, { force: true });
      fs.copyFileSync(mp4, path.join(PUBLICO, `${filme.id}.mp4`));
      fs.copyFileSync(path.join(dir, "capa.jpg"), path.join(PUBLICO, `${filme.id}.jpg`));

      // O total do player é o do ARQUIVO, não o do relógio: são eles que
      // divergem quando o Playwright perde quadros. A última cena termina onde o
      // vídeo termina — senão a barra de progresso para antes do fim.
      const duracaoFinal = duracaoDoArquivo(mp4);
      if (Math.abs(duracaoFinal - duracao) > 1) {
        console.log(`  relógio ${duracao.toFixed(1)}s · arquivo ${duracaoFinal.toFixed(1)}s`);
      }
      medidas[medidas.length - 1].fim = duracaoFinal;
      escreverIndiceDoPlayer(filme, medidas, duracaoFinal, { comAudio: !semAudio });
      const mb = (fs.statSync(mp4).size / 1024 / 1024).toFixed(1);
      relatorio.push({ filme: filme.id, status: "ok", motivo: `${Math.round(duracaoFinal)}s · ${mb} MB${semAudio ? " · sem voz" : ""}` });
      if (errosJs.length) {
        console.warn(`  ⚠ ${errosJs.length} erro(s) de JavaScript na página durante a gravação: ${errosJs[0]}`);
      }
    } catch (e) {
      relatorio.push({ filme: filme.id, status: "FALHOU", motivo: String(e.message ?? e) });
      console.error(`  ✖ ${String(e.message ?? e)}`);
      console.error(`    estado da tela: ${path.join(dir, "FALHOU.png")}`);
    }
  }
  await navegador.close();

  fs.writeFileSync(path.join(ROOT, "TUTORIAL.md"), roteiroEmMarkdown(), "utf-8");
} finally {
  servidor.kill();
}

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
for (const r of relatorio) {
  const marca = r.status === "ok" ? "✅" : r.status === "pulado" ? "⏭ " : "🔴";
  console.log(`${marca} ${r.filme.padEnd(10)} ${r.status.padEnd(7)} ${r.motivo}`);
}
console.log(`\nvídeos prontos em ${PUBLICO} · roteiro em TUTORIAL.md`);
// Filme que falhou é teste vermelho: o código de saída avisa quem rodou.
process.exitCode = relatorio.some((r) => r.status === "FALHOU") ? 1 : 0;
