// Shared API response types used across multiple route modules

export interface NewsArticle {
  source: { name: string };
  author: string | null;
  title: string;
  description: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
}

export interface NewsApiResponse {
  status: string;
  totalResults: number;
  articles: NewsArticle[];
}

// ── Polymarket ────────────────────────────────────────────────────────────────

export interface PolyMarketInner {
  id: string; question: string; slug: string; groupItemTitle?: string;
  volume?: number | string; liquidity?: number | string;
  active?: boolean; closed?: boolean; acceptingOrders?: boolean;
  endDate?: string; outcomePrices?: string; outcomes?: string; clobTokenIds?: string;
  volume24hr?: number; oneWeekPriceChange?: number; bestBid?: number; bestAsk?: number;
}
export interface PolyEventTag { label?: string; slug?: string }
export interface PolyEvent {
  id: string; title?: string; slug: string;
  volume?: number | string; liquidity?: number | string; volume24hr?: number;
  active?: boolean; closed?: boolean; featured?: boolean; negRisk?: boolean;
  category?: string; tags?: PolyEventTag[];
  markets?: PolyMarketInner[];
}
export interface PolyMarket {
  id: string; question: string; slug: string; eventSlug: string;
  eventTitle?: string;
  volume?: number; volume24hr?: number; liquidity?: number;
  weekPriceChange?: number;
  featured?: boolean; category?: string;
  closed?: boolean; active?: boolean;
  endDate?: string; outcomePrices?: string; outcomes?: string; clobTokenIds?: string;
  externalUrl?: string; // URL canônica /event/{eventSlug} computada no servidor
}

// ── Kalshi ────────────────────────────────────────────────────────────────────

export interface KalshiNestedMarket {
  ticker: string; event_ticker: string; title?: string; yes_sub_title?: string;
  yes_bid_dollars?: string; yes_ask_dollars?: string; last_price_dollars?: string;
  previous_price_dollars?: string;
  volume_fp?: string; volume_24h_fp?: string; open_interest_fp?: string;
  liquidity_dollars?: string; close_time?: string; status?: string;
}
export interface KalshiEvent {
  event_ticker: string; series_ticker?: string; title?: string; category?: string;
  mutually_exclusive?: boolean;
  markets?: KalshiNestedMarket[];
}
export interface KalshiEventsResponse { events: KalshiEvent[] }
export interface KalshiMarket {
  ticker: string; eventTicker: string; seriesTicker: string; title: string;
  yesProb: number; prevYesProb?: number;
  volume: number; volume24h?: number; openInterest?: number; liquidity?: number;
  closeTime?: string; category?: string; status?: string;
  externalUrl?: string; // URL canônica /markets/{series}/{event} computada no servidor
  outcomes?: { label: string; prob: number }[]; // multi-resultado agrupado (mutually_exclusive)
}

// ── Normalised quote (market data) ────────────────────────────────────────────

export interface NormalisedQuote {
  ticker: string; name: string; price: number; change: number; changePercent: number;
  dividendYield: number; pe: number | null; pvp: number | null; currency: string;
  source: "brapi" | "yahoo" | "fallback";
}
