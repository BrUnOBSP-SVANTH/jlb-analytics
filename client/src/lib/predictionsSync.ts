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
import { loadPredictions, savePredictions, type StoredPrediction, type ResolutionSource } from "./predictions";

// ── DB row type (matches 003_predictions.sql + 018_resolution_source.sql) ──

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
  resolution_source: string | null;      // migration 018 (auto-heal se ausente)
  brier_score: number | string | null;   // generated column
  created_at: string;
  resolved_at: string | null;
}

/**
 * Upsert com auto-heal: se a coluna resolution_source ainda não existe (migration
 * 018 não aplicada), o PostgREST devolve erro de schema cache — reenviamos SEM o
 * campo. Assim o sync inteiro nunca quebra por causa da coluna nova.
 */
async function upsertRows(rows: Array<Record<string, unknown>>): Promise<void> {
  const { error } = await supabase.from("predictions").upsert(rows, { onConflict: "id" });
  if (error && /resolution_source|PGRST204|schema cache/i.test(error.message ?? "")) {
    const stripped = rows.map(({ resolution_source, ...rest }) => { void resolution_source; return rest; });
    await supabase.from("predictions").upsert(stripped, { onConflict: "id" });
  }
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
    resolution_source: p.resolutionSource ?? null,
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
    resolutionSource: (row.resolution_source as ResolutionSource | null) ?? undefined,
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
    const localById = new Map(local.map((p) => [p.id, p]));

    // Merge por id: remoto vence, EXCETO onde isso reverteria fatos locais.
    // A resolução é monotônica — uma foto remota 'pendente' nunca deve apagar
    // uma previsão já resolvida localmente (corrida com o settlement oficial); e a
    // procedência local ('settled'/'manual') é preservada quando o remoto vier sem
    // ela (janela em que o auto-heal gravou sem resolution_source, pré-migration 018).
    const reconciled = remote.map((r) => {
      const l = localById.get(r.id);
      if (!l) return r;
      if (l.resolved && !r.resolved) return l;                       // não reverter resolução local
      if (r.resolved && !r.resolutionSource && l.resolutionSource) { // preservar procedência local
        return { ...r, resolutionSource: l.resolutionSource };
      }
      return r;
    });

    const remoteIds = new Set(remote.map((p) => p.id));
    const localOnly = local.filter((p) => !remoteIds.has(p.id));

    const merged = [...reconciled, ...localOnly].sort(
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
    await upsertRows(rows);
  } catch {
    // silent — local state unchanged
  }
}

// ── Single-row operations ─────────────────────────────────────────────────

/** Upsert a single prediction (call after addPrediction / resolvePrediction). */
export async function syncOne(pred: StoredPrediction, userId: string): Promise<void> {
  try {
    await upsertRows([toDbRow(pred, userId)]);
  } catch { /* silent */ }
}

/** Delete a single prediction from Supabase (call after deletePrediction). */
export async function deleteOne(id: string, userId: string): Promise<void> {
  try {
    await supabase.from("predictions").delete().eq("id", id).eq("user_id", userId);
  } catch { /* silent */ }
}
