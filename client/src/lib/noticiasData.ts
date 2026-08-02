/**
 * Camada de dados da pagina Noticias — fetchers de Polymarket/Kalshi/Reddit + a
 * lista de subreddits. Extraido de pages/Noticias.tsx.
 */
import { getMarkets } from "@/lib/marketsCache";
import { type PolyMarket, type KalshiMarket, type RedditPost } from "@/lib/noticiasShared";

export async function fetchPolymarketDirect(): Promise<PolyMarket[]> {
  // Cache compartilhado — reusa a resposta já buscada por Apostas/Home
  return (await getMarkets<PolyMarket>("polymarket")).slice(0, 24);
}

export async function fetchKalshiMarkets(): Promise<KalshiMarket[]> {
  return (await getMarkets<KalshiMarket>("kalshi")).slice(0, 24);
}

export async function fetchRedditPosts(subreddit: string): Promise<RedditPost[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`/api/reddit/${subreddit}?limit=15`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Reddit HTTP ${res.status}`);
    const json = await res.json() as { posts: RedditPost[] };
    return json.posts ?? [];
  } finally {
    clearTimeout(timer);
  }
}

export const SUBREDDITS = ["Polymarket", "predictionmarkets"];
