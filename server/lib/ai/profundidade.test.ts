import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { familiaDaCategoria, montarFicha, analiseDeEmergencia } from "./fichaMercado.ts";
import { REGRA_LINGUAGEM } from "./linguagem.ts";

/**
 * SEM BANCO DE VERDADE. O comentário abaixo sempre disse "sem Supabase (como
 * aqui)", mas o .env é carregado nos testes e a ficha consultava o banco real a
 * cada execução — com a rede lenta, estourava os 5 s (visto em 14/09, com o DNS
 * da máquina fora). O cenário que o teste quer provar é justamente o banco
 * indisponível, então ele é simulado, não herdado do ambiente.
 */
vi.mock("../supaPaginado.ts", () => ({
  buscarTudo: async () => { throw new Error("sem banco no teste"); },
}));


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

/**
 * 🔴 "POR QUE ESTÁ DANDO ESSA ANÁLISE TÃO RASA?" — 27/09/2026.
 *
 * O fundador mandou a captura de um mercado e a pergunta. Estava mesmo rasa: a
 * emergência imprimia a primeira linha da ficha, avisava que a IA não respondeu
 * e parava. Duas frases, num dia em que os três provedores estavam fora.
 *
 * E o incômodo é que boa parte do que o modelo faria ali é CONTA, não
 * julgamento: comparar o preço com a taxa que medimos na categoria, cruzar a
 * direção da trajetória com o tempo que resta, dizer se a liquidez sustenta o
 * preço como consenso. Isso não precisa de provedor nenhum.
 *
 * A regra que estes testes prendem: cada frase só existe se o DADO dela
 * existir. Nenhuma preenche lacuna com suposição — sem histórico da categoria,
 * a frase do histórico não aparece, em vez de aparecer vaga.
 */
describe("a leitura que não depende de provedor nenhum", () => {
  // Os números exatos da captura do fundador.
  const fichaReal = [
    "PREÇO E O QUE ELE PAGA: o mercado dá 0% de chance ao SIM. Quem apostar R$ 100 no SIM recebe mais de R$ 20.000 se acertar; no NÃO (cotado a 100%), recebe R$ 100,00.",
    "RELÓGIO: fecha em 3 dias — janela em que notícia recente ainda muda o preço.",
    "LIQUIDEZ: US$ 11 mi negociados. Volume alto.",
    "TRAJETÓRIA DO MERCADO (39d, 40 snapshots): de 6% → 0% — tendência caindo (-5pp).",
    "NOSSO HISTÓRICO EM ECONOMIA: acompanhamos 122 mercados desta área até a liquidação oficial.",
  ].join("\n");

  const fatos = {
    simPct: 0, diasAteFechar: 3, volume: 11_000_000, volumeAlto: true, trajetoriaPp: -5,
    historico: { categoria: "Economia", resolvidos: 122, simAconteceuPct: 39.3 },
  };

  it("com os fatos, a análise raciocina em vez de reimprimir", () => {
    const antes = analiseDeEmergencia(fichaReal, 0, "Polymarket").analysis;
    const depois = analiseDeEmergencia(fichaReal, 0, "Polymarket", fatos).analysis;
    const frases = (t: string) => t.split(/(?<=[.!?])\s+/).filter((f) => f.trim().length > 12).length;
    // Medido em GANHO, e não num piso absoluto: a primeira linha da ficha já é
    // composta (preço, pagamento do SIM, pagamento do NÃO), então o texto antigo
    // não tinha 2 frases e sim 4. Foi a primeira versão deste teste que errou —
    // e um piso escolhido de cabeça teria reprovado o conserto certo.
    expect(frases(depois) - frases(antes)).toBeGreaterThanOrEqual(3);
    expect(depois.length).toBeGreaterThan(antes.length * 1.7);
  });

  it("compara o preço com a nossa taxa MEDIDA, com o tamanho da amostra", () => {
    const t = analiseDeEmergencia(fichaReal, 0, "Polymarket", fatos).analysis;
    expect(t).toMatch(/122 mercados/);
    expect(t).toMatch(/39,3%/);
    expect(t).toMatch(/39pp abaixo/);
    // E deixa claro que é passado da categoria, não projeção deste mercado —
    // é a diferença entre estatística e adivinhação com número.
    expect(t).toMatch(/passado da categoria, não uma projeção/i);
  });

  it("cruza a trajetória com o relógio", () => {
    const t = analiseDeEmergencia(fichaReal, 0, "Polymarket", fatos).analysis;
    expect(t).toMatch(/caindo/);
    expect(t).toMatch(/3 dias para fechar/);
    expect(t).toMatch(/trabalha contra o SIM/);
  });

  it("🔴 nenhum número sai fora do padrão pt-BR", () => {
    // "39.3%" e "81.1%" estavam indo crus para a tela E para o prompt — dá para
    // ver na própria captura do fundador. Ponto decimal antes de % num texto em
    // português é justamente o erro que esta plataforma existe para corrigir.
    const t = analiseDeEmergencia(fichaReal, 0, "Polymarket", fatos).analysis;
    expect(t, `número com ponto decimal: ${t}`).not.toMatch(/\d+\.\d+\s*%/);
  });

  it("frase sem dado não aparece — não se preenche lacuna com suposição", () => {
    const soPreco = { simPct: 40, diasAteFechar: null, volume: null, volumeAlto: false, trajetoriaPp: null, historico: null };
    const t = analiseDeEmergencia("PREÇO E O QUE ELE PAGA: o mercado dá 40% ao SIM.", 40, "Kalshi", soPreco).analysis;
    expect(t).not.toMatch(/amostra|trajetó|volume negociado/i);
    // E aí o aviso volta a ser o seco, porque não houve leitura nenhuma.
    expect(t).toMatch(/não pôde ser gerada/i);
  });

  it("sem os fatos, o comportamento antigo continua valendo", () => {
    // Os dois chamadores passam `fatos`, mas o parâmetro é opcional — e um
    // chamador futuro que esqueça não pode quebrar a tela.
    expect(() => analiseDeEmergencia(fichaReal, 0, "Polymarket")).not.toThrow();
  });
});
