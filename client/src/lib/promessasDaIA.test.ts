import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * O que a tela promete da IA tem que ser o que o código faz.
 *
 * O QUE A AUDITORIA DE 21/09 ACHOU (IAC-01). A ficha dizia que a IA estima um
 * valor justo "independente do preço do mercado". Ela não estima: o preço entra
 * no prompt, e `clampFairValue` (server/lib/ai/guardrails.ts) prende o
 * resultado a ±15pp do mercado — menos ainda perto dos extremos — e a uma faixa
 * de 5% a 95%. O próprio track record media "distância média do preço: 1,1pp" e
 * ninguém explicava por quê.
 *
 * E /previsao prometia "a IA escolhe entre mais de 30 modelos econométricos" e
 * "cita a linha de pesquisa acadêmica (Harvard, USP, Stanford, ITA)". Os
 * modelos são uma lista no prompt: nenhum é ajustado a dados, os coeficientes
 * saem da própria IA e as citações podiam ser inventadas.
 *
 * Num produto cujo valor é rigor, descrever a ferramenta melhor do que ela é
 * custa mais caro do que a limitação. Este teste prende o texto às duas coisas
 * que o código realmente garante.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ler = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf-8");

/**
 * O texto SEM os comentários.
 *
 * ⚠️ Cada conserto deste achado deixou um comentário explicando o que a frase
 * antiga dizia — e é assim que a casa escreve, para o próximo a mexer entender
 * por quê. Um teste que lesse a prosa acusaria justamente a explicação do
 * conserto, e a saída seria apagar a explicação: o pior dos dois mundos.
 */
const semComentarios = (texto: string) =>
  texto
    .replace(/\/\*[\s\S]*?\*\//g, " ")                        // /* … */ e /** … */
    .split(/\r?\n/).map((l) => l.replace(/^\s*\/\/.*$/, " ")).join("\n")  // // … na linha inteira
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");                   // {/* … */} do JSX

describe("IAC-01 — a trava do fair value é dita na tela", () => {
  it("a ficha do mercado conta que a IA parte do preço e tem teto", () => {
    const ficha = ler("client", "src", "pages", "MarketDetail.tsx");
    expect(ficha).toContain("parte do preço do mercado");
    expect(ficha).toMatch(/15 pontos percentuais/);
    expect(ficha).toMatch(/nunca publica abaixo de 5% nem acima de 95%/);
  });

  it("🔴 a ficha NÃO diz mais que o valor justo é independente do preço", () => {
    const ficha = ler("client", "src", "pages", "MarketDetail.tsx");
    // O comentário explica o defeito e cita a frase antiga de propósito; o que
    // não pode voltar é a AFIRMAÇÃO, dentro do texto que o usuário lê.
    expect(semComentarios(ficha)).not.toMatch(/independente do preço do mercado/);
  });

  it("o /track-record explica por que a IA fica perto do mercado", () => {
    const tr = ler("client", "src", "pages", "TrackRecord.tsx");
    expect(tr).toMatch(/A IA parte do preço/);
    expect(tr).toMatch(/15 pontos percentuais/);
  });

  it("os números do texto batem com a trava do código", () => {
    // Se alguém afrouxar a trava e esquecer o texto, isto acusa.
    const guardrails = ler("server", "lib", "ai", "guardrails.ts");
    expect(guardrails).toMatch(/clampFairValue\([^)]*maxDev = 15, min = 5, max = 95/);
  });
});

describe("IAC-01 — as promessas de /previsao e da home", () => {
  it("a tela de previsão não promete modelo ajustado nem citação acadêmica", () => {
    const prev = semComentarios(ler("client", "src", "pages", "Previsao.tsx"));
    expect(prev).not.toContain("equação matemática exata");
    expect(prev).not.toMatch(/Harvard, USP, Stanford, ITA/);
    // E diz o que de fato acontece:
    expect(prev).toMatch(/ILUSTRATIVA|ilustrativa/);
    expect(prev).toMatch(/não um (modelo )?ajust/);
  });

  it("🔴 a home não promete mais 'o acerto de cada modelo publicado'", () => {
    // O track record publica acerto por PROVEDOR e por TEMA — nunca por modelo.
    const home = semComentarios(ler("client", "src", "pages", "Home.tsx"));
    expect(home).not.toContain("com o acerto de cada um publicado");
  });
});

describe("IAC-01 — o prompt não manda a IA se achar infalível", () => {
  const prompt = () => semComentarios(ler("server", "lib", "ai", "modelPredict.ts"));

  it("🔴 sai o 'melhor sistema de previsão do mundo'", () => {
    // Incentivava exatamente o excesso de confiança que a plataforma ensina a
    // evitar — e o placar mostra a conta: ao divergir do mercado, a IA acerta
    // 33% de 504.
    expect(prompt()).not.toContain("melhor sistema de previsão quantitativa do mundo");
    expect(prompt()).not.toMatch(/Nate Silver \(538\)/);
  });

  it("a fórmula é declarada ilustrativa, e a citação só do que foi entregue", () => {
    const p = prompt();
    expect(p).toMatch(/A FÓRMULA E OS COEFICIENTES SÃO ILUSTRATIVOS/);
    expect(p).toMatch(/NÃO CITE paper, autor, ano ou journal que não esteja nas fontes entregues/);
    // A instrução que produzia referência inventada:
    expect(p).not.toContain("cite o paper original com ano e journal");
  });
});
