// ── Cerebro: base de conhecimento proprietária (Supabase REST) ───────────────
// Cruza o mercado com artigos curados + sínteses IA. Também lê snapshots para
// calcular o momentum do mercado. Extraído de routes/ai.ts.
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseRest.ts";

interface CerebroHit { title: string; summary: string; source: string; kind: "síntese" | "artigo" }

/** Extrai 2-3 termos significativos para busca full-text no Cerebro. */
function topKeywords(text: string, n = 3): string {
  const stop = new Set(["will","the","and","для","que","com","por","uma","dos","das","será","vai","ser","está","sobre","como","what","when","this","that","with","from","have","does","após","entre","mais"]);
  return text.replace(/[^a-zA-ZÀ-ú0-9 ]/g, " ").split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w.toLowerCase()))
    .slice(0, n).join(" ");
}

export async function fetchCerebroContext(title: string, description?: string): Promise<{ context: string; hits: CerebroHit[] }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { context: "", hits: [] };
  const kw = topKeywords(title + " " + (description ?? ""));
  if (!kw) return { context: "", hits: [] };

  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const enc = encodeURIComponent(kw);

  try {
    // Sínteses (maior valor) primeiro, depois artigos recentes — busca full-text PT
    const [synthRes, artRes] = await Promise.allSettled([
      fetch(`${SUPABASE_URL}/rest/v1/cerebro_analyses?fts=plfts(portuguese).${enc}&status=eq.active&select=title,content&limit=2`, { headers, signal: AbortSignal.timeout(6_000) }),
      fetch(`${SUPABASE_URL}/rest/v1/cerebro_articles?fts=plfts(portuguese).${enc}&status=eq.active&select=title,summary,source&order=published_at.desc&limit=4`, { headers, signal: AbortSignal.timeout(6_000) }),
    ]);

    const hits: CerebroHit[] = [];
    if (synthRes.status === "fulfilled" && synthRes.value.ok) {
      const rows = await synthRes.value.json() as Array<{ title: string; content: string }>;
      for (const r of rows) hits.push({ title: r.title, summary: (r.content ?? "").slice(0, 400), source: "Cerebro IA", kind: "síntese" });
    }
    if (artRes.status === "fulfilled" && artRes.value.ok) {
      const rows = await artRes.value.json() as Array<{ title: string; summary: string | null; source: string }>;
      for (const r of rows) hits.push({ title: r.title, summary: (r.summary ?? "").slice(0, 250), source: r.source, kind: "artigo" });
    }

    if (hits.length === 0) return { context: "", hits: [] };
    const context = hits.map((h, i) => `[C${i + 1}] (${h.kind} · ${h.source}) "${h.title}"\n${h.summary}`).join("\n\n");
    return { context, hits };
  } catch { return { context: "", hits: [] }; }
}

/** Busca o histórico de preço do mercado (snapshots) e calcula momentum. */
export async function fetchMarketMomentum(marketId: string | undefined, source: string): Promise<string> {
  if (!marketId || !SUPABASE_URL || !SUPABASE_KEY) return "";
  const rawId = marketId.replace(/^(poly-|kalshi-|manifold-)/, "");
  const since = new Date(Date.now() - 45 * 86_400_000).toISOString();
  try {
    const url = `${SUPABASE_URL}/rest/v1/market_snapshots?market_id=eq.${encodeURIComponent(rawId)}&source=eq.${encodeURIComponent(source)}&snapped_at=gte.${since}&select=yes_prob,snapped_at&order=snapped_at.asc`;
    const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return "";
    const rows = await res.json() as Array<{ yes_prob: number; snapped_at: string }>;
    if (rows.length < 3) return "";
    const first = rows[0].yes_prob;
    const last = rows[rows.length - 1].yes_prob;
    const max = Math.max(...rows.map((r) => r.yes_prob));
    const min = Math.min(...rows.map((r) => r.yes_prob));
    const change = last - first;
    const days = Math.round((new Date(rows[rows.length - 1].snapped_at).getTime() - new Date(rows[0].snapped_at).getTime()) / 86_400_000);
    const trend = Math.abs(change) < 3 ? "estável" : change > 0 ? `subindo (+${change.toFixed(0)}pp)` : `caindo (${change.toFixed(0)}pp)`;
    return `TRAJETÓRIA DO MERCADO (${days}d, ${rows.length} snapshots): de ${first.toFixed(0)}% → ${last.toFixed(0)}% — tendência ${trend}. Faixa: ${min.toFixed(0)}%–${max.toFixed(0)}%.`;
  } catch { return ""; }
}

// ── AI Forecast Log (track record + divergências) ───────────────────────────
// Registra cada fair value que a IA gera, para depois medir a calibração real
// da própria IA (Brier) e surfaçar onde ela mais discorda do mercado.
