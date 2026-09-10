import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
/**
 * Tira comentários antes de casar padrão.
 *
 * A primeira versão destes testes falhou em três dos seis casos — e o código
 * estava certo: os testes é que liam os comentários que EXPLICAM o defeito
 * ("`opacity: inView ? 1 : 0`", "`threshold: 0.01`"). É a terceira vez que isto
 * morde nesta base. Documentar bem o motivo de uma correção coloca o texto do
 * defeito no arquivo; teste que varre fonte precisa olhar só o código.
 */
const semComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const componente = semComentarios(readFileSync(join(AQUI, "AnimatedSection.tsx"), "utf-8"));
const css = semComentarios(readFileSync(join(AQUI, "..", "index.css"), "utf-8"));

/**
 * O achado mais caro da auditoria de 09/09/2026 (TRV-05) foi este componente:
 * cards, seções e o rodapé inteiro parados em opacidade ~0,15, um viewport em
 * branco em cinco rotas, e a tela de detalhe de mercado levando nove segundos
 * para mostrar um DOM que já estava pronto no primeiro segundo.
 *
 * São 268 usos em 37 arquivos. Não dá para testar 268 telas — o que dá para
 * prender é a INVARIANTE que torna o defeito impossível:
 *
 *   se nada acontecer, o conteúdo está visível.
 *
 * Cada teste abaixo protege uma das peças disso, e todas são fáceis de desfazer
 * sem perceber (um `opacity: 0` a mais parece inofensivo) e nenhuma quebraria
 * build, tipo ou tela de desenvolvimento — o defeito só aparece em produção,
 * com a rede lenta, para o usuário.
 */
describe("nenhum bloco nasce invisível", () => {
  it("o componente não escreve opacidade no estilo inline", () => {
    // Era assim que o defeito existia: `style={{ opacity: inView ? 1 : 0 }}`.
    // Estilo inline vence qualquer folha de estilo, então um observer que não
    // dispara deixava o conteúdo invisível para sempre.
    expect(componente).not.toMatch(/opacity:\s*(inView|revelado)/);
    expect(componente).not.toMatch(/style=\{\{[^}]*opacity/);
  });

  it("a animação é LIGADA por classe, não desligada por ela", () => {
    // A inversão é o coração do conserto: sem `revelar-pronto` não há animação
    // e, portanto, não há quadro inicial invisível.
    expect(componente).toMatch(/revelar-pronto/);
    const regra = css.match(/\.revelar-pronto\s*\{[^}]*\}/)?.[0] ?? "";
    expect(regra).toMatch(/animation:/);
    // `backwards`, e não `both`: `both` mantém o ÚLTIMO quadro depois de
    // terminar, o que é inofensivo — mas o `from { opacity: 0 }` só existe
    // enquanto a animação existe, e é isso que precisa ser verdade.
    expect(regra).toMatch(/backwards/);
  });

  it("existe rede de segurança independente do observer", () => {
    // O IntersectionObserver pode não disparar: elemento de altura zero,
    // extensão do navegador, JS parcialmente quebrado. A rede garante que
    // "não animou" nunca vire "não apareceu".
    expect(componente).toMatch(/setTimeout\(revelar/);
    const espera = Number(componente.match(/setTimeout\(revelar,\s*(\d+)\)/)?.[1] ?? 0);
    expect(espera).toBeGreaterThan(0);
    expect(espera).toBeLessThanOrEqual(2000);   // 9 s foi o que a auditoria mediu
  });

  it("o limiar não depende da ÁREA do elemento", () => {
    // `threshold: 0.01` é 1% da área do ELEMENTO. Um bloco que nasce com altura
    // zero (conteúdo ainda vindo da rede) tem área zero e nunca chega lá —
    // uma das três formas de o observer nunca disparar.
    expect(componente).toMatch(/threshold:\s*0\b/);
    expect(componente).not.toMatch(/threshold:\s*0\.\d/);
  });

  it("quem pede menos movimento recebe a página pronta", () => {
    // Ancora na REGRA, não na primeira menção ao nome da classe.
    const bloco = css.slice(css.indexOf(".revelar-pronto {"));
    expect(bloco.slice(0, 900)).toMatch(/prefers-reduced-motion:\s*reduce/);
  });

  it("nenhum keyframe de revelação TERMINA invisível", () => {
    // `to { opacity: 0 }` num keyframe com `forwards` deixaria o bloco apagado
    // depois de animar — o mesmo sintoma por outro caminho.
    const keyframes = css.match(/@keyframes revelar-[a-z]+\s*\{[^}]*\}[^}]*\}/g) ?? [];
    expect(keyframes.length).toBeGreaterThan(0);
    for (const k of keyframes) expect(k).not.toMatch(/to\s*\{[^}]*opacity:\s*0/);
  });
});
