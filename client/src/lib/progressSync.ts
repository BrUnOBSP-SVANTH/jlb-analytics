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
 * Fire-and-forget com erro silencioso: funciona offline e mesmo SEM a migração
 * 017_user_progress.sql aplicada (pull retorna false, push falha calado).
 */

import { supabase } from "./supabase";
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

/** Pull da nuvem → merge no localStorage. Retorna true se sincronizou. */
export async function pullProgress(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return false;

    saveProgress(mergeProgress(loadProgress(), data as DbProgress));
    return true;
  } catch {
    return false;
  }
}

/** Upsert do progresso local na nuvem. Fire-and-forget. */
export async function pushProgress(userId: string): Promise<void> {
  try {
    const p = loadProgress();
    await supabase.from("user_progress").upsert(
      {
        user_id: userId,
        total_points: p.totalPoints,
        activities: p.activities,
        one_time_done: p.oneTimeDone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch {
    /* silent — estado local inalterado */
  }
}
