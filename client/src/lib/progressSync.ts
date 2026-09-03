/**
 * Progress — Supabase sync layer (JLB Analytics)
 *
 * Sincroniza o progresso/gamificação (pontos, conquistas, feed) entre
 * dispositivos. Espelha a estratégia do predictionsSync:
 *   - localStorage é sempre a fonte local de verdade.
 *   - No login: pull da nuvem → MERGE no localStorage.
 *   - Ao ganhar pontos: push (debounced, feito pelo componente ProgressSync).
 *
 * Merge (evita duplicar somando e nunca perde um marco já ganho):
 *   - totalPoints = maior valor (local vs nuvem)
 *   - oneTimeDone = união
 *   - activities  = união por id, 200 mais recentes
 *   - dailyCounts = local (efêmero, não precisa cruzar aparelho)
 *
 * Fire-and-forget: funciona offline e mesmo SEM a migração 017_user_progress.sql
 * aplicada. Mas falha SILENCIOSA não — ver `avisarFalha` abaixo.
 *
 * ⚠️ Por que a falha precisa ser observável (aprendido em 02/09): a tabela
 * `user_progress` estava com ZERO linhas e não havia como distinguir "ninguém
 * usou ainda" de "a sincronização está quebrada". É a mesma armadilha que deixou
 * Manifold e Reddit mortos por semanas — 502 engolido no catch, nenhum alarme.
 * O caminho de escrita foi verificado ponta a ponta e funciona; o que faltava era
 * saber quando parar de funcionar.
 */

import { supabase } from "./supabase";
import { track } from "./analytics";
import { loadProgress, saveProgress, type UserProgress, type ActivityEntry } from "./userProgress";

interface DbProgress {
  user_id: string;
  total_points: number;
  activities: ActivityEntry[] | null;
  one_time_done: string[] | null;
  updated_at: string;
}

export function mergeProgress(local: UserProgress, remote: DbProgress): UserProgress {
  const oneTimeDone = Array.from(new Set([...local.oneTimeDone, ...(remote.one_time_done ?? [])]));

  const byId = new Map<string, ActivityEntry>();
  for (const a of [...(remote.activities ?? []), ...local.activities]) byId.set(a.id, a);
  const activities = Array.from(byId.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 200);

  return {
    totalPoints: Math.max(local.totalPoints, remote.total_points ?? 0),
    activities,
    oneTimeDone,
    dailyCounts: local.dailyCounts,
  };
}

/**
 * Registra a falha sem atrapalhar o usuário: vai para a telemetria (fica visível
 * em /api/track) e para o console em desenvolvimento. Nunca lança.
 */
function avisarFalha(etapa: "pull" | "push", motivo: string): void {
  try {
    track("progress_sync_failed", { etapa, motivo: motivo.slice(0, 120) });
    if (import.meta.env?.DEV) console.warn(`[progressSync] ${etapa} falhou: ${motivo}`);
  } catch { /* telemetria nunca pode quebrar o app */ }
}

/** Pull da nuvem → merge no localStorage. Retorna true se sincronizou. */
export async function pullProgress(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    // Distinguir os dois casos importa: SEM linha é normal (usuário novo);
    // COM erro é defeito, e precisa aparecer em algum lugar.
    if (error) { avisarFalha("pull", error.message); return false; }
    if (!data) return false;

    saveProgress(mergeProgress(loadProgress(), data as DbProgress));
    return true;
  } catch (e) {
    avisarFalha("pull", e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Upsert do progresso local na nuvem. Fire-and-forget. */
export async function pushProgress(userId: string): Promise<void> {
  try {
    const p = loadProgress();
    const { error } = await supabase.from("user_progress").upsert(
      {
        user_id: userId,
        total_points: p.totalPoints,
        activities: p.activities,
        one_time_done: p.oneTimeDone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    // O erro do supabase-js vem no RETORNO, não como exceção — o `catch` sozinho
    // nunca o veria. Era por isso que a falha sumia por completo.
    if (error) avisarFalha("push", error.message);
  } catch (e) {
    avisarFalha("push", e instanceof Error ? e.message : String(e));
  }
}
