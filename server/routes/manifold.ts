import { Router } from "express";
import { getCache, setCache } from "../lib/cache.ts";
import { fetchJSON } from "../lib/fetcher.ts";
import { log } from "../lib/log.ts";

const router = Router();

interface ManifoldMarket {
  id: string;
  question: string;
  probability?: number;
  volume: number;
  url: string;
  closeTime?: number;
  outcomeType: string;
  creatorName?: string;
  lastUpdatedTime?: number;
  createdTime?: number;
  groupSlugs?: string[];
}

router.get("/markets", async (req, res) => {
  const cacheKey = "manifold:markets";
  const cached = getCache<ManifoldMarket[]>(cacheKey);
  if (cached) { res.json({ markets: cached, source: "cache" }); return; }

  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? "60"), 10), 100);
    // ⚠️ `/v0/markets` deixou de aceitar `sort` e `filter` — passou a responder
    // HTTP 400 ("Error validating request"), e a integração morria EM SILÊNCIO: a
    // rota devolvia 502, o cliente engolia no catch e mostrava lista vazia. As 30
    // vagas reservadas para a Manifold ficavam sem preencher e ninguém percebia.
    // Os dois parâmetros migraram para `/v0/search-markets` (testado em 02/09:
    // `/v0/markets` simples = 200; com sort = 400; search-markets = 200).
    const data = await fetchJSON<ManifoldMarket[]>(
      `https://api.manifold.markets/v0/search-markets?term=&limit=${limit}&sort=score&filter=open`
    );
    const markets = data
      .filter((m) => m.outcomeType === "BINARY" && typeof m.probability === "number")
      .slice(0, limit);
    setCache(cacheKey, markets, 120);
    res.json({ markets, source: "live" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error("[Manifold] error:", msg);
    res.status(502).json({ error: "manifold_unavailable", message: msg });
  }
});

export default router;
