import { describe, it, expect } from "vitest";
import { idDeLiquidacao, idCanonicoDeMercado, mercadoQueLiquida } from "./liquidacao.ts";

// Os ids abaixo são os do banco de produção em 22/09: a previsão do fundador em
// "Democratic Presidential Nominee 2028 — Alexandria Ocasio-Cortez", o token
// CLOB que ela guardava e o mercado aninhado que esse token representa
// (confirmado no gamma: clob_token_ids=1070649… → market id 559653).
const TOKEN_AOC = "107064985435494333113391038470401719113272800530429703182710416066774068907304";
const MERCADO_AOC = "559653";

describe("desfecho do Polymarket — DAD-03: quem liquida é o MERCADO, não o token", () => {
  it("🔴 o token CLOB não liquida nada, e é por isso que a previsão ficava presa", () => {
    // Era o estado da previsão do fundador: registrada em 21/09, `resolved=false`
    // para sempre, porque o id guardado não é um mercado — é um identificador de
    // negociação, sem resultado oficial para consultar.
    expect(idDeLiquidacao({ marketId: "poly-559653", outcomeId: TOKEN_AOC })).toBeNull();
  });

  it("o id do mercado do desfecho liquida — vencedor e perdedor pelo MESMO caminho", () => {
    // Cada desfecho de um evento negRisk é um mercado binário próprio: o que
    // acontecer liquida SIM, os outros liquidam NÃO. Quem decide é o mercado do
    // desfecho, não o do card.
    expect(idDeLiquidacao({ marketId: "poly-ev-14321", outcomeId: MERCADO_AOC })).toBe("poly-559653");
    expect(idDeLiquidacao({ marketId: "poly-ev-14321", outcomeId: "561975" })).toBe("poly-561975");
  });

  it("⚠️ o card de EVENTO nunca liquida sozinho", () => {
    // "poly-ev-14321" representa a disputa inteira, que não tem SIM/NÃO. Antes o
    // card carregava o id do LÍDER, e uma previsão sem desfecho escolhido era
    // liquidada contra um candidato que o usuário nunca apontou.
    expect(idDeLiquidacao({ marketId: "poly-ev-14321" })).toBeNull();
    // Mercado binário comum continua liquidando por si:
    expect(idDeLiquidacao({ marketId: "poly-561975" })).toBe("poly-561975");
  });

  it("rótulo não liquida — nem quando é o único id que sobrou", () => {
    // Cache antigo entregava o rótulo no lugar do id. "Alexandria Ocasio-Cortez"
    // não é consultável em lugar nenhum.
    expect(idDeLiquidacao({ marketId: "poly-ev-14321", outcomeId: "Alexandria Ocasio-Cortez" })).toBeNull();
  });

  it("id de mercado do Kalshi não vale no Polymarket, e vice-versa", () => {
    // Prefixo errado liquida contra a plataforma errada, em silêncio.
    expect(idDeLiquidacao({ marketId: "poly-ev-1", outcomeId: "KXPRESNOMD-28-AOC" })).toBeNull();
    expect(idDeLiquidacao({ marketId: "kalshi-KXPRESNOMD-28", outcomeId: MERCADO_AOC })).toBeNull();
  });
});

describe("mercadoQueLiquida — qual mercado responde por uma aposta SIM/NÃO", () => {
  const CARD_AGREGADO = { id: "ev-14321", outcomeMarketIds: JSON.stringify([MERCADO_AOC, "559655", "559657"]) };

  it("card de evento liquida pelo mercado do LÍDER", () => {
    // A aposta "SIM a 18%" num card de evento é sobre quem está na frente. É
    // esse mercado que tem resultado oficial; o evento não tem.
    expect(mercadoQueLiquida(CARD_AGREGADO)).toBe(MERCADO_AOC);
  });

  it("mercado binário comum responde por si mesmo", () => {
    expect(mercadoQueLiquida({ id: "561975" })).toBe("561975");
  });

  it("🔴 card agregado SEM a lista de mercados não inventa um id", () => {
    // Cache antigo, servido durante um deploy: melhor recusar a aposta do que
    // gravá-la contra um mercado adivinhado.
    expect(mercadoQueLiquida({ id: "ev-14321" })).toBeNull();
    expect(mercadoQueLiquida({ id: "ev-14321", outcomeMarketIds: "[]" })).toBeNull();
    expect(mercadoQueLiquida({ id: "ev-14321", outcomeMarketIds: "não é json" })).toBeNull();
    expect(mercadoQueLiquida({ id: "" })).toBeNull();
  });

  it("⚠️ quando o líder muda, o id que liquida muda junto — e é isso que evita alerta falso", () => {
    // O card continua sendo o mesmo evento (é o que a watchlist guarda), mas a
    // comparação de preço passa a ser chaveada por OUTRO mercado: sem anterior,
    // sem alerta. Comparar o preço de Ossoff com o de AOC diria "subiu 13pp"
    // sem ninguém ter subido.
    const amanha = { id: "ev-14321", outcomeMarketIds: JSON.stringify(["559655", MERCADO_AOC]) };
    expect(amanha.id).toBe(CARD_AGREGADO.id);
    expect(mercadoQueLiquida(amanha)).not.toBe(mercadoQueLiquida(CARD_AGREGADO));
  });
});

describe("idCanonicoDeMercado — um formato só para o id do mercado", () => {
  it("o caso real de 20/09: a previsão da ficha gravava o id cru", () => {
    expect(idCanonicoDeMercado("polymarket", "1130012")).toBe("poly-1130012");
    // E sem o prefixo ela nunca seria resolvida:
    expect(idDeLiquidacao({ marketId: "1130012" })).toBeNull();
    expect(idDeLiquidacao({ marketId: idCanonicoDeMercado("polymarket", "1130012") })).toBe("poly-1130012");
  });

  it("'poly', não 'polymarket' — é o prefixo que o banco guarda", () => {
    expect(idCanonicoDeMercado("polymarket", "559653")).toBe("poly-559653");
    expect(idCanonicoDeMercado("poly", "559653")).toBe("poly-559653");
  });

  it("Kalshi e Manifold seguem a mesma regra", () => {
    expect(idCanonicoDeMercado("kalshi", "KXNFLGAME-26SEP21NYGLAR-NYG")).toBe("kalshi-KXNFLGAME-26SEP21NYGLAR-NYG");
    expect(idCanonicoDeMercado("manifold", "abc123")).toBe("manifold-abc123");
  });

  it("id que já vem no formato passa intacto — chamar duas vezes é seguro", () => {
    expect(idCanonicoDeMercado("polymarket", "poly-1130012")).toBe("poly-1130012");
    expect(idCanonicoDeMercado("kalshi", idCanonicoDeMercado("kalshi", "KX-1"))).toBe("kalshi-KX-1");
  });

  it("fonte desconhecida NÃO ganha prefixo inventado", () => {
    // Prefixo errado liquidaria a previsão contra o mercado de outra plataforma.
    expect(idCanonicoDeMercado("reddit", "123")).toBe("123");
    expect(idCanonicoDeMercado(undefined, "123")).toBe("123");
  });

  it("id vazio continua vazio", () => {
    expect(idCanonicoDeMercado("polymarket", "")).toBe("");
  });
});
