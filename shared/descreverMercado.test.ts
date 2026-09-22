import { describe, it, expect } from "vitest";
import { descreverMercado, resumoDoMercado, rotuloEmPortugues } from "./descreverMercado.ts";
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
