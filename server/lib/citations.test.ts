import { describe, it, expect } from "vitest";
import { humanizeCitations } from "./citations.ts";

const news = ["Reuters", "InfoMoney", "CNN", "BBC", "Bloomberg"];
const cerebro = ["Bloomberg Markets", "Cerebro IA"];

describe("humanizeCitations", () => {
  it("troca um marcador de notícia pelo nome da fonte", () => {
    expect(humanizeCitations("O conflito se intensificou[1] na região.", news))
      .toBe("O conflito se intensificou (Reuters) na região.");
  });

  it("colapsa uma sequência de marcadores sem repetir fontes", () => {
    expect(humanizeCitations("Vários relatos[1][3][4] confirmam.", news))
      .toBe("Vários relatos (Reuters, CNN, BBC) confirmam.");
  });

  it("resolve marcadores do Cerebro [CN]", () => {
    expect(humanizeCitations("Segundo o contexto[C1], o cenário mudou.", news, cerebro))
      .toBe("Segundo o contexto (Bloomberg Markets), o cenário mudou.");
  });

  it("mistura notícias e Cerebro na mesma sequência", () => {
    expect(humanizeCitations("As fontes[1][C2] convergem.", news, cerebro))
      .toBe("As fontes (Reuters, Cerebro IA) convergem.");
  });

  it("remove marcador que aponta para índice inexistente", () => {
    expect(humanizeCitations("Sem base real[9] aqui.", news))
      .toBe("Sem base real aqui.");
  });

  it("aceita marcador com vírgula interna", () => {
    expect(humanizeCitations("Confirmado[1, 3] pelas fontes.", news))
      .toBe("Confirmado (Reuters, CNN) pelas fontes.");
  });

  it("preserva texto sem citações e string vazia", () => {
    expect(humanizeCitations("Nenhuma citação aqui.", news)).toBe("Nenhuma citação aqui.");
    expect(humanizeCitations("", news)).toBe("");
  });
});
