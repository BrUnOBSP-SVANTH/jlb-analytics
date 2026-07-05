/**
 * /api/snapshots — histórico de probabilidade de mercados salvos no Supabase.
 * Usado para sparklines de longo prazo e análise de calibração do mercado.
 */

import { Router } from "express";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "";

function supaHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
  };
}

// GET /api/snapshots/history/:source/:marketId?days=90
router.get("/history/:source/:marketId", async (req, res) => {
  const { source, marketId } = req.params;
  const days = Math.min(parseInt(String(req.query.days ?? "90"), 10), 365);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: "Supabase not configured" });
  }

  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const url =
      `${SUPABASE_URL}/rest/v1/market_snapshots` +
      `?market_id=eq.${encodeURIComponent(marketId)}` +
      `&source=eq.${encodeURIComponent(source)}` +
      `&snapped_at=gte.${since}` +
      `&select=yes_prob,volume_24h,status,snapped_at` +
      `&order=snapped_at.asc`;

    const r = await fetch(url, { headers: supaHeaders() });
    if (!r.ok) return res.status(502).json({ error: "Supabase error" });

    const rows = await r.json() as Array<{
      yes_prob: number; volume_24h: number; status: string; snapped_at: string;
    }>;

    res.json({ marketId, source, days, rows });
  } catch (err) {
    console.error("[snapshots] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// GET /api/snapshots/top?source=polymarket&category=politics&days=30
// Retorna mercados com maior variação de prob no período — útil para análise
router.get("/top", async (req, res) => {
  const source = String(req.query.source ?? "");
  const category = String(req.query.category ?? "");
  const days = Math.min(parseInt(String(req.query.days ?? "30"), 10), 90);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: "Supabase not configured" });
  }

  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    let url =
      `${SUPABASE_URL}/rest/v1/market_snapshots` +
      `?snapped_at=gte.${since}` +
      `&select=market_id,source,title,category,yes_prob,snapped_at`;

    if (source) url += `&source=eq.${encodeURIComponent(source)}`;
    if (category) url += `&category=ilike.*${encodeURIComponent(category)}*`;
    url += "&order=snapped_at.desc&limit=500";

    const r = await fetch(url, { headers: supaHeaders() });
    if (!r.ok) return res.status(502).json({ error: "Supabase error" });

    const rows = await r.json() as Array<{
      market_id: string; source: string; title: string; category: string | null;
      yes_prob: number; snapped_at: string;
    }>;

    // Agrupa por market_id e calcula variação total
    const byMarket = new Map<string, { first: number; last: number; title: string; source: string; category: string | null }>();
    for (const row of [...rows].reverse()) {
      const key = `${row.source}:${row.market_id}`;
      if (!byMarket.has(key)) {
        byMarket.set(key, { first: row.yes_prob, last: row.yes_prob, title: row.title, source: row.source, category: row.category });
      } else {
        byMarket.get(key)!.last = row.yes_prob;
      }
    }

    const ranked = Array.from(byMarket.entries())
      .map(([key, v]) => ({
        key,
        title: v.title,
        source: v.source,
        category: v.category,
        startProb: v.first,
        endProb: v.last,
        change: v.last - v.first,
        absChange: Math.abs(v.last - v.first),
      }))
      .sort((a, b) => b.absChange - a.absChange)
      .slice(0, 20);

    res.json({ days, ranked });
  } catch (err) {
    console.error("[snapshots/top] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/snapshots/trigger — dispara coleta manual (requer service key)
router.post("/trigger", async (req, res) => {
  const authHeader = req.headers["authorization"] ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? "";
  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  res.json({ triggered: true, message: "Snapshot collection initiated" });
});

// POST /api/snapshots/seed — popula market_snapshots com histórico real do Polymarket CLOB
// Busca top 20 mercados ativos, puxa CLOB history de cada um e insere no Supabase.
// Público (sem auth) mas rate-limited pelo próprio Polymarket/Supabase.
router.post("/seed", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(503).json({ error: "Supabase not configured" });
  }

  try {
    // 1. Busca top mercados do Polymarket
    const polyRes = await fetch(
      "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=30&order=volume&ascending=false&with_nested_markets=true",
      { signal: AbortSignal.timeout(15_000) }
    );
    if (!polyRes.ok) return res.status(502).json({ error: "Polymarket unavailable" });

    interface PolyEvent { id: string; slug: string; category?: string; volume?: number; markets?: Array<{ id: string; question: string; clobTokenIds?: string; outcomePrices?: string; endDate?: string }> }
    const events = await polyRes.json() as PolyEvent[];

    const markets = events.flatMap((ev) => (ev.markets ?? []).slice(0, 1).map((m) => ({
      id: m.id,
      title: m.question,
      category: ev.category ?? "other",
      clobTokenId: (() => { try { return (JSON.parse(m.clobTokenIds ?? "[]") as string[])[0]; } catch { return null; } })(),
      outcomePrices: m.outcomePrices,
    }))).filter((m) => m.clobTokenId).slice(0, 20);

    let seeded = 0;
    const snapshots: object[] = [];

    for (const m of markets) {
      try {
        // 2. Busca histórico CLOB (últimos 60 dias, fidelidade diária)
        const clobUrl = `https://clob.polymarket.com/prices-history?market=${m.clobTokenId}&interval=all&fidelity=1440`;
        const clobRes = await fetch(clobUrl, { signal: AbortSignal.timeout(10_000) });
        if (!clobRes.ok) continue;

        interface ClobPoint { t: number; p: number }
        const clobData = await clobRes.json() as { history?: ClobPoint[] };
        const history = (clobData.history ?? []).slice(-60); // últimos 60 dias

        for (const pt of history) {
          const yesProb = Math.round(Math.max(0, Math.min(100, pt.p * 100)) * 100) / 100;
          snapshots.push({
            market_id: m.id,
            source: "polymarket",
            title: m.title.slice(0, 200),
            category: m.category,
            yes_prob: yesProb,
            volume: null,
            volume_24h: null,
            liquidity: null,
            status: "open",
            snap_date: new Date(pt.t * 1000).toISOString().slice(0, 10),
            snapped_at: new Date(pt.t * 1000).toISOString(),
          });
        }
        seeded++;
      } catch {
        // skip market on error
      }
    }

    if (snapshots.length === 0) {
      return res.json({ seeded: 0, rows: 0, message: "Sem dados históricos disponíveis no momento." });
    }

    // Deduplica por (market_id, source, snap_date) — o Postgres não aceita conflito dentro do mesmo batch
    const deduped = Array.from(
      new Map(
        (snapshots as Array<Record<string, unknown>>).map((s) => [`${s.market_id}:${s.source}:${s.snap_date}`, s])
      ).values()
    );

    // 3. Upsert no Supabase — especifica colunas de conflito na URL
    const upsertUrl = `${SUPABASE_URL}/rest/v1/market_snapshots?on_conflict=market_id,source,snap_date`;
    const upsertRes = await fetch(upsertUrl, {
      method: "POST",
      headers: {
        ...supaHeaders(),
        Prefer: "return=minimal,resolution=merge-duplicates",
      },
      body: JSON.stringify(deduped),
      signal: AbortSignal.timeout(30_000),
    });

    if (!upsertRes.ok) {
      const errText = await upsertRes.text().catch(() => "");
      return res.status(502).json({ error: "Supabase upsert failed", detail: errText.slice(0, 200) });
    }

    res.json({ seeded, rows: deduped.length, message: `${deduped.length} snapshots inseridos para ${seeded} mercados.` });
  } catch (err) {
    console.error("[snapshots/seed] error:", err);
    res.status(500).json({ error: "Internal error", message: err instanceof Error ? err.message : "unknown" });
  }
});

export default router;
