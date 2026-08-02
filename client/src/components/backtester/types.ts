/**
 * Tipos e labels compartilhados do Backtester. Extraido de pages/Backtester.tsx.
 */
export interface PolyMarketResolved {
  id: string;
  question: string;
  slug: string;
  clobTokenIds?: string;
  outcomePrices?: string;
  volume?: number;
  closed?: boolean;
  resolutionTime?: string;
  source?: "polymarket" | "kalshi";
}

export type StrategyType = "meanReversion" | "panicFade" | "rsiReversion";

export const STRATEGY_LABELS: Record<StrategyType, string> = {
  meanReversion: "Mean Reversion",
  panicFade: "Panic Fade",
  rsiReversion: "RSI Reversion",
};
