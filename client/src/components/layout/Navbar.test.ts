import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Navbar.tsx"), "utf-8");

/**
 * UXP-01 — a navegação do notebook.
 *
 * Esta barra já trocou de ponto de corte duas vezes, e cada troca quebrou o
 * outro lado:
 *
 *  · NAV-01 (14/09) ligou o menu de desktop em `lg` (1024px) sem medir. O
 *    conteúdo pedia mais espaço do que havia e o site inteiro rolava de lado;
 *    o remédio foi subir para `xl`.
 *  · UXP-01 (21/09) mostrou o custo do remédio: notebook nenhum abaixo de
 *    1280px tinha menu — só um hambúrguer numa barra larga e vazia. A conta,
 *    medida com a sessão aberta: logo 123 + grupos 489 + ações 479 = 1115px de
 *    conteúdo para 960px de espaço em 1024px.
 *
 * Os testes abaixo não prendem o valor do ponto de corte — prendem o que não
 * pode acontecer em NENHUM valor: as quatro peças têm que virar juntas, e a
 * faixa estreita tem que ser mais estreita de verdade.
 */
const PONTO = /\b(sm|md|lg|xl|2xl):/;

function classes(trecho: string): string {
  return trecho.match(/className="([^"]*)"/)?.[1] ?? "";
}

/** O bloco dos grupos de navegação (o que some quando a tela encolhe). */
const gruposDesktop = classes(fonte.slice(fonte.indexOf("Desktop nav groups")));
/** O bloco de busca/tema/conta, do lado direito. */
const acoesDesktop = classes(fonte.slice(fonte.indexOf("Right actions")));
/** O botão de hambúrguer. */
const hamburguer = classes(fonte.slice(fonte.indexOf("Mobile toggle")));
/** O painel que o hambúrguer abre. */
const painel = classes(fonte.slice(fonte.indexOf("── Mobile menu ──")));

describe("uma navegação de cada vez", () => {
  it("as quatro peças viram no MESMO ponto de corte", () => {
    // Se só uma metade mudar, o resultado é duas navegações na tela ao mesmo
    // tempo ou nenhuma — e as duas já aconteceram aqui.
    const deDesktop = [gruposDesktop, acoesDesktop].map((c) => c.match(/hidden (\w+):flex/)?.[1]);
    const deMobile = [hamburguer, painel].map((c) => c.match(/(\w+):hidden/)?.[1]);
    expect(deDesktop[0]).toBeDefined();
    expect(new Set([...deDesktop, ...deMobile]).size).toBe(1);
  });

  it("🔴 o menu de desktop aparece no notebook, não só em 1280px", () => {
    // O achado em si: `xl` deixava 1024–1279px sem navegação nenhuma.
    const ponto = gruposDesktop.match(/hidden (\w+):flex/)?.[1];
    expect(["md", "lg"]).toContain(ponto);
  });
});

describe("a faixa compacta é compacta de verdade", () => {
  it("o rótulo e o atalho da busca só entram na tela larga", () => {
    // São 91px — a maior sobra disponível sem tirar nada do lugar. O nome da
    // ação continua no aria-label, então quem usa leitor de tela não perde nada.
    const busca = fonte.slice(fonte.indexOf("Abrir busca global"), fonte.indexOf("<AlertBell />"));
    expect(busca).toMatch(/hidden xl:inline[^"]*"?>Buscar/);
    expect(busca).toMatch(/<kbd className="hidden xl:inline/);
  });

  it("os botões de grupo pedem menos espaço antes de `xl`", () => {
    // Sem isto, ligar o menu em `lg` só devolve a rolagem lateral do NAV-01.
    const botao = fonte.match(/alvo-toque flex items-center gap-1 xl:gap-1\.5 [^"`]*/)?.[0] ?? "";
    expect(botao).toContain("px-2 xl:px-3");
    expect(botao).toContain("text-[13px] xl:text-sm");
  });
});

describe("abrir o menu não mexe na página", () => {
  it("o painel flutua: sai do fluxo e é ancorado pela nav", () => {
    // Medido antes do conserto, em 390px com a página em 1500px: abrir o menu
    // levava a leitura para 1875px. O painel entrava no fluxo dentro de um
    // header grudado, o documento crescia e a âncora de rolagem escorregava.
    // Quem fechasse o menu voltava para outro lugar do texto.
    expect(painel).toMatch(/\babsolute\b/);
    expect(painel).toMatch(/\btop-full\b/);
    expect(fonte).toMatch(/<nav aria-label="Navegação principal" className="[^"]*\brelative\b/);
  });

  it("🔴 o que não cabe na tela rola DENTRO do painel", () => {
    // Antes era `overflow-hidden` com header grudado: em 768px, 79px do pé
    // ficavam fora da tela e "Sair da conta" não tinha como ser alcançado.
    expect(painel).toMatch(/overflow-y-auto/);
    expect(painel).not.toMatch(/overflow-hidden/);
    // `dvh` e não `vh`: no celular a barra do navegador entra e sai da conta.
    expect(painel).toMatch(/max-h-\[calc\(100dvh-3\.5rem\)\]/);
  });
});

/**
 * 🔴 NÃO HAVIA COMO SAIR DA CONTA NO DESKTOP (27/09/2026).
 *
 * O fundador foi trocar de perfil e descobriu. No código, a única chamada a
 * `signOut` da barra vivia dentro do bloco `{mobileOpen && (…)}`.
 *
 * Repare que o defeito nasceu de um conserto que estava certo: NAV-04 tirou o
 * botão do header do CELULAR, onde ele ficava colado no botão de tema, e o
 * levou para dentro do menu do CELULAR. O desktop nunca teve um — e de `lg`
 * para cima não existe hambúrguer, então aquele menu nunca abre. O único
 * caminho para trocar de conta no computador virou EXCLUIR a conta: a porta ao
 * lado em /perfil, e irreversível.
 *
 * ⚠️ O que isto diz sobre as nossas ferramentas: com o defeito no ar, a
 * `pnpm varredura` deu 27/27 telas limpas e o `pnpm doctor` deu 0 críticos. As
 * duas medem o que QUEBRA e o que está errado na tela; nenhuma sabe o que
 * deveria estar lá e não está. Ausência de AÇÃO não tem detector automático.
 *
 * O teste lê a fonte porque era a POSIÇÃO no arquivo que estava errada — um
 * teste montando o componente passaria igual renderizando só o menu mobile.
 */
const MARCA_MENU_MOBILE = "{mobileOpen && (";
const foraDoMenuMobile = (() => {
  const i = fonte.indexOf(MARCA_MENU_MOBILE);
  if (i === -1) throw new Error("o menu mobile mudou de forma — reveja esta âncora");
  return fonte.slice(0, i);
})();

describe("dá para sair da conta sem depender do menu do celular", () => {
  it("existe uma chamada a signOut fora do bloco do menu mobile", () => {
    expect(
      foraDoMenuMobile,
      "só há como sair dentro de `{mobileOpen && …}` — no desktop esse menu nunca abre",
    ).toMatch(/signOut\(\)/);
  });

  it("o botão de sair diz o que faz, com essas palavras", () => {
    expect(foraDoMenuMobile).toContain("Sair da conta");
  });

  it("sair pede confirmação — um clique só, ao lado de links, é acidente", () => {
    expect(foraDoMenuMobile).toMatch(/confirmarSaida/);
    expect(foraDoMenuMobile).toContain("Confirmar saída");
  });

  /**
   * Quem não consegue sair também não consegue saber em que conta está: quando
   * o objetivo é trocar de perfil, as duas perguntas são a mesma.
   */
  it("o menu da conta mostra o e-mail de quem está conectado", () => {
    expect(foraDoMenuMobile).toContain("Conectado como");
    expect(foraDoMenuMobile).toMatch(/user\.email/);
  });

  it("o gatilho do menu se anuncia para leitor de tela", () => {
    expect(foraDoMenuMobile).toMatch(/aria-haspopup="menu"/);
    expect(foraDoMenuMobile).toMatch(/aria-label="Abrir menu da conta"/);
  });

  /**
   * NAV-02: todo popover sai pelo mesmo hook — Esc, clique fora e rolagem. Um
   * menu que só fecha clicando de novo no próprio gatilho fica preso na tela.
   */
  it("o menu da conta fecha pelo caminho comum dos popovers", () => {
    expect(foraDoMenuMobile).toMatch(/useDispensar<HTMLDivElement>\(menuAberto/);
  });
});
