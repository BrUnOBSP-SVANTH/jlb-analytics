import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const fonte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "TutorialModal.tsx"), "utf-8");
/** Comentário que explica o defeito cita o defeito — fora antes de afirmar ausência. */
const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/^\s*\/\/.*$/gm, " ");

/**
 * 🔴 O PLAYER MENTIA QUANDO O VÍDEO FALHAVA (01/10/2026).
 *
 * Em produção o arquivo do vídeo dava 404 (estava no .gitignore e o Render
 * constrói a partir do Git). O estado de erro dizia "Vídeo tutorial
 * disponível" — e nem chegava a aparecer: o `onError` estava no <video>, mas
 * com <source> dentro o evento dispara no <source>. Quem abria o tutorial via
 * uma caixa preta, sem explicação.
 */
describe("o player conta a verdade sobre o vídeo", () => {
  it("o estado de erro diz que o vídeo NÃO carregou", () => {
    expect(codigo).not.toMatch(/Vídeo tutorial disponível/);
    expect(codigo).toMatch(/Este vídeo não carregou/);
  });

  it("o vídeo usa src direto — sem <source>, cujo erro o <video> não ouve", () => {
    expect(codigo).not.toMatch(/<source\b/);
    expect(codigo).toMatch(/<video[\s\S]*?src=\{urlDoVideo\(/);
    expect(codigo).toMatch(/onError=\{\(\) => setErroVideo\(true\)\}/);
  });

  it("nenhuma duração escrita à mão — ela vem da gravação", () => {
    expect(codigo).not.toMatch(/minutos e \d+ segundos/);
    expect(codigo).not.toMatch(/DURACAO_TOTAL_SEGUNDOS/);
    expect(codigo).toMatch(/filme\.duracaoSegundos/);
  });

  it("sem vídeo gravado, diz isso em vez de abrir um player vazio", () => {
    expect(codigo).toMatch(/ainda não foram gravados/);
  });

  it("cores só por token — nada de preto ou branco cru", () => {
    expect(codigo).not.toMatch(/\b(text|bg|from|via|to)-(black|white)\b/);
  });
});
