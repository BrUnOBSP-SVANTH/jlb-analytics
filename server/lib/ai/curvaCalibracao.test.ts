import { describe, it, expect } from "vitest";
import { montarCurva } from "./curvaCalibracao.ts";

/** Gera n previsões numa faixa, das quais `acertos` aconteceram. */
const linhas = (prob: number, n: number, acertos: number) =>
  Array.from({ length: n }, (_, i) => ({ prob, aconteceu: i < acertos }));

describe("montarCurva — a prova que qualquer pessoa consegue ler", () => {
  it("marca como calibrada a faixa em que o prometido bate com o acontecido", () => {
    // Dissemos 75% em 100 casos e aconteceu em 75: no alvo.
    const c = montarCurva(linhas(75, 100, 75));
    const faixa = c.find((f) => f.faixa === "70–80%")!;
    expect(faixa.aconteceu).toBe(75);
    expect(faixa.dentroDaMargem).toBe(true);
  });

  it("acusa a faixa em que prometemos mais do que entregamos", () => {
    // Dissemos 75% e aconteceu 30%: fora da margem, e o site precisa MOSTRAR isso.
    const faixa = montarCurva(linhas(75, 100, 30)).find((f) => f.faixa === "70–80%")!;
    expect(faixa.dentroDaMargem).toBe(false);
    expect(faixa.desvioPp).toBeLessThan(0);
  });

  it("faixa com poucos casos não vira afirmação", () => {
    // 3 previsões não sustentam uma porcentagem. Melhor dizer "sem amostra" do
    // que publicar "100% de acerto" apoiado em três casos.
    const faixa = montarCurva(linhas(55, 3, 3)).find((f) => f.faixa === "50–60%")!;
    expect(faixa.n).toBe(3);
    expect(faixa.aconteceu).toBeNull();
    expect(faixa.dentroDaMargem).toBeNull();
  });

  it("amostra maior aperta a margem da faixa", () => {
    const poucos = montarCurva(linhas(55, 10, 5)).find((f) => f.faixa === "50–60%")!;
    const muitos = montarCurva(linhas(55, 400, 200)).find((f) => f.faixa === "50–60%")!;
    expect(muitos.margemPp!).toBeLessThan(poucos.margemPp!);
  });

  it("devolve todas as faixas mesmo sem dado, para o leitor ver o que falta", () => {
    const c = montarCurva([]);
    expect(c).toHaveLength(10);
    expect(c.every((f) => f.n === 0 && f.aconteceu === null)).toBe(true);
  });
});
