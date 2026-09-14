import { describe, it, expect, beforeEach } from "vitest";
import * as progresso from "./userProgress.ts";
import { loadProgress, concluirNivel, niveisConcluidos, awardPoints } from "./userProgress.ts";

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

  it("dá para concluir o Nível 5 sem ter feito os anteriores", () => {
    // A ordem é sugestão, não cadeado (auditoria de 14/09, item 4): quem já
    // domina o básico começa por onde quiser, e o que resolveu conta.
    concluirNivel(5, "x");
    expect(niveisConcluidos()).toEqual([5]);
  });

  it("nenhum saldo de pontos conclui um nível", () => {
    // O caminho antigo, testado de propósito: mesmo com pontos de sobra, sem
    // exercício resolvido não há nível concluído.
    //
    // O saldo entra direto porque `awardPoints` tem teto diário (3 previsões por
    // dia) — acumular 100 por ali levaria semanas, que é justamente o motivo de
    // ninguém ter percebido que 100 pontos eram fáceis por OUTRO caminho: o
    // `level_visited`, que valia 10 e não tinha teto por dia.
    localStorage.setItem("jlb_progress_v1", JSON.stringify({
      totalPoints: 250, activities: [], dailyCounts: {}, oneTimeDone: [], levelsCompleted: [],
    }));
    expect(loadProgress().totalPoints).toBeGreaterThan(100);
    expect(niveisConcluidos()).toEqual([]);
  });

  it("progresso gravado antes da mudança não vira conclusão retroativa", () => {
    // Quem acumulou ponto clicando não resolveu exercício nenhum. Inferir
    // conclusão dos pontos antigos repetiria a mentira, agora gravada.
    localStorage.setItem("jlb_progress_v1", JSON.stringify({
      totalPoints: 120, activities: [], dailyCounts: {}, oneTimeDone: [],
    }));
    expect(loadProgress().levelsCompleted).toEqual([]);
  });

  it("nível fora de 1–5 é ignorado", () => {
    concluirNivel(0, "x");
    concluirNivel(9, "x");
    expect(niveisConcluidos()).toEqual([]);
  });

  it("não existe mais regra de destravar nível", () => {
    // Existiam `NIVEIS_PARA_DESTRAVAR`, `isLevelUnlocked` e
    // `faltamParaDestravar` — e nenhuma página de nível os consultava. Três
    // telas mostravam cadeado, /nivel/5 abria para qualquer um e /planos dizia
    // "tudo grátis". Se a regra voltar, que volte com o gate de verdade e com
    // este teste mudado de propósito, não por import esquecido.
    expect(Object.keys(progresso)).not.toContain("isLevelUnlocked");
    expect(Object.keys(progresso)).not.toContain("faltamParaDestravar");
    expect(Object.keys(progresso)).not.toContain("NIVEIS_PARA_DESTRAVAR");
  });

  it("devolve os níveis em ordem, mesmo se concluídos fora dela", () => {
    concluirNivel(3, "x"); concluirNivel(1, "x"); concluirNivel(2, "x");
    expect(niveisConcluidos()).toEqual([1, 2, 3]);
  });
});
