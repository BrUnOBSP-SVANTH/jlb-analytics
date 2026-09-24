import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "Previsao.tsx"), "utf-8");

/**
 * UXP-03 — a ferramenta vinha depois da vitrine.
 *
 * Quatro blocos de credibilidade ficavam entre o título e o formulário: margem
 * de erro, track record da IA, comparador de resultados e guia do
 * superforecaster. Cada um se justifica sozinho; empilhados, empurravam para
 * fora da tela a única coisa que a página existe para fazer.
 *
 * Medido em 390px, antes: o campo de escrever começava em 1.104px e o botão
 * "Analisar com IA" em 1.576px, com a dobra em 844px. Depois: campo em 823px,
 * acima da dobra. No desktop, 878px → 703px.
 *
 * Nada saiu da página — a prova de credibilidade desceu para logo abaixo do
 * formulário, onde responde a uma dúvida que a pessoa já formulou em vez de
 * antecipá-la, e continua antes de qualquer resultado.
 */
/**
 * Sem comentários — asserção NEGATIVA tem que falar do código.
 * O comentário que explica este conserto CITA o texto antigo ("Selic a 10.5%"),
 * e prendê-lo faria o teste falhar justamente por causa da explicação. Aconteceu
 * três vezes nesta auditoria; o remédio é sempre este.
 */
const semComentarios = (t: string) => t
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/^\s*\/\/.*$/gm, "");

const posicao = (marca: string) => {
  const i = fonte.indexOf(marca);
  expect(i, `não achei "${marca}" na página`).toBeGreaterThan(-1);
  return i;
};

describe("a página de previsão começa pela previsão", () => {
  it("🔴 o formulário vem antes dos blocos de credibilidade", () => {
    const formulario = posicao("{/* ── Formulário ──");
    for (const bloco of ["<MarginOfError />", "<AiTrackRecord />", "<ResultComparator />", "<SuperforecasterGuide />"]) {
      expect(posicao(bloco), `${bloco} deveria vir depois do formulário`).toBeGreaterThan(formulario);
    }
  });

  it("⚠️ a ressalva de margem de erro continua antes de qualquer resultado", () => {
    // Ela desceu, mas não pode acabar depois do número que ela ressalva —
    // empresa de previsão não se vende como perfeita, e a ordem é parte disso.
    expect(posicao("<MarginOfError />")).toBeLessThan(posicao("{/* ── Resultado ── */}"));
  });

  it("os quatro blocos continuam na página — isto foi reordenar, não cortar", () => {
    for (const bloco of ["<MarginOfError />", "<AiTrackRecord />", "<ResultComparator />", "<SuperforecasterGuide />"]) {
      expect(fonte).toContain(bloco);
    }
  });
});

describe("o exemplo do campo não afirma dado", () => {
  it("🔴 o contexto não cita um valor de Selic", () => {
    // O placeholder dizia "Selic está a 10.5%": ponto decimal num produto que
    // fala português, e um valor que não é o da Selic. Exemplo dentro de campo
    // é lido como se fosse dado da casa — e este site existe para desconfiar de
    // número sem fonte.
    const contexto = semComentarios(fonte.slice(fonte.indexOf("Contexto adicional"), fonte.indexOf("3. Qual horizonte")));
    expect(contexto).not.toMatch(/Selic\s+(está|em|a)\s*\d/i);
    expect(contexto).not.toMatch(/\d+\.\d+\s*%/);
  });
});
