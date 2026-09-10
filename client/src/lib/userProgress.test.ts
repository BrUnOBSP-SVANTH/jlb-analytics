import { describe, it, expect, beforeEach } from "vitest";
import {
  loadProgress, concluirNivel, niveisConcluidos, isLevelUnlocked,
  faltamParaDestravar, NIVEIS_PARA_DESTRAVAR, awardPoints,
} from "./userProgress.ts";

/** localStorage de mentira: estes testes são sobre a REGRA, não sobre o navegador. */
function limpar() {
  const dados = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => { dados.set(k, v); },
    removeItem: (k: string) => { dados.delete(k); },
    clear: () => dados.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

beforeEach(limpar);

/**
 * A auditoria (NVL-01, DSH-01, PRF-02) encontrou o Dashboard anunciando
 * **"Todos os níveis concluídos"** para uma conta com 0 previsões resolvidas e a
 * conquista "Visitou o Nível 1" ainda bloqueada na mesma tela. As duas coisas
 * não podiam ser verdade juntas.
 *
 * A causa era a régua: `level_visited` valia 10 pontos e os níveis abriam com
 * 50 e 100. Abrir as cinco aulas somava 50 sem ler uma linha.
 *
 * Num produto de educação, dizer que a pessoa concluiu o que ela não fez é
 * mentir para ela sobre a única coisa que ela veio buscar aqui. Por isso a regra
 * nova mora em teste: é fácil "simplificar" de volta para pontos sem perceber o
 * que se está afirmando.
 */
describe("nível concluído = exercício resolvido", () => {
  it("visitar não conclui nada", () => {
    awardPoints("level_visited", "Visitou o Nível 1", "level_visited_1");
    awardPoints("level_visited", "Visitou o Nível 2", "level_visited_2");
    awardPoints("level_visited", "Visitou o Nível 3", "level_visited_3");
    expect(niveisConcluidos()).toEqual([]);
    expect(isLevelUnlocked(4)).toBe(false);
  });

  it("resolver um exercício conclui o nível", () => {
    concluirNivel(1, "Resolveu exercício do Nível 1");
    expect(niveisConcluidos()).toEqual([1]);
  });

  it("resolver o segundo exercício do mesmo nível não conta de novo", () => {
    // A régua é "chegou até aqui", não "quantas vezes clicou" — que era
    // exatamente o defeito anterior, por outro caminho.
    concluirNivel(2, "primeiro");
    const pontosDepoisDoPrimeiro = loadProgress().totalPoints;
    concluirNivel(2, "segundo");
    expect(niveisConcluidos()).toEqual([2]);
    expect(loadProgress().totalPoints).toBe(pontosDepoisDoPrimeiro);
  });

  it("os três primeiros níveis são sempre abertos", () => {
    for (const n of [1, 2, 3]) expect(isLevelUnlocked(n)).toBe(true);
  });

  it("o nível 4 abre com três concluídos; o 5, com quatro", () => {
    expect(NIVEIS_PARA_DESTRAVAR[4]).toBe(3);
    expect(NIVEIS_PARA_DESTRAVAR[5]).toBe(4);

    concluirNivel(1, "x"); concluirNivel(2, "x");
    expect(isLevelUnlocked(4)).toBe(false);
    expect(faltamParaDestravar(4)).toBe(1);

    concluirNivel(3, "x");
    expect(isLevelUnlocked(4)).toBe(true);
    expect(isLevelUnlocked(5)).toBe(false);

    concluirNivel(4, "x");
    expect(isLevelUnlocked(5)).toBe(true);
  });

  it("nenhum saldo de pontos abre um nível", () => {
    // O caminho antigo, testado de propósito: mesmo com pontos de sobra, sem
    // exercício resolvido não há nível liberado.
    //
    // O saldo entra direto porque `awardPoints` tem teto diário (3 previsões por
    // dia) — acumular 100 por ali levaria semanas, que é justamente o motivo de
    // ninguém ter percebido que 100 pontos eram fáceis por OUTRO caminho: o
    // `level_visited`, que valia 10 e não tinha teto por dia.
    localStorage.setItem("jlb_progress_v1", JSON.stringify({
      totalPoints: 250, activities: [], dailyCounts: {}, oneTimeDone: [], levelsCompleted: [],
    }));
    expect(loadProgress().totalPoints).toBeGreaterThan(100);
    expect(isLevelUnlocked(4)).toBe(false);
    expect(isLevelUnlocked(5)).toBe(false);
  });

  it("progresso gravado antes da mudança não vira conclusão retroativa", () => {
    // Quem acumulou ponto clicando não resolveu exercício nenhum. Inferir
    // conclusão dos pontos antigos repetiria a mentira, agora gravada.
    localStorage.setItem("jlb_progress_v1", JSON.stringify({
      totalPoints: 120, activities: [], dailyCounts: {}, oneTimeDone: [],
    }));
    expect(loadProgress().levelsCompleted).toEqual([]);
    expect(isLevelUnlocked(5)).toBe(false);
  });

  it("nível fora de 1–5 é ignorado", () => {
    concluirNivel(0, "x");
    concluirNivel(9, "x");
    expect(niveisConcluidos()).toEqual([]);
  });

  it("devolve os níveis em ordem, mesmo se concluídos fora dela", () => {
    concluirNivel(3, "x"); concluirNivel(1, "x"); concluirNivel(2, "x");
    expect(niveisConcluidos()).toEqual([1, 2, 3]);
  });
});
