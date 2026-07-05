/**
 * useMarketData — hooks for consuming the /api/* endpoints
 *
 * Each hook:
 * - Fetches on mount
 * - Stores loading / error / data state
 * - Accepts an optional refresh interval (ms)
 */

import { useState, useEffect, useCallback } from "react";

// ─── Shared types ──────────────────────────────────────────────────────────

export interface NormalisedQuote {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  dividendYield: number;
  pe: number | null;
  pvp: number | null;
  currency: string;
  source: "brapi" | "yahoo" | "fallback";
}

export interface RatesData {
  selic: number | null;
  cdi: number | null;
  ipca: number | null;
  usdBrl: number | null;
  eurBrl: number | null;
  updatedAt: string;
}

export interface TickerTapeItem {
  symbol: string;
  value: string;
  change: string;
}

export interface IndexQuote {
  ticker: string;
  name: string;
  value: number;
  change: number;
  changePercent: number;
}

// ─── Generic fetch hook ───────────────────────────────────────────────────

function useFetch<T>(url: string, refreshMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as T;
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void load();
    if (!refreshMs) return;
    const id = setInterval(() => { void load(); }, refreshMs);
    return () => clearInterval(id);
  }, [load, refreshMs]);

  return { data, loading, error, refetch: load };
}

// ─── Public hooks ─────────────────────────────────────────────────────────

/** BCB rates: Selic, CDI, IPCA, USD/BRL, EUR/BRL */
export function useRates() {
  return useFetch<RatesData>("/api/rates");
}

/** Brazilian stocks from BRAPI */
export function useBrQuotes(tickers: string[]) {
  const url = `/api/quotes/br?tickers=${tickers.join(",")}`;
  return useFetch<{ quotes: NormalisedQuote[]; updatedAt: string }>(url, 60_000);
}

/** US stocks & ETFs from Yahoo Finance */
export function useUsQuotes(tickers: string[]) {
  const url = `/api/quotes/us?tickers=${tickers.join(",")}`;
  return useFetch<{ quotes: NormalisedQuote[]; updatedAt: string }>(url, 60_000);
}

/** Main indices (Ibov, S&P 500, Nasdaq, Dow) */
export function useIndices() {
  return useFetch<{ quotes: IndexQuote[]; updatedAt: string }>("/api/quotes/indices", 60_000);
}

/** Ticker tape (combined items) — refreshes every 60s */
export function useTickerTape() {
  return useFetch<{ items: TickerTapeItem[]; updatedAt: string }>("/api/ticker-tape", 60_000);
}
