/**
 * Prediction Tracker — JLB Analytics
 * localStorage-based store, schema-compatible with the Supabase predictions table (003_predictions.sql).
 * All logic is pure: no React, no side effects. Import and call freely.
 */

import { getAllMarkets } from "./marketsCache";

export interface StoredPrediction {
  id: string;
  marketId: string;
  question: string;
  marketProb: number;   // 0-100, market consensus at save time
  userProb: number;     // 0-100, user's estimate
  savedAt: string;      // ISO 8601
  resolved: boolean;
  outcome: boolean | null;   // true = YES resolved, false = NO resolved
  brierScore: number | null; // (outcome01 - userProb/100)^2, null until resolved
}

export interface CalibrationBucket {
  bucket: number;      // midpoint of the bucket (5, 15, 25, ... 95)
  actualRate: number;  // fraction that actually resolved YES in this bucket
  count: number;       // number of resolved predictions in bucket
  predicted: number;   // same as bucket (for perfect-calibration reference line)
}

const KEY = "jlb_predictions_v1";

// ── CRUD ──────────────────────────────────────────────────────────────────

export function loadPredictions(): StoredPrediction[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as StoredPrediction[];
  } catch { return []; }
}

function save(list: StoredPrediction[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Replace the entire stored list (used by cloud sync). */
export function savePredictions(list: StoredPrediction[]): void {
  save(list);
}

export function addPrediction(
  data: Omit<StoredPrediction, "id" | "savedAt" | "resolved" | "outcome" | "brierScore">
): StoredPrediction {
  const p: StoredPrediction = {
    ...data,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    resolved: false,
    outcome: null,
    brierScore: null,
  };
  const list = loadPredictions();
  list.unshift(p);
  save(list);
  return p;
}

export function resolvePrediction(id: string, outcome: boolean): StoredPrediction | null {
  const list = loadPredictions();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const p = list[idx];
  const outcome01 = outcome ? 1 : 0;
  const prob01 = p.userProb / 100;
  list[idx] = {
    ...p,
    resolved: true,
    outcome,
    brierScore: Math.pow(outcome01 - prob01, 2),
  };
  save(list);
  return list[idx];
}

export function deletePrediction(id: string): void {
  save(loadPredictions().filter((p) => p.id !== id));
}

// ── Auto-resolution detection ───────────────────────────────────────────────
// Cruza previsões pendentes (com marketId real) contra o estado atual dos
// mercados ao vivo. Quando um mercado atinge probabilidade extrema (≥97% ou
// ≤3%) ele está efetivamente resolvido — sugerimos o resultado ao usuário.

export interface ResolutionSuggestion {
  prediction: StoredPrediction;
  suggestedOutcome: boolean;   // true = SIM, false = NÃO
  currentProb: number;          // prob atual do mercado (0-100)
  confidence: "alta" | "media"; // alta = ≥97/≤3, media = ≥90/≤10
}

interface LiveMarketLite { id: string; yesProb: number }

/** Busca o estado atual dos mercados e detecta previsões prontas para resolver. */
export async function detectResolutions(pending: StoredPrediction[]): Promise<ResolutionSuggestion[]> {
  const realMarketPreds = pending.filter(
    (p) => p.marketId.startsWith("poly-") || p.marketId.startsWith("kalshi-")
  );
  if (realMarketPreds.length === 0) return [];

  const priceMap = new Map<string, number>(); // marketId → yesProb (0-100)

  try {
    const { polymarket, kalshi } = await getAllMarkets<
      { id: string; outcomePrices?: string; yesProb?: number },
      { ticker: string; yesProb: number }
    >();

    for (const m of polymarket) {
      let prob = m.yesProb;
      if (prob === undefined && m.outcomePrices) {
        try { prob = parseFloat((JSON.parse(m.outcomePrices) as string[])[0]); } catch { /* skip */ }
      }
      if (prob !== undefined && !isNaN(prob)) {
        priceMap.set(`poly-${m.id}`, prob > 1 ? prob : prob * 100);
      }
    }
    for (const m of kalshi) {
      priceMap.set(`kalshi-${m.ticker}`, m.yesProb > 1 ? m.yesProb : m.yesProb * 100);
    }
  } catch { return []; }

  const suggestions: ResolutionSuggestion[] = [];
  for (const pred of realMarketPreds) {
    const currentProb = priceMap.get(pred.marketId);
    if (currentProb === undefined) continue; // mercado não está mais ativo — não dá pra inferir
    if (currentProb >= 90) {
      suggestions.push({ prediction: pred, suggestedOutcome: true, currentProb, confidence: currentProb >= 97 ? "alta" : "media" });
    } else if (currentProb <= 10) {
      suggestions.push({ prediction: pred, suggestedOutcome: false, currentProb, confidence: currentProb <= 3 ? "alta" : "media" });
    }
  }
  return suggestions;
}

// ── Analytics ──────────────────────────────────────────────────────────────

/** Mean Brier Score over resolved predictions. Lower = better. Baseline = 0.25. */
export function meanBrierScore(preds: StoredPrediction[]): number | null {
  const resolved = preds.filter((p) => p.resolved && p.brierScore !== null);
  if (resolved.length === 0) return null;
  const sum = resolved.reduce((acc, p) => acc + (p.brierScore ?? 0), 0);
  return sum / resolved.length;
}

/**
 * Skill Score = 1 - (mean Brier) / 0.25.
 * > 0: better than random. 1.0: perfect. < 0: worse than random.
 */
export function skillScore(preds: StoredPrediction[]): number | null {
  const bs = meanBrierScore(preds);
  if (bs === null) return null;
  return 1 - bs / 0.25;
}

/**
 * Build calibration buckets in steps of 10 (0-10, 10-20, ..., 90-100).
 * Only uses resolved predictions.
 */
export function calibrationBuckets(preds: StoredPrediction[]): CalibrationBucket[] {
  const resolved = preds.filter((p) => p.resolved && p.outcome !== null);
  const buckets: CalibrationBucket[] = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const hi = lo + 10;
    const inBucket = resolved.filter((p) => p.userProb >= lo && p.userProb < hi);
    if (inBucket.length === 0) continue;
    const yesCount = inBucket.filter((p) => p.outcome === true).length;
    buckets.push({
      bucket: lo + 5,
      predicted: lo + 5,
      actualRate: Math.round((yesCount / inBucket.length) * 100),
      count: inBucket.length,
    });
  }
  return buckets;
}

// ── Calibration History ────────────────────────────────────────────────────

export interface CalibrationSnapshot {
  date: string;       // ISO date (YYYY-MM-DD) — one snapshot per day
  meanBrier: number | null;
  skillScore: number | null;
  resolvedCount: number;
  totalCount: number;
}

const HISTORY_KEY = "jlb_calibration_history_v1";
const MAX_SNAPSHOTS = 90; // ~3 months

export function loadCalibrationHistory(): CalibrationSnapshot[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as CalibrationSnapshot[];
  } catch { return []; }
}

/** Call this after resolving a prediction to persist a daily snapshot. */
export function saveCalibrationSnapshot(): void {
  const preds = loadPredictions();
  const today = new Date().toISOString().slice(0, 10);
  const history = loadCalibrationHistory();

  const bs = meanBrierScore(preds);
  const ss = bs !== null ? parseFloat((1 - bs / 0.25).toFixed(4)) : null;
  const snapshot: CalibrationSnapshot = {
    date: today,
    meanBrier: bs !== null ? parseFloat(bs.toFixed(4)) : null,
    skillScore: ss,
    resolvedCount: preds.filter((p) => p.resolved).length,
    totalCount: preds.length,
  };

  // Replace today's entry if it exists, otherwise append
  const idx = history.findIndex((s) => s.date === today);
  if (idx >= 0) history[idx] = snapshot;
  else history.push(snapshot);

  // Keep only the most recent MAX_SNAPSHOTS entries, sorted ascending
  const trimmed = history
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_SNAPSHOTS);

  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}

/** Edge: user estimate minus market consensus. Positive = you think market underprices. */
export function edge(userProb: number, marketProb: number): number {
  return userProb - marketProb;
}

/**
 * Kelly fraction (full Kelly) given estimated prob and market odds (decimal).
 * marketOdds = 100 / marketProb (implied from price).
 * Returns 0 if no edge, capped at 0.25 (¼ Kelly conservative default).
 */
export function kellyFraction(userProb: number, marketProb: number): number {
  if (marketProb <= 0 || marketProb >= 100) return 0;
  const p = userProb / 100;
  const q = 1 - p;
  const b = (100 - marketProb) / marketProb; // net odds on YES side
  const f = (p * b - q) / b;
  return Math.max(0, Math.min(f, 0.25));
}

// ── Sentiment (wordlist approach) ─────────────────────────────────────────

const POS_WORDS = [
  "win", "wins", "won", "beats", "leads", "surge", "rise", "rises",
  "higher", "bull", "likely", "probable", "confirms", "elected", "approved",
  "passes", "yes", "gains", "grows", "up", "strong", "positive", "bullish",
  "momentum", "breakout", "record", "all-time", "outperforms",
];
const NEG_WORDS = [
  "lose", "loses", "lost", "trails", "miss", "misses", "crash", "fall", "falls",
  "lower", "bear", "unlikely", "improbable", "fails", "rejected", "defeated",
  "denied", "no", "drops", "down", "weak", "negative", "bearish",
  "underperforms", "slump", "collapse", "crisis",
];

export interface SentimentResult {
  score: number;  // -1 to +1
  label: "Positivo" | "Neutro" | "Negativo";
  color: string;  // tailwind class
}

export function analyzeSentiment(text: string): SentimentResult {
  // Tokeniza em palavras INTEIRAS (inclui hifenizadas como "all-time").
  // Antes usava substring (`includes`), o que dava falso positivo grave:
  // "economy" contém "no", "support" contém "up", "winter" contém "win".
  const words = new Set(text.toLowerCase().match(/[a-z]+(?:-[a-z]+)?/g) ?? []);
  let pos = 0;
  let neg = 0;
  POS_WORDS.forEach((w) => { if (words.has(w)) pos++; });
  NEG_WORDS.forEach((w) => { if (words.has(w)) neg++; });
  if (pos + neg === 0) return { score: 0, label: "Neutro", color: "text-muted-foreground" };
  const score = (pos - neg) / (pos + neg);
  if (score > 0.2) return { score, label: "Positivo", color: "text-positive" };
  if (score < -0.2) return { score, label: "Negativo", color: "text-negative" };
  return { score, label: "Neutro", color: "text-muted-foreground" };
}
