/**
 * Predictions — Supabase sync layer (JLB Analytics)
 *
 * Strategy: localStorage is always the local source of truth.
 * When the user is authenticated:
 *   - On login / mount: pull from Supabase → merge into localStorage
 *   - On every write (add, resolve, delete): upsert/delete in Supabase
 *
 * All network calls are fire-and-forget with silent error swallowing so that
 * the app works fine offline or without the migration applied.
 *
 * REQUIRES: migration 003_predictions.sql applied in Supabase.
 */

import { supabase } from "./supabase";
import { loadPredictions, savePredictions, type StoredPrediction } from "./predictions";

// ── DB row type (matches 003_predictions.sql) ─────────────────────────────

interface DbPrediction {
  id: string;
  user_id: string;
  market_id: string;
  market_question: string;
  market_prob: number | string;
  user_prob: number | string;
  kelly_fraction: number | null;
  resolved: boolean;
  outcome: boolean | null;
  resolution_price: number | null;
  brier_score: number | string | null;  // generated column
  created_at: string;
  resolved_at: string | null;
}

// ── Converters ────────────────────────────────────────────────────────────

function toDbRow(p: StoredPrediction, userId: string): Omit<DbPrediction, "brier_score" | "edge_at_save"> {
  return {
    id: p.id,
    user_id: userId,
    market_id: p.marketId,
    market_question: p.question,
    market_prob: p.marketProb,
    user_prob: p.userProb,
    kelly_fraction: null,
    resolved: p.resolved,
    outcome: p.outcome,
    resolution_price: p.outcome !== null ? (p.outcome ? 100 : 0) : null,
    created_at: p.savedAt,
    resolved_at: p.resolved ? (p.savedAt) : null,
  };
}

function fromDbRow(row: DbPrediction): StoredPrediction {
  const bs = row.brier_score !== null && row.brier_score !== undefined
    ? parseFloat(String(row.brier_score))
    : null;
  return {
    id: row.id,
    marketId: row.market_id,
    question: row.market_question,
    marketProb: parseFloat(String(row.market_prob)),
    userProb: parseFloat(String(row.user_prob)),
    savedAt: row.created_at,
    resolved: row.resolved,
    outcome: row.outcome,
    brierScore: isNaN(bs as number) ? null : bs,
  };
}

// ── Pull from Supabase → merge into localStorage ──────────────────────────

/**
 * Loads the user's predictions from Supabase and merges them into localStorage.
 * Remote rows win on conflict (same id). Local-only entries are preserved.
 * Returns true if sync succeeded.
 */
export async function pullFromSupabase(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("predictions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error || !data) return false;

    const remote = (data as DbPrediction[]).map(fromDbRow);
    const local = loadPredictions();

    // Merge: remote wins by id, local-only entries appended
    const remoteIds = new Set(remote.map((p) => p.id));
    const localOnly = local.filter((p) => !remoteIds.has(p.id));

    const merged = [...remote, ...localOnly].sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
    );

    savePredictions(merged);
    return true;
  } catch {
    return false;
  }
}

// ── Push localStorage → Supabase (full upsert) ────────────────────────────

/** Upserts all localStorage predictions to Supabase. Fire-and-forget safe. */
export async function pushToSupabase(userId: string): Promise<void> {
  try {
    const preds = loadPredictions();
    if (preds.length === 0) return;
    const rows = preds.map((p) => toDbRow(p, userId));
    await supabase.from("predictions").upsert(rows, { onConflict: "id" });
  } catch {
    // silent — local state unchanged
  }
}

// ── Single-row operations ─────────────────────────────────────────────────

/** Upsert a single prediction (call after addPrediction / resolvePrediction). */
export async function syncOne(pred: StoredPrediction, userId: string): Promise<void> {
  try {
    await supabase.from("predictions").upsert(toDbRow(pred, userId), { onConflict: "id" });
  } catch { /* silent */ }
}

/** Delete a single prediction from Supabase (call after deletePrediction). */
export async function deleteOne(id: string, userId: string): Promise<void> {
  try {
    await supabase.from("predictions").delete().eq("id", id).eq("user_id", userId);
  } catch { /* silent */ }
}
