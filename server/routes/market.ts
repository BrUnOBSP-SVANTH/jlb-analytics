import { Router } from "express";
import { fetchBcbSerie } from "../lib/bcb.ts";
import { fetchBrapiQuotes } from "../lib/brapi.ts";
import { fetchYahooQuotes, fetchYahooHistory } from "../lib/yahoo.ts";
import { getCache, setCache } from "../lib/cache.ts";
import type { NormalisedQuote } from "../lib/types.ts";
import { log } from "../lib/log.ts";

const router = Router();

router.get("/rates", async (_req, res) => {
  const cacheKey = "bcb:all";
  const cached = getCache<object>(cacheKey);
  if (cached) return res.json(cached);
  const [selic, cdi, ipca, usdBrl, eurBrl] = await Promise.all([
    fetchBcbSerie(432), fetchBcbSerie(4389), fetchBcbSerie(13522), fetchBcbSerie(1), fetchBcbSerie(21619),
  ]);
  const data = { selic, cdi, ipca, usdBrl, eurBrl, updatedAt: new Date().toISOString() };
  setCache(cacheKey, data, 3600);
  res.json(data);
});

router.get("/quotes/br", async (req, res) => {
  const tickers = ((req.query.tickers as string) ?? "PETR4,VALE3,ITUB4,BBAS3,WEGE3")
    .split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  const raw = await fetchBrapiQuotes(tickers);
  const quotes: NormalisedQuote[] = raw.map((q) => ({
    ticker: q.symbol, name: q.shortName, price: q.regularMarketPrice,
    change: q.regularMarketChange, changePercent: q.regularMarketChangePercent,
    dividendYield: q.dividendsYield ?? 0, pe: q.priceEarnings ?? null, pvp: null,
    currency: "BRL", source: "brapi",
  }));
  res.json({ quotes, updatedAt: new Date().toISOString() });
});

router.get("/quotes/us", async (req, res) => {
  const tickers = ((req.query.tickers as string) ?? "AAPL,MSFT,NVDA,TSLA,AMZN,VOO,SPY,QQQ")
    .split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  const raw = await fetchYahooQuotes(tickers);
  const quotes: NormalisedQuote[] = raw.map((q) => ({
    ticker: q.symbol, name: q.shortName ?? q.longName ?? q.symbol,
    price: q.regularMarketPrice ?? 0, change: q.regularMarketChange ?? 0,
    changePercent: q.regularMarketChangePercent ?? 0,
    dividendYield: (q.dividendYield ?? 0) * 100, pe: q.trailingPE ?? null,
    pvp: q.priceToBook ?? null, currency: "USD", source: "yahoo",
  }));
  res.json({ quotes, updatedAt: new Date().toISOString() });
});

router.get("/quotes/indices", async (_req, res) => {
  const tickers = ["^BVSP", "^GSPC", "^IXIC", "^DJI"];
  const raw = await fetchYahooQuotes(tickers);
  const nameMap: Record<string, string> = {
    "^BVSP": "Ibovespa", "^GSPC": "S&P 500", "^IXIC": "Nasdaq", "^DJI": "Dow Jones",
  };
  const quotes = raw.map((q) => ({
    ticker: q.symbol, name: nameMap[q.symbol] ?? q.symbol,
    value: q.regularMarketPrice ?? 0, change: q.regularMarketChange ?? 0,
    changePercent: q.regularMarketChangePercent ?? 0,
  }));
  res.json({ quotes, updatedAt: new Date().toISOString() });
});

router.get("/quotes/ticker/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const isBR = /\d$/.test(symbol);
  if (isBR) {
    const results = await fetchBrapiQuotes([symbol]);
    const q = results[0];
    if (!q) return res.status(404).json({ error: "Ticker not found" });
    res.json({ ticker: q.symbol, name: q.shortName, price: q.regularMarketPrice, change: q.regularMarketChange, changePercent: q.regularMarketChangePercent, currency: "BRL", source: "brapi" });
  } else {
    const results = await fetchYahooQuotes([symbol]);
    const q = results[0];
    if (!q) return res.status(404).json({ error: "Ticker not found" });
    res.json({ ticker: q.symbol, name: q.shortName ?? q.longName ?? symbol, price: q.regularMarketPrice ?? 0, change: q.regularMarketChange ?? 0, changePercent: q.regularMarketChangePercent ?? 0, currency: "USD", source: "yahoo" });
  }
});

router.get("/quotes/history/:symbol", async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const months = Math.min(24, Math.max(3, parseInt(String(req.query.months ?? "12"), 10)));
  const cacheKey = `history:${symbol}:${months}`;
  const cached = getCache<object>(cacheKey);
  if (cached) return res.json(cached);
  try {
    const points = await fetchYahooHistory(symbol, months);
    const result = { ticker: symbol, points, updatedAt: new Date().toISOString() };
    if (points.length > 0) setCache(cacheKey, result, 3600);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    res.status(502).json({ error: "history_unavailable", message: msg });
  }
});

router.get("/ticker-tape", async (_req, res) => {
  try {
    const cacheKey = "ticker-tape";
    const cached = getCache<object>(cacheKey);
    if (cached) return res.json(cached);
    const [brRaw, usRaw, ratesRaw] = await Promise.allSettled([
      fetchBrapiQuotes(["PETR4", "VALE3", "ITUB4"]),
      fetchYahooQuotes(["AAPL", "MSFT", "NVDA", "^BVSP", "^GSPC", "^IXIC"]),
      Promise.all([fetchBcbSerie(1), fetchBcbSerie(21619)]),
    ]);
    const items: { symbol: string; value: string; change: string }[] = [];
    if (brRaw.status === "fulfilled") {
      for (const q of brRaw.value) {
        try {
          items.push({
            symbol: q.symbol,
            value: `R$ ${(q.regularMarketPrice ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            change: `${(q.regularMarketChangePercent ?? 0) >= 0 ? "+" : ""}${(q.regularMarketChangePercent ?? 0).toFixed(2)}%`,
          });
        } catch { /* skip bad quote */ }
      }
    }
    if (usRaw.status === "fulfilled") {
      const nameMap: Record<string, string> = { "^BVSP": "IBOV", "^GSPC": "S&P 500", "^IXIC": "NASDAQ" };
      for (const q of usRaw.value) {
        try {
          const sym = nameMap[q.symbol] ?? q.symbol;
          const isIndex = q.symbol.startsWith("^");
          const price = q.regularMarketPrice ?? 0;
          const pct = q.regularMarketChangePercent ?? 0;
          items.push({ symbol: sym, value: isIndex ? price.toLocaleString("en-US") : `$${price.toFixed(2)}`, change: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` });
        } catch { /* skip bad quote */ }
      }
    }
    if (ratesRaw.status === "fulfilled") {
      const [usd, eur] = ratesRaw.value;
      if (usd) items.push({ symbol: "USD/BRL", value: `R$ ${usd.toFixed(2)}`, change: "" });
      if (eur) items.push({ symbol: "EUR/BRL", value: `R$ ${eur.toFixed(2)}`, change: "" });
    }
    const result = { items, updatedAt: new Date().toISOString() };
    if (items.length > 0) setCache(cacheKey, result, 60);
    res.json(result);
  } catch (err) {
    log.error("[ticker-tape] route error:", err);
    res.json({ items: [], updatedAt: new Date().toISOString() });
  }
});

export default router;
