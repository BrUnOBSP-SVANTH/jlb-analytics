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
  // `/mercados` é a canônica desde a decisão de posicionamento (NEG-01);
  // `/apostas` continua na lista de propósito, para o redirect ser testado.
  "/", "/mercados", "/apostas", "/noticias", "/portfolio", "/previsao", "/briefing",
  "/track-record", "/dashboard", "/perfil", "/leaderboard", "/duelos", "/planos",
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

/**
 * A rota que TEM que dar 404.
 *
 * Ela está na lista para provar que a página de "não encontrado" desenha. Desde
 * 15/09 o servidor devolve o status 404 de verdade nela (antes era 200 com o
 * HTML do app, e todo link quebrado da internet virava página indexável) — e o
 * navegador registra isso no console como erro. Ou seja: a varredura passou a
 * acusar exatamente o conserto. O que se cobra aqui é a TELA, não o status.
 */
const ROTA_404 = "/rota-que-nao-existe";

const b = await chromium.launch();
const problemas = [];
let telasOk = 0;

for (const rota of ROTAS) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  const achados = [];

  // Na rota de 404, o erro de console do PRÓPRIO documento é o esperado.
  const erro404DoDocumento = (t) => rota === ROTA_404 && /Failed to load resource.*\b404\b/i.test(t);

  p.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (!ehRuido(t) && !erro404DoDocumento(t)) achados.push(`console: ${t.slice(0, 150)}`);
  });
  p.on("pageerror", (e) => achados.push(`ERRO JS: ${String(e.message).slice(0, 150)}`));
  p.on("requestfailed", (r) => {
    const t = `${r.url()} — ${r.failure()?.errorText ?? "?"}`;
    if (!ehRuido(t)) achados.push(`rede: ${t.slice(0, 150)}`);
  });
  p.on("response", (r) => {
    if (r.status() < 500) return;
    // Continua acusando TODO 5xx — inclusive o 503 declarado. O que muda é o que
    // se lê no relatório: quando a rota diz o motivo em português ("a cota diária
    // de IA acabou"), esse motivo vale mais que o número do status, porque separa
    // "código quebrado" de "fonte indisponível" sem esconder nenhum dos dois.
    const base = `HTTP ${r.status()}: ${r.url().slice(0, 120)}`;
    void r.text()
      .then((corpo) => {
        const motivo = JSON.parse(corpo)?.message;
        achados.push(typeof motivo === "string" && motivo ? `${base} — ${motivo.slice(0, 120)}` : base);
      })
      .catch(() => achados.push(base));
  });

  try {
    await p.goto(BASE + rota, { waitUntil: "domcontentloaded", timeout: 60_000 });

    /**
     * ⚠️ A ORDEM DESTE BLOCO É O CONSERTO, e ela custou o pior bug que este
     * site já teve em produção.
     *
     * As dispensas logo abaixo ("Pular tour", "Aceitar a medição") existem para
     * o cromo não atrapalhar as outras medições. Só que elas rodavam PRIMEIRO —
     * e com isso a varredura media um estado que NENHUM visitante de primeira
     * viagem vê. O tour de boas-vindas cobria o formulário de `/login` inteiro,
     * ninguém conseguia entrar no site, e a varredura dava 27/27 telas limpas
     * todos os dias, porque clicava em "Pular tour" antes de olhar.
     *
     * Então a checagem de clique acontece AQUI, com a página exatamente como
     * ela chega para quem abre o site pela primeira vez.
     */
    await p.waitForTimeout(2500);
    /**
     * FORMULÁRIO COBERTO — o detector que faltava, e que custou caro.
     *
     * O bloco de TEXTO SOBREPOSTO lá embaixo ignora de propósito o que é `fixed`
     * ou `role=dialog`: modal por cima de texto é o comportamento correto de um
     * modal. Essa régua estava certa para texto e ERRADA para formulário. O tour
     * de boas-vindas renderizava em `/login` (é irmão do `<Router/>` em App.tsx,
     * e `/login` fica fora do Layout) e cobria o formulário inteiro. Não dava
     * nem para digitar o e-mail. Ninguém conseguia entrar no site, e não havia
     * um único erro no console — porque o clique nunca chegava a acontecer.
     *
     * A régua é estreita de propósito, e é por isso que não tem falso positivo:
     * um formulário é a razão de existir da página que o contém. Se ao ABRIR a
     * página ele já está coberto, a página não pode cumprir a própria função.
     * Não existe modal legítimo que nasça por cima de um formulário — os que
     * nascem sozinhos são cromo (tour, aviso de cookies), e cromo não tem o
     * direito de bloquear a tarefa que a pessoa veio fazer.
     *
     * ⚠️ NÃO filtre por `disabled`. A primeira versão filtrava, e não acusou
     * nada: o botão "Entrar" nasce desabilitado enquanto o e-mail está vazio —
     * exatamente o estado em que a página abre.
     */
    const bloqueados = await p.evaluate(() => {
      const fora = [];
      for (const form of document.querySelectorAll("form")) {
        const cs = getComputedStyle(form);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const campos = [...form.querySelectorAll("input, textarea, select, button")].filter((c) => {
          const s2 = getComputedStyle(c);
          if (s2.display === "none" || s2.visibility === "hidden") return false;
          const r = c.getBoundingClientRect();
          return r.width > 8 && r.height > 8 &&
                 r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
        });
        if (campos.length === 0) continue;
        // Coberto quando NENHUM campo visível do formulário é alcançável: um
        // campo isolado atrás de um tooltip é ruído; o formulário inteiro
        // inalcançável é a página quebrada.
        const alcancavel = campos.some((c) => {
          const r = c.getBoundingClientRect();
          const topo = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return topo && (topo === c || c.contains(topo) || form.contains(topo));
        });
        if (alcancavel) continue;
        const r = campos[0].getBoundingClientRect();
        const topo = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        const quem = topo?.closest("[role=dialog]") ?? topo;
        fora.push(`${campos.length} campos inalcançáveis, cobertos por <${quem?.tagName.toLowerCase()} class="${String(quem?.className).slice(0, 56)}">`);
      }
      return fora.slice(0, 2);
    });
    if (bloqueados.length > 0) achados.push(`FORMULÁRIO COBERTO: ${bloqueados.join(" | ")}`);

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
    /**
     * TEXTO SOBREPOSTO. Dois blocos de texto ocupando o mesmo retângulo é
     * sempre defeito de layout — foi o achado PRV-01 (a linha de subtítulo
     * desenhada por cima do "1. QUAL ÁREA VOCÊ QUER ANALISAR?").
     *
     * Ignora o que fica por cima DE PROPÓSITO: modal, banner fixo e tooltip.
     * Sem isso o teste acusa o tour de boas-vindas e o aviso de cookies em
     * todas as rotas — foi o que a primeira versão devolveu.
     */
    const colisoes = await p.evaluate(() => {
      const foraDoFluxo = (el) => {
        for (let n = el; n && n !== document.body; n = n.parentElement) {
          const pos = getComputedStyle(n).position;
          if (pos === "fixed" || pos === "sticky") return true;
          if (n.getAttribute("role") === "dialog") return true;
        }
        return false;
      };
      const alvos = [...document.querySelectorAll("p,h1,h2,h3,span,li")].filter((e) => {
        if (e.children.length > 0 || foraDoFluxo(e)) return false;
        if ((e.textContent ?? "").trim().length < 10) return false;
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.2) return false;
        const b = e.getBoundingClientRect();
        return b.width > 30 && b.height > 8;
      }).map((e) => ({ el: e, b: e.getBoundingClientRect(), t: (e.textContent ?? "").trim().slice(0, 32) }));

      const fora = [];
      for (let i = 0; i < alvos.length; i++) for (let j = i + 1; j < alvos.length; j++) {
        // Irmãos do MESMO pai são trechos inline da mesma frase (um título em
        // duas cores, um trecho em negrito): eles dividem a linha de propósito e
        // seus retângulos se sobrepõem por definição. Foi o falso positivo que a
        // primeira versão devolveu no título da /imprensa.
        if (alvos[i].el.parentElement === alvos[j].el.parentElement) continue;
        const a = alvos[i].b, c = alvos[j].b;
        const ox = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const oy = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (ox > 20 && oy > 6) fora.push(`"${alvos[i].t}" × "${alvos[j].t}"`);
      }
      return fora.slice(0, 2);
    });
    if (colisoes.length > 0) achados.push(`TEXTO SOBREPOSTO: ${colisoes.join(" | ")}`);

    if (a11y.invisiveis > 0) achados.push(`CONTEÚDO INVISÍVEL: ${a11y.invisiveis} blocos com opacidade baixa`);
    if (a11y.saltos.length > 0) achados.push(`SALTO DE TÍTULO: ${a11y.saltos.join(", ")}`);
    if (a11y.h1 === 0) achados.push("SEM H1: a página não tem título principal");

    /**
     * SOBRA HORIZONTAL NO CELULAR.
     *
     * A varredura rodava só em 1280px, e em 16/09 o /nivel/1 rolava de lado em
     * 390px: dois `<input>` sem `min-w-0` empurravam os cards 20px para fora da
     * tela. Nada no console, nenhum teste vermelho — só a página balançando no
     * dedo de quem abre pelo celular, que é quase todo mundo no Brasil.
     *
     * Redimensionar em vez de navegar de novo: as media queries reaplicam na
     * hora e a verificação custa um quadro, não uma carga.
     */
    /**
     * ⚠️ 360px TAMBÉM (Auditoria 21/09, UXP-06). 390 é o iPhone; 360 é a largura
     * mais comum do Android no Brasil — Galaxy A, Moto G, a base instalada de
     * quem este site quer alcançar. São 30px, e é neles que a linha de botões
     * que cabia justo deixa de caber.
     */
    for (const largura of [390, 360]) {
      await p.setViewportSize({ width: largura, height: 844 });
      await p.waitForTimeout(400);
      const sobra = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (sobra > 0) achados.push(`SOBRA HORIZONTAL EM ${largura}px: a página rola ${sobra}px de lado`);
    }
    // O resto das medidas de celular segue em 390px.
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(300);

    /**
     * TEXTO ESPREMIDO NO CELULAR.
     *
     * O defeito vizinho da sobra, e que não faz a página rolar: um bloco
     * `flex-1` ao lado de botões `shrink-0` numa linha com `flex-wrap`. Com base
     * zero o texto nunca desce de linha — no /leaderboard ele ficou com 36px de
     * largura, uma palavra por linha, e nada acusava.
     *
     * Critério: texto de frase inteira (40+ caracteres) renderizado com menos de
     * 80px de largura e mais de 60px de altura. Fica de fora o que é de propósito
     * estreito: o `sr-only` (1px) e o que corta com reticências.
     */
    const espremidos = await p.evaluate(() => {
      const saida = [];
      for (const e of document.querySelectorAll("p, span, li, h1, h2, h3, h4")) {
        const texto = (e.textContent || "").trim();
        if (texto.length < 40) continue;
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.width >= 80 || r.height <= 60) continue;
        const cs = getComputedStyle(e);
        if (cs.textOverflow === "ellipsis" || cs.visibility === "hidden") continue;
        saida.push(`"${texto.slice(0, 35)}…" com ${Math.round(r.width)}px`);
        if (saida.length >= 2) break;
      }
      return saida;
    });
    if (espremidos.length > 0) achados.push(`TEXTO ESPREMIDO EM 390px: ${espremidos.join(" | ")}`);

    /**
     * A FAIXA DO NOTEBOOK (Auditoria 21/09, UXP-01).
     *
     * A varredura media 1280px e 390px — e o defeito morava exatamente no meio.
     * A navegação de desktop ligava só em 1280px, então TODO notebook de
     * 1024–1279px (a tela mais comum de quem usa o site sentado) via um
     * hambúrguer numa barra larga e vazia. Nenhuma das duas medidas via isso.
     *
     * A causa do breakpoint alto era real: em 1024px o conteúdo da barra pedia
     * mais espaço do que havia e a página rolava de lado (NAV-01). Por isso a
     * checagem aqui é dupla — o menu tem que APARECER e a página não pode rolar
     * de lado. Consertar um quebrando o outro é o laço em que isto já entrou.
     */
    await p.setViewportSize({ width: 1024, height: 800 });
    await p.waitForTimeout(400);
    const notebook = await p.evaluate(() => {
      const grupos = document.querySelector("header nav > div > div.flex-1");
      const hamburguer = document.querySelector('[aria-label="Abrir menu"]');
      const visivel = (el) => !!el && el.getBoundingClientRect().width > 0;
      return {
        menuDesktop: visivel(grupos),
        hamburguer: visivel(hamburguer),
        sobra: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    if (notebook.sobra > 0) achados.push(`SOBRA HORIZONTAL EM 1024px: a página rola ${notebook.sobra}px de lado`);
    if (!notebook.menuDesktop && notebook.hamburguer) achados.push("SEM MENU EM 1024px: a navegação de desktop sumiu na faixa do notebook (UXP-01)");

    /**
     * NÚMERO FORA DO PADRÃO BRASILEIRO (Auditoria 21/09, TXT-01).
     *
     * A casa tem uma fonte única de formatação (`shared/formato.ts`) e ela
     * existe porque a plataforma inteira fala português: "7,3%", não "7.3%".
     * Mesmo assim, 28 lugares chamavam `toFixed` direto e publicavam ponto
     * decimal — "±4.3", "0.147", "Brier 0.15", "Vol: $2.7M".
     *
     * Um detector estático não resolveria: boa parte dos `toFixed` alimenta
     * GRÁFICO (arredondar antes do Recharts é legítimo e não vira texto). Só o
     * texto RENDERIZADO responde, e é o que esta checagem olha.
     *
     * Duas regras:
     *  · `1.234,5` é separador de milhar em pt-BR e passa; `4.3%` não;
     *  · cifrão sozinho é dólar escrito como se fosse real — "US$" ou "R$".
     */
    await p.setViewportSize({ width: 1280, height: 900 });
    await p.waitForTimeout(300);
    const numerosErrados = await p.evaluate(() => {
      const saida = [];
      // Ponto decimal seguido de 1–3 dígitos e de um sinal de porcentagem, pp
      // ou fim — mas NUNCA com 3 dígitos exatos depois (isso é milhar: 1.234).
      const PONTO_DECIMAL = /(?<![\d.])\d{1,3}\.\d{1,2}(?![\d])\s?(%|pp)/;
      const CIFRAO_SOZINHO = /(?<![RU]S?)\$\s?\d/;
      const vistos = new Set();
      for (const e of document.querySelectorAll("p, span, li, td, th, h1, h2, h3, h4, strong, div")) {
        // Só o nó de texto PRÓPRIO: sem isto, um `<div>` pai reporta o número
        // do filho e o mesmo achado sai dez vezes.
        const proprio = Array.from(e.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent || "")
          .join(" ")
          .trim();
        if (!proprio || proprio.length > 160) continue;
        // Texto que CITAMOS da plataforma (título de mercado em inglês) não
        // segue o nosso padrão — e reformatá-lo seria adulterar a citação.
        if (e.closest("[data-fonte=\"externa\"]")) continue;
        const m = proprio.match(PONTO_DECIMAL) || proprio.match(CIFRAO_SOZINHO);
        if (!m) continue;
        const chave = m[0];
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        saida.push(`"${proprio.slice(0, 50)}"`);
        if (saida.length >= 4) break;
      }
      return saida;
    });
    if (numerosErrados.length > 0) {
      achados.push(`NÚMERO FORA DO PADRÃO pt-BR: ${numerosErrados.join(" | ")} — use shared/formato.ts`);
    }

    /**
     * O MESMO, MAS NO PLACEHOLDER (Auditoria 21/09, UXP-03).
     *
     * A checagem acima lê o texto RENDERIZADO, e placeholder não é texto
     * renderizado: é atributo. Por isso dois escaparam da varredura inteira —
     * "ex: 0.45" na página que ENSINA a ler número, e "Selic está a 10.5%" no
     * campo de contexto da previsão, que ainda por cima afirmava um valor que
     * não é o da Selic.
     *
     * Exemplo dentro de um campo é lido como se fosse dado da casa. Vale a
     * mesma régua do resto da tela.
     *
     * ⚠️ LIMITE, medido ao provar este detector: ele só enxerga o que está
     * MONTADO. O placeholder da Selic mora numa seção que nasce fechada e nem
     * chega ao DOM, então passou aqui. Quem fecha esse buraco é o teste de
     * código-fonte em client/src/components/visual.test.ts — os dois juntos
     * cobrem o que cada um sozinho não cobre.
     */
    const placeholdersErrados = await p.evaluate(() => {
      const PONTO_DECIMAL = /(?<![\d.])\d{1,3}\.\d{1,2}(?![\d])\s?(%|pp|$)/;
      const saida = [];
      for (const e of document.querySelectorAll("[placeholder]")) {
        const texto = e.getAttribute("placeholder") ?? "";
        if (PONTO_DECIMAL.test(texto)) saida.push(`"${texto.slice(0, 50)}"`);
        if (saida.length >= 3) break;
      }
      return saida;
    });
    if (placeholdersErrados.length > 0) {
      achados.push(`NÚMERO FORA DO PADRÃO pt-BR EM PLACEHOLDER: ${placeholdersErrados.join(" | ")}`);
    }

    /**
     * MEDIDA DE LINHA NO DESKTOP LARGO (Auditoria 21/09, UXP-07).
     *
     * Parágrafo sem largura máxima ocupa o que a tela der. Medido em 1440px:
     * o aviso de cookies — o texto de CONSENTIMENTO, o primeiro que um
     * visitante novo lê — abria para 908px, cerca de 151 caracteres por linha,
     * e aparecia assim em todas as rotas. Em /mercados a ressalva institucional
     * chegava a 216. O olho perde a linha de volta e o texto deixa de ser lido;
     * num site que se sustenta em explicar, isso é a função quebrando em
     * silêncio.
     *
     * ⚠️ O LIMITE É 120, não 65. O confortável para leitura fica perto de 65
     * caracteres, mas documento denso (termos, política, glossário) vive bem
     * entre 100 e 120 e reflow em tudo isso seria mexer onde não dói. Acima de
     * 120 não há caso defensável — e era exatamente onde estavam os defeitos.
     */
    const linhasLongas = await p.evaluate(() => {
      const saida = [];
      for (const e of document.querySelectorAll("p, li")) {
        const t = (e.textContent || "").trim();
        if (t.length < 150) continue;               // texto curto não faz linha longa
        const r = e.getBoundingClientRect();
        if (r.width < 600) continue;
        const tamanho = parseFloat(getComputedStyle(e).fontSize);
        // ~0,5em por caractere é a regra prática para estimar medida de linha.
        const caracteres = Math.round(r.width / (tamanho * 0.5));
        if (caracteres > 120) saida.push(`~${caracteres} car. em "${t.slice(0, 34)}…"`);
        if (saida.length >= 3) break;
      }
      return saida;
    });
    if (linhasLongas.length > 0) {
      achados.push(`LINHA LONGA DEMAIS EM 1280px: ${linhasLongas.join(" | ")} — use max-w-prose`);
    }
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
