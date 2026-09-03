import { describe, it, expect } from "vitest";
import { dedupPorMercado, vereditoCalibracao, vereditoBold } from "./calibrationData.ts";

const f = (market_id: string, forecast_date: string, created_at: string, marca = "") =>
  ({ market_id, forecast_date, created_at, marca });

describe("dedupPorMercado — a invariante do módulo", () => {
  // Por que isto importa mais que parece: o backtest SEM dedup deu +5,4% e o
  // correto, +3,1%. Um mercado previsto em 6 dias contava 6 vezes. A regra é a
  // mesma da view do track record (migration 019).
  it("mantém UMA previsão por mercado, a mais antiga", () => {
    const r = dedupPorMercado([
      f("m1", "2026-08-10", "2026-08-10T12:00:00Z", "meio"),
      f("m1", "2026-08-08", "2026-08-08T12:00:00Z", "primeira"),
      f("m1", "2026-08-12", "2026-08-12T12:00:00Z", "ultima"),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].marca).toBe("primeira");
  });

  it("desempata pelo created_at quando a data da previsão é igual", () => {
    // Sem este desempate a escolha dependeria da ordem que o banco devolveu —
    // ou seja, o mesmo dado poderia gerar números diferentes entre execuções.
    const r = dedupPorMercado([
      f("m1", "2026-08-08", "2026-08-08T18:00:00Z", "tarde"),
      f("m1", "2026-08-08", "2026-08-08T06:00:00Z", "cedo"),
    ]);
    expect(r[0].marca).toBe("cedo");
  });

  it("é independente da ordem de entrada", () => {
    const linhas = [
      f("m1", "2026-08-10", "2026-08-10T00:00:00Z", "a"),
      f("m1", "2026-08-05", "2026-08-05T00:00:00Z", "b"),
      f("m2", "2026-08-01", "2026-08-01T00:00:00Z", "c"),
    ];
    const marcas = (xs: typeof linhas) => dedupPorMercado(xs).map((x) => x.marca).sort();
    expect(marcas(linhas)).toEqual(marcas([...linhas].reverse()));
    expect(marcas(linhas)).toEqual(["b", "c"]);
  });

  it("preserva mercados distintos e aguenta lista vazia", () => {
    expect(dedupPorMercado([])).toEqual([]);
    expect(dedupPorMercado([f("m1", "2026-08-01", "x"), f("m2", "2026-08-01", "x")])).toHaveLength(2);
  });
});

describe("vereditoCalibracao — a régua que custou 7,7% para aprender", () => {
  // 29/08: promovemos uma calibração que "melhorava o cru" e ela PIOROU 7,7% ao
  // vivo. A régua exige ganhar do cru E do mercado, com amostra. Estes testes
  // existem para ninguém afrouxar isso sem perceber.
  it("com amostra pequena não dá veredito, mesmo se os números forem bons", () => {
    expect(vereditoCalibracao(29, 0.10, 0.20, 0.20)).toContain("amostra pequena");
  });

  it("só é candidata quando vence o cru E o mercado", () => {
    expect(vereditoCalibracao(50, 0.10, 0.20, 0.15)).toContain("candidata a go-live");
  });

  it("vencer só o cru NÃO basta — foi exatamente o erro de 29/08", () => {
    const v = vereditoCalibracao(50, 0.18, 0.20, 0.15);
    expect(v).toContain("ainda não bate o mercado");
    expect(v).not.toContain("go-live");
  });

  it("não melhorar o cru é reprovação direta", () => {
    expect(vereditoCalibracao(50, 0.25, 0.20, 0.30)).toContain("NÃO promover");
  });
});

describe("vereditoBold — divergir do mercado paga?", () => {
  it("pouca divergência já é uma resposta, não um empate", () => {
    // Se o modelo concorda com o preço mesmo SEM a trava, a hipótese está
    // respondida — não adianta comparar Brier de quem não divergiu.
    expect(vereditoBold(50, 5, 0.10, 0.20, 0.20)).toContain("divergiu pouco");
  });

  it("reconhece o caso em que divergir pagou", () => {
    expect(vereditoBold(50, 20, 0.10, 0.15, 0.14)).toContain("DIVERGIR PAGOU");
  });

  it("divergir e piorar não vira meia-vitória", () => {
    expect(vereditoBold(50, 20, 0.30, 0.20, 0.18)).toContain("PIOROU");
  });
});
