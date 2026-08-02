/**
 * Tipos e utilitários compartilhados entre a página Notícias e os modais de análise.
 * Extraído para quebrar o arquivo gigante Noticias.tsx sem import circular.
 */

export interface Article {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description: string;
  imageUrl?: string;
  lang: "pt" | "en";
}

/** "5m atrás" / "3h atrás" / "ontem" / "2d atrás" a partir de uma data ISO. */
export function timeAgoISO(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m atrás`;
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  return `${d}d atrás`;
}

// ── Mercados (Polymarket/Kalshi) e Reddit — movidos de pages/Noticias.tsx ──
// timeAgo (utc seconds) coexiste com timeAgoISO (ISO string) acima — nomes distintos.

export interface PolyMarket {
  id: string;
  question: string;
  slug: string;
  eventSlug?: string;
  volume?: number;
  volume24hr?: number;
  liquidity?: number;
  weekPriceChange?: number;
  featured?: boolean;
  category?: string;
  endDate?: string;
  outcomePrices?: string;
  outcomes?: string;
  clobTokenIds?: string;
}

export interface KalshiMarket {
  ticker: string;
  eventTicker: string;
  seriesTicker: string;
  title: string;
  yesProb: number;
  prevYesProb?: number;
  volume: number;
  volume24h?: number;
  openInterest?: number;
  liquidity?: number;
  closeTime?: string;
  category?: string;
}

export interface RedditPost {
  title: string;
  url: string;
  permalink: string;
  subreddit: string;
  score: number;
  created_utc: number;
  author: string;
  selftext?: string;
}

export function formatVolume(v?: number | string): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!n || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function daysLeft(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return null;
  return Math.ceil(diff / 86_400_000);
}

export function parseOutcomePrices(raw?: string): { yes: number; no: number } | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as string[];
    const yes = parseFloat(arr[0] ?? "0") * 100;
    const no = parseFloat(arr[1] ?? "0") * 100;
    if (isNaN(yes) || isNaN(no)) return null;
    return { yes, no };
  } catch { return null; }
}

export function timeAgo(utcSeconds: number): string {
  const diff = Date.now() - utcSeconds * 1000;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m atrás`;
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}
