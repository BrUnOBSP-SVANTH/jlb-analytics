import type { Request, Response } from "express";
import { fetchJSON } from "../fetcher.ts";
import { fetchBcbSerie } from "../bcb.ts";
import { parsePolyPrices } from "../aiForecasts.ts";
import { callClaude } from "../anthropic.ts";
import { extractJson } from "../extractJson.ts";
import { INJECTION_GUARD } from "./promptSafety.ts";
import { getCache, setCache } from "../cache.ts";
import { log } from "../log.ts";
import type { NewsApiResponse, PolyEvent, KalshiEventsResponse } from "../types.ts";

export async function dailyBriefingHandler(req: Request, res: Response) {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY não configurada." });

  const today = new Date().toISOString().slice(0, 10);
  const force = req.query.force === "1";
  const cacheKey = `daily-briefing:${today}`;
  if (!force) {
    const cached = getCache<object>(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });
  }

  const [polyResult, kalshiResult, ratesResult] = await Promise.allSettled([
    fetchJSON<PolyEvent[]>("https://gamma-api.polymarket.com/events?active=true&closed=false&limit=15&order=volume&ascending=false&with_nested_markets=true"),
    fetchJSON<KalshiEventsResponse>("https://api.elections.kalshi.com/trade-api/v2/events?limit=15&with_nested_markets=true", { "Accept": "application/json" }),
    Promise.all([fetchBcbSerie(432), fetchBcbSerie(13522), fetchBcbSerie(1)]),
  ]);

  const topMarkets: { source: string; title: string; prob: number }[] = [];

  if (polyResult.status === "fulfilled") {
    for (const ev of polyResult.value.slice(0, 8)) {
      const m = ev.markets?.[0];
      if (!m) continue;
      const prices = parsePolyPrices(m.outcomePrices);
      const yesProb = prices[0] !== undefined ? Math.round(prices[0] * 100) : null;
      if (m.question && yesProb !== null) topMarkets.push({ source: "Polymarket", title: m.question, prob: yesProb });
    }
  }
  if (kalshiResult.status === "fulfilled") {
    for (const ev of (kalshiResult.value.events ?? []).slice(0, 8)) {
      const m = ev.markets?.[0];
      if (!m) continue;
      const bid = parseFloat(m.yes_bid_dollars ?? "0") * 100;
      const ask = parseFloat(m.yes_ask_dollars ?? "0") * 100;
      const yesProb = bid > 0 && ask > 0 ? Math.round((bid + ask) / 2) : null;
      if ((m.title ?? ev.title) && yesProb !== null) topMarkets.push({ source: "Kalshi", title: m.title ?? ev.title ?? m.ticker, prob: yesProb });
    }
  }

  const [selic, ipca, usd] = ratesResult.status === "fulfilled" ? ratesResult.value : [null, null, null];

  const NEWS_KEY = process.env.NEWS_API_KEY ?? "";
  let newsHeadlines: string[] = [];
  if (NEWS_KEY) {
    try {
      const from2 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const data = await fetchJSON<NewsApiResponse>(`https://newsapi.org/v2/everything?q=markets+economy+prediction&pageSize=6&sortBy=publishedAt&from=${from2}&language=en&apiKey=${NEWS_KEY}`);
      newsHeadlines = (data.articles ?? []).filter((a) => a.title !== "[Removed]").slice(0, 5).map((a) => `• ${a.title} (${a.source.name})`);
    } catch { /* skip */ }
  }

  const marketsContext = topMarkets.length > 0
    ? topMarkets.map((m) => `- [${m.source}] ${m.title}: ${m.prob}% SIM`).join("\n")
    : "Dados de mercados temporariamente indisponíveis.";

  const prompt = `Você é um analista quantitativo sênior gerando um briefing matinal para traders brasileiros.

DATA: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
MACRO: Selic ${selic ?? "~10.5"}% | IPCA ${ipca ?? "~4.8"}% | USD/BRL ${usd ?? "~5.85"}

TOP MERCADOS:
${marketsContext}

MANCHETES:
${newsHeadlines.length > 0 ? newsHeadlines.join("\n") : "Sem manchetes disponíveis."}

${INJECTION_GUARD}

JSON exato (sem markdown). Em marketHighlights, "prob" é a probabilidade SIM do mercado em número 0-100 (nunca texto):
{"headline":"","summary":"","topTheme":"","macroNote":"","marketHighlights":[{"market":"","prob":0,"insight":""}],"watchToday":"","calibrationTip":"","riskAlert":null}`;

  try {
    const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 1000, messages: [{ role: "user", content: prompt }], timeoutMs: 25_000, prefillJson: false });
    const parsed = extractJson(raw) as { marketHighlights?: { market?: string; prob?: unknown; insight?: string }[] };
    // O modelo às vezes preenche "prob" com um rótulo de texto — normaliza para número 0-100 ou null
    const marketHighlights = (Array.isArray(parsed.marketHighlights) ? parsed.marketHighlights : [])
      .filter((h) => h?.market && h?.insight)
      .map((h) => {
        const n = Number(h.prob);
        return { ...h, prob: Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null };
      });
    const result = { ...parsed, marketHighlights, topMarkets, generatedAt: new Date().toISOString(), cached: false };
    setCache(cacheKey, result, 86400);
    res.json(result);
  } catch (err) {
    log.error("[daily-briefing] error:", err);
    res.status(500).json({ error: "briefing_failed", message: err instanceof Error ? err.message : "unknown" });
  }
}
