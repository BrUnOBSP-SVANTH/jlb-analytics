import { describe, it, expect } from "vitest";
import { montarDesfechos } from "./desfechos";

const j = (v: unknown) => JSON.stringify(v);

/**
 * O teste central aqui é o do ALINHAMENTO. A lista chega em três arrays
 * paralelos e é filtrada e reordenada; se o identificador não acompanhar o
 * rótulo, a tela mostra o histórico de um candidato sob o nome de outro.
 *
 * Esse erro não quebra nada — o gráfico desenha, as cores aparecem, o número
 * bate. Ele só mente. E numa eleição, mentir sobre quem estava subindo é o pior
 * erro que este site pode cometer.
 */
describe("montarDesfechos — o identificador não pode se soltar do nome", () => {
  it("mantém o par nome↔identificador depois de REORDENAR", () => {
    // Chega fora de ordem de propósito: o líder é o terceiro da lista.
    const r = montarDesfechos(
      j(["Ciro", "Lula", "Bolsonaro"]),
      j(["0.06", "0.38", "0.44"]),
      j(["tk-ciro", "tk-lula", "tk-bolso"]),
    );
    expect(r).not.toBeNull();
    expect(r!.map((o) => o.label)).toEqual(["Bolsonaro", "Lula", "Ciro"]);
    // Cada um com o SEU token, não com o do vizinho.
    expect(r!.map((o) => o.token)).toEqual(["tk-bolso", "tk-lula", "tk-ciro"]);
  });

  it("mantém o par depois de FILTRAR o ruído", () => {
    // "Zé" some por estar abaixo de 0,5%; os tokens dos que ficam não podem
    // escorregar uma posição por causa disso.
    const r = montarDesfechos(
      j(["Lula", "Zé", "Bolsonaro"]),
      j(["0.38", "0.001", "0.44"]),
      j(["tk-lula", "tk-ze", "tk-bolso"]),
    );
    expect(r!.map((o) => o.label)).toEqual(["Bolsonaro", "Lula"]);
    expect(r!.map((o) => o.token)).toEqual(["tk-bolso", "tk-lula"]);
    expect(r!.some((o) => o.token === "tk-ze")).toBe(false);
  });

  it("filtrar E reordenar ao mesmo tempo continua alinhado", () => {
    const r = montarDesfechos(
      j(["A", "B", "C", "D"]),
      j(["0.10", "0.002", "0.55", "0.30"]),
      j(["tk-a", "tk-b", "tk-c", "tk-d"]),
    );
    expect(r!.map((o) => `${o.label}:${o.token}`)).toEqual(["C:tk-c", "D:tk-d", "A:tk-a"]);
  });

  it("sem token, o desfecho continua na lista — só não terá histórico", () => {
    // Perder o gráfico de um candidato é aceitável; perder o candidato da lista,
    // não. A lista de desfechos é o dado principal.
    const r = montarDesfechos(j(["A", "B", "C"]), j(["0.5", "0.3", "0.2"]), j(["tk-a"]));
    expect(r).toHaveLength(3);
    expect(r!.map((o) => o.token)).toEqual(["tk-a", "", ""]);
  });

  it("mercado binário devolve null — quem manda ali é o SIM/NÃO", () => {
    expect(montarDesfechos(j(["Sim", "Não"]), j(["0.6", "0.4"]), j([]))).toBeNull();
    expect(montarDesfechos(j([]), j([]), j([]))).toBeNull();
  });

  it("preço faltando derruba a lista inteira em vez de inventar 0%", () => {
    // Buraco no array viraria "0%" na tela — uma afirmação falsa, não uma
    // ausência. Melhor não mostrar a lista do que mostrar um número errado.
    expect(montarDesfechos(j(["A", "B", "C"]), j(["0.5", "0.3"]), j([]))).toBeNull();
  });

  it("aguenta lixo da fonte sem derrubar a tela", () => {
    expect(montarDesfechos("nao é json", "[]", "[]")).toBeNull();
    expect(montarDesfechos(undefined, undefined, undefined)).toBeNull();
    // Preço ilegível vira 0 e some no filtro, em vez de virar NaN na tela.
    const r = montarDesfechos(j(["A", "B", "C"]), j(["0.5", "xx", "0.3"]), j(["a", "b", "c"]));
    expect(r!.map((o) => o.label)).toEqual(["A", "C"]);
  });
});

describe("o mercado de cada desfecho — é ele que liquida (DAD-03)", () => {
  // Os ids são os reais do evento "Democratic Presidential Nominee 2028".
  const ROTULOS = j(["Alexandria Ocasio-Cortez", "Jon Ossoff", "Gavin Newsom"]);
  const PRECOS = j(["0.18", "0.17", "0.13"]);
  const TOKENS = j(["tok-aoc", "tok-ossoff", "tok-newsom"]);
  const MERCADOS = j(["559653", "559655", "559657"]);

  it("o mercado acompanha o rótulo pela ORDENAÇÃO, igual ao token", () => {
    // A lista é reordenada por probabilidade. Se o id não viajar junto, a
    // previsão de um candidato é gravada contra o mercado de outro — e liquida
    // errado, marcada como oficial.
    const r = montarDesfechos(
      j(["Gavin Newsom", "Alexandria Ocasio-Cortez", "Jon Ossoff"]),
      j(["0.13", "0.18", "0.17"]),
      j(["tok-newsom", "tok-aoc", "tok-ossoff"]),
      j(["559657", "559653", "559655"]),
    );
    expect(r!.map((o) => o.label)).toEqual(["Alexandria Ocasio-Cortez", "Jon Ossoff", "Gavin Newsom"]);
    expect(r!.map((o) => o.marketId)).toEqual(["559653", "559655", "559657"]);
    expect(r!.map((o) => o.token)).toEqual(["tok-aoc", "tok-ossoff", "tok-newsom"]);
  });

  it("token e mercado são coisas diferentes e não se confundem", () => {
    const r = montarDesfechos(ROTULOS, PRECOS, TOKENS, MERCADOS);
    expect(r![0]).toMatchObject({ label: "Alexandria Ocasio-Cortez", token: "tok-aoc", marketId: "559653" });
  });

  it("sem a lista de mercados, `marketId` fica vazio — não vira o token", () => {
    // Cache antigo. Vazio é ausência; token no lugar do mercado seria o defeito
    // de volta, porque token não liquida.
    const r = montarDesfechos(ROTULOS, PRECOS, TOKENS);
    expect(r!.every((o) => o.marketId === "")).toBe(true);
    expect(r![0].token).toBe("tok-aoc");
  });
});
