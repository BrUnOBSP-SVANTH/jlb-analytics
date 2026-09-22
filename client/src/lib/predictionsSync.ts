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
import { addPrediction, loadPredictions, savePredictions, type StoredPrediction, type ResolutionSource } from "./predictions";

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
  outcome_id?: string | null;            // migration 030 (auto-heal se ausente)
  outcome_label?: string | null;         // migration 030
  brier_score: number | string | null;   // generated column
  created_at: string;
  resolved_at: string | null;
}

/** Colunas que chegaram depois da tabela — podem faltar num banco sem a migration. */
const COLUNAS_OPCIONAIS = ["resolution_source", "outcome_id", "outcome_label"] as const;

/**
 * Upsert com auto-heal: se uma coluna nova ainda não existe no banco (migration
 * não aplicada), o PostgREST devolve erro de schema cache — reenviamos SEM ela.
 * Assim o sync inteiro nunca quebra por causa de coluna nova.
 *
 * Tira SÓ a coluna que o erro nomeia, uma por vez. A versão anterior conhecia
 * uma coluna só; com três, tirar todas de uma vez apagaria `resolution_source`
 * num banco que já tem a 018 e só falta a 030.
 */
async function upsertRows(rows: Array<Record<string, unknown>>): Promise<void> {
  let atuais = rows;
  for (let tentativa = 0; tentativa <= COLUNAS_OPCIONAIS.length; tentativa++) {
    // ⚠️ `ignoreDuplicates` — a previsão é IMUTÁVEL depois de gravada (migration
    // 041, achado SEG-01). Quem resolve é o servidor, contra o settlement
    // oficial; o navegador não tem mais UPDATE em `predictions`, porque com ele
    // dava para marcar as próprias previsões como acertadas e subir no ranking
    // público. Sem esta linha o PostgREST recusaria o LOTE INTEIRO por causa das
    // linhas que já existem, e nem as previsões novas seriam salvas.
    const { error } = await supabase
      .from("predictions")
      .upsert(atuais, { onConflict: "id", ignoreDuplicates: true });
    if (!error) return;
    const msg = error.message ?? "";
    const faltando = COLUNAS_OPCIONAIS.find((c) => msg.includes(c) && c in (atuais[0] ?? {}));
    if (!faltando) return;          // erro que não é de coluna nova: nada a curar aqui
    atuais = atuais.map((r) => { const { [faltando]: _fora, ...resto } = r; void _fora; return resto; });
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
    outcome_id: p.outcomeId ?? null,
    outcome_label: p.outcomeLabel ?? null,
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
    outcomeId: row.outcome_id ?? undefined,
    outcomeLabel: row.outcome_label ?? undefined,
  };
}

// ── Reconciliação (pura, testada) ─────────────────────────────────────────

/**
 * Junta a foto remota com o que está no aparelho. Exportada para teste: é a
 * regra que decide o que o usuário PERDE ou não ao abrir o site em outro
 * aparelho, e antes morava enterrada numa função que chama o Supabase.
 *
 * Remoto vence por id, EXCETO onde isso apagaria um fato local:
 *  · resolução é monotônica — foto remota "pendente" não desfaz uma previsão já
 *    resolvida aqui (corrida com o settlement oficial);
 *  · procedência local ('settled'/'manual') fica quando o remoto vem sem ela
 *    (janela em que o auto-heal gravou sem resolution_source, pré-018);
 *  · o DESFECHO local nunca é apagado. Num banco sem a migration 030 a linha
 *    volta sem outcome_id, e "remoto vence" faria a previsão de "Aston Villa"
 *    virar previsão do mercado inteiro — e a resolução automática aplicaria
 *    nela o resultado do LÍDER: Brier errado, gravado como oficial.
 */
export function reconciliar(remote: StoredPrediction[], local: StoredPrediction[]): StoredPrediction[] {
  const localById = new Map(local.map((p) => [p.id, p]));
  const reconciled = remote.map((r) => {
    const l = localById.get(r.id);
    if (!l) return r;
    if (l.resolved && !r.resolved) return l;
    let out = r;
    if (out.resolved && !out.resolutionSource && l.resolutionSource) {
      out = { ...out, resolutionSource: l.resolutionSource };
    }
    if (!out.outcomeId && l.outcomeId) {
      out = { ...out, outcomeId: l.outcomeId, outcomeLabel: l.outcomeLabel };
    }
    return out;
  });
  const remoteIds = new Set(remote.map((p) => p.id));
  const localOnly = local.filter((p) => !remoteIds.has(p.id));
  return [...reconciled, ...localOnly].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
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
    savePredictions(reconciliar(remote, loadPredictions()));
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

/**
 * Registra a previsão E sincroniza na hora, se houver conta.
 *
 * O cabeçalho deste arquivo promete "on every write: upsert in Supabase" — e
 * não era o que acontecia. Só o Dashboard (ao montar) e a Previsão Guiada
 * sincronizavam; quem registrava pela FICHA do mercado ou pelos cards de
 * notícias ficava só no localStorage até abrir o painel. Medido em 20/09/2026
 * no site publicado: a previsão registrada na ficha não chegou ao banco.
 *
 * O que isso custava: o job que resolve pelo settlement oficial e manda push
 * roda no SERVIDOR, de 6 em 6 horas — previsão que não chegou ao banco nunca é
 * resolvida e nunca vira aviso. E o cadastro promete "histórico de previsões
 * sincronizado", o que só era verdade depois de uma visita ao painel.
 *
 * A sessão é lida aqui dentro para as telas não precisarem conhecer o usuário —
 * eram quatro componentes sem `useAuth`, e espalhar isso convidaria o próximo a
 * esquecer de novo. Best-effort: falha de rede não pode derrubar o registro,
 * que já está salvo localmente.
 */
export function registrarPrevisao(
  dados: Parameters<typeof addPrediction>[0],
): StoredPrediction {
  const pred = addPrediction(dados);
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      if (userId) await syncOne(pred, userId);
    } catch { /* offline ou sem conta: o localStorage já guardou */ }
  })();
  return pred;
}
