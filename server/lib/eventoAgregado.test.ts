import { describe, it, expect } from "vitest";
import { montarCardDoEvento, type DesfechoDoEvento } from "./eventoAgregado.ts";

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
