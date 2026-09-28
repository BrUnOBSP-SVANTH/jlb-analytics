/**
 * O defeito que este arquivo impede de voltar.
 *
 * Em 27/09/2026 o fundador foi trocar de perfil no site e descobriu que não
 * havia como sair da conta. Não era um botão escondido: no código, a única
 * chamada a `signOut` da barra vivia dentro do bloco `{mobileOpen && (…)}`.
 *
 * NAV-04 tinha movido o botão do header do CELULAR para dentro do menu do
 * CELULAR — decisão certa, porque sair ficava colado no botão de tema. Só que o
 * desktop nunca teve um, e ninguém notou: de `lg` para cima não existe
 * hambúrguer, então aquele menu nunca abre. O único caminho para trocar de
 * conta no computador passava a ser EXCLUIR a conta, que é irreversível e fica
 * na porta ao lado, em /perfil.
 *
 * É a família de defeito cujo sintoma é a AUSÊNCIA de algo: nada quebra, nada
 * aparece no console, nenhum teste fica vermelho. Só falta.
 *
 * O teste lê a fonte porque é exatamente a posição no arquivo que estava
 * errada — um teste de comportamento montando o componente passaria igual
 * renderizando só o menu mobile.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FONTE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "Navbar.tsx"),
  "utf-8",
);

/** Tudo o que vem ANTES do menu do celular — ou seja, o que o desktop enxerga. */
const MARCA_MENU_MOBILE = "{mobileOpen && (";
const foraDoMenuMobile = (() => {
  const i = FONTE.indexOf(MARCA_MENU_MOBILE);
  if (i === -1) throw new Error("o menu mobile mudou de forma — reveja esta âncora");
  return FONTE.slice(0, i);
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
   * Quem não consegue sair também não consegue saber em que conta está: as duas
   * perguntas são a mesma quando se quer trocar de perfil.
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
