import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { familiaDaCategoria, montarFicha, analiseDeEmergencia } from "./fichaMercado.ts";
import { REGRA_LINGUAGEM } from "./linguagem.ts";

const AQUI = dirname(fileURLToPath(import.meta.url));
const promptDaAnalise = readFileSync(join(AQUI, "marketAnalysis.ts"), "utf-8");

/**
 * O fundador cobriu em 05/09 que as análises estavam rasas: 1.061 caracteres no
 * total, fatores genéricos ("Polarização política crescente"), sem procedência e
 * sem usar o nosso dado próprio. Estes testes prendem as decisões que corrigiram
 * isso — são fáceis de desfazer sem querer, porque vivem dentro de um texto.
 */
describe("profundidade da análise — o que não pode voltar a encolher", () => {
  it("o esquema pede contexto do assunto e cenários dos dois lados", () => {
    expect(promptDaAnalise).toMatch(/"contexto"/);
    expect(promptDaAnalise).toMatch(/"cenarios"/);
  });

  it("a análise pede 6 a 9 frases, não 3 ou 4", () => {
    expect(promptDaAnalise).toMatch(/6 a 9 frases/);
    expect(promptDaAnalise).not.toMatch(/"analysis":"3-4 frases/);
  });

  it("exige procedência e número, não adjetivo", () => {
    expect(promptDaAnalise).toMatch(/CITE NÚMERO E NOME/);
    expect(promptDaAnalise).toMatch(/DIGA DE ONDE VEIO/);
  });

  it("proíbe inventar o histórico quando a ficha não o traz", () => {
    // A IA fabricou "nosso histórico aponta base rate de 50% em 250 mil dólares"
    // para uma categoria sem amostra. Fabricar dado próprio é o pior erro
    // possível aqui: destrói exatamente o que dá valor ao site.
    expect(promptDaAnalise).toMatch(/NÃO inventa|fabricação/i);
  });

  it("o teto de tokens comporta a resposta maior", () => {
    // Com 1000 a resposta era cortada no meio e o JSON vinha inválido — a
    // análise mais rica seria justamente a que falharia.
    const m = promptDaAnalise.match(/maxTokens:\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(2000);
  });
});

describe("número se escreve com algarismo", () => {
  it("a regra de linguagem manda usar 42%, não 'quarenta e dois porcento'", () => {
    // A regra antiga ("prefira o concreto", "nada de símbolo") foi aplicada
    // demais e a IA passou a soletrar porcentagem — pior de ler num site de
    // dados, não melhor.
    expect(REGRA_LINGUAGEM).toMatch(/algarismo/i);
    expect(REGRA_LINGUAGEM).toMatch(/42%/);
  });
});

describe("famílias de categoria — o que devolveu histórico à política", () => {
  it("junta os apelidos que as plataformas usam para política", () => {
    for (const c of ["politics", "trump", "primary elections", "United States", "midterms"]) {
      expect(familiaDaCategoria(c)).toBe("política");
    }
  });

  it("separa e-sports de esporte tradicional", () => {
    expect(familiaDaCategoria("esports")).toBe("e-sports");
    expect(familiaDaCategoria("mlb")).toBe("esportes");
    expect(familiaDaCategoria("tennis")).toBe("esportes");
  });

  it("junta as moedas numa família só", () => {
    for (const c of ["bitcoin", "ethereum", "solana", "xrp"]) {
      expect(familiaDaCategoria(c)).toBe("cripto");
    }
  });

  it("categoria desconhecida não é forçada para família nenhuma", () => {
    // Forçar traria mercado de assunto alheio para dentro da estatística.
    expect(familiaDaCategoria("parent for derivative")).toBeNull();
    expect(familiaDaCategoria(undefined)).toBeNull();
  });

  it("é insensível a caixa e espaço, como os dados chegam", () => {
    expect(familiaDaCategoria("  Politics ")).toBe("política");
    expect(familiaDaCategoria("PRIMARY ELECTIONS")).toBe("política");
  });

  it("a ficha continua saindo mesmo sem banco", async () => {
    // Sem Supabase (como aqui) não há histórico — e a ficha ainda precisa
    // entregar conteúdo, senão a análise volta a poder ficar vazia.
    const f = await montarFicha({ titulo: "X", precoPct: 42, categoria: "politics", plataforma: "Polymarket" });
    expect(f).toMatch(/42%/);
    expect(f.length).toBeGreaterThan(80);
  });
});

describe("com a IA fora do ar, a tela ainda tem conteúdo", () => {
  // Não é hipótese: em 05/09 os três provedores estavam esgotados ao mesmo tempo
  // (Anthropic sem crédito, Gemini 429, Groq no teto diário) e TODA análise do
  // site caía neste caminho — servindo 93 caracteres de "sem notícias recentes".
  const ficha = [
    "PREÇO E O QUE ELE PAGA: o mercado dá 42% de chance ao SIM. Quem apostar R$ 100 recebe R$ 238,10.",
    "RELÓGIO: fecha em 400 dias — prazo longo.",
    "NOSSO HISTÓRICO EM POLÍTICA: 80 mercados, favorito venceu 86,3%.",
  ].join("\n");

  it("usa a ficha em vez de um aviso seco", () => {
    const r = analiseDeEmergencia(ficha, 42, "Polymarket");
    expect(r.analysis).toMatch(/42%/);
    expect(r.analysis.length + r.keyFactors.join("").length).toBeGreaterThan(200);
  });

  it("avisa com honestidade que a leitura da IA não saiu", () => {
    // O usuário precisa saber o que está vendo. Omitir seria passar a ficha por
    // análise — e a análise é justamente o que não foi gerado.
    expect(analiseDeEmergencia(ficha, 42, "Polymarket").analysis).toMatch(/não pôde ser gerada/i);
  });

  it("não repete a ficha no parágrafo e nos marcadores", () => {
    const r = analiseDeEmergencia(ficha, 42, "Polymarket");
    expect(r.keyFactors.some((f) => r.analysis.includes(f))).toBe(false);
    expect(r.keyFactors).toHaveLength(2);
  });

  it("aguenta ficha vazia sem produzir frase quebrada", () => {
    const r = analiseDeEmergencia("", 42, "Kalshi");
    expect(r.analysis).toMatch(/42%/);
    expect(r.analysis).toMatch(/Kalshi/);
    expect(r.keyFactors).toEqual([]);
  });
});
