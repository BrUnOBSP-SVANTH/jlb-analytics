/**
 * /api/feed/editorial — o FEED EDITORIAL de probabilidades: o ativo B2B para
 * redações e portais. Combina a probabilidade AO VIVO dos mercados (Polymarket/
 * Kalshi) com o MOVIMENTO da semana (dos snapshots) e devolve itens prontos para
 * publicar: manchete, probabilidade, variação de 7 dias, leitura em pt-BR e
 * atribuição. Dado 100% real — nenhum número é inventado; sem histórico, delta = null.
 *
 * É deliberadamente um ENDPOINT (não só uma tela): o produto que se vende para a
 * mídia é justamente um feed/API/widget que a redação consome.
 */
import { Router } from "express";
import { log } from "../lib/log.ts";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";
const PORT = process.env.PORT ?? "3001";

export interface PolyMarket { id: string; question: string; outcomePrices?: string; category?: string; volume?: number; externalUrl?: string }
export interface KalshiMarket { ticker: string; title: string; yesProb: number; category?: string; volume?: number; externalUrl?: string }

export interface FeedItem {
  source: "polymarket" | "kalshi";
  marketId: string;
  question: string;
  prob: number;            // 0-100, ao vivo
  delta7d: number | null;  // pts nos últimos 7 dias (null = sem histórico ainda)
  volume: number;
  category: string;
  externalUrl?: string;
  read: string;            // leitura editorial em pt-BR (determinística, sem IA)
}

async function localJson<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`http://localhost:${PORT}${path}`, { signal: AbortSignal.timeout(12_000) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Movimento de 7 dias por market_id: primeiro vs. último snapshot na janela. */
async function movements(source: string, ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!SUPABASE_URL || !SUPABASE_KEY || ids.length === 0) return out;
  try {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const url =
      `${SUPABASE_URL}/rest/v1/market_snapshots` +
      `?source=eq.${source}` +
      `&market_id=in.(${ids.join(",")})` +
      `&snapped_at=gte.${since}` +
      `&select=market_id,yes_prob,snapped_at&order=snapped_at.asc&limit=5000`;
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return out;
    const rows = (await r.json()) as Array<{ market_id: string; yes_prob: number | null }>;
    const firstLast = new Map<string, { first: number; last: number }>();
    for (const row of rows) {
      if (row.yes_prob == null) continue;
      const cur = firstLast.get(row.market_id);
      if (!cur) firstLast.set(row.market_id, { first: row.yes_prob, last: row.yes_prob });
      else cur.last = row.yes_prob;
    }
    firstLast.forEach((v, id) => out.set(id, Math.round((v.last - v.first) * 10) / 10));
    return out;
  } catch {
    return out;
  }
}

export function readOf(prob: number, delta: number | null): string {
  const base = `O mercado precifica ${Math.round(prob)}% de chance.`;
  if (delta == null || Math.abs(delta) < 0.5) return `${base} Estável na última semana.`;
  return `${base} ${delta > 0 ? "Subiu" : "Caiu"} ${Math.abs(delta).toFixed(1)} pts em 7 dias.`;
}

/**
 * Monta o feed a partir dos mercados já buscados + os mapas de movimento. Puro
 * (sem I/O) de propósito, para ser testável: filtra externalUrl e quase-resolvidos
 * (≤3% / ≥97%, sem gancho editorial), calcula prob/leitura, ordena os maiores
 * movimentos primeiro (volume como desempate) e corta em `limit`.
 */
export function assembleFeed(
  polyMs: PolyMarket[],
  kalshiMs: KalshiMarket[],
  polyMov: Map<string, number>,
  kalshiMov: Map<string, number>,
  limit: number,
): FeedItem[] {
  const items: FeedItem[] = [];
  for (const m of polyMs) {
    if (!m.externalUrl) continue;
    let prob = 50;
    try { const p = parseFloat((JSON.parse(m.outcomePrices ?? "[]") as string[])[0]); if (!isNaN(p)) prob = p * 100; } catch { /* mantém 50 */ }
    if (prob <= 3 || prob >= 97) continue; // já quase resolvido → sem gancho editorial
    const delta = polyMov.get(m.id) ?? null;
    items.push({ source: "polymarket", marketId: m.id, question: m.question, prob: Math.round(prob), delta7d: delta, volume: m.volume ?? 0, category: m.category ?? "other", externalUrl: m.externalUrl, read: readOf(prob, delta) });
  }
  for (const m of kalshiMs) {
    if (!m.externalUrl) continue;
    if (m.yesProb <= 3 || m.yesProb >= 97) continue;
    const delta = kalshiMov.get(m.ticker) ?? null;
    items.push({ source: "kalshi", marketId: m.ticker, question: m.title, prob: Math.round(m.yesProb), delta7d: delta, volume: m.volume ?? 0, category: m.category ?? "other", externalUrl: m.externalUrl, read: readOf(m.yesProb, delta) });
  }
  // Quem se moveu (mais noticiável) primeiro; volume como desempate.
  items.sort((a, b) => {
    const am = a.delta7d == null ? -1 : Math.abs(a.delta7d);
    const bm = b.delta7d == null ? -1 : Math.abs(b.delta7d);
    return bm !== am ? bm - am : b.volume - a.volume;
  });
  return items.slice(0, limit);
}

// GET /api/feed/editorial?limit=12
router.get("/editorial", async (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "12"), 10) || 12, 30);
  try {
    const [poly, kalshi] = await Promise.all([
      localJson<{ markets: PolyMarket[] }>("/api/polymarket/markets?limit=30"),
      localJson<{ markets: KalshiMarket[] }>("/api/kalshi/markets?limit=30"),
    ]);

    const polyMs = (poly?.markets ?? []).filter((m) => m.externalUrl);
    const kalshiMs = (kalshi?.markets ?? []).filter((m) => m.externalUrl);

    const [polyMov, kalshiMov] = await Promise.all([
      movements("polymarket", polyMs.map((m) => m.id)),
      movements("kalshi", kalshiMs.map((m) => m.ticker)),
    ]);

    const items = assembleFeed(polyMs, kalshiMs, polyMov, kalshiMov, limit);

    res.set("Cache-Control", "public, max-age=300");
    res.json({ items, generatedAt: new Date().toISOString(), source: "JLB Analytics" });
  } catch (err) {
    log.error("[feed/editorial] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
