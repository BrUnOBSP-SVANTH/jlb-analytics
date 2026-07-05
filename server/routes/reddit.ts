import { Router } from "express";
import { getCache, setCache } from "../lib/cache.ts";
import { fetchJSON } from "../lib/fetcher.ts";
import { log } from "../lib/log.ts";

interface RedditChild {
  data: {
    title: string; url: string; permalink: string; subreddit: string;
    score: number; created_utc: number; author: string; selftext?: string;
    num_comments: number;
  }
}
interface RedditFeed { data: { children: RedditChild[] } }

const router = Router();

router.get("/:subreddit", async (req, res) => {
  const sub = req.params.subreddit.replace(/[^a-zA-Z0-9_]/g, "");
  if (!sub) return res.status(400).json({ error: "invalid subreddit" });

  const cacheKey = `reddit:${sub}`;
  const cached = getCache<RedditChild["data"][]>(cacheKey);
  if (cached) { res.json({ posts: cached, source: "cache" }); return; }

  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "25"), 10), 50);
    const url = `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}`;
    const data = await fetchJSON<RedditFeed>(url, {
      "User-Agent": "JLBAnalytics/1.0 (educational platform)",
      "Accept": "application/json",
    });
    const posts = data.data.children.map((c) => c.data);
    setCache(cacheKey, posts, 300);
    res.json({ posts, source: "live" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error(`[Reddit/${sub}] error:`, msg);
    res.status(502).json({ error: "reddit_unavailable", message: msg });
  }
});

export default router;
