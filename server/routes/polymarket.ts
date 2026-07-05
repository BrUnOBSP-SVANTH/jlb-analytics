import { Router } from "express";
import { swr, getCache, setCache } from "../lib/cache.ts";
import { fetchWithRetry, fetchJSON } from "../lib/fetcher.ts";
import type { PolyEvent, PolyMarket } from "../lib/types.ts";

const router = Router();

router.get("/markets", async (req, res) => {
  const closed = req.query.closed === "true";
  const cacheKey = `polymarket:markets:${closed ? "closed" : "active"}`;
  try {
    // SWR: cache fresco na hora; se venceu, devolve o velho e atualiza em bg.
    const markets = await swr<PolyMarket[]>(cacheKey, closed ? 600 : 90, async () => {
    const toNum = (v: unknown) => (v === undefined || v === null) ? undefined : parseFloat(String(v)) || undefined;

    const eventsUrl = (order: string, limit: number, extra = "") => {
      const base = closed
        ? `https://gamma-api.polymarket.com/events?active=false&closed=true`
        : `https://gamma-api.polymarket.com/events?active=true&closed=false`;
      return `${base}&limit=${limit}&order=${order}&ascending=false&with_nested_markets=true${extra}`;
    };

    // Fetch three pools in parallel: top by total volume, top by 24h volume, featured
    const [byVolume, by24h, featured] = await Promise.allSettled([
      fetchWithRetry<PolyEvent[]>(eventsUrl("volume", 80)),
      fetchWithRetry<PolyEvent[]>(eventsUrl("volume_24hr", 60)),
      closed ? Promise.resolve([] as PolyEvent[]) : fetchWithRetry<PolyEvent[]>(eventsUrl("volume", 40, "&featured=true")),
    ]);

    const allEvents: PolyEvent[] = [
      ...(byVolume.status === "fulfilled" ? byVolume.value : []),
      ...(by24h.status === "fulfilled" ? by24h.value : []),
      ...(featured.status === "fulfilled" ? featured.value : []),
    ];

    // Deduplicate events by slug
    const seenEventSlug = new Set<string>();
    const uniqueEvents = allEvents.filter((ev) => {
      if (seenEventSlug.has(ev.slug)) return false;
      seenEventSlug.add(ev.slug);
      return true;
    });

    const now = Date.now();
    // Keep only markets closing in the future (or no endDate = long-running)
    // and not older than 180 days since creation (avoids stale resolved markets)
    const MAX_AGE_DAYS = 180;
    const maxAgeMs = MAX_AGE_DAYS * 86_400_000;

    const isDateFresh = (endDate?: string): boolean => {
      if (!endDate) return true;
      const end = new Date(endDate).getTime();
      if (isNaN(end)) return true;
      if (end < now) return false;
      return true;
    };

    // Regex to detect Polymarket's internal placeholder names (e.g. "Team AM", "Person P")
    const GENERIC_PLACEHOLDER = /\b(Team|Person|Candidate|Player|Country|Party)\s+[A-Z]{1,3}\b/;

    // Build flat market list: 1 market per event (highest-volume nested market)
    const rawMarkets: (PolyMarket & { _vol24h: number; _endMs: number })[] = uniqueEvents.flatMap((ev) => {
      const nested = (ev.markets ?? [])
        .filter((m) => isDateFresh(m.endDate))
        // Skip markets that only have generic placeholder names — real names not yet published
        .filter((m) => !GENERIC_PLACEHOLDER.test(m.question ?? ""))
        .map((m) => {
          const endMs = m.endDate ? new Date(m.endDate).getTime() : now + maxAgeMs;
          return {
            id: m.id,
            // Prefer the market question; use event title as fallback for clarity
            question: m.question,
            eventTitle: ev.title,
            slug: m.slug,
            eventSlug: ev.slug,
            volume: toNum(m.volume) ?? toNum(ev.volume) ?? 0,
            volume24hr: toNum(m.volume24hr) ?? toNum(ev.volume24hr) ?? 0,
            liquidity: toNum(m.liquidity) ?? toNum(ev.liquidity),
            weekPriceChange: m.oneWeekPriceChange,
            featured: ev.featured ?? false,
            category: ev.category ?? ev.tags?.[0]?.label,
            endDate: m.endDate,
            outcomePrices: m.outcomePrices,
            outcomes: m.outcomes,
            clobTokenIds: m.clobTokenIds,
            _vol24h: toNum(m.volume24hr) ?? toNum(ev.volume24hr) ?? 0,
            _endMs: endMs,
          };
        })
        .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));

      // 1 market per event; for multi-outcome events take the top market only
      return nested.slice(0, 1);
    })
    // Additional pass: drop markets with endDate > 365 days out AND zero 24h activity
    .filter((m) => {
      const daysUntilEnd = (m._endMs - now) / 86_400_000;
      if (daysUntilEnd > 365 && (m._vol24h ?? 0) === 0) return false;
      return true;
    });

    // Enforce category diversity: max 12 markets per category
    const MAX_PER_CAT = 12;
    const catCount = new Map<string, number>();
    const diverse = rawMarkets.filter((m) => {
      const cat = (m.category ?? "other").toLowerCase();
      const n = catCount.get(cat) ?? 0;
      if (n >= MAX_PER_CAT) return false;
      catCount.set(cat, n + 1);
      return true;
    });

    // Sort final list: mix of relevance signals
    // Score = 55% 24h momentum + 25% total volume + 10% featured + 10% closing soon
    const maxVol24h = Math.max(...diverse.map((m) => m._vol24h ?? 0), 1);
    const maxVol = Math.max(...diverse.map((m) => m.volume ?? 0), 1);
    const sorted = diverse
      .map((m) => {
        // closing soon bonus: markets ending in <30 days get up to +0.10
        const daysLeft = (m._endMs - now) / 86_400_000;
        const urgency = daysLeft <= 0 ? 0 : daysLeft < 30 ? (1 - daysLeft / 30) * 0.10 : 0;
        return {
          ...m,
          _score:
            0.55 * ((m._vol24h ?? 0) / maxVol24h) +
            0.25 * ((m.volume ?? 0) / maxVol) +
            0.10 * (m.featured ? 1 : 0) +
            urgency,
        };
      })
      .sort((a, b) => b._score - a._score)
      .map(({ _vol24h, _endMs, _score, ...rest }) => rest);

    return sorted;
    });
    res.json({ markets, source: "live" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[Polymarket] error:", msg);
    res.status(502).json({ error: "polymarket_unavailable", message: msg });
  }
});

interface ClobEntry { t: number; p: number }
interface ClobResponse { history: ClobEntry[] }

router.get("/clob-history", async (req, res) => {
  const tokenId = String(req.query.tokenId ?? "").replace(/[^a-zA-Z0-9]/g, "");
  if (!tokenId) return res.status(400).json({ error: "tokenId required" });

  const cacheKey = `clob:${tokenId}`;
  const cached = getCache<ClobEntry[]>(cacheKey);
  if (cached) { res.json({ history: cached, source: "cache" }); return; }

  try {
    const url = `https://clob.polymarket.com/prices-history?market=${tokenId}&interval=all&fidelity=60`;
    const data = await fetchJSON<ClobResponse>(url);
    if (!Array.isArray(data.history)) throw new Error("Invalid CLOB response");
    setCache(cacheKey, data.history, 300);
    res.json({ history: data.history, source: "live" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error(`[CLOB/${tokenId}] error:`, msg);
    res.status(502).json({ error: "clob_unavailable", message: msg });
  }
});

export default router;
