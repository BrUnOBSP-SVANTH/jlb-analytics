import { Router } from "express";
import { swr } from "../lib/cache.ts";
import { fetchWithRetry } from "../lib/fetcher.ts";
import type { KalshiEventsResponse, KalshiMarket } from "../lib/types.ts";
import { log } from "../lib/log.ts";

const router = Router();

router.get("/markets", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "40"), 10), 100);
  try {
    // SWR: serve cache fresco na hora; se venceu, devolve o velho e atualiza em bg.
    const markets = await swr<KalshiMarket[]>("kalshi:markets", 120, async () => {
      const url = `https://api.elections.kalshi.com/trade-api/v2/events?limit=${limit}&with_nested_markets=true`;
      const data = await fetchWithRetry<KalshiEventsResponse>(url, { "Accept": "application/json" });
      const events = data.events ?? [];
      return events.flatMap((ev) =>
        (ev.markets ?? [])
          // Fidelidade ao mercado: só o que está realmente aberto. Kalshi marca o status
          // como "closed"/"settled"/"finalized"/"determined" quando o mercado encerra/resolve.
          .filter((m) => !m.status || m.status === "active")
          .map((m) => {
          const bid = parseFloat(m.yes_bid_dollars ?? "0") * 100;
          const ask = parseFloat(m.yes_ask_dollars ?? "0") * 100;
          const last = parseFloat(m.last_price_dollars ?? "0") * 100;
          const rawProb = bid > 0 && ask > 0 ? (bid + ask) / 2 : last || 50;
          const yesProb = parseFloat(rawProb.toFixed(1));
          return {
            ticker: m.ticker,
            eventTicker: ev.event_ticker,
            seriesTicker: ev.series_ticker ?? ev.event_ticker,
            title: m.title ?? ev.title ?? m.ticker,
            yesProb: Math.max(0.1, Math.min(99.9, yesProb)),
            prevYesProb: m.previous_price_dollars
              ? parseFloat((parseFloat(m.previous_price_dollars) * 100).toFixed(1))
              : undefined,
            volume: Math.round(parseFloat(m.volume_fp ?? "0")),
            volume24h: Math.round(parseFloat(m.volume_24h_fp ?? "0")),
            openInterest: Math.round(parseFloat(m.open_interest_fp ?? "0")),
            liquidity: parseFloat(m.liquidity_dollars ?? "0"),
            closeTime: m.close_time,
            category: ev.category,
            status: m.status,
          };
        })
      ).slice(0, limit);
    });
    res.json({ markets, source: "live" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error("[Kalshi] error:", msg);
    res.status(502).json({ error: "kalshi_unavailable", message: msg });
  }
});

export default router;
