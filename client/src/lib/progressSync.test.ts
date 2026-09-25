import { describe, it, expect } from "vitest";
import { mergeProgress } from "./progressSync";
import type { UserProgress } from "./userProgress";

const atividade = (id: string, quando: string) =>
  ({ id, type: "prediction_made" as const, points: 5, label: id, timestamp: quando });

const local = (over: Partial<UserProgress> = {}): UserProgress => ({
  totalPoints: 0, activities: [], dailyCounts: {}, oneTimeDone: [], ...over,
});

const nuvem = (over: Record<string, unknown> = {}) => ({
  user_id: "u1", total_points: 0, activities: [], one_time_done: [],
  updated_at: "2026-09-02T00:00:00Z", ...over,
}) as never;

// O merge decide se o usuário PERDE pontos ao entrar em outro aparelho. Um erro
// aqui é invisível (nada quebra) e irreversível para quem perdeu o progresso.
describe("mergeProgress — trocar de aparelho não pode custar progresso", () => {
  it("fica com o MAIOR total, não com o mais recente", () => {
    // O aparelho que sincroniza por último pode ser o que tem menos pontos —
    // sobrescrever pelo mais recente apagaria o que foi ganho no outro.
    expect(mergeProgress(local({ totalPoints: 40 }), nuvem({ total_points: 90 })).totalPoints).toBe(90);
    expect(mergeProgress(local({ totalPoints: 90 }), nuvem({ total_points: 40 })).totalPoints).toBe(90);
  });

  it("une os marcos únicos, sem repetir", () => {
    const r = mergeProgress(
      local({ oneTimeDone: ["first_login", "level_1"] }),
      nuvem({ one_time_done: ["level_1", "level_2"] }),
    );
    expect(r.oneTimeDone.sort()).toEqual(["first_login", "level_1", "level_2"]);
  });

  it("nunca perde um marco que a nuvem já registrou", () => {
    const r = mergeProgress(local({ oneTimeDone: [] }), nuvem({ one_time_done: ["level_5"] }));
    expect(r.oneTimeDone).toContain("level_5");
  });

  it("junta as atividades sem duplicar as que existem nos dois lados", () => {
    const r = mergeProgress(
      local({ activities: [atividade("a", "2026-09-01T10:00:00Z"), atividade("b", "2026-09-02T10:00:00Z")] }),
      nuvem({ activities: [atividade("a", "2026-09-01T10:00:00Z"), atividade("c", "2026-08-30T10:00:00Z")] }),
    );
    expect(r.activities.map((x) => x.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("mantém as 200 mais recentes, da mais nova para a mais antiga", () => {
    const muitas = Array.from({ length: 250 }, (_, i) =>
      atividade(`x${i}`, new Date(2026, 0, 1, 0, i).toISOString()));
    const r = mergeProgress(local({ activities: muitas }), nuvem());
    expect(r.activities).toHaveLength(200);
    expect(r.activities[0].id).toBe("x249");                    // a mais nova sobrevive
    expect(r.activities.map((a) => a.id)).not.toContain("x0");  // a mais velha sai
  });

  it("dailyCounts fica com o LOCAL — é efêmero e não faz sentido cruzar aparelhos", () => {
    // Limite diário é por dispositivo/dia; trazer o do outro aparelho consumiria
    // cota que o usuário não gastou ali.
    const r = mergeProgress(local({ dailyCounts: { "2026-09-02": { prediction_made: 2 } } }), nuvem());
    expect(r.dailyCounts).toEqual({ "2026-09-02": { prediction_made: 2 } });
  });

  it("aguenta nuvem com campos nulos (linha antiga ou parcial)", () => {
    const r = mergeProgress(local({ totalPoints: 15 }), nuvem({ activities: null, one_time_done: null }));
    expect(r.totalPoints).toBe(15);
    expect(r.activities).toEqual([]);
    expect(r.oneTimeDone).toEqual([]);
  });
});

describe("🔴 a trilha também viaja entre aparelhos (APR-01)", () => {
  /**
   * Desde a auditoria de 14/09, "nível concluído" significa "resolveu um
   * exercício dele" — e essa informação vive em `levelsCompleted`. Ela nunca
   * subiu para a nuvem: a tabela não tinha a coluna e o push não a enviava.
   *
   * O pior não era a falta de sincronia. Este merge montava o objeto a partir
   * dos campos que conhecia, e não conhecia este — então o campo voltava
   * `undefined` e CADA PULL APAGAVA a trilha do aparelho que sincronizou. Quem
   * estudasse no computador e entrasse no celular perdia o avanço que tinha
   * ali. Medido antes do conserto: [1,2,3] entrava e `undefined` saía.
   */
  it("o pull não apaga mais os níveis concluídos", () => {
    const r = mergeProgress(local({ levelsCompleted: [1, 2, 3] }), nuvem());
    expect(r.levelsCompleted).toEqual([1, 2, 3]);
  });

  it("une os dois aparelhos, em ordem e sem repetir", () => {
    // Concluir o 3 no celular e o 4 no computador tem que dar os dois — é a
    // mesma lógica dos marcos únicos.
    const r = mergeProgress(local({ levelsCompleted: [3, 1] }), nuvem({ levels_completed: [4, 3] }));
    expect(r.levelsCompleted).toEqual([1, 3, 4]);
  });

  it("nuvem antiga, sem a coluna, não derruba o que é local", () => {
    // Linha gravada antes da migração 048 volta sem o campo.
    const r = mergeProgress(local({ levelsCompleted: [2] }), nuvem({ levels_completed: undefined }));
    expect(r.levelsCompleted).toEqual([2]);
  });
});
