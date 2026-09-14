import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "index.css"), "utf-8");

/**
 * Contraste dos acentos, medido — não estimado.
 *
 * A auditoria de 09/09/2026 encontrou 14 falhas de contraste NO TEMA CLARO
 * (TRV-07): o dourado da tradução em 1,71:1, a aba ativa em 1,76:1, o selo
 * "AO VIVO" em 1,84:1, o chip "Polymarket" em ~2,0:1. Todos abaixo do mínimo de
 * 4,5:1 da WCAG AA para texto.
 *
 * A causa não foi descuido pontual: a rampa de cor foi desenhada para o fundo
 * quase-preto e reaproveitada inteira sobre o creme. Por isso o conserto é um
 * TOKEN POR TEMA, e por isso este teste mede os dois — trocar uma cor "porque
 * ficou bonita" no escuro é o caminho natural para reintroduzir o defeito no
 * claro sem ninguém ver.
 */

/** oklch → sRGB linear. Fórmula de referência do CSS Color 4. */
function oklchParaRgb(L: number, C: number, Hdeg: number): [number, number, number] {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

const luminancia = ([r, g, b]: [number, number, number]) =>
  0.2126 * Math.max(0, r) + 0.7152 * Math.max(0, g) + 0.0722 * Math.max(0, b);

function contraste(a: [number, number, number], b: [number, number, number]): number {
  const la = luminancia(oklchParaRgb(...a)), lb = luminancia(oklchParaRgb(...b));
  const [alto, baixo] = la > lb ? [la, lb] : [lb, la];
  return (alto + 0.05) / (baixo + 0.05);
}

/**
 * Lê um token oklch do CSS, dentro do bloco do tema pedido.
 *
 * Sem regex montada por concatenação: a primeira versão deste teste construía o
 * padrão com `new RegExp` e template string, e as barras invertidas se perderam
 * no caminho até o arquivo. Fatiar texto não tem esse problema.
 */
function token(nome: string, tema: "escuro" | "claro"): [number, number, number] {
  const inicioBloco = tema === "escuro" ? css.indexOf(":root {") : css.indexOf(".light {");
  const linhas = css.slice(inicioBloco).split(/\r?\n/);
  const fim = linhas.findIndex((l, i) => i > 0 && l.startsWith("}"));
  const bloco = linhas.slice(0, fim === -1 ? undefined : fim);

  const decl = bloco.find((l) => l.trim().startsWith(nome + ":"));
  if (!decl) throw new Error(`token ${nome} não encontrado no tema ${tema}`);

  const abre = decl.indexOf("oklch(");
  const dentro = decl.slice(abre + 6, decl.indexOf(")", abre));
  const [L, C, H] = dentro.trim().split(" ").filter(Boolean).map(Number);
  if (![L, C, H].every(Number.isFinite)) throw new Error(`token ${nome} ilegível: ${decl.trim()}`);
  return [L, C, H];
}

/** WCAG AA para texto normal. */
const MINIMO = 4.5;

const ACENTOS = ["--gold-legivel", "--positivo-legivel", "--negativo-legivel", "--azul-legivel"];

describe("acentos legíveis nos DOIS temas", () => {
  for (const tema of ["escuro", "claro"] as const) {
    it(`tema ${tema}: todo acento passa de ${MINIMO}:1`, () => {
      const fundo = token("--background", tema);
      for (const nome of ACENTOS) {
        const razao = contraste(token(nome, tema), fundo);
        expect(razao, `${nome} no tema ${tema} mede ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(MINIMO);
      }
    });
  }

  it("o dourado do tema claro não é o mesmo do escuro", () => {
    // Era esse o defeito: uma rampa só, os dois temas. Se algum dia os dois
    // valores voltarem a coincidir, é sinal de que alguém "simplificou".
    expect(token("--gold-legivel", "claro")).not.toEqual(token("--gold-legivel", "escuro"));
  });

  it("mede o que a auditoria mediu: o dourado antigo REPROVA no claro (sanidade da conta)", () => {
    // Guarda-chuva contra falso positivo: se a função de contraste estivesse
    // errada, ela aprovaria o valor que sabidamente falha. O dourado de marca
    // (0.78 0.12 85) sobre o creme foi medido pela auditoria em 1,71:1.
    const antigo: [number, number, number] = [0.78, 0.12, 85];
    expect(contraste(antigo, token("--background", "claro"))).toBeLessThan(2.5);
  });
});

/**
 * AS CORES QUE OS UTILITÁRIOS USAM — o buraco que o bloco acima não cobria.
 *
 * Em 14/09/2026 descobrimos, no navegador, que o tema claro inteiro pintava os
 * destaques do tema ESCURO. `@theme inline` embute o valor literal no
 * utilitário (`.text-gold{color:#dbb155}`), e as seis sobrescritas de
 * `--color-*` dentro de `.light` nunca chegavam à tela: texto dourado, verde,
 * vermelho e de aviso a 1,87–3,56:1. Este arquivo passava o tempo todo, porque
 * media os tokens `-legivel` — que funcionam — e não os que `text-gold`,
 * `text-positive` e companhia de fato leem.
 */
const DESTAQUES = ["--gold", "--positive", "--negative", "--warning", "--level3", "--level4"];

describe("destaques usados por text-gold, text-positive e cia.", () => {
  for (const tema of ["escuro", "claro"] as const) {
    it(`tema ${tema}: passam de ${MINIMO}:1 sobre o fundo E sobre o card`, () => {
      const superficies = { fundo: token("--background", tema), card: token("--card", tema) };
      for (const nome of DESTAQUES) {
        for (const [onde, cor] of Object.entries(superficies)) {
          const razao = contraste(token(nome, tema), cor);
          expect(razao, `${nome} sobre ${onde} no tema ${tema}: ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(MINIMO);
        }
      }
    });
  }

  it("texto sobre fundo dourado (text-on-accent) passa nos dois temas", () => {
    for (const tema of ["escuro", "claro"] as const) {
      const razao = contraste(token("--on-accent", tema), token("--gold", tema));
      expect(razao, `on-accent sobre gold no tema ${tema}: ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(MINIMO);
    }
  });
});

/**
 * NENHUMA SOBRESCRITA MORTA. É a checagem que teria pegado o defeito no dia em
 * que ele nasceu, sem abrir navegador: se o `@theme inline` define `--color-X`
 * com um valor literal, redefinir `--color-X` dentro de `.light` não tem efeito
 * nenhum — e parece ter.
 */
/** Comentário fora: o comentário que EXPLICA o defeito cita os mesmos nomes de
 *  token, e sem isto a guarda acusava a própria documentação (aconteceu na
 *  primeira rodada — é a quinta vez que esse tipo de teste morde nesta base). */
const cssSemComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");

function bloco(abertura: string): string[] {
  const linhas = cssSemComentarios.slice(cssSemComentarios.indexOf(abertura)).split(/\r?\n/);
  const fim = linhas.findIndex((l, i) => i > 0 && l.startsWith("}"));
  return linhas.slice(0, fim === -1 ? undefined : fim);
}

describe("@theme inline × .light", () => {
  const tema = new Map(
    bloco("@theme inline {")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("--color-"))
      .map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()] as const),
  );

  it("toda cor que o .light redefine é lida por var() no @theme", () => {
    const redefinidas = bloco(".light {").map((l) => l.trim()).filter((l) => l.startsWith("--color-"))
      .map((l) => l.slice(0, l.indexOf(":")));
    const mortas = redefinidas.filter((nome) => !(tema.get(nome) ?? "").startsWith("var("));
    expect(mortas, `sobrescritas sem efeito no tema claro: ${mortas.join(", ")}`).toEqual([]);
  });

  it("os destaques de cada tema chegam aos utilitários por var()", () => {
    for (const nome of ["gold", "positive", "negative", "warning", "level3", "level4", "on-accent"]) {
      expect(tema.get(`--color-${nome}`), `--color-${nome} no @theme`).toBe(`var(--${nome});`);
    }
  });
});
