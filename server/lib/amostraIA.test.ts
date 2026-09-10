import { describe, it, expect } from "vitest";
import { resumir, fatiar, MIN_AMOSTRA, type Amostra, type LinhaIA } from "./amostraIA.ts";

let seq = 0;
function l(over: Partial<LinhaIA> = {}): LinhaIA {
  seq += 1;
  const ai = over.ai_fair_value ?? 60;
  const mkt = over.market_prob ?? 55;
  const outcome = over.outcome === undefined ? true : over.outcome;
  // `brier` e `market_brier` são colunas GERADAS no Postgres e ficam NULL quando
  // não há desfecho (migration 007). Reproduzir isso aqui é o que torna o teste
  // fiel: foi exatamente essa nulidade que quebrou a conta em produção.
  const b = (p: number) => outcome === null ? null : ((outcome ? 1 : 0) - Number(p) / 100) ** 2;
  return {
    market_id: `m${seq}`, source: "polymarket", title: `Mercado ${seq}`,
    category: "politica", model: "gemini",
    market_prob: mkt, ai_fair_value: ai,
    brier: b(Number(ai)), market_brier: b(Number(mkt)),
    outcome, resolved: true, resolved_at: "2026-01-01T00:00:00Z",
    resolution_source: "settled",
    forecast_date: "2025-12-01", created_at: "2025-12-01T00:00:00Z",
    ...over,
  };
}

function amostraDe(linhas: LinhaIA[]): Amostra {
  return {
    todas: linhas,
    resolvidas: linhas.filter((r) => r.resolved && r.outcome !== null),
    emAberto: linhas.filter((r) => !r.resolved),
    semDesfecho: linhas.filter((r) => r.resolved && r.outcome === null),
  };
}

/**
 * A auditoria de 09/09 contou CINCO totais diferentes de "previsões resolvidas"
 * na mesma página. Estes testes prendem a causa raiz — não o sintoma —, porque o
 * sintoma volta sozinho no dia em que alguém acrescentar um bloco novo à tela
 * com o seu próprio filtro.
 */
describe("um denominador só", () => {
  it("linha resolvida SEM desfecho não entra no denominador", () => {
    // O defeito original em uma frase: a view fazia
    // `COUNT(*) FILTER (WHERE resolved)` no denominador e `AVG(brier)` no
    // numerador — e `brier` é NULL quando `outcome` é NULL. Numerador de um
    // conjunto, denominador de outro.
    const a = amostraDe([
      l({ outcome: true }),
      l({ outcome: false }),
      l({ outcome: null }),          // fechou, mas sem resultado utilizável
      l({ resolved: false, outcome: null }),
    ]);
    const r = resumir(a);
    expect(r.total).toBe(4);
    expect(r.resolvidas).toBe(2);
    expect(r.emAberto).toBe(1);
    expect(r.semDesfecho).toBe(1);   // existe, aparece, não é somada em silêncio
  });

  it("toda porcentagem divide pelo MESMO conjunto", () => {
    const a = amostraDe([
      l({ ai_fair_value: 90, market_prob: 60, outcome: true }),   // nós melhor
      l({ ai_fair_value: 20, market_prob: 45, outcome: false }),  // nós melhor
      l({ ai_fair_value: 40, market_prob: 80, outcome: true }),   // mercado melhor
      l({ outcome: null }),                                       // não pontuável
    ]);
    const r = resumir(a);
    expect(r.resolvidas).toBe(3);
    expect(r.bateuMercado).toBe(2);
    expect(r.bateuMercadoPct).toBe(67);          // 2/3 — nunca 2/4
    expect(r.comLado).toBe(3);
    expect(r.taxaAcerto).toBe(67);               // mesmo 3 embaixo
  });

  it("previsão de 50% exatos não conta como lado", () => {
    // 50% não tem lado: contá-la como acerto ou erro seria sortear.
    const a = amostraDe([l({ ai_fair_value: 50 }), l({ ai_fair_value: 70, outcome: true })]);
    const r = resumir(a);
    expect(r.resolvidas).toBe(2);      // as duas são pontuáveis para o Brier
    expect(r.comLado).toBe(1);         // só uma tem lado
    expect(r.taxaAcerto).toBe(100);
  });

  it("o Brier médio ignora nulo em vez de tratá-lo como zero", () => {
    // Zero é o Brier PERFEITO. Somar nulo como zero faria a IA parecer melhor
    // quanto mais mercado fechasse sem resultado — o incentivo invertido.
    const a = amostraDe([l({ ai_fair_value: 100, outcome: true }), l({ outcome: null })]);
    expect(resumir(a).aiBrier).toBe(0);
    expect(resumir(a).resolvidas).toBe(1);
  });

  it("sem nada resolvido, devolve nulo em vez de 0%", () => {
    // "0% de acerto" e "ainda não sei" são afirmações muito diferentes.
    const r = resumir(amostraDe([l({ resolved: false, outcome: null })]));
    expect(r.resolvidas).toBe(0);
    expect(r.taxaAcerto).toBeNull();
    expect(r.bateuMercadoPct).toBeNull();
    expect(r.aiBrier).toBeNull();
  });

  it("as DUAS leituras de 'bateu o mercado' saem da mesma amostra", () => {
    // O achado TRK-02: a tela mostrava 12% num bloco e 43% em outro. Não eram
    // números errados — eram perguntas diferentes com denominadores diferentes:
    //   · pelo BRIER, sobre todas as resolvidas;
    //   · pela DIVERGÊNCIA, sobre as 50 linhas mais recentes.
    // Continuam sendo duas perguntas. O que não pode é cada uma ter a sua base.
    const a = amostraDe([
      l({ ai_fair_value: 90, market_prob: 60, outcome: true }),   // divergiu p/ cima e deu SIM: acertou
      l({ ai_fair_value: 30, market_prob: 60, outcome: false }),  // divergiu p/ baixo e deu NÃO: acertou
      l({ ai_fair_value: 80, market_prob: 40, outcome: false }),  // divergiu p/ cima e deu NÃO: errou
      l({ ai_fair_value: 55, market_prob: 55, outcome: true }),   // não divergiu: fora da conta
    ]);
    const r = resumir(a);
    expect(r.resolvidas).toBe(4);
    expect(r.divergimos).toBe(3);            // o denominador da pergunta difícil
    expect(r.acertosAoDivergir).toBe(2);
    expect(r.taxaAoDivergir).toBe(67);
    // E o Brier, a outra pergunta, sobre as 4 — cada uma declara sua base.
    expect(r.bateuMercadoPct).not.toBeNull();
  });

  it("concordar com o mercado não conta como tê-lo batido", () => {
    // Se a IA repete o preço, ela não divergiu: o resultado não diz nada sobre
    // quem estava certo. Contar isso como vitória infla o número mais bonito.
    const a = amostraDe([l({ ai_fair_value: 70, market_prob: 70, outcome: true })]);
    const r = resumir(a);
    expect(r.divergimos).toBe(0);
    expect(r.taxaAoDivergir).toBeNull();
  });

  it("conta quantas vieram do settlement oficial", () => {
    const a = amostraDe([l(), l({ resolution_source: "inferred" }), l({ resolution_source: null })]);
    expect(resumir(a).oficiais).toBe(1);
  });
});

describe("a régua de amostra mínima que a página promete", () => {
  it("é uma só, e é 20", () => {
    // O texto de `/track-record` diz "a partir de 20 resolvidas". Os endpoints
    // usavam 15 num lugar e 30 em outro, e a tabela listava temas com 1 caso.
    expect(MIN_AMOSTRA).toBe(20);
  });

  it("tema com menos de 20 casos não recebe veredito NENHUM", () => {
    const poucos = Array.from({ length: 4 }, () => l({ category: "cripto" }));
    const [f] = fatiar(poucos, (x) => x.category ?? "outros");
    expect(f.n).toBe(4);
    expect(f.estado).toBe("insuficiente");
    // Nem porcentagem em letra miúda: 100% sobre 4 casos é ruído com cara de prova.
    expect(f.taxaAcerto).toBeNull();
    expect(f.comparacao).toBeNull();
    expect(f.taxaAcertoMercado).toBeNull();
  });

  it("a partir de 20 o veredito aparece, com a margem junto", () => {
    const muitos = Array.from({ length: MIN_AMOSTRA }, () => l({ category: "politica" }));
    const [f] = fatiar(muitos, (x) => x.category ?? "outros");
    expect(f.estado).toBe("veredito");
    expect(f.taxaAcerto).toBe(100);
    expect(f.margemPp).toBeGreaterThan(0);   // 100% de 20 ainda tem incerteza
  });

  it("ordena por tamanho de amostra: o que sabemos mais vem primeiro", () => {
    const linhas = [
      ...Array.from({ length: 3 }, () => l({ category: "cripto" })),
      ...Array.from({ length: 25 }, () => l({ category: "politica" })),
    ];
    expect(fatiar(linhas, (x) => x.category ?? "outros").map((f) => f.nome))
      .toEqual(["politica", "cripto"]);
  });

  it("a soma das fatias é o total — nenhuma linha some no recorte", () => {
    const linhas = [
      ...Array.from({ length: 7 }, () => l({ category: "politica" })),
      ...Array.from({ length: 5 }, () => l({ category: null })),
    ];
    const fatias = fatiar(linhas, (x) => x.category ?? "outros");
    expect(fatias.reduce((s, f) => s + f.n, 0)).toBe(12);
  });
});
