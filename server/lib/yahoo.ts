import { getCache, setCache } from "./cache.ts";
import { fetchJSON } from "./fetcher.ts";

export interface YahooQuote {
  symbol: string; shortName?: string; longName?: string;
  regularMarketPrice?: number; regularMarketChange?: number; regularMarketChangePercent?: number;
  trailingPE?: number; priceToBook?: number; dividendYield?: number;
}
interface YahooCrumb { crumb: string; cookie: string }
let yahooCrumb: YahooCrumb | null = null;

async function getYahooCrumb(): Promise<YahooCrumb | null> {
  if (yahooCrumb) return yahooCrumb;
  try {
    const cookieRes = await fetch("https://finance.yahoo.com/", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    const cookie = (cookieRes.headers.get("set-cookie") ?? "").split(";")[0];
    const crumbRes = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": "Mozilla/5.0", Cookie: cookie },
      signal: AbortSignal.timeout(8000),
    });
    const crumb = await crumbRes.text();
    yahooCrumb = { crumb, cookie };
    return yahooCrumb;
  } catch { return null; }
}

export interface YahooHistoryPoint { t: number; close: number }

export async function fetchYahooHistory(ticker: string, intervalMonths = 12): Promise<YahooHistoryPoint[]> {
  const cacheKey = `yahoo:history:${ticker}:${intervalMonths}m`;
  const cached = getCache<YahooHistoryPoint[]>(cacheKey);
  if (cached) return cached;
  try {
    const crumb = await getYahooCrumb();
    const range = intervalMonths <= 6 ? "6mo" : intervalMonths <= 12 ? "1y" : "2y";
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=${range}&crumb=${crumb?.crumb ?? ""}`;
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0",
      ...(crumb ? { Cookie: crumb.cookie } : {}),
    };
    interface ChartResponse {
      chart: { result: Array<{ timestamp: number[]; indicators: { quote: Array<{ close: number[] }> } }> }
    }
    const data = await fetchJSON<ChartResponse>(url, headers);
    const result = data.chart?.result?.[0];
    if (!result) return [];
    const timestamps = result.timestamp ?? [];
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const points: YahooHistoryPoint[] = timestamps
      .map((t, i) => ({ t, close: closes[i] }))
      .filter((p) => p.close != null && isFinite(p.close))
      .slice(-intervalMonths);
    setCache(cacheKey, points, 3600); // cache 1h
    return points;
  } catch { return []; }
}

export async function fetchYahooQuotes(tickers: string[]): Promise<YahooQuote[]> {
  const cacheKey = `yahoo:${tickers.sort().join(",")}`;
  const cached = getCache<YahooQuote[]>(cacheKey);
  if (cached) return cached;
  try {
    const crumb = await getYahooCrumb();
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers.join(",")}&fields=shortName,longName,regularMarketPrice,regularMarketChange,regularMarketChangePercent,trailingPE,priceToBook,dividendYield&crumb=${crumb?.crumb ?? ""}`;
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0",
      ...(crumb ? { Cookie: crumb.cookie } : {}),
    };
    interface YahooResponse { quoteResponse: { result: YahooQuote[] } }
    const data = await fetchJSON<YahooResponse>(url, headers);
    const results = data.quoteResponse?.result ?? [];
    setCache(cacheKey, results, 60);
    return results;
  } catch { return []; }
}
