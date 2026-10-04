import { describe, it, expect } from "vitest";
import {
  montarCardDoEvento, agruparOpcoesDoEvento, organizarOpcoes, tipoPeloStrike, prefixoComumDosRotulos, TETO_INDEPENDENTES,
  type DesfechoDoEvento, type OpcaoDaFonte,
} from "./eventoAgregado.ts";

// O evento real que a auditoria de 21/09 usou como exemplo, com os ids que estão
// no banco de produção: a previsão do fundador em "Democratic Presidential
// Nominee 2028 — Alexandria Ocasio-Cortez" (mercado 559653).
const EVENTO = "14321";
const desfecho = (rotulo: string, prob: number, idDoMercado: string, token = ""): DesfechoDoEvento =>
  ({ rotulo, prob, idDoMercado, token });

const DISPUTA = [
  desfecho("Alexandria Ocasio-Cortez", 0.18, "559653", "107064985435494333113391038470401719113272800530429703182710416066774068907304"),
  desfecho("Jon Ossoff", 0.17, "559655", "tok-ossoff"),
  desfecho("Gavin Newsom", 0.13, "559657", "tok-newsom"),
];

describe("montarCardDoEvento — o card é o EVENTO, não quem está na frente", () => {
  it("🔴 o id NÃO muda quando o líder muda", () => {
    // Este é o defeito inteiro (DAD-03). Antes o card herdava o id do mercado
    // líder: virava a disputa, virava o id — e o link compartilhado, a
    // watchlist, o alerta e a análise guardada passavam a falar de outro
    // candidato, sem nenhum erro aparecer na tela.
    const hoje = montarCardDoEvento(EVENTO, DISPUTA);
    const amanha = montarCardDoEvento(EVENTO, [
      desfecho("Jon Ossoff", 0.31, "559655", "tok-ossoff"),          // virou líder
      desfecho("Alexandria Ocasio-Cortez", 0.16, "559653", "tok-aoc"),
      desfecho("Gavin Newsom", 0.13, "559657", "tok-newsom"),
    ]);
    expect(hoje.id).toBe("ev-14321");
    expect(amanha.id).toBe(hoje.id);
    // …e o card passa a mostrar o novo líder, que é o que tinha de mudar:
    expect(JSON.parse(amanha.outcomes)[0]).toBe("Jon Ossoff");
  });

  it("as quatro listas ficam alinhadas — mesmo índice, mesmo desfecho", () => {
    // Uma lista fora de ordem faz a tela mostrar o histórico de um candidato sob
    // o nome de outro: desenha bonito e mente.
    const c = montarCardDoEvento(EVENTO, DISPUTA);
    const rotulos = JSON.parse(c.outcomes) as string[];
    const precos = JSON.parse(c.outcomePrices) as string[];
    const tokens = JSON.parse(c.outcomeTokens) as string[];
    const mercados = JSON.parse(c.outcomeMarketIds) as string[];

    expect(rotulos).toHaveLength(3);
    expect([precos, tokens, mercados].every((l) => l.length === rotulos.length)).toBe(true);
    const i = rotulos.indexOf("Alexandria Ocasio-Cortez");
    expect(mercados[i]).toBe("559653");
    expect(precos[i]).toBe("0.1800");
    expect(tokens[i]).toContain("10706498");
  });

  it("o preço guarda 4 casas — arredondar aqui já anunciou edge que não existia", () => {
    // 18,5% lido como 19% fazia a calculadora inventar meio ponto de vantagem.
    const c = montarCardDoEvento(EVENTO, [desfecho("A", 0.185, "1"), desfecho("B", 0.4449, "2"), desfecho("C", 0.37, "3")]);
    expect(JSON.parse(c.outcomePrices)).toEqual(["0.1850", "0.4449", "0.3700"]);
  });

  it("desfecho sem token ou sem mercado entra como vazio, não desloca a lista", () => {
    // O índice é o que liga rótulo, preço, token e mercado. Um buraco que
    // encolhe a lista passa a apontar cada nome para o dado do vizinho.
    const c = montarCardDoEvento(EVENTO, [
      desfecho("A", 0.5, "1", "tok-a"),
      { rotulo: "B", prob: 0.3, idDoMercado: "", token: "" },
      desfecho("C", 0.2, "3", "tok-c"),
    ]);
    expect(JSON.parse(c.outcomeTokens)).toEqual(["tok-a", "", "tok-c"]);
    expect(JSON.parse(c.outcomeMarketIds)).toEqual(["1", "", "3"]);
  });

  it("o prefixo `ev-` é o que separa card de mercado no resto do sistema", () => {
    // `shared/liquidacao.ts` usa exatamente este prefixo para saber que o card
    // não liquida sozinho — evento não tem SIM/NÃO.
    expect(montarCardDoEvento("  99  ", DISPUTA).id).toBe("ev-99");
  });
});


/** Uma opção como a rota a monta a partir do Gamma. */
const opcao = (rotulo: string, prob: number, id: string, extra: Partial<OpcaoDaFonte<string>> = {}): OpcaoDaFonte<string> =>
  ({ rotulo, prob, idDoMercado: id, token: `tok-${id}`, ref: id, ...extra });

/**
 * Os casos REAIS da varredura de 03/10/2026 — o catálogo publicado contra a
 * fonte: de 85 eventos do Polymarket com várias opções, o site mostrava todas
 * em 6. Os dados abaixo são os do Gamma naquele dia.
 */
describe("agruparOpcoesDoEvento — evento de várias opções vira um card com todas", () => {
  it("🔴 Indiana (escada de datas, NÃO negRisk): as 4 datas, na ordem da plataforma", () => {
    // O site mostrava só "11%" — o degrau de 31/12/2027, o de maior volume —
    // como se fosse a chance do evento. A rota só agrupava negRisk.
    const g = agruparOpcoesDoEvento({ id: "indiana", negRisk: false }, [
      // Na ordem em que a rota as recebe: por VOLUME, não por data.
      opcao("December 31, 2027", 0.11, "5126779", { ordemNaFonte: 2 }),
      opcao("December 31, 2028", 0.185, "m4", { ordemNaFonte: 3 }),
      opcao("June 30, 2027", 0.09, "m2", { ordemNaFonte: 1 }),
      opcao("December 31, 2026", 0.045, "m1", { ordemNaFonte: 0 }),
    ]);
    expect(g).not.toBeNull();
    expect(g!.tipo).toBe("independentes");
    expect(JSON.parse(g!.card.outcomes)).toEqual(["December 31, 2026", "June 30, 2027", "December 31, 2027", "December 31, 2028"]);
    expect(JSON.parse(g!.card.outcomePrices)).toEqual(["0.0450", "0.0900", "0.1100", "0.1850"]);
    expect(g!.card.tipoDeGrupo).toBe("independentes");
    expect(g!.card.opcoesOcultas).toBe(0);
  });

  it("a escada não perde degrau por ser barato: 4,5% é informação, não ruído", () => {
    const { lista } = organizarOpcoes([
      opcao("October 31", 0.0041, "a", { ordemNaFonte: 3 }),
      opcao("December 31", 0.145, "b", { ordemNaFonte: 5 }),
    ], "independentes");
    expect(lista.map((o) => o.rotulo)).toEqual(["October 31", "December 31"]);
  });

  it("ordem embaralhada na fonte (cessar-fogo Rússia × Ucrânia) sai em ordem", () => {
    const { lista } = organizarOpcoes([
      opcao("March 31, 2027", 0.34, "a", { ordemNaFonte: 8 }),
      opcao("October 31", 0.04, "b", { ordemNaFonte: 3 }),
      opcao("January 31, 2027", 0.22, "c", { ordemNaFonte: 6 }),
    ], "independentes");
    expect(lista.map((o) => o.rotulo)).toEqual(["October 31", "January 31, 2027", "March 31, 2027"]);
  });

  it("sem a ordem da plataforma, a escada se ordena pela data de fim", () => {
    const { lista } = organizarOpcoes([
      opcao("tarde", 0.5, "a", { fimMs: 3_000 }),
      opcao("cedo", 0.1, "b", { fimMs: 1_000 }),
    ], "independentes");
    expect(lista.map((o) => o.rotulo)).toEqual(["cedo", "tarde"]);
  });

  it("🔴 Eleição brasileira (negRisk, só 2 acima de 0,5%): Flávio e Lula — nunca Renan Santos", () => {
    // Com 2 opções acima do ruído, a regra antiga ("3 ou mais") desistia de
    // agrupar e pegava o mercado de MAIOR VOLUME: Renan Santos, a 0,15%. O card
    // da eleição dizia "0,15%".
    const g = agruparOpcoesDoEvento({ id: "brasil", negRisk: true }, [
      opcao("Renan Santos", 0.0015, "601825"),
      opcao("Tarcisio de Freitas", 0.0005, "t"),
      opcao("Luiz Inácio Lula da Silva", 0.415, "lula"),
      opcao("Flávio Bolsonaro", 0.592, "flavio"),
      opcao("Geraldo Alckmin", 0.0015, "g"),
    ]);
    expect(g!.tipo).toBe("exclusivos");
    expect(JSON.parse(g!.card.outcomes)).toEqual(["Flávio Bolsonaro", "Luiz Inácio Lula da Silva"]);
    expect(JSON.parse(g!.card.outcomeMarketIds)).toEqual(["flavio", "lula"]);
    // Os que ficaram abaixo de 0,5% não somem calados: a tela diz quantos são.
    expect(g!.card.opcoesOcultas).toBe(3);
  });

  it("disputa de 2 (Câmara 2026: Democratas × Republicanos) mostra os dois", () => {
    const g = agruparOpcoesDoEvento({ id: "camara", negRisk: true }, [
      opcao("Democratic Party", 0.935, "d"),
      opcao("Republican Party", 0.065, "r"),
    ]);
    expect(JSON.parse(g!.card.outcomes)).toEqual(["Democratic Party", "Republican Party"]);
  });

  it("evento com UMA opção aberta é SIM/NÃO de verdade: não vira grupo", () => {
    expect(agruparOpcoesDoEvento({ id: "x", negRisk: false }, [opcao("Yes", 0.4, "a")])).toBeNull();
  });

  it("escada longa corta no teto e conta o que ficou de fora", () => {
    const muitas = Array.from({ length: TETO_INDEPENDENTES + 5 }, (_, i) => opcao(`degrau ${i}`, 0.1, `m${i}`, { ordemNaFonte: i }));
    const g = agruparOpcoesDoEvento({ id: "longa" }, muitas);
    expect(JSON.parse(g!.card.outcomes)).toHaveLength(TETO_INDEPENDENTES);
    expect(g!.card.opcoesOcultas).toBe(5);
  });

  it("o card de evento continua com identidade de evento (DAD-03)", () => {
    const g = agruparOpcoesDoEvento({ id: 30829, negRisk: true }, [opcao("A", 0.6, "a"), opcao("B", 0.4, "b")]);
    expect(g!.card.id).toBe("ev-30829");
  });
});

describe("partida não é lista de opções", () => {
  it("🔴 Counter-Strike: mercados com rótulos próprios ficam no mercado principal", () => {
    // Cada mercado de uma partida é OUTRA pergunta (quem vence, mapa 1, total
    // de mapas). Agrupar escrevia "Game 1 Winner 55%" — 55% de quem?
    const g = agruparOpcoesDoEvento({ id: "cs", negRisk: false }, [
      opcao("Spirit vs ShindeN", 0.55, "moneyline", { simNao: false, ordemNaFonte: 0 }),
      opcao("Game 1 Winner", 0.52, "g1", { simNao: false, ordemNaFonte: 1 }),
      opcao("Both teams win a map?", 0.4, "btts", { simNao: true, ordemNaFonte: 2 }),
    ]);
    expect(g).toBeNull();
  });

  it("escada e disputa são SIM/NÃO em cada opção, e continuam agrupando", () => {
    const g = agruparOpcoesDoEvento({ id: "ind" }, [
      opcao("December 31, 2026", 0.045, "a", { simNao: true, ordemNaFonte: 0 }),
      opcao("June 30, 2027", 0.09, "b", { simNao: true, ordemNaFonte: 1 }),
    ]);
    expect(g?.tipo).toBe("independentes");
  });
});

describe("Kalshi: ordem, corte e tipo sem o evento junto", () => {
  it("🔴 escada longa (Bitcoin da hora, 188 degraus) fica com os degraus onde há dúvida", () => {
    // Cortar pelos primeiros mostraria vinte linhas de "99%".
    const degraus = Array.from({ length: 60 }, (_, i) =>
      opcao(`$${76_000 + i * 100} or above`, Math.max(0.01, 0.99 - i * 0.0165), `b${i}`, { ordemNaFonte: 76_000 + i * 100 }));
    const { lista, ocultas } = organizarOpcoes(degraus, "independentes");
    expect(lista).toHaveLength(TETO_INDEPENDENTES);
    expect(ocultas).toBe(60 - TETO_INDEPENDENTES);
    // O que ficou está em volta de 50%…
    expect(Math.min(...lista.map((o) => o.prob))).toBeGreaterThan(0.25);
    expect(Math.max(...lista.map((o) => o.prob))).toBeLessThan(0.75);
    // …e continua na ordem do patamar.
    const ordem = lista.map((o) => o.ordemNaFonte as number);
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));
  });

  it("sem ordem nenhuma ('Quem Trump vai indultar?'), da mais provável para a menos", () => {
    const { lista } = organizarOpcoes([
      opcao("A", 0.1, "a", { fimMs: 5 }), opcao("B", 0.7, "b", { fimMs: 5 }), opcao("C", 0.3, "c", { fimMs: 5 }),
    ], "independentes");
    expect(lista.map((o) => o.rotulo)).toEqual(["B", "C", "A"]);
  });

  it("tipo pelo strike_type: medido contra a flag mutually_exclusive em 03/10/2026", () => {
    expect(tipoPeloStrike(["structured", "structured"])).toBe("exclusivos");          // jogo (KXMLBGAME)
    expect(tipoPeloStrike(["less", "between", "between", "greater"])).toBe("exclusivos"); // faixas (KXHIGHNY)
    expect(tipoPeloStrike(["greater", "greater", "greater"])).toBe("independentes");    // limiar (KXBTCD)
    // Na dúvida, a leitura que não afirma que as chances somam 100%.
    expect(tipoPeloStrike([undefined, "custom"])).toBe("independentes");
  });
});

describe("prefixoComumDosRotulos — dois eventos do Kalshi com o mesmo título", () => {
  it("🔴 'Texas Senate margin of victory': o nome do candidato vai para o título", () => {
    // O Kalshi publica um evento para cada lado com o MESMO título; agrupados,
    // eram dois cards idênticos (o doctor acusou 8 pares em 03/10/2026).
    expect(prefixoComumDosRotulos(["Ken Paxton, 1+ pts", "Ken Paxton, 3+ pts", "Ken Paxton, 5+ pts"])).toBe("Ken Paxton");
    expect(prefixoComumDosRotulos(["James Talarico, 1+ pts", "James Talarico, 3+ pts"])).toBe("James Talarico");
  });

  it("sem um nome comum a TODAS, não inventa", () => {
    expect(prefixoComumDosRotulos(["Ken Paxton, 1+ pts", "James Talarico, 1+ pts"])).toBeNull();
    expect(prefixoComumDosRotulos(["Before Oct 1, 2026", "Before Nov 1, 2026"])).toBeNull();
    // A vírgula da DATA: o "nome comum" seria "Before Jan 1" e o rótulo, só o ano.
    expect(prefixoComumDosRotulos(["Before Jan 1, 2027", "Before Jan 1, 2028"])).toBeNull();
    expect(prefixoComumDosRotulos(["December 31, 2026", "December 31, 2027"])).toBeNull();
    expect(prefixoComumDosRotulos(["Lula", "Flávio"])).toBeNull();
    expect(prefixoComumDosRotulos(["Ken Paxton, 1+ pts"])).toBeNull();
  });
});
