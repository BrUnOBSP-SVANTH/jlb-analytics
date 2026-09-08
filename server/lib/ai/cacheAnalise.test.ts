import { describe, it, expect } from "vitest";
import { ANALYZE_CACHE_KEY, type AnalyzeParams } from "./marketAnalysis.ts";

const mercado = (yesProb: number, extra: Partial<AnalyzeParams> = {}): AnalyzeParams => ({
  title: "Brazil Presidential Election",
  source: "polymarket",
  yesProb,
  ...extra,
});

/**
 * A chave do cache decide QUANDO gastar cota de IA, e a cota é o gargalo real do
 * site: ~2.900 tokens por análise contra 200.000/dia do plano gratuito, ou seja
 * ~69 análises no dia inteiro. Cada chamada poupada é um usuário a mais que
 * recebe a análise completa em vez do modo reduzido.
 *
 * Por isso quem invalida é o PREÇO, não o relógio: mercado parado reaproveita,
 * mercado que andou refaz. Estes testes prendem as duas metades — soltar
 * qualquer uma quebra em silêncio (ou queima cota, ou mostra leitura velha).
 */
describe("chave do cache da análise", () => {
  it("mercado parado reaproveita a mesma análise", () => {
    expect(ANALYZE_CACHE_KEY(mercado(0.42))).toBe(ANALYZE_CACHE_KEY(mercado(0.42)));
  });

  it("oscilação pequena NÃO gasta cota de novo", () => {
    // 42% e 43% dariam a mesma leitura com outro número. Refazer a análise aí é
    // queimar cota para reescrever a mesma coisa.
    expect(ANALYZE_CACHE_KEY(mercado(0.40))).toBe(ANALYZE_CACHE_KEY(mercado(0.43)));
  });

  it("movimento de verdade GERA análise nova", () => {
    // 40% → 52% é outra história, e a leitura antiga estaria errada.
    expect(ANALYZE_CACHE_KEY(mercado(0.40))).not.toBe(ANALYZE_CACHE_KEY(mercado(0.52)));
  });

  it("a faixa é de 4pp — nem tão fina que nunca reaproveite, nem tão larga que minta", () => {
    // Dentro da faixa: mesma chave. Cruzando a divisa: chave nova.
    expect(ANALYZE_CACHE_KEY(mercado(0.44))).toBe(ANALYZE_CACHE_KEY(mercado(0.47)));
    expect(ANALYZE_CACHE_KEY(mercado(0.47))).not.toBe(ANALYZE_CACHE_KEY(mercado(0.48)));
  });

  it("mercados diferentes nunca compartilham análise", () => {
    // O pior erro possível aqui: servir a leitura de um mercado em outro.
    expect(ANALYZE_CACHE_KEY(mercado(0.42)))
      .not.toBe(ANALYZE_CACHE_KEY(mercado(0.42, { title: "US Presidential Election" })));
  });

  it("a mesma pergunta em plataformas diferentes é análise diferente", () => {
    // Preço, liquidez e regra de liquidação mudam entre Polymarket e Kalshi.
    expect(ANALYZE_CACHE_KEY(mercado(0.42)))
      .not.toBe(ANALYZE_CACHE_KEY(mercado(0.42, { source: "kalshi" })));
  });

  it("aguenta preço ausente sem gerar chave quebrada", () => {
    const k = ANALYZE_CACHE_KEY({ title: "X", source: "polymarket" } as AnalyzeParams);
    expect(k).toContain("market-analyze");
    expect(k).not.toMatch(/NaN|undefined/);
  });

  it("a versão da chave subiu junto com a regra", () => {
    // Sem trocar a versão, as análises guardadas com a regra ANTIGA continuariam
    // sendo servidas — e ninguém veria a mudança acontecer.
    expect(ANALYZE_CACHE_KEY(mercado(0.42))).toContain(":v4:");
  });
});
