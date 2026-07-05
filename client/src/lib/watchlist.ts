/**
 * Watchlist — JLB Analytics
 * localStorage-based market watchlist. Shared between Apostas and Dashboard.
 */

export interface WatchlistItem {
  id: string;
  title: string;
  source: "polymarket" | "kalshi" | "reddit";
  yesProb?: number;           // 0–1 decimal at save time
  lastKnownProb?: number;     // 0–1 decimal, updated on each Apostas refresh
  alertThreshold?: number;    // pp delta to trigger alert (default 5)
  externalUrl: string;
  savedAt: string;            // ISO 8601
  category?: string;
}

const KEY = "jlb_watchlist_v1";

export function loadWatchlist(): WatchlistItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as WatchlistItem[];
  } catch { return []; }
}

function save(list: WatchlistItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addToWatchlist(item: Omit<WatchlistItem, "savedAt">): void {
  const list = loadWatchlist();
  if (list.some((w) => w.id === item.id)) return; // already saved
  list.unshift({ ...item, savedAt: new Date().toISOString() });
  save(list.slice(0, 50)); // cap at 50 items
}

export function removeFromWatchlist(id: string): void {
  save(loadWatchlist().filter((w) => w.id !== id));
}

export function isWatched(id: string): boolean {
  return loadWatchlist().some((w) => w.id === id);
}

export function clearWatchlist(): void {
  localStorage.removeItem(KEY);
}

/**
 * Called after each market refresh. Updates lastKnownProb for every watchlisted
 * item that appears in the current market data.
 * Returns items whose prob moved beyond their alertThreshold since last check.
 */
export function updateWatchlistProbs(
  updates: { id: string; prob: number }[],
): { id: string; title: string; delta: number; newProb: number }[] {
  if (updates.length === 0) return [];
  const list = loadWatchlist();
  const triggered: { id: string; title: string; delta: number; newProb: number }[] = [];
  let changed = false;
  for (const { id, prob } of updates) {
    const idx = list.findIndex((w) => w.id === id);
    if (idx < 0) continue;
    const item = list[idx];
    const prev = item.lastKnownProb ?? item.yesProb;
    if (prev !== undefined) {
      const deltaPp = (prob - prev) * 100;
      const threshold = item.alertThreshold ?? 5;
      if (Math.abs(deltaPp) >= threshold) {
        triggered.push({ id, title: item.title, delta: deltaPp, newProb: prob });
      }
    }
    list[idx] = { ...item, lastKnownProb: prob };
    changed = true;
  }
  if (changed) save(list);
  return triggered;
}

/** Cycle alert threshold for an item: 3 → 5 → 10 → 3 pp. */
export function cycleAlertThreshold(id: string): number {
  const list = loadWatchlist();
  const idx = list.findIndex((w) => w.id === id);
  if (idx < 0) return 5;
  const cur = list[idx].alertThreshold ?? 5;
  const next = cur < 4 ? 5 : cur < 7 ? 10 : 3;
  list[idx] = { ...list[idx], alertThreshold: next };
  save(list);
  return next;
}
