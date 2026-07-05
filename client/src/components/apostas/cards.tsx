/**
 * Componentes de display dos cards de mercado (Apostas).
 * Extraídos de Apostas.tsx para reduzir o tamanho do arquivo — puramente
 * presentacionais (badges, pills, sparkline, barra de hype, multi-outcome).
 */
import { useState, useEffect } from "react";
import type { DynamicBadge, Source } from "@/lib/trending";

// ─── Sparkline ───────────────────────────────────────────────────────────────

export function ProbSparkline({ tokenIds, marketId, source }: {
  tokenIds?: string;
  marketId?: string;
  source?: string;
}) {
  const [pts, setPts] = useState<{ t: number; p: number }[]>([]);

  useEffect(() => {
    let cancelled = false;

    const trySupabase = () => {
      if (marketId && source) {
        const rawId = marketId.replace(/^(poly-|kalshi-|manifold-)/, "");
        fetch(`/api/snapshots/history/${source}/${encodeURIComponent(rawId)}?days=90`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (cancelled || !data?.rows) return;
            const snappedPts = data.rows
              .map((r: { yes_prob: number; snapped_at: string }) => ({
                t: Math.floor(new Date(r.snapped_at).getTime() / 1000),
                p: r.yes_prob,
              }))
              .filter((h: { t: number; p: number }) => !isNaN(h.t));
            if (snappedPts.length >= 4) setPts(snappedPts);
          })
          .catch(() => {});
      }
    };

    if (source === "kalshi") {
      trySupabase();
      return () => { cancelled = true; };
    }

    if (tokenIds) {
      try {
        const arr = JSON.parse(tokenIds) as string[];
        const tokenId = arr[0];
        if (!tokenId) { trySupabase(); return () => { cancelled = true; }; }
        const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
        fetch(`/api/polymarket/clob-history?tokenId=${encodeURIComponent(tokenId)}`)
          .then((r) => r.ok ? r.json() as Promise<{ history: { t: number; p: number }[] }> : null)
          .then((data) => {
            if (cancelled) return;
            if (!data?.history) { trySupabase(); return; }
            const recent = data.history.filter((h) => h.t >= sevenDaysAgo);
            if (recent.length >= 4) {
              setPts(recent);
            } else {
              trySupabase();
            }
          })
          .catch(() => { trySupabase(); });
      } catch { trySupabase(); }
    } else {
      trySupabase();
    }

    return () => { cancelled = true; };
  }, [tokenIds, marketId, source]);

  if (pts.length < 4) return null;

  const W = 72, H = 24;
  const probs = pts.map((h) => h.p);
  const minP = Math.min(...probs), maxP = Math.max(...probs);
  const range = maxP - minP || 0.02;
  const points = pts
    .map((h, i) => {
      const x = (i / (pts.length - 1)) * W;
      const y = H - ((h.p - minP) / range) * (H - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const trend = probs[probs.length - 1] >= probs[0];
  const color = trend ? "#22c55e" : "#ef4444";
  const spanDays = pts.length >= 2
    ? Math.round((pts[pts.length - 1].t - pts[0].t) / 86400)
    : 7;
  const displayDays = spanDays > 8 ? spanDays : 7;

  return (
    <div className="flex items-center gap-1.5 mt-1.5" title={`Variação ${displayDays} dias`}>
      <svg width={W} height={H} className="overflow-visible shrink-0">
        <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.75} strokeLinejoin="round" />
      </svg>
      <span className={`text-[9px] font-mono ${trend ? "text-positive" : "text-negative"}`}>
        {trend ? "+" : ""}{Math.round((probs[probs.length - 1] - probs[0]) * 100)}pp {displayDays}d
      </span>
    </div>
  );
}

// ─── Badges / pills ──────────────────────────────────────────────────────────

export const BADGE_CONFIG: Record<DynamicBadge, { label: string; cls: string }> = {
  viral:      { label: "🔥 Viral",      cls: "border-orange-500/40 bg-orange-500/10 text-orange-400" },
  nova:       { label: "✨ Nova",        cls: "border-neon-blue/40 bg-neon-blue/10 text-neon-blue"   },
  "em-alta":  { label: "📈 Em Alta",    cls: "border-positive/40 bg-positive/10 text-positive"      },
  encerrando: { label: "⏳ Encerrando", cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400" },
};

export function MarketBadge({ badge, endDate }: { badge: DynamicBadge; endDate?: string }) {
  const { cls } = BADGE_CONFIG[badge];
  let label = BADGE_CONFIG[badge].label;

  if (badge === "encerrando" && endDate) {
    const diff = new Date(endDate).getTime() - Date.now();
    if (diff > 0) {
      const days = Math.floor(diff / 86_400_000);
      const hrs  = Math.floor((diff % 86_400_000) / 3_600_000);
      label = days > 0 ? `⏳ ${days}d ${hrs}h` : `⏳ ${hrs}h`;
    }
  }

  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cls}`}>
      {label}
    </span>
  );
}

export function VolumeTrend({ volume, volume24h }: { volume?: number; volume24h?: number }) {
  if (!volume || !volume24h || volume <= 0) return null;
  const ratio = volume24h / volume;
  if (ratio < 0.05) return null;
  const isStrong = ratio > 0.2;
  return (
    <span className={`text-[10px] font-mono ${isStrong ? "text-positive" : "text-muted-foreground/60"}`}
      title={`${(ratio * 100).toFixed(0)}% do volume total nas últimas 24h`}>
      {isStrong ? "↑↑" : "↑"}
    </span>
  );
}

export function HypeBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-positive" : score >= 40 ? "bg-gold" : "bg-primary/50";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-secondary/50 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{Math.round(score)}%</span>
    </div>
  );
}

export function SentimentBadge({ label }: { label: string }) {
  return (
    <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border ${
      label === "Positivo" ? "border-positive/30 bg-positive/10 text-positive" :
      label === "Negativo" ? "border-negative/30 bg-negative/10 text-negative" :
      "border-border/30 bg-secondary/30 text-muted-foreground"
    }`}>{label}</span>
  );
}

export function SourceBadge({ source, subreddit }: { source: Source; subreddit?: string }) {
  if (source === "reddit")
    return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400">r/{subreddit}</span>;
  if (source === "kalshi")
    return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-green-500/30 bg-green-500/10 text-green-400">Kalshi</span>;
  if (source === "manifold")
    return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400">Manifold</span>;
  return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-neon-blue/30 bg-neon-blue/10 text-neon-blue">Polymarket</span>;
}

export function ProbPill({ prob, flash }: { prob: number; flash?: "up" | "down" | null }) {
  const pct = parseFloat((prob * 100).toFixed(1));
  const baseColor = pct >= 70 ? "text-positive" : pct <= 30 ? "text-negative" : "text-gold";
  const color = flash === "up" ? "text-positive" : flash === "down" ? "text-negative" : baseColor;
  return (
    <div className={`flex items-center gap-1.5 transition-all duration-300 ${flash ? "scale-110" : "scale-100"}`}>
      <div className="relative w-8 h-8">
        <svg viewBox="0 0 32 32" className="w-8 h-8 -rotate-90">
          <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3" className="text-secondary/40" />
          <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3"
            className={`${color} transition-colors duration-300`}
            strokeDasharray={`${2 * Math.PI * 12 * prob} ${2 * Math.PI * 12 * (1 - prob)}`}
            strokeLinecap="round"
          />
        </svg>
        {flash && (
          <span className={`absolute -top-1 -right-1 text-[8px] font-bold leading-none ${flash === "up" ? "text-positive" : "text-negative"}`}>
            {flash === "up" ? "▲" : "▼"}
          </span>
        )}
      </div>
      <div>
        <p className={`text-sm font-mono font-bold leading-none ${color} transition-colors duration-300`}>{pct}%</p>
        <p className="text-[9px] text-muted-foreground leading-none mt-0.5">SIM</p>
      </div>
    </div>
  );
}

/** Shown when the market has more than 2 outcomes (multi-way market). */
export function MultiOutcomePills({ outcomes }: { outcomes: { label: string; prob: number }[] }) {
  const top = outcomes.slice(0, 6);
  const others = outcomes.slice(6);
  const otherProb = others.reduce((s, o) => s + o.prob, 0);
  return (
    <div className="space-y-1.5 w-full">
      {top.map(({ label, prob }) => {
        const pct = Math.round(prob * 100);
        const barColor = pct >= 40 ? "bg-positive/70" : pct >= 20 ? "bg-gold/70" : "bg-primary/40";
        return (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground truncate shrink-0 w-28 leading-none" title={label}>{label}</span>
            <div className="flex-1 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            <span className={`text-[10px] font-mono font-bold w-8 text-right shrink-0 ${pct >= 40 ? "text-positive" : pct >= 20 ? "text-gold" : "text-muted-foreground"}`}>{pct}%</span>
          </div>
        );
      })}
      {otherProb > 0.01 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground/60 shrink-0 w-28">+{others.length} outros</span>
          <div className="flex-1 h-1.5 bg-secondary/30 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-secondary/60" style={{ width: `${Math.round(otherProb * 100)}%` }} />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/60 w-8 text-right">{Math.round(otherProb * 100)}%</span>
        </div>
      )}
    </div>
  );
}
