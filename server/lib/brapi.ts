import { getCache, setCache } from "./cache.ts";
import { fetchJSON } from "./fetcher.ts";

export interface BrapiQuote {
  symbol: string; shortName: string;
  regularMarketPrice: number; regularMarketChange: number; regularMarketChangePercent: number;
  dividendsYield?: number; priceEarnings?: number;
}
interface BrapiResponse { results: BrapiQuote[] }

export async function fetchBrapiQuotes(tickers: string[]): Promise<BrapiQuote[]> {
  const cacheKey = `brapi:${tickers.sort().join(",")}`;
  const cached = getCache<BrapiQuote[]>(cacheKey);
  if (cached) return cached;
  const apiKey = process.env.BRAPI_TOKEN ?? "";
  const url = `https://brapi.dev/api/quote/${tickers.join(",")}?token=${apiKey}&fundamental=true`;
  try {
    const data = await fetchJSON<BrapiResponse>(url);
    const results = data.results ?? [];
    setCache(cacheKey, results, 60);
    return results;
  } catch { return []; }
}
