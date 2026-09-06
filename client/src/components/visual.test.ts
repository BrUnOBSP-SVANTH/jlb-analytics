import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..");
const css = readFileSync(join(SRC, "index.css"), "utf-8");

function arquivos(dir: string, saida: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) arquivos(p, saida);
    else if (/\.tsx$/.test(e)) saida.push(p);
  }
  return saida;
}

/**
 * Decisões de identidade visual que vivem espalhadas em CSS e marcação, e que
 * por isso somem sem ninguém perceber. Nenhum destes testes é sobre gosto — cada
 * um prende um motivo que custou medição para descobrir.
 */
describe("entrada de página — a animação que não animava", () => {
  it("é feita por keyframes, não por transição de estado", () => {
    // A primeira versão trocava um estado entre dois requestAnimationFrame e
    // NÃO animava: medindo a opacidade real durante a navegação, ela ficava em 1
    // o tempo todo. O navegador agrupa as mudanças entre quadros e nunca vê o
    // estado inicial, então não tem de onde transicionar. Keyframe não depende
    // disso — toca sempre que o elemento nasce.
    expect(css).toMatch(/@keyframes\s+entrada-pagina/);
    expect(css).toMatch(/\.entrada-pagina\s*\{[^}]*animation:/);
  });

  it("respeita quem pediu menos movimento", () => {
    const bloco = css.slice(css.indexOf("@keyframes entrada-pagina"));
    expect(bloco).toMatch(/prefers-reduced-motion[\s\S]{0,180}\.entrada-pagina\s*\{\s*animation:\s*none/);
  });

  it("a key da rota está lá — é ela que faz repetir a cada navegação", () => {
    // Sem `key={location}` o React reaproveita o mesmo nó e a animação só
    // aconteceria no primeiro carregamento da aba.
    const src = readFileSync(join(SRC, "components", "EntradaDePagina.tsx"), "utf-8");
    expect(src).toMatch(/key=\{location\}/);
    expect(src).toMatch(/entrada-pagina/);
  });

  it("está montada uma vez, envolvendo as rotas", () => {
    const app = readFileSync(join(SRC, "App.tsx"), "utf-8");
    expect(app).toMatch(/<EntradaDePagina>/);
  });
});

describe("dourado dos títulos", () => {
  it("o token existe nos DOIS temas, com tons diferentes", () => {
    // O mesmo dourado não serve nos dois: o tom claro some no fundo creme.
    // Um token só, definido uma vez, seria o erro clássico de tema claro.
    const ocorrencias = css.match(/--titulo:/g) ?? [];
    expect(ocorrencias.length).toBeGreaterThanOrEqual(2);
  });

  it("os títulos usam o token, não uma cor solta", () => {
    // Regra global não funcionaria: no Tailwind v4 a camada de utilitários vence
    // a base por ordem de camada, então `h1.text-foreground` perde por mais
    // específico que seja. A cor vai na marcação, vinda do token.
    const usos = arquivos(SRC).filter((f) =>
      /text-\[var\(--titulo\)\]/.test(readFileSync(f, "utf-8")));
    expect(usos.length).toBeGreaterThan(15);
  });

  it("o texto corrido NÃO é dourado", () => {
    // Cor de marca serve para guiar o olho. Se tudo é dourado, nada é — e em
    // corpo de 14px o dourado ainda derruba o contraste da leitura.
    expect(css).not.toMatch(/\bbody\s*\{[^}]*var\(--titulo\)/);
    expect(css).not.toMatch(/\bp\s*\{[^}]*var\(--titulo\)/);
  });
});

describe("fonte de display", () => {
  it("não é mais a face padrão de site gerado por IA", () => {
    // Outfit/Inter/Space Grotesk são as três faces que aparecem em todo site
    // feito às pressas. Continuam na lista como RESERVA, nunca como escolha.
    const linha = css.match(/--font-display:[^;]+;/)?.[0] ?? "";
    expect(linha).toMatch(/Fraunces/);
    expect(linha.indexOf("Fraunces")).toBeLessThan(linha.indexOf("Outfit"));
  });

  it("tem fallback real, e não só a família genérica", () => {
    const linha = css.match(/--font-display:[^;]+;/)?.[0] ?? "";
    expect(linha).toMatch(/serif|sans-serif/);
  });
});
