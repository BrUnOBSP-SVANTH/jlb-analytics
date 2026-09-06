/**
 * Componentes de display dos cards de mercado (Apostas).
 * Extraídos de Apostas.tsx para reduzir o tamanho do arquivo — puramente
 * presentacionais (badges, pills, sparkline, barra de hype, multi-outcome).
 */
import { useState, useEffect, useRef } from "react";
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
              .map((r: { yes_prob: number | null; snapped_at: string }) => ({
                t: Math.floor(new Date(r.snapped_at).getTime() / 1000),
                // Snapshots guardam yes_prob em 0-100; o CLOB do Polymarket vem 0-1.
                // Normaliza para 0-1 aqui, senão o deltaPp (× 100) infla 100× a variação
                // (ex.: +5pp virava "+500pp"). Nulo → descartado no filtro.
                p: r.yes_prob == null ? NaN : r.yes_prob / 100,
              }))
              .filter((h: { t: number; p: number }) => !isNaN(h.t) && !isNaN(h.p));
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
  const deltaPp = Math.round((probs[probs.length - 1] - probs[0]) * 100);
  const trend = probs[probs.length - 1] >= probs[0];
  // Tokens (adaptam claro/escuro) em vez de hex fixo; neutro quando não há tendência real.
  const color = deltaPp === 0 ? "var(--color-muted-foreground)" : trend ? "var(--color-positive)" : "var(--color-negative)";
  const spanDays = pts.length >= 2
    ? Math.round((pts[pts.length - 1].t - pts[0].t) / 86400)
    : 7;
  const displayDays = spanDays > 8 ? spanDays : 7;

  return (
    <div className="flex items-center gap-1.5 mt-1.5" title={`Variação ${displayDays} dias`}>
      <svg width={W} height={H} className="overflow-visible shrink-0">
        <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.75} strokeLinejoin="round" />
      </svg>
      <span className={`text-[9px] font-mono ${deltaPp === 0 ? "text-muted-foreground" : trend ? "text-positive" : "text-negative"}`}>
        {deltaPp > 0 ? "+" : ""}{deltaPp}pp {displayDays}d
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
    // "fictício" no rótulo, não só na dica: a Manifold opera com dinheiro de
    // brincadeira (mana). O preço dela ao lado de Polymarket e Kalshi parece a
    // mesma evidência e NÃO é — lá existe risco financeiro real por trás de cada
    // centavo, aqui não. Quem lê de relance precisa ver a diferença.
    return (
      <span
        className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-purple-400"
        title="A Manifold usa dinheiro fictício (mana). O preço reflete opinião, não dinheiro em risco — diferente de Polymarket e Kalshi."
      >
        Manifold · fictício
      </span>
    );
  return <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-neon-blue/30 bg-neon-blue/10 text-neon-blue">Polymarket</span>;
}


/** Probabilidade protagonista — o número-herói do card (mercados binários).
 *  Grande e confiante: num site de mercados preditivos, a probabilidade É o produto. */
/**
 * Conta o número subindo até o valor real, uma vez, ao aparecer.
 *
 * Não é enfeite: a probabilidade É o conteúdo do card, e vê-la se formar prende
 * o olho no dado em vez de na moldura. Dura 600ms — o suficiente para registrar,
 * curto o bastante para não atrasar quem só quer o número.
 *
 * Quem pediu menos movimento recebe o valor final direto, sem contagem.
 */
function useContagem(alvo: number, ativo = true): number {
  const [valor, setValor] = useState(alvo);
  const jaContou = useRef(false);

  useEffect(() => {
    const semMovimento = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // Só na PRIMEIRA vez: recontar a cada atualização de preço ao vivo faria o
    // número dançar sozinho na tela, que é o oposto de legível.
    if (!ativo || semMovimento || jaContou.current) { setValor(alvo); return; }
    jaContou.current = true;

    const inicio = performance.now();
    const DURACAO = 600;
    let id = 0;
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO);
      // Desacelera no fim (ease-out cúbico): chega no número, não bate nele.
      setValor(alvo * (1 - Math.pow(1 - t, 3)));
      if (t < 1) id = requestAnimationFrame(passo);
    };
    id = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(id);
  }, [alvo, ativo]);

  return valor;
}

export function ProbHero({ prob, flash }: { prob: number; flash?: "up" | "down" | null }) {
  const alvoPct = Math.round(prob * 100);
  const pct = Math.round(useContagem(alvoPct));
  // Mid (31-69%) usa text-primary (adapta claro/escuro) em vez de text-gold fixo,
  // que ficava ~1.75:1 no card branco. positive/negative escurecem no .light.
  const base = pct >= 70 ? "text-positive" : pct <= 30 ? "text-negative" : "text-primary";
  const color = flash === "up" ? "text-positive" : flash === "down" ? "text-negative" : base;
  return (
    <div className={`text-right shrink-0 transition-transform duration-300 ${flash ? "scale-105" : "scale-100"}`}>
      <p className={`font-mono font-bold leading-none tabular-nums ${color} transition-colors duration-300`} style={{ fontSize: "2.75rem" }}>
        {pct}<span className="text-xl align-top leading-none">%</span>
      </p>
      <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-1.5 flex items-center justify-end gap-1">
        {flash === "up" && <span className="text-positive leading-none">▲</span>}
        {flash === "down" && <span className="text-negative leading-none">▼</span>}
        chance SIM
      </p>
    </div>
  );
}

/** Barra de probabilidade SIM/NÃO — substitui a antiga "barra de hype" (que era
 *  ~100% em todo card, logo inútil). Esta varia por mercado e É o sinal real. */
export function ProbBar({ prob }: { prob: number }) {
  const pct = Math.round(prob * 100);
  const largura = useContagem(pct);
  const color = pct >= 70 ? "bg-positive" : pct <= 30 ? "bg-negative" : "bg-primary";
  return (
    <div>
      <div className="h-2 rounded-full bg-secondary/40 overflow-hidden">
        {/* ancorado à esquerda (rounded-l + min-w) — em prob. baixa não vira pílula solta */}
        <div className={`h-full rounded-l-full rounded-r-[2px] min-w-[6px] ${color} transition-all duration-500`} style={{ width: `${largura}%` }} />
      </div>
      {/* Só o complemento NÃO é dado novo — o número SIM já é o herói acima. */}
      <div className="flex justify-between text-[10px] mt-1">
        <span className="text-muted-foreground">SIM</span>
        <span className="text-muted-foreground">NÃO <span className="text-foreground/70 font-mono font-medium">{100 - pct}%</span></span>
      </div>
    </div>
  );
}

/** Shown when the market has more than 2 outcomes (multi-way market). */
export function MultiOutcomePills({ outcomes }: { outcomes: { label: string; prob: number }[] }) {
  if (outcomes.length === 0) return null;
  const [leader, ...restAll] = outcomes;
  const rest = restAll.slice(0, 5);
  const others = restAll.slice(5);
  const otherProb = others.reduce((s, o) => s + o.prob, 0);
  const leaderPct = Math.round(leader.prob * 100);
  return (
    <div className="w-full space-y-2">
      {/* Líder = protagonista: número grande e cor semântica, para qualquer card
          multi-desfecho liderar com uma probabilidade (não só os binários). */}
      <div className="flex items-center gap-3">
        <span className={`font-mono font-bold leading-none tabular-nums shrink-0 ${leaderPct >= 50 ? "text-positive" : "text-primary"}`} style={{ fontSize: "2.25rem" }}>
          {leaderPct}<span className="text-sm align-top leading-none">%</span>
        </span>
        <span className="text-xs text-foreground/80 leading-snug min-w-0 truncate" title={leader.label}>{leader.label}</span>
      </div>
      {/* Demais desfechos — compactos, legíveis (foreground/70, não muted) */}
      <div className="space-y-1">
        {rest.map(({ label, prob }) => {
          const pct = Math.round(prob * 100);
          return (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground truncate shrink-0 w-24 leading-none" title={label}>{label}</span>
              <div className="flex-1 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                <div className={`h-full rounded-l-full rounded-r-[2px] ${pct >= 25 ? "bg-primary/60" : "bg-primary/35"}`} style={{ width: `${Math.max(2, pct)}%` }} />
              </div>
              <span className="text-[10px] font-mono font-bold w-8 text-right shrink-0 text-foreground/70">{pct}%</span>
            </div>
          );
        })}
        {otherProb > 0.01 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/60 shrink-0 w-24">+{others.length} outros</span>
            <div className="flex-1 h-1.5 bg-secondary/30 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-secondary/60" style={{ width: `${Math.round(otherProb * 100)}%` }} />
            </div>
            <span className="text-[10px] font-mono text-muted-foreground/60 w-8 text-right">{Math.round(otherProb * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
