/**
 * userProgress — Sistema de Pontos JLB Analytics
 *
 * Armazenamento: localStorage (sincroniza com Supabase em versão futura).
 * Pontos desbloqueiam níveis 4 e 5 — sem pagamento.
 *
 * Regras:
 *  - Nível 4 → 50 pts
 *  - Nível 5 → 100 pts
 *
 * Atividades que geram pontos (com limites diários):
 *  - prediction_made      → +5  (máx 3/dia)
 *  - prediction_resolved  → +5  (máx 3/dia)
 *  - calculator_used      → +2  (máx 5/dia)
 *  - market_analyzed      → +3  (máx 3/dia)
 *  - level_visited        → +10 (uma vez por nível)
 *  - first_login          → +10 (uma vez)
 */

export type ActivityType =
  | "prediction_made"
  | "prediction_resolved"
  | "calculator_used"
  | "market_analyzed"
  | "level_visited"
  | "first_login"
  | "duel_won";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  label: string;
  points: number;
  timestamp: string;
}

export interface UserProgress {
  totalPoints: number;
  activities: ActivityEntry[];
  /** ISO date string → activity type → count that day */
  dailyCounts: Record<string, Record<string, number>>;
  /** Which one-time milestones were already awarded */
  oneTimeDone: string[];
}

const KEY = "jlb_progress_v1";

const POINTS: Record<ActivityType, number> = {
  prediction_made: 5,
  prediction_resolved: 5,
  calculator_used: 2,
  market_analyzed: 3,
  level_visited: 10,
  first_login: 10,
  duel_won: 25, // vitória em duelo de previsão (one-time por duelo, ver DUELOS.md)
};

const DAILY_LIMITS: Partial<Record<ActivityType, number>> = {
  prediction_made: 3,
  prediction_resolved: 3,
  calculator_used: 5,
  market_analyzed: 3,
};

export const UNLOCK_THRESHOLDS: Record<number, number> = {
  4: 50,
  5: 100,
};

// ── Storage ───────────────────────────────────────────────────────────────────

export function loadProgress(): UserProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return JSON.parse(raw) as UserProgress;
  } catch { return empty(); }
}

function empty(): UserProgress {
  return { totalPoints: 0, activities: [], dailyCounts: {}, oneTimeDone: [] };
}

function persist(p: UserProgress): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* quota exceeded — ignore */ }
}

// ── Core ──────────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface AwardResult {
  progress: UserProgress;
  /** Points earned in this call (0 if blocked by limit or one-time guard). */
  earned: number;
}

/**
 * Awards points for an activity.
 * Returns { progress, earned } — `earned` is 0 when blocked by daily limit or one-time guard.
 * Also dispatches a "jlb:points" CustomEvent on window so UI can react reactively.
 *
 * Pass `oneTimeKey` for milestones that should only fire once (e.g. "level_visited_3").
 */
export function awardPoints(
  type: ActivityType,
  label: string,
  oneTimeKey?: string,
): AwardResult {
  const p = loadProgress();

  // One-time guard
  if (oneTimeKey) {
    if (p.oneTimeDone.includes(oneTimeKey)) return { progress: p, earned: 0 };
    p.oneTimeDone.push(oneTimeKey);
  }

  // Daily limit guard
  const limit = DAILY_LIMITS[type];
  if (limit !== undefined) {
    const today = todayKey();
    p.dailyCounts[today] ??= {};
    const current = p.dailyCounts[today][type] ?? 0;
    if (current >= limit) return { progress: p, earned: 0 };
    p.dailyCounts[today][type] = current + 1;
  }

  const pts = POINTS[type];
  const entry: ActivityEntry = {
    id: crypto.randomUUID(),
    type,
    label,
    points: pts,
    timestamp: new Date().toISOString(),
  };

  p.totalPoints += pts;
  p.activities.unshift(entry);

  // Keep only last 200 activities (display purposes)
  if (p.activities.length > 200) p.activities = p.activities.slice(0, 200);

  // Prune daily counts older than 3 days
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  for (const key of Object.keys(p.dailyCounts)) {
    if (key < cutoff) delete p.dailyCounts[key];
  }

  persist(p);

  // Notify UI components (badge update + toast)
  try {
    window.dispatchEvent(
      new CustomEvent("jlb:points", { detail: { earned: pts, label, type } }),
    );
  } catch { /* SSR or test environment — ignore */ }

  return { progress: p, earned: pts };
}

// ── Queries ───────────────────────────────────────────────────────────────────

export function isLevelUnlocked(level: number): boolean {
  const threshold = UNLOCK_THRESHOLDS[level];
  if (!threshold) return true; // levels 1, 2, 3 always unlocked
  return loadProgress().totalPoints >= threshold;
}

export function pointsToUnlock(level: number): number {
  const threshold = UNLOCK_THRESHOLDS[level] ?? 0;
  const { totalPoints } = loadProgress();
  return Math.max(0, threshold - totalPoints);
}

/** Returns today's usage count for a given activity type. */
export function dailyUsage(type: ActivityType): number {
  const p = loadProgress();
  return p.dailyCounts[todayKey()]?.[type] ?? 0;
}

export function canEarnToday(type: ActivityType): boolean {
  const limit = DAILY_LIMITS[type];
  if (!limit) return true;
  return dailyUsage(type) < limit;
}
