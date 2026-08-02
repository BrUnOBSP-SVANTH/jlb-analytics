/**
 * Helpers puros do Backtester (formatacao + fetch de historico). Extraido de pages/Backtester.tsx.
 */
import { type PricePoint } from "@/lib/backtester";

export function pct(v: number, decimals = 1): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(decimals)}%`;
}

export function fmt2(v: number): string {
  const s = v.toFixed(3);
  if (s === "0.000" || s === "-0.000") return "0.000"; // evita "+0.000"/"-0.000"
  return `${v >= 0 ? "+" : ""}${s}`;
}

export function dateFromTs(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function parseFirstTokenId(raw?: string): string | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as string[];
    return arr[0] ?? null;
  } catch { return null; }
}

export async function fetchSnapshotHistory(source: string, marketId: string): Promise<PricePoint[]> {
  const rawId = marketId.replace(/^(poly-|kalshi-|manifold-)/, "");
  try {
    const res = await fetch(`/api/snapshots/history/${encodeURIComponent(source)}/${encodeURIComponent(rawId)}?days=90`);
    if (!res.ok) return [];
    const data = await res.json() as { rows?: Array<{ yes_prob: number; snapped_at: string }> };
    return (data.rows ?? []).map((r) => ({
      t: Math.floor(new Date(r.snapped_at).getTime() / 1000),
      p: r.yes_prob,
    })).filter(pt => !isNaN(pt.t) && pt.p >= 0 && pt.p <= 1);
  } catch { return []; }
}
