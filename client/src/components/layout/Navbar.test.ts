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
