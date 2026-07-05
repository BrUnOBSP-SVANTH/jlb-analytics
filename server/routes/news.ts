import { Router } from "express";
import { getCache, setCache } from "../lib/cache.ts";
import { fetchJSON } from "../lib/fetcher.ts";
import type { NewsArticle, NewsApiResponse } from "../lib/types.ts";
import { log } from "../lib/log.ts";

const router = Router();

// ── Translation helpers ───────────────────────────────────────────────────────

function isTranslationError(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("mymemory warning") || t.includes("quota") ||
    t.includes("you used all") || t.includes("invalid language pair") ||
    t.includes("must be shorter than") || t.startsWith("http");
}

async function tryGoogleTranslate(text: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt-BR&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const data = await r.json() as Array<unknown>;
    const chunks = (data[0] as Array<[string]> | null) ?? [];
    const result = chunks.map((c) => c[0] ?? "").join("").trim();
    return result && !isTranslationError(result) ? result : null;
  } catch { return null; }
}

async function tryMyMemory(text: string): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|pt-BR`;
    interface MyMemoryResponse { responseData: { translatedText: string }; responseStatus: number }
    const data = await fetchJSON<MyMemoryResponse>(url);
    if (data.responseStatus !== 200) return null;
    const result = data.responseData?.translatedText?.trim() ?? "";
    return result && !isTranslationError(result) ? result : null;
  } catch { return null; }
}

// ── Translate endpoint (Google Translate → MyMemory fallback) ─────────────────

router.get("/translate", async (req, res) => {
  const text = String(req.query.text ?? "").trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: "text required" });

  const cacheKey = `translate:${text}`;
  const cached = getCache<string>(cacheKey);
  if (cached) { res.json({ translation: cached }); return; }

  const translation =
    await tryGoogleTranslate(text) ??
    await tryMyMemory(text);

  if (translation) {
    setCache(cacheKey, translation, 86400);
    res.json({ translation });
  } else {
    // Return original text — never cache a failure
    res.json({ translation: text });
  }
});

// ── NewsAPI ──────────────────────────────────────────────────────────────────

router.get("/news", async (req, res) => {
  const NEWS_API_KEY = process.env.NEWS_API_KEY ?? "";
  if (!NEWS_API_KEY) {
    res.status(503).json({ error: "news_key_missing", message: "Defina NEWS_API_KEY no .env para usar este endpoint." });
    return;
  }

  const q = String(req.query.q ?? "prediction markets OR polymarket OR mercados preditivos");
  const pageSize = Math.min(parseInt(String(req.query.pageSize ?? "20"), 10), 50);
  const cacheKey = `news:${q}:${pageSize}`;
  const cached = getCache<NewsArticle[]>(cacheKey);
  if (cached) { res.json({ articles: cached, source: "cache" }); return; }

  try {
    const from7days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&pageSize=${pageSize}&sortBy=publishedAt&from=${from7days}&language=en&apiKey=${NEWS_API_KEY}`;
    const data = await fetchJSON<NewsApiResponse>(url);
    if (data.status !== "ok") throw new Error(`NewsAPI status: ${data.status}`);
    const articles = data.articles.filter((a) => a.title !== "[Removed]");
    setCache(cacheKey, articles, 900);
    res.json({ articles, source: "live" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error("[News] error:", msg);
    res.status(502).json({ error: "news_unavailable", message: msg });
  }
});

// ── Articles via Google News RSS + NewsAPI ────────────────────────────────────

interface Article {
  title: string; url: string; source: string;
  publishedAt: string; description: string; imageUrl?: string; lang: "pt" | "en";
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    .trim();
}

function extractImageUrl(html: string): string | undefined {
  return html.match(/<img[^>]+src="([^"]+)"/i)?.[1];
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseGoogleNewsRSS(xml: string, lang: "pt" | "en"): Article[] {
  const articles: Article[] = [];
  for (const itemMatch of Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g))) {
    const item = itemMatch[1] ?? "";
    const rawTitle =
      item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1] ??
      item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const title = decodeHtmlEntities(rawTitle).replace(/ - [^-–]{1,60}$/, "").trim();
    if (!title || title === "Google News") continue;
    const googleLink = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
    const descBlock =
      item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1] ??
      item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "";
    const actualUrl = decodeHtmlEntities(descBlock.match(/<a\s+href="([^"]+)"/i)?.[1] ?? "") || googleLink;
    const description = stripHtml(decodeHtmlEntities(descBlock)).replace(/\s{2,}/g, " ").slice(0, 220).trim();
    const sourceRaw = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1] ?? rawTitle.match(/ - ([^-–]+)$/)?.[1] ?? "";
    const source = decodeHtmlEntities(sourceRaw).trim();
    const pubDateRaw = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    let publishedAt: string;
    try { publishedAt = pubDateRaw ? new Date(pubDateRaw).toISOString() : new Date().toISOString(); }
    catch { publishedAt = new Date().toISOString(); }
    const imageUrl = extractImageUrl(descBlock);
    if (actualUrl && !actualUrl.includes("google.com/rss")) {
      articles.push({ title, url: actualUrl, source, publishedAt, description, imageUrl, lang });
    } else if (googleLink) {
      articles.push({ title, url: googleLink, source, publishedAt, description, imageUrl, lang });
    }
  }
  return articles;
}

router.get("/articles", async (req, res) => {
  const lang = String(req.query.lang ?? "pt") as "pt" | "en";
  const rawQ = String(req.query.q ?? (lang === "pt"
    ? "polymarket OR mercados preditivos OR apostas esportivas"
    : "polymarket OR prediction markets OR kalshi"));
  const pageSize = Math.min(parseInt(String(req.query.pageSize ?? "20"), 10), 40);

  const cacheKey = `articles:${lang}:${rawQ}:${pageSize}`;
  const cached = getCache<Article[]>(cacheKey);
  if (cached) { res.json({ articles: cached, source: "cache" }); return; }

  const articles: Article[] = [];
  const errors: string[] = [];

  // 1. Google News RSS (no key required)
  try {
    const gnQ = encodeURIComponent(rawQ);
    const gnUrl = lang === "pt"
      ? `https://news.google.com/rss/search?q=${gnQ}&hl=pt-BR&gl=BR&ceid=BR:pt-419`
      : `https://news.google.com/rss/search?q=${gnQ}&hl=en-US&gl=US&ceid=US:en`;
    const gnRes = await fetch(gnUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JLBBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (gnRes.ok) {
      const xml = await gnRes.text();
      articles.push(...parseGoogleNewsRSS(xml, lang).slice(0, pageSize));
    } else {
      errors.push(`Google News RSS HTTP ${gnRes.status}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    errors.push(`Google News RSS: ${msg}`);
  }

  // 2. NewsAPI (supplemental, English, requires key)
  const NEWS_API_KEY = process.env.NEWS_API_KEY ?? "";
  if (NEWS_API_KEY && articles.length < pageSize) {
    try {
      const from7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const naUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(rawQ)}&pageSize=${pageSize}&sortBy=publishedAt&from=${from7}&language=en&apiKey=${NEWS_API_KEY}`;
      const naData = await fetchJSON<NewsApiResponse>(naUrl);
      if (naData.status === "ok") {
        const naArticles: Article[] = naData.articles
          .filter((a) => a.title !== "[Removed]")
          .map((a) => ({ title: a.title, url: a.url, source: a.source.name, publishedAt: a.publishedAt, description: a.description ?? "", imageUrl: a.urlToImage ?? undefined, lang: "en" }));
        const existingDomains = new Set(articles.map((a) => { try { return new URL(a.url).hostname; } catch { return ""; } }));
        const fresh = naArticles.filter((a) => { try { return !existingDomains.has(new URL(a.url).hostname); } catch { return true; } });
        articles.push(...fresh.slice(0, pageSize - articles.length));
      }
    } catch (err) {
      errors.push(`NewsAPI: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  const seen = new Set<string>();
  const deduped = articles
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .filter((a) => { const key = a.title.slice(0, 40).toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, pageSize);

  if (deduped.length === 0) { res.status(502).json({ error: "articles_unavailable", errors }); return; }

  setCache(cacheKey, deduped, 1800);
  res.json({ articles: deduped, source: "live", count: deduped.length });
});

export default router;
