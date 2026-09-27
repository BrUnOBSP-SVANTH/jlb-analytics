import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SRC = join(AQUI, "..");
const header = readFileSync(join(AQUI, "PageHeader.tsx"), "utf-8");
const css = readFileSync(join(SRC, "index.css"), "utf-8");

/** O comentário que explica o defeito cita o defeito. Sétima vez nesta base. */
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

function paginas(dir: string, saida: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) paginas(p, saida);
    else if (e.endsWith(".tsx")) saida.push(p);
  }
  return saida;
}

/**
 * O CABEÇALHO DE 22 TELAS NÃO VOLTA A SER O DE QUALQUER SITE.
 *
 * A versão anterior empilhava, de uma vez, quatro tiques de página gerada: um
 * rótulo em CAIXA ALTA espaçada com pontinho pulsando acima de todo título; a
 * primeira palavra do título em dourado; entrada em cascata por elemento; e uma
 * linha de gradiente no topo.
 *
 * O mais caro deles estava escrito no próprio arquivo como "a assinatura dos
 * títulos da casa" — e era o contrário disso. Acentuar uma palavra do título é
 * o recurso que qualquer página usa, justamente por não exigir decisão nenhuma.
 *
 * Estes testes não são sobre gosto. Cada um prende uma decisão que custou uma
 * medição, e todos falham nomeando o que voltou.
 */
describe("o cabeçalho não tem os tiques de página gerada", () => {
  const fonte = semComentarios(header);

  it("o título sai numa cor só", () => {
    // Nenhum <span> dentro do h1 pintando um pedaço.
    const h1 = fonte.slice(fonte.indexOf("<h1"), fonte.indexOf("</h1>"));
    expect(h1).not.toMatch(/text-gradient-gold|text-gold|<span/);
  });

  it("não há rótulo em caixa alta com letra espaçada", () => {
    expect(fonte).not.toMatch(/uppercase/);
    expect(fonte).not.toMatch(/tracking-\[0\.\d+em\]|tracking-(wider|widest)/);
  });

  it("não há entrada em cascata — a rota inteira já anima uma vez", () => {
    // `EntradaDePagina` envolve as rotas em App.tsx. Escalonar de novo aqui
    // empilha duas animações na mesma tela.
    expect(fonte).not.toMatch(/animationDelay|slide-in-from|animate-in/);
    const app = readFileSync(join(SRC, "App.tsx"), "utf-8");
    expect(app).toMatch(/<EntradaDePagina>/);
  });

  it("o pontinho que pulsava saiu junto com o rótulo", () => {
    expect(fonte).not.toMatch(/animate-pulse/);
  });
});

/**
 * A RÉGUA MEDE, OU NÃO EXISTE.
 *
 * Ela foi desenhada com a justificativa certa — "probabilidade é a unidade
 * fundamental da plataforma" — e ficou meses sem medir nada: `probability`
 * nunca foi passado por nenhuma das 22 telas, e ela aparecia até em /termos e
 * /privacidade. Era papel de parede com aparência de dado.
 */
describe("a régua de probabilidade", () => {
  it("só é desenhada quando há uma medida", () => {
    expect(semComentarios(header)).toMatch(/\{medida && !compacto && <Regua/);
  });

  it("todo número vem com o que ele mede — `rotulo` é obrigatório", () => {
    const tipo = header.slice(header.indexOf("export interface Medida"), header.indexOf("interface Props"));
    expect(tipo).toMatch(/valor: number/);
    expect(tipo).toMatch(/rotulo: string/);
    expect(tipo, "rotulo opcional faz a régua voltar a ser enfeite").not.toMatch(/rotulo\?/);
  });

  it("🔴 NÃO É BARRA DE PROGRESSO: nada é preenchido até o valor", () => {
    // Barra de progresso preenche da esquerda até o valor e lê como "quanto já
    // foi". Probabilidade não acumula — tem uma POSIÇÃO numa escala inteira.
    // Se alguém trocar a agulha por uma largura, o desenho passa a dizer outra
    // coisa, e é isto que esta asserção impede.
    const regua = semComentarios(header.slice(header.indexOf("function Regua"), header.indexOf("export default")));
    expect(regua).not.toMatch(/width:\s*`\$\{/);
    expect(regua, "a agulha é posicionada, não dimensionada").toMatch(/left:\s*`\$\{pct\}%`/);
  });

  it("quem usa leitor de tela recebe o número, que o desenho é aria-hidden", () => {
    expect(header).toMatch(/sr-only/);
    expect((header.match(/aria-hidden/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * 🔴 DESFOQUE SÓ ONDE HÁ ALGO ATRÁS.
 *
 * Medido no navegador em 8 rotas: 97 camadas com `backdrop-filter` ativo, 74
 * delas sem nada atrás para desfocar (/imprensa: 25 de 27). Desfoque de fundo
 * força uma camada de composição e refaz o borrão a cada quadro — caro num
 * plano de 0,1 CPU e em celular, e sobre fundo liso não muda um pixel.
 *
 * Dos 181 usos de `.glass-card`, UM precisava: o painel do chat. Os modais
 * parecem candidatos e não são — a sobreposição deles já desfoca e escurece.
 * Depois da mudança: 20 camadas, todas sobre conteúdo.
 */
describe("desfoque de fundo", () => {
  it("a superfície de conteúdo não desfoca", () => {
    // Até a PRIMEIRA chave de fechamento, e não até `.glass-card:hover`: entre
    // os dois vive agora o bloco `.sobreposto`, que desfoca de propósito — e a
    // primeira versão deste teste o engolia junto e reprovava a própria
    // correção.
    const inicio = css.indexOf(".glass-card {");
    const bloco = css.slice(inicio, css.indexOf("}", inicio));
    expect(semComentarios(bloco)).not.toMatch(/backdrop-filter/);
  });

  it("existe `.sobreposto` para o que flutua, e a ordem das prefixadas está certa", () => {
    const bloco = css.slice(css.indexOf(".sobreposto {"));
    const corpo = bloco.slice(0, bloco.indexOf("}"));
    // A prefixada ANTES da padrão: na ordem inversa o Lightning CSS trata as
    // duas como a mesma propriedade e fica só com a -webkit-, que o Chrome
    // ignora (auditoria de 14/09, item 3).
    expect(corpo.indexOf("-webkit-backdrop-filter")).toBeLessThan(corpo.indexOf("\n    backdrop-filter"));
  });

  it("só o painel do chat usa `sobreposto` — e ele flutua sobre a página viva", () => {
    const usos = paginas(SRC)
      // Procura a CLASSE, e não a palavra — com os comentários fora.
      //
      // A primeira versão buscava `\bsobreposto\b` no arquivo inteiro e acusou
      // dois culpados: este teste, que cita a classe para poder prendê-la, e o
      // OnboardingTour, cujo comentário usa "sobreposto" em português corrente.
      // Nenhum dos dois aplica coisa alguma. É a armadilha de sempre nesta base,
      // pela sétima vez: asserção negativa que encontra a própria documentação.
      .filter((f) => !/\.(test|spec)\.tsx?$/.test(f))
      .filter((f) => /className=[^>]*\bsobreposto\b/.test(semComentarios(readFileSync(f, "utf-8"))))
      .map((f) => f.replace(/\\/g, "/").split("/client/src/")[1]);
    expect(usos).toEqual(["components/chat/ChatPanel.tsx"]);
    // `fixed` e sem sobreposição escurecendo atrás: é o único caso em que o
    // desfoque faz trabalho de verdade.
    const chat = readFileSync(join(SRC, "components/chat/ChatPanel.tsx"), "utf-8");
    expect(chat).toMatch(/fixed[^"]*glass-card sobreposto/);
  });
});
