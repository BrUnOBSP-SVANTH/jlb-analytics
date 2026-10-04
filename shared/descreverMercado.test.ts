import { describe, it, expect } from "vitest";
import {
  descreverMercado, descreverPolymarket, resumoDoMercado, rotuloEmPortugues,
  rotuloDaOpcao, ehEscadaDePrazo, tituloDoGrupo, rotulosSaoSimNao,
} from "./descreverMercado.ts";
import { pctDeProb } from "./formato.ts";

const resumo = (m: Parameters<typeof descreverMercado>[0]) =>
  resumoDoMercado(descreverMercado(m), (p) => pctDeProb(p));

/**
 * Os casos são os da Auditoria 21/09 (DAD-01 e DAD-02), com os dados exatos
 * que o catálogo do Polymarket devolveu em 22/09.
 */
describe("DAD-01 — o título é a PERGUNTA, nunca o guarda-chuva do evento", () => {
  it("escada de datas: o evento perde a data, a pergunta guarda", () => {
    const d = descreverMercado({
      pergunta: "US announces end of Iranian blockade by September 30, 2026?",
      tituloDoEvento: "US announces end of Iranian blockade by...?",
      rotulos: ["Yes", "No"], precos: [0.115, 0.885],
    });
    expect(d.titulo).toBe("US announces end of Iranian blockade by September 30, 2026?");
    expect(d.subtitulo).toBeUndefined();   // truncado nunca vira texto de tela
    expect(d.tipo).toBe("escada-de-datas");
  });

  it("patamar: '(HIGH) $3.0T' está na pergunta e sumia no evento", () => {
    const d = descreverMercado({
      pergunta: "Will Anthropic's valuation hit (HIGH) $3.0T by December 31?",
      tituloDoEvento: "Will Anthropic’s valuation hit by December 31?",
      rotulos: ["Yes", "No"], precos: [0.245, 0.755],
    });
    expect(d.titulo).toContain("(HIGH) $3.0T");
  });

  it("negRisk de dois desfechos: o card dizia '93% SIM' sem dizer de qual partido", () => {
    const d = descreverMercado({
      pergunta: "Will the Democratic Party control the House after the 2026 Midterm elections?",
      tituloDoEvento: "Which party will win the House in 2026?",
      rotulos: ["Yes", "No"], precos: [0.925, 0.075],
    });
    expect(d.titulo).toContain("Democratic Party");
    expect(d.subtitulo).toBe("Which party will win the House in 2026?");
  });

  it("Over/Under vira SIM/NÃO hoje — e 'SIM' ali não quer dizer nada", () => {
    const d = descreverMercado({
      pergunta: "Map 2 Total Rounds: Over/Under 21.5",
      tituloDoEvento: "Counter-Strike: Inner Circle Esports vs 3DMAX (BO3) - Logitech G Play Connect Playoffs",
      rotulos: ["Over", "Under"], precos: [0.51, 0.49],
    });
    expect(d.tipo).toBe("dois-rotulos");
    expect(resumoDoMercado(d, (p) => pctDeProb(p))).toBe("Mais 51% · Menos 49%");
    expect(d.subtitulo).toContain("Counter-Strike");
  });

  it("time × time mostra os dois times, não SIM/NÃO", () => {
    expect(resumo({
      pergunta: "Tampa Bay Rays vs. New York Yankees",
      tituloDoEvento: "Tampa Bay Rays vs. New York Yankees",
      rotulos: ["Tampa Bay Rays", "New York Yankees"], precos: [0.485, 0.515],
    })).toBe("Tampa Bay Rays 49% · New York Yankees 52%");
  });

  it("vários desfechos: o número vem SEMPRE com o nome (DAD-02)", () => {
    const d = descreverMercado({
      pergunta: "Brazil Presidential Election",
      desfechos: [
        { rotulo: "Flávio Bolsonaro", prob: 0.61 },
        { rotulo: "Lula", prob: 0.27 },
        { rotulo: "Outro", prob: 0.12 },
      ],
    });
    expect(d.tipo).toBe("varios-desfechos");
    expect(resumoDoMercado(d, (p) => pctDeProb(p))).toBe("Flávio Bolsonaro 61%");
    expect(d.lider!.rotulo).toBe("Flávio Bolsonaro");
  });

  it("Sim/Não de verdade continua Sim/Não", () => {
    const d = descreverMercado({
      pergunta: "Will Bitcoin close above $80,000 in 2026?",
      rotulos: ["Yes", "No"], precos: [0.8, 0.2],
    });
    expect(d.tipo).toBe("sim-nao");
    expect(resumoDoMercado(d, (p) => pctDeProb(p))).toBe("Sim 80%");
    expect(d.desfechos.map((x) => x.rotulo)).toEqual(["Sim", "Não"]);
  });
});

describe("regras de borda", () => {
  it("evento igual à pergunta não vira subtítulo repetido", () => {
    expect(descreverMercado({
      pergunta: "St. Tropez: Matteo Martineau vs Tristan Schoolkate",
      tituloDoEvento: "St. Tropez: Matteo Martineau vs Tristan Schoolkate",
      rotulos: ["Matteo Martineau", "Tristan Schoolkate"], precos: [0.9995, 0.0005],
    }).subtitulo).toBeUndefined();
  });

  it("evento contido na pergunta também não vira subtítulo", () => {
    expect(descreverMercado({
      pergunta: "Porto: Veronika Podrez vs Madalena Matias — vencedora do set 2",
      tituloDoEvento: "Porto: Veronika Podrez vs Madalena Matias",
    }).subtitulo).toBeUndefined();
  });

  it("sem pergunta, usa o evento — e apara o truncamento", () => {
    expect(descreverMercado({ tituloDoEvento: "Saudi Oil Pipeline restarts by...?" }).titulo)
      .toBe("Saudi Oil Pipeline restarts");
  });

  it("só a probabilidade de SIM já descreve um binário", () => {
    expect(resumo({ pergunta: "Chove amanhã?", probSim: 0.42 })).toBe("Sim 42%");
  });

  it("rótulos em inglês ganham nome em português", () => {
    expect(rotuloEmPortugues("Yes")).toBe("Sim");
    expect(rotuloEmPortugues("UNDER")).toBe("Menos");
    expect(rotuloEmPortugues("Tie")).toBe("Empate");
    expect(rotuloEmPortugues("Lula")).toBe("Lula"); // nome próprio não se traduz
  });

  it("mercado sem nada não quebra", () => {
    const d = descreverMercado({});
    expect(d.titulo).toBe("");
    expect(d.desfechos).toEqual([]);
    expect(resumoDoMercado(d, (p) => pctDeProb(p))).toBe("");
  });
});

describe("descreverPolymarket — os campos da plataforma vêm como texto", () => {
  it("lê os arrays em texto e descreve", () => {
    const d = descreverPolymarket({
      question: "Will the Democratic Party control the House after the 2026 Midterm elections?",
      eventTitle: "Which party will win the House in 2026?",
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.925", "0.075"]',
    });
    expect(d.tipo).toBe("sim-nao");
    expect(d.desfechos[0].prob).toBeCloseTo(0.925, 3);
    expect(d.subtitulo).toBe("Which party will win the House in 2026?");
  });

  it("texto quebrado não derruba a tela — cai no que sobrou", () => {
    const d = descreverPolymarket({ question: "Vai chover?", outcomes: "{quebrado", outcomePrices: "nada", yesProb: 0.3 });
    expect(d.tipo).toBe("sim-nao");
    expect(d.desfechos[0].prob).toBe(0.3);
  });
});

describe("o caso em que o EVENTO é o título certo", () => {
  it("evento agregado: a 'pergunta' da plataforma é a do desfecho líder", () => {
    // Caso real que o teste de destaques já guardava: um card escrito
    // "25 bps 62%" não diz de que mercado se trata. Com vários desfechos, o
    // específico vem nos desfechos e o título é o guarda-chuva.
    const d = descreverMercado({
      pergunta: "25 bps",
      tituloDoEvento: "Decisão do Fed em setembro",
      desfechos: [
        { rotulo: "25 bps", prob: 0.62 },
        { rotulo: "Manter", prob: 0.3 },
        { rotulo: "50 bps", prob: 0.08 },
      ],
    });
    expect(d.titulo).toBe("Decisão do Fed em setembro");
    expect(d.subtitulo).toBeUndefined();          // o evento virou o título
    expect(resumoDoMercado(d, (p) => pctDeProb(p))).toBe("25 bps 62%");
  });

  it("mas em binário a pergunta continua mandando", () => {
    const d = descreverMercado({
      pergunta: "Will the Democratic Party control the House after the 2026 Midterm elections?",
      tituloDoEvento: "Which party will win the House in 2026?",
      rotulos: ["Yes", "No"], precos: [0.925, 0.075],
    });
    expect(d.titulo).toContain("Democratic Party");
  });
});

/**
 * Os grupos (03/10/2026): o servidor passou a mandar UM card por evento com
 * TODAS as opções. Os exemplos são os do catálogo publicado naquele dia.
 */
describe("card de evento — grupo exclusivo ou de opções independentes", () => {
  const indiana = {
    question: "Indiana enacts data center moratorium by...?",
    eventTitle: "Indiana enacts data center moratorium by...?",
    outcomes: JSON.stringify(["December 31, 2026", "June 30, 2027", "December 31, 2027", "December 31, 2028"]),
    outcomePrices: JSON.stringify(["0.045", "0.09", "0.11", "0.185"]),
    tipoDeGrupo: "independentes" as const,
  };

  it("🔴 escada de datas: todas as datas, NA ORDEM, com 'até'", () => {
    const d = descreverPolymarket(indiana);
    expect(d.tipo).toBe("opcoes-independentes");
    expect(d.desfechos.map((o) => o.rotulo)).toEqual([
      "até 31 de dezembro de 2026", "até 30 de junho de 2027", "até 31 de dezembro de 2027", "até 31 de dezembro de 2028",
    ]);
    // Ordenar por chance poria 2028 primeiro e embaralharia o tempo.
    expect(d.desfechos.map((o) => o.prob)).toEqual([0.045, 0.09, 0.11, 0.185]);
    // A opção em destaque é a 1ª — a mesma que liquida a aposta da banca
    // (mercadoQueLiquida usa outcomeMarketIds[0]), nunca a "mais provável".
    expect(d.lider).toEqual({ rotulo: "até 31 de dezembro de 2026", prob: 0.045 });
  });

  it("o título não fica com o 'by...?' pendurado", () => {
    expect(descreverPolymarket(indiana).titulo).toBe("Indiana enacts data center moratorium by when?");
    expect(tituloDoGrupo("US-Iran Final Nuclear Deal by…?")).toBe("US-Iran Final Nuclear Deal by when?");
    expect(tituloDoGrupo("Democratic Presidential Nominee 2028")).toBe("Democratic Presidential Nominee 2028");
  });

  it("o resumo da escada mostra as duas pontas, não um 'líder'", () => {
    expect(resumoDoMercado(descreverPolymarket(indiana), (p) => pctDeProb(p)))
      .toBe("até 31 de dezembro de 2026 5% … até 31 de dezembro de 2028 19%");
  });

  it("🔴 disputa de DOIS (Flávio × Lula) é disputa, não 'dois rótulos' de um binário", () => {
    const d = descreverPolymarket({
      question: "Brazil Presidential Election", eventTitle: "Brazil Presidential Election",
      outcomes: JSON.stringify(["Luiz Inácio Lula da Silva", "Flávio Bolsonaro"]),
      outcomePrices: JSON.stringify(["0.415", "0.592"]),
      tipoDeGrupo: "exclusivos",
    });
    expect(d.tipo).toBe("varios-desfechos");
    expect(d.lider?.rotulo).toBe("Flávio Bolsonaro");
  });

  it("faixa de preço (escada que não é de prazo) não ganha 'até'", () => {
    const d = descreverPolymarket({
      question: "What will Gold (GC) hit by end of December?",
      eventTitle: "What will Gold (GC) hit by end of December?",
      outcomes: JSON.stringify(["↑ $4,500", "↑ $5,000"]),
      outcomePrices: JSON.stringify(["0.495", "0.2"]),
      tipoDeGrupo: "independentes",
    });
    expect(d.desfechos.map((o) => o.rotulo)).toEqual(["↑ US$ 4.500", "↑ US$ 5.000"]);
  });
});

describe("rótulo de opção em português", () => {
  it("data por extenso e dinheiro em dólar", () => {
    expect(rotuloEmPortugues("December 31, 2026")).toBe("31 de dezembro de 2026");
    expect(rotuloEmPortugues("October 31")).toBe("31 de outubro");
    expect(rotuloEmPortugues("$86,000")).toBe("US$ 86.000");
    expect(rotuloEmPortugues("Above $3.5")).toBe("Acima de US$ 3,5");
  });

  it("os rótulos reais do Kalshi (catálogo de 03/10/2026)", () => {
    expect(rotuloEmPortugues("Before Oct 10, 2026")).toBe("antes de 10 de outubro de 2026");
    expect(rotuloEmPortugues("Before Jan 1, 2027")).toBe("antes de 1º de janeiro de 2027");
    expect(rotuloEmPortugues("At least $4.45")).toBe("Pelo menos US$ 4,45");
    expect(rotuloEmPortugues("Above 6")).toBe("Acima de 6");
    expect(rotuloEmPortugues("$76,600 or above")).toBe("US$ 76.600 ou mais");
    expect(rotuloEmPortugues("10 or more")).toBe("10 ou mais");
    expect(rotuloEmPortugues("Above 1,000")).toBe("Acima de 1.000");
    // O prefixo só traduz quando o rótulo INTEIRO vira português — meio-a-meio
    // ("Exatamente 4 songs") é pior que o original.
    expect(rotuloEmPortugues("Exactly 4 songs")).toBe("Exactly 4 songs");
    expect(rotuloEmPortugues("At least 2.5 inches")).toBe("At least 2,5 inches");
  });

  it("o 'até' da escada não se soma a um rótulo que já traz o prazo", () => {
    expect(rotuloDaOpcao("Before Oct 10, 2026", { prazo: true })).toBe("antes de 10 de outubro de 2026");
    expect(rotuloDaOpcao("Dec 31, 2026", { prazo: true })).toBe("até 31 de dezembro de 2026");
  });

  it("nome de gente e de time fica como está", () => {
    expect(rotuloEmPortugues("Flávio Bolsonaro")).toBe("Flávio Bolsonaro");
    expect(rotuloEmPortugues("Mayor Adams")).toBe("Mayor Adams");
  });

  it("'até' só quando o evento é de prazo — e por palavra inteira", () => {
    expect(rotuloDaOpcao("June 30, 2027", { prazo: true })).toBe("até 30 de junho de 2027");
    expect(rotuloDaOpcao("Lula", { prazo: true })).toBe("Lula");
    expect(ehEscadaDePrazo("Russia x Ukraine ceasefire agreement by...?")).toBe(true);
    // Casar por substring já mordeu 4× neste projeto (CLAUDE.md): "by" dentro
    // de "Ruby" ou "nearby" não é prazo.
    expect(ehEscadaDePrazo("Ruby on Rails 9 release")).toBe(false);
    expect(ehEscadaDePrazo("Nearby asteroid passes Earth?")).toBe(false);
  });
});

describe("rotulosSaoSimNao", () => {
  it("lê o texto JSON do Polymarket", () => {
    expect(rotulosSaoSimNao('["Yes", "No"]')).toBe(true);
    expect(rotulosSaoSimNao('["Spirit", "ShindeN"]')).toBe(false);
    expect(rotulosSaoSimNao(["Over", "Under"])).toBe(false);
    expect(rotulosSaoSimNao(undefined)).toBe(true);
  });
});
