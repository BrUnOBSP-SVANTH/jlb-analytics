import { describe, it, expect } from "vitest";
import { montarSerie, MAX_PONTOS, type LinhaPrevisao } from "./calibracaoUsuario.ts";

const p = (dia: string | null, brier: number | null, resolved = true): LinhaPrevisao => ({
  resolved_at: dia ? `${dia}T12:00:00Z` : null,
  brier_score: brier,
  resolved,
});

/**
 * Esta série é o gráfico de evolução do Dashboard — a resposta à pergunta "eu
 * estou melhorando?". Ela vivia só no navegador e sumia ao trocar de aparelho;
 * agora é recalculada das previsões da conta.
 *
 * O que os testes prendem é a REGRA da conta, não o transporte: um acumulado
 * errado mostraria uma melhora (ou uma piora) que não aconteceu — e o usuário
 * não teria como desconfiar, porque o gráfico desenharia igual.
 */
describe("série de calibração do usuário", () => {
  it("acumula: o ponto de hoje inclui tudo que resolveu antes", () => {
    // É o que faz a curva significar "estou melhorando". Um Brier só do dia
    // oscilaria demais com 2 ou 3 resoluções e não diria nada.
    const s = montarSerie([p("2026-01-01", 0.4), p("2026-01-02", 0.0)]);
    expect(s).toHaveLength(2);
    expect(s[0].meanBrier).toBeCloseTo(0.4, 4);
    expect(s[1].meanBrier).toBeCloseTo(0.2, 4);   // (0,4 + 0,0) / 2
  });

  it("um ponto por DIA, mesmo com várias resoluções no mesmo dia", () => {
    // Sem isto o gráfico teria pontos empilhados na mesma data.
    const s = montarSerie([p("2026-01-01", 0.4), p("2026-01-01", 0.2), p("2026-01-02", 0.0)]);
    expect(s.map((x) => x.date)).toEqual(["2026-01-01", "2026-01-02"]);
    expect(s[0].meanBrier).toBeCloseTo(0.3, 4);   // as duas do dia 1 juntas
    expect(s[0].resolvedCount).toBe(2);
  });

  it("o skill compara com o CHUTE: 0,25 vira zero", () => {
    // Brier 0,25 é o que se consegue dizendo 50% em tudo. Skill 0 = tão bom
    // quanto chutar; é a régua que diz se estudar adiantou.
    expect(montarSerie([p("2026-01-01", 0.25)])[0].skillScore).toBeCloseTo(0, 4);
    expect(montarSerie([p("2026-01-01", 0.0)])[0].skillScore).toBeCloseTo(1, 4);
    // Pior que chutar tem que aparecer como negativo, não ser escondido em zero.
    expect(montarSerie([p("2026-01-01", 0.5)])[0].skillScore).toBeCloseTo(-1, 4);
  });

  it("ordena por data mesmo se o banco devolver fora de ordem", () => {
    const s = montarSerie([p("2026-03-01", 0.1), p("2026-01-01", 0.3), p("2026-02-01", 0.2)]);
    expect(s.map((x) => x.date)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });

  it("ignora o que não resolveu e o que não tem nota", () => {
    // Previsão aberta não diz nada sobre calibração; nota ausente entraria como
    // zero e faria a curva parecer melhor do que é.
    const s = montarSerie([
      p("2026-01-01", 0.4),
      p("2026-01-02", null),          // sem nota
      p(null, 0.1),                    // sem data de resolução
      p("2026-01-03", 0.2, false),     // marcada como não resolvida
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].meanBrier).toBeCloseTo(0.4, 4);
  });

  it("totalCount conta TUDO, inclusive o que está em aberto", () => {
    // O gráfico mostra "8 de 20 resolvidas": os 20 incluem as abertas.
    const s = montarSerie([p("2026-01-01", 0.4), p("2026-01-02", null, false)]);
    expect(s[0].resolvedCount).toBe(1);
    expect(s[0].totalCount).toBe(2);
  });

  it("sem nada resolvido, devolve série vazia em vez de um ponto falso", () => {
    expect(montarSerie([])).toEqual([]);
    expect(montarSerie([p("2026-01-01", null, false)])).toEqual([]);
  });

  it("corta em 90 pontos, mantendo os MAIS RECENTES", () => {
    const muitos = Array.from({ length: 120 }, (_, i) =>
      p(`2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`, 0.2));
    const s = montarSerie(muitos);
    expect(s.length).toBeLessThanOrEqual(MAX_PONTOS);
    // O fim da série é o que interessa: cortar pelo começo perderia o presente.
    expect(s[s.length - 1].date).toBe(muitos[muitos.length - 1].resolved_at!.slice(0, 10));
  });

  it("aguenta lixo do banco sem derrubar o gráfico", () => {
    const s = montarSerie([
      { resolved: true, resolved_at: "data-invalida", brier_score: 0.3 },
      { resolved: true, resolved_at: "2026-01-01T00:00:00Z", brier_score: "0.2" },  // numérico como texto
      { resolved: true, resolved_at: "2026-01-02T00:00:00Z", brier_score: "abc" },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0].meanBrier).toBeCloseTo(0.2, 4);
  });
});
