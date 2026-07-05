/**
 * Backtesting Engine — JLB Analytics
 * Ports strategy logic from evan-kolberg/prediction-market-backtesting to TypeScript.
 * Strategies: Mean Reversion, Panic Fade, RSI Reversion.
 * All prices are 0–1 (Polymarket convention: 1 = 100¢ = YES resolved).
 *
 * Reference implementations:
 *   strategies/mean_reversion.py  — rolling average, buy below mean − threshold
 *   strategies/panic_fade.py      — buy capitulation below panic_price
 *   strategies/rsi_reversion.py   — RSI < oversold → buy, RSI > exit → sell
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface PricePoint {
  t: number;   // unix seconds
  p: number;   // 0–1 probability (YES outcome)
}

export type ExitReason =
  | "takeProfit"
  | "stopLoss"
  | "rebound"
  | "rsiExit"
  | "timeout"
  | "endOfData";

export interface Trade {
  entryIdx: number;
  exitIdx: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;       // exitPrice − entryPrice (per unit)
  pnlPct: number;    // pnl / entryPrice
  exitReason: ExitReason;
}

export interface BacktestMetrics {
  totalReturn: number;      // sum of pnl across trades (cumulative profit per unit)
  sharpe: number;           // annualised Sharpe ratio (based on per-trade returns)
  maxDrawdown: number;      // max peak→trough decline of equity curve (0–1)
  winRate: number;          // fraction of profitable trades
  totalTrades: number;
  avgPnlPerTrade: number;
  avgEntryPrice: number;    // mean entry price — low → edge over market
  brierAdvantage: number;   // Brier improvement vs. buy-and-hold baseline
  equity: number[];         // normalised equity curve starting at 1.0 (length = series)
}

// ── Strategy Config Types ──────────────────────────────────────────────────

export interface MeanReversionConfig {
  window: number;          // rolling average period (candles)
  entryThreshold: number;  // buy when price ≤ mean − threshold (0–1)
  takeProfit: number;      // exit gain (0–1)
  stopLoss: number;        // exit loss  (0–1)
}

export interface PanicFadeConfig {
  dropWindow: number;         // lookback for peak calculation (candles)
  minDrop: number;            // minimum absolute drop (0–1)
  panicPrice: number;         // maximum price allowed at entry (0–1)
  reboundExit: number;        // exit when price recovers to this (0–1)
  maxHoldingPeriods: number;  // timeout (candles)
  takeProfit: number;
  stopLoss: number;
}

export interface RsiReversionConfig {
  period: number;         // RSI lookback period (candles)
  oversold: number;       // RSI < oversold → buy  (e.g. 30)
  exitRsi: number;        // RSI > exitRsi → sell  (e.g. 55)
  takeProfit: number;
  stopLoss: number;
}

export type StrategyConfig =
  | { type: "meanReversion"; params: MeanReversionConfig }
  | { type: "panicFade"; params: PanicFadeConfig }
  | { type: "rsiReversion"; params: RsiReversionConfig };

// ── Strategy defaults ──────────────────────────────────────────────────────

export const DEFAULT_MEAN_REVERSION: MeanReversionConfig = {
  window: 20,
  entryThreshold: 0.04,
  takeProfit: 0.06,
  stopLoss: 0.03,
};

export const DEFAULT_PANIC_FADE: PanicFadeConfig = {
  dropWindow: 12,
  minDrop: 0.08,
  panicPrice: 0.35,
  reboundExit: 0.45,
  maxHoldingPeriods: 36,
  takeProfit: 0.06,
  stopLoss: 0.03,
};

export const DEFAULT_RSI_REVERSION: RsiReversionConfig = {
  period: 14,
  oversold: 30,
  exitRsi: 55,
  takeProfit: 0.05,
  stopLoss: 0.025,
};

// ── Indicators ────────────────────────────────────────────────────────────

function rollingMean(prices: number[], window: number): number | null {
  if (prices.length < window) return null;
  const slice = prices.slice(-window);
  return slice.reduce((a, b) => a + b, 0) / window;
}

/**
 * Compute RSI over the last `period + 1` prices.
 * Returns null if insufficient data.
 */
function computeRsi(prices: number[], period: number): number | null {
  if (prices.length < period + 1) return null;
  const slice = prices.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const change = slice[i] - slice[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

// ── Risk exit helper ───────────────────────────────────────────────────────

function checkRiskExit(
  entryPrice: number,
  currentPrice: number,
  takeProfit: number,
  stopLoss: number,
): ExitReason | null {
  if (currentPrice >= entryPrice + takeProfit) return "takeProfit";
  if (currentPrice <= entryPrice - stopLoss) return "stopLoss";
  return null;
}

// ── Mean Reversion ────────────────────────────────────────────────────────

function runMeanReversion(series: PricePoint[], cfg: MeanReversionConfig): Trade[] {
  const trades: Trade[] = [];
  const prices: number[] = [];
  let inPosition = false;
  let entryIdx = 0;
  let entryPrice = 0;

  for (let i = 0; i < series.length; i++) {
    const p = series[i].p;
    prices.push(p);

    if (!inPosition) {
      const mean = rollingMean(prices, cfg.window);
      if (mean !== null && p <= mean - cfg.entryThreshold) {
        inPosition = true;
        entryIdx = i;
        entryPrice = p;
      }
    } else {
      const exitReason = checkRiskExit(entryPrice, p, cfg.takeProfit, cfg.stopLoss);
      const isLast = i === series.length - 1;

      if (exitReason || isLast) {
        trades.push(makeTrade(series, entryIdx, i, entryPrice, p, exitReason ?? "endOfData"));
        inPosition = false;
      }
    }
  }
  return trades;
}

// ── Panic Fade ────────────────────────────────────────────────────────────

function runPanicFade(series: PricePoint[], cfg: PanicFadeConfig): Trade[] {
  const trades: Trade[] = [];
  const prices: number[] = [];
  let inPosition = false;
  let entryIdx = 0;
  let entryPrice = 0;
  let holdingPeriods = 0;

  for (let i = 0; i < series.length; i++) {
    const p = series[i].p;
    prices.push(p);

    if (!inPosition) {
      if (prices.length >= cfg.dropWindow) {
        const window = prices.slice(-cfg.dropWindow);
        const peak = Math.max(...window);
        const drop = peak - p;
        if (p <= cfg.panicPrice && drop >= cfg.minDrop) {
          inPosition = true;
          entryIdx = i;
          entryPrice = p;
          holdingPeriods = 0;
        }
      }
    } else {
      holdingPeriods++;
      const riskExit = checkRiskExit(entryPrice, p, cfg.takeProfit, cfg.stopLoss);
      const timedOut = holdingPeriods >= cfg.maxHoldingPeriods;
      const rebounded = p >= cfg.reboundExit;
      const isLast = i === series.length - 1;

      let exitReason: ExitReason | null = null;
      if (riskExit) exitReason = riskExit;
      else if (rebounded) exitReason = "rebound";
      else if (timedOut) exitReason = "timeout";
      else if (isLast) exitReason = "endOfData";

      if (exitReason) {
        trades.push(makeTrade(series, entryIdx, i, entryPrice, p, exitReason));
        inPosition = false;
      }
    }
  }
  return trades;
}

// ── RSI Reversion ─────────────────────────────────────────────────────────

function runRsiReversion(series: PricePoint[], cfg: RsiReversionConfig): Trade[] {
  const trades: Trade[] = [];
  const prices: number[] = [];
  let inPosition = false;
  let entryIdx = 0;
  let entryPrice = 0;

  for (let i = 0; i < series.length; i++) {
    const p = series[i].p;
    prices.push(p);

    const rsi = computeRsi(prices, cfg.period);
    if (rsi === null) continue;

    if (!inPosition) {
      if (rsi < cfg.oversold) {
        inPosition = true;
        entryIdx = i;
        entryPrice = p;
      }
    } else {
      const riskExit = checkRiskExit(entryPrice, p, cfg.takeProfit, cfg.stopLoss);
      const rsiExit = rsi > cfg.exitRsi;
      const isLast = i === series.length - 1;

      let exitReason: ExitReason | null = null;
      if (riskExit) exitReason = riskExit;
      else if (rsiExit) exitReason = "rsiExit";
      else if (isLast) exitReason = "endOfData";

      if (exitReason) {
        trades.push(makeTrade(series, entryIdx, i, entryPrice, p, exitReason));
        inPosition = false;
      }
    }
  }
  return trades;
}

// ── Trade factory ─────────────────────────────────────────────────────────

function makeTrade(
  series: PricePoint[],
  entryIdx: number,
  exitIdx: number,
  entryPrice: number,
  exitPrice: number,
  exitReason: ExitReason,
): Trade {
  const pnl = exitPrice - entryPrice;
  return {
    entryIdx,
    exitIdx,
    entryTime: series[entryIdx].t,
    exitTime: series[exitIdx].t,
    entryPrice,
    exitPrice,
    pnl,
    pnlPct: entryPrice > 0 ? pnl / entryPrice : 0,
    exitReason,
  };
}

// ── Metrics ────────────────────────────────────────────────────────────────

function buildMetrics(trades: Trade[], series: PricePoint[]): BacktestMetrics {
  const n = series.length;

  // Equity curve: starts at 1.0, accumulates P&L at each trade exit
  const equity = new Array<number>(n).fill(1.0);
  let running = 1.0;
  let tradeIdx = 0;

  for (let i = 0; i < n; i++) {
    while (tradeIdx < trades.length && trades[tradeIdx].exitIdx <= i) {
      running += trades[tradeIdx].pnl;
      tradeIdx++;
    }
    equity[i] = running;
  }

  // Max drawdown
  let peak = equity[0];
  let maxDD = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = peak > 0 ? (peak - e) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }

  // Sharpe (annualised, ~365 * 24 hourly candles / candles_per_year)
  const returns = trades.map((t) => t.pnlPct);
  const sharpe = computeSharpe(returns);

  // Win rate
  const wins = trades.filter((t) => t.pnl > 0).length;

  // Average entry price
  const avgEntry = trades.length > 0
    ? trades.reduce((s, t) => s + t.entryPrice, 0) / trades.length
    : 0;

  // Total return
  const totalReturn = trades.reduce((s, t) => s + t.pnl, 0);

  // Brier Advantage vs. buy-and-hold baseline
  // Baseline: "buy" at series[0].p, hold to series[n-1].p
  // BS_baseline = (final - initial)^2  (treating initial price as prediction)
  // BS_strategy = mean over trades of (exitPrice - entryPrice) style Brier comparison
  const brierAdvantage = computeBrierAdvantage(trades, series);

  return {
    totalReturn,
    sharpe,
    maxDrawdown: maxDD,
    winRate: trades.length > 0 ? wins / trades.length : 0,
    totalTrades: trades.length,
    avgPnlPerTrade: trades.length > 0 ? totalReturn / trades.length : 0,
    avgEntryPrice: avgEntry,
    brierAdvantage,
    equity,
  };
}

function computeSharpe(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  // Scale by sqrt of annual trades (approximation)
  const annFactor = Math.sqrt(Math.max(returns.length, 1));
  return (mean / std) * annFactor;
}

/**
 * Brier Advantage: how much better does the strategy's entry timing perform
 * vs. simply using the market price as the probability estimate.
 *
 * For each trade, if the market resolved to outcome R ∈ {0, 1}:
 *   BS_strategy = (R - entry_price)^2
 *   BS_baseline = (R - series[entryIdx - 1].p)^2   ← market price just before entry
 *   advantage   = BS_baseline - BS_strategy          (positive = strategy is better)
 *
 * We use exitPrice as a proxy for R when we don't have the true resolution.
 */
function computeBrierAdvantage(trades: Trade[], series: PricePoint[]): number {
  if (trades.length === 0) return 0;
  let totalAdv = 0;
  for (const t of trades) {
    // Use final series price as resolution proxy
    const resolution = series[series.length - 1].p > 0.8 ? 1 : series[series.length - 1].p < 0.2 ? 0 : t.exitPrice;
    const prevPrice = t.entryIdx > 0 ? series[t.entryIdx - 1].p : series[0].p;
    const bsBaseline = Math.pow(resolution - prevPrice, 2);
    const bsStrategy = Math.pow(resolution - t.entryPrice, 2);
    totalAdv += bsBaseline - bsStrategy;
  }
  return totalAdv / trades.length;
}

// ── Main entry point ───────────────────────────────────────────────────────

export function runBacktest(series: PricePoint[], config: StrategyConfig): {
  trades: Trade[];
  metrics: BacktestMetrics;
} {
  if (series.length < 20) {
    return { trades: [], metrics: buildMetrics([], series) };
  }

  let trades: Trade[];
  switch (config.type) {
    case "meanReversion":
      trades = runMeanReversion(series, config.params);
      break;
    case "panicFade":
      trades = runPanicFade(series, config.params);
      break;
    case "rsiReversion":
      trades = runRsiReversion(series, config.params);
      break;
  }

  return { trades, metrics: buildMetrics(trades, series) };
}

// ── Synthetic price series generator ─────────────────────────────────────
/**
 * Generates a realistic Brownian Bridge price series for a prediction market.
 * Starts at `startProb`, ends at `endProb` (resolution), with configurable
 * volatility. Clamped to (0.01, 0.99).
 *
 * Used as fallback when live price history is unavailable.
 */
export function generateSyntheticSeries(
  steps: number,
  startProb: number,
  endProb: number,
  volatility = 0.025,
  seed = 42,
): PricePoint[] {
  // LCG PRNG (deterministic)
  let state = seed;
  function rand(): number {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  }
  function randn(): number {
    const u = Math.max(rand(), 1e-10);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  const now = Math.floor(Date.now() / 1000);
  const series: PricePoint[] = [];
  let p = startProb;

  for (let i = 0; i < steps; i++) {
    series.push({ t: now - (steps - i) * 3600, p: Math.max(0.01, Math.min(0.99, p)) });
    // Brownian bridge drift: pull toward endProb proportional to remaining steps
    const remaining = steps - i;
    const drift = (endProb - p) / remaining;
    p += drift + volatility * randn();
    p = Math.max(0.01, Math.min(0.99, p));
  }
  series.push({ t: now, p: endProb });
  return series;
}

// ── Polymarket CLOB history fetcher ──────────────────────────────────────

interface ClobHistoryEntry { t: number; p: number }
interface ClobHistoryResponse { history: ClobHistoryEntry[] }

/**
 * Fetches hourly price history from Polymarket CLOB API.
 * `tokenId` = the YES outcome CLOB token id (first element of clobTokenIds).
 * Returns null on error.
 */
export async function fetchPolymarketHistory(tokenId: string): Promise<PricePoint[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`/api/polymarket/clob-history?tokenId=${encodeURIComponent(tokenId)}`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json() as ClobHistoryResponse;
    if (!Array.isArray(data.history) || data.history.length === 0) return null;
    return data.history.map((e) => ({ t: e.t, p: Math.max(0.01, Math.min(0.99, e.p)) }));
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Exit reason labels ─────────────────────────────────────────────────────

export const EXIT_REASON_LABEL: Record<ExitReason, string> = {
  takeProfit: "Take Profit",
  stopLoss: "Stop Loss",
  rebound: "Rebound",
  rsiExit: "RSI Exit",
  timeout: "Timeout",
  endOfData: "Fim dos dados",
};
