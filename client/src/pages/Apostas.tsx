/**
 * Apostas — Apostas em Hype
 * Fontes: Reddit + Polymarket + Kalshi
 */
import { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from "react";
import { toast } from "sonner";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import {
  Flame, ExternalLink, RefreshCw, AlertCircle, Bell, BellOff,
  LayoutGrid, List, ArrowUpDown, AlignJustify,
} from "lucide-react";
import MercadosTabs from "@/components/MercadosTabs";
import { addToWatchlist, removeFromWatchlist, loadWatchlist, updateWatchlistProbs } from "@/lib/watchlist";
import { useMarketAlerts } from "@/hooks/useMarketAlerts";
import { syncPushWatchlist } from "@/hooks/usePushNotifications";
import {
  type TrendingItem, type CategoryFilter, CATEGORY_LABELS, formatVolume, fetchRedditSub, fetchPolymarketSports, fetchManifold, fetchKalshi, REDDIT_SUBS,
} from "@/lib/trending";
import { SourceBadge, BADGE_CONFIG } from "@/components/apostas/cards";
import { TrendingCard } from "@/components/apostas/TrendingCard";
import { ComparePanel } from "@/components/apostas/ComparePanel";
import { CompactRow } from "@/components/apostas/CompactRow";
import { LoadingSkeleton } from "@/components/apostas/LoadingSkeleton";
import { DivergencesSection } from "@/components/apostas/DivergencesSection";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// formatAge foi para components/apostas/TrendingCard.tsx (único consumidor).

// ─── Comparison Panel ─────────────────────────────────────────────────────────

// ─── Main page ────────────────────────────────────────────────────────────────

type Filter = "all" | "reddit" | "polymarket" | "kalshi" | "manifold";
type ViewMode = "grid" | "list" | "compact";
type SortBy = "trending" | "volume" | "prob_asc" | "prob_desc" | "newest";

const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: "trending",   label: "Trending"   },
  { id: "volume",     label: "Volume"     },
  { id: "prob_desc",  label: "Prob ↓"     },
  { id: "prob_asc",   label: "Prob ↑"     },
  { id: "newest",     label: "Mais novos" },
];

function sortItems(arr: TrendingItem[], sortBy: SortBy): TrendingItem[] {
  const s = [...arr];
  switch (sortBy) {
    case "trending":  return s.sort((a, b) => b.score - a.score);
    case "volume":    return s.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    case "prob_desc": return s.sort((a, b) => (b.yesProb ?? 0) - (a.yesProb ?? 0));
    case "prob_asc":  return s.sort((a, b) => (a.yesProb ?? 0) - (b.yesProb ?? 0));
    case "newest":    return s.sort((a, b) => b.ageHours - a.ageHours);
    default:          return s;
  }
}

const REFRESH_INTERVAL = 180; // seconds

function canNotify() {
  return typeof Notification !== "undefined" && Notification.permission === "granted";
}

function sendMarketNotification(title: string, body: string) {
  if (!canNotify()) return;
  new Notification(title, { body, icon: "/favicon.ico", tag: "jlb-market-move" });
}

const PAGE_SIZE = 20;

// ── "Onde a JLB discorda" — mercados com maior edge entre fair value IA e preço ──


export default function Apostas() {
  useSEO("Apostas Ao Vivo", "Mercados preditivos em tempo real do Polymarket e Kalshi com probabilidades, volume, divergências da IA e análise contextual.");
  const [items, setItems]           = useState<TrendingItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filter, setFilter]         = useState<Filter>(() => (localStorage.getItem("apostas_filter") as Filter) ?? "all");
  const [catFilter, setCatFilter]   = useState<CategoryFilter>(() => (localStorage.getItem("apostas_catFilter") as CategoryFilter) ?? "all");
  const [viewMode, setViewMode]     = useState<ViewMode>(() => (localStorage.getItem("apostas_viewMode") as ViewMode) ?? "grid");
  const [sortBy, setSortBy]         = useState<SortBy>(() => (localStorage.getItem("apostas_sortBy") as SortBy) ?? "trending");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [compareMap, setCompareMap] = useState<Map<string, TrendingItem>>(new Map());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [countdown, setCountdown]   = useState(REFRESH_INTERVAL);
  const [newCount, setNewCount]     = useState(0);
  const [notifPerm, setNotifPerm]   = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const [searchQuery, setSearchQuery] = useState("");
  // Debounce nativo: o input fica instantâneo; a filtragem da lista roda em
  // prioridade menor (não trava a digitação em listas grandes).
  const deferredSearch = useDeferredValue(searchQuery);
  const [watchedSet, setWatchedSet] = useState<Set<string>>(() => new Set(loadWatchlist().map((w) => w.id)));
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const initialCompareIdsRef = useRef<string[] | null>(null);
  if (initialCompareIdsRef.current === null) {
    const params = new URLSearchParams(window.location.search);
    const compareParam = params.get("compare");
    initialCompareIdsRef.current = compareParam ? compareParam.split(",").filter(Boolean) : [];
  }

  // Alertas de mercado via WebSocket (variações ≥ 3pp nos mercados watchlisted)
  const watchlistIds = useMemo(() => new Set(loadWatchlist().map((w) => w.id)), []);
  const { latestAlert } = useMarketAlerts(watchlistIds);

  // Mostra toast quando chega alerta WS para item da watchlist
  useEffect(() => {
    if (!latestAlert) return;
    const dir = latestAlert.delta > 0 ? `+${latestAlert.delta.toFixed(1)}pp ↑` : `${latestAlert.delta.toFixed(1)}pp ↓`;
    const shortTitle = latestAlert.title.slice(0, 65) + (latestAlert.title.length > 65 ? "…" : "");
    toast(`⚡ Watchlist: ${dir}`, { description: shortTitle, duration: 8000 });
  }, [latestAlert]);

  // refs stable across renders
  const prevIdsRef   = useRef<Set<string>>(new Set());
  const prevProbsRef = useRef<Map<string, number>>(new Map()); // id → yesProb*100
  const countRef     = useRef(REFRESH_INTERVAL);

  const buildAndSet = useCallback((all: TrendingItem[], silent: boolean) => {
    if (all.length === 0) return false;

    // detect new items
    const newIds = new Set(all.map((i) => i.id));
    const added = silent ? all.filter((i) => !prevIdsRef.current.has(i.id)).length : 0;

    // detect significant prob movements (>= 5pp) for market items
    if (silent) {
      all.forEach((item) => {
        if (item.yesProb === undefined) return;
        const prevPct = prevProbsRef.current.get(item.id);
        if (prevPct === undefined) return;
        const currPct = Math.round(item.yesProb * 100);
        const delta = currPct - prevPct;
        if (Math.abs(delta) >= 5) {
          const dir = delta > 0 ? `+${delta}pp ↑` : `${delta}pp ↓`;
          const shortTitle = item.title.slice(0, 60) + (item.title.length > 60 ? "…" : "");
          toast(`⚡ Movimento: ${dir}`, {
            description: shortTitle,
            duration: 6000,
          });
          sendMarketNotification(`⚡ Movimento: ${dir}`, shortTitle);
        }
      });
    }

    // Watchlist-specific alerts (fires even if item is not currently visible)
    const watchedIds = new Set(loadWatchlist().map((w) => w.id));
    const watchedInView = all.filter((i) => watchedIds.has(i.id) && i.yesProb !== undefined);
    if (watchedInView.length > 0) {
      const watchAlerts = updateWatchlistProbs(watchedInView.map((i) => ({ id: i.id, prob: i.yesProb! })));
      if (silent) {
        watchAlerts.forEach((a) => {
          const dir = a.delta > 0 ? `+${a.delta.toFixed(1)}pp ↑` : `${a.delta.toFixed(1)}pp ↓`;
          const shortTitle = a.title.slice(0, 65) + (a.title.length > 65 ? "…" : "");
          toast(`🔔 Watchlist: ${dir}`, { description: shortTitle, duration: 8000 });
          sendMarketNotification(`🔔 Watchlist: ${dir}`, shortTitle);
        });
      }
    }

    // persist current state
    prevIdsRef.current = newIds;
    prevProbsRef.current = new Map(
      all.filter((i) => i.yesProb !== undefined).map((i) => [i.id, Math.round(i.yesProb! * 100)])
    );

    setItems(all);
    setLastUpdated(new Date());
    if (added > 0) setNewCount(added);
    return true;
  }, []);

  // Named function expression: o retry dos toasts se auto-referencia via o
  // próprio nome (sem TDZ) — referenciar `load` dentro da própria definição
  // fazia o React Compiler desistir do arquivo.
  const load = useCallback(async function loadSelf(silent = false) {
    if (!silent) { setLoading(true); setError(null); }
    try {
      const [reddit, poly, kalshi, manifold] = await Promise.allSettled([
        Promise.all(REDDIT_SUBS.map(fetchRedditSub)).then((arrs) => arrs.flat()),
        fetchPolymarketSports(),
        fetchKalshi(),
        fetchManifold(),
      ]);
      // Reserve slots per source so no single source crowds out the others
      const redditItems   = (reddit.status   === "fulfilled" ? reddit.value   : []).sort((a, b) => b.score - a.score).slice(0, 40);
      const polyItems     = (poly.status     === "fulfilled" ? poly.value     : []).sort((a, b) => b.score - a.score).slice(0, 30);
      const kalshiItems   = (kalshi.status   === "fulfilled" ? kalshi.value   : []).sort((a, b) => b.score - a.score).slice(0, 20);
      const manifoldItems = (manifold.status === "fulfilled" ? manifold.value : []).sort((a, b) => b.score - a.score).slice(0, 15);
      const all = [...redditItems, ...polyItems, ...kalshiItems, ...manifoldItems].sort((a, b) => b.score - a.score);

      const ok = buildAndSet(all, silent);
      if (!ok && !silent) {
        setError("Não foi possível carregar os dados agora. Tente novamente em instantes.");
        toast.error("Falha ao carregar mercados", {
          action: { label: "Tentar novamente", onClick: () => void loadSelf(false) },
        });
      }
    } catch {
      if (!silent) {
        setError("Erro ao buscar dados. Verifique sua conexão e tente novamente.");
        toast.error("Erro de conexão", {
          description: "Verifique se o servidor está ativo.",
          action: { label: "Tentar novamente", onClick: () => void loadSelf(false) },
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [buildAndSet]);

  // persist filter preferences
  useEffect(() => { localStorage.setItem("apostas_filter",    filter);   }, [filter]);
  useEffect(() => { localStorage.setItem("apostas_catFilter", catFilter); }, [catFilter]);
  useEffect(() => { localStorage.setItem("apostas_viewMode",  viewMode);  }, [viewMode]);
  useEffect(() => { localStorage.setItem("apostas_sortBy",    sortBy);    }, [sortBy]);

  // Restore compare state from URL on first items load
  useEffect(() => {
    const ids = initialCompareIdsRef.current;
    if (!ids || ids.length === 0 || items.length === 0) return;
    initialCompareIdsRef.current = [];
    const matched = items.filter(i => ids.includes(i.id)).slice(0, 2);
    if (matched.length > 0) {
      const m = new Map<string, TrendingItem>();
      matched.forEach(i => m.set(i.id, i));
      setCompareMap(m);
    }
  }, [items]);

  // Sync compareMap to URL
  useEffect(() => {
    const ids = Array.from(compareMap.keys());
    const params = new URLSearchParams(window.location.search);
    if (ids.length > 0) {
      params.set("compare", ids.join(","));
    } else {
      params.delete("compare");
    }
    const newUrl = `${window.location.pathname}${params.size > 0 ? "?" + params.toString() : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, [compareMap]);

  // `/` shortcut → foca na busca
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName ?? "";
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // initial load
  useEffect(() => { void load(false); }, [load]);

  // auto-refresh countdown + silent reload
  useEffect(() => {
    countRef.current = REFRESH_INTERVAL;
    const timer = setInterval(() => {
      countRef.current -= 1;
      setCountdown(countRef.current);
      if (countRef.current <= 0) {
        countRef.current = REFRESH_INTERVAL;
        setCountdown(REFRESH_INTERVAL);
        void load(true);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [load]);

  const bySource = useMemo(
    () => filter === "all" ? items : items.filter((i) => i.source === filter),
    [items, filter]
  );

  const filtered = useMemo(() => {
    let result = catFilter === "all" ? bySource : bySource.filter((i) => i.normalizedCategory === catFilter);
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q));
    }
    return sortItems(result, sortBy);
  }, [bySource, catFilter, sortBy, deferredSearch]);

  // reset pagination + comparison when filters/sort change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter, catFilter, sortBy]);
  useEffect(() => { setCompareMap(new Map()); }, [filter, catFilter]);

  // Infinite scroll — incrementa visibleCount quando sentinel entra na viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setVisibleCount((n) => n + PAGE_SIZE);
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // useCallback: referência estável → o React.memo do TrendingCard funciona.
  const toggleCompare = useCallback((item: TrendingItem) => {
    setCompareMap((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) { next.delete(item.id); return next; }
      if (next.size >= 2) return prev; // max 2
      next.set(item.id, item);
      return next;
    });
  }, []);
  const compareItems = Array.from(compareMap.values());

  // Compute which categories have items AND their counts — single pass, memoized
  const { availableCats, catCounts } = useMemo(() => {
    const counts = new Map<CategoryFilter, number>();
    for (const item of bySource) {
      counts.set(item.normalizedCategory, (counts.get(item.normalizedCategory) ?? 0) + 1);
    }
    const cats = (Object.keys(CATEGORY_LABELS) as CategoryFilter[]).filter(
      (c) => c === "all" || counts.has(c)
    );
    return { availableCats: cats, catCounts: counts };
  }, [bySource]);


  return (
    <div>
      <MercadosTabs />
      {/* ── Page header — Polymarket style: tight, number-forward ── */}
      <div className="border-b border-border/30 bg-obsidian/40">
        <div className="container py-6">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 rounded-full bg-positive animate-pulse" aria-hidden="true" />
                <span className="text-[11px] font-mono text-positive/80 uppercase tracking-widest">Ao vivo</span>
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground">Mercados em Hype</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Reddit · Polymarket · Kalshi — atualização automática a cada 3 minutos
              </p>
            </div>
            {/* Live stat pills */}
            {!loading && items.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="px-3 py-1.5 rounded-lg bg-secondary/30 border border-border/30 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Mercados</p>
                  <p className="text-lg font-mono font-bold text-foreground">{items.length}</p>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-secondary/30 border border-border/30 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Atualizado</p>
                  <p className="text-sm font-mono text-foreground">
                    {lastUpdated?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) ?? "—"}
                  </p>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-secondary/30 border border-border/30 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Refresh em</p>
                  <p className="text-sm font-mono font-bold text-foreground">
                    {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container py-6">
        {/* ── Onde a JLB discorda do mercado ── */}
        <DivergencesSection />

        {/* ── Control bar — Kalshi-style horizontal strip ── */}
        <AnimatedSection>
          <div className="mb-5 space-y-3">
            {/* Row 1: source + category tabs */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
              {/* Source pills */}
              {(["all", "reddit", "polymarket", "kalshi", "manifold"] as Filter[]).map((src) => {
                const LABELS: Record<Filter, string> = { all: "Todos", reddit: "Reddit", polymarket: "Polymarket", kalshi: "Kalshi", manifold: "Manifold" };
                return (
                  <button key={src}
                    onClick={() => { setFilter(src); setCatFilter("all"); }}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      filter === src
                        ? "bg-foreground text-background border-foreground"
                        : "border-border/40 text-muted-foreground hover:text-foreground hover:border-border/70"
                    }`}>
                    {LABELS[src]}
                  </button>
                );
              })}

              <div className="w-px h-5 bg-border/40 mx-1 shrink-0" />

              {/* Category pills */}
              {!loading && availableCats.filter((c) => c !== "all").map((cat) => (
                <button key={cat}
                  onClick={() => setCatFilter(catFilter === cat ? "all" : cat)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    catFilter === cat
                      ? "border-gold/50 bg-gold/10 text-gold"
                      : "border-border/30 text-muted-foreground/70 hover:text-foreground hover:border-border/50"
                  }`}>
                  {CATEGORY_LABELS[cat]}
                  <span className="ml-1 opacity-50">{catCounts.get(cat) ?? 0}</span>
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <input
                ref={searchRef}
                type="search"
                aria-label="Buscar mercados"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar mercados… (/ para focar)"
                className="w-full sm:w-72 pl-8 pr-3 py-1.5 rounded-lg text-xs bg-secondary/30 border border-border/30 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </div>

            {/* Row 2: sort + view + actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Sort */}
              <div className="flex items-center gap-1 bg-secondary/30 rounded-lg p-0.5 border border-border/20">
                <ArrowUpDown className="w-3 h-3 text-muted-foreground ml-2 shrink-0" aria-hidden="true" />
                {SORT_OPTIONS.map((opt) => (
                  <button key={opt.id}
                    onClick={() => setSortBy(opt.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      sortBy === opt.id
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* View mode toggle */}
              <div className="flex items-center bg-secondary/30 rounded-lg p-0.5 border border-border/20">
                <button onClick={() => setViewMode("grid")}
                  title="Visualização em grade"
                  className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button onClick={() => setViewMode("list")}
                  title="Visualização em lista"
                  className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  <List className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button onClick={() => setViewMode("compact")} title="Compacto"
                  className={`p-1.5 rounded-md transition-colors ${viewMode === "compact" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  <AlignJustify className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                {newCount > 0 && (
                  <button onClick={() => setNewCount(0)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-positive/10 border border-positive/30 text-positive animate-pulse">
                    +{newCount} novo{newCount > 1 ? "s" : ""}
                  </button>
                )}
                {typeof Notification !== "undefined" && notifPerm !== "denied" && (
                  <button
                    onClick={async () => {
                      const perm = await Notification.requestPermission();
                      setNotifPerm(perm);
                      if (perm === "granted") toast("Notificações ativadas", { description: "Alertas quando prob. mover ≥5pp." });
                    }}
                    title={notifPerm === "granted" ? "Notificações ativas" : "Ativar alertas de movimento"}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      notifPerm === "granted"
                        ? "border-positive/30 bg-positive/5 text-positive"
                        : "border-border/30 text-muted-foreground hover:text-foreground"
                    }`}>
                    {notifPerm === "granted" ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                  </button>
                )}
                <button
                  onClick={() => { void load(false); countRef.current = REFRESH_INTERVAL; setCountdown(REFRESH_INTERVAL); }}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/50 transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
                  Atualizar
                </button>
              </div>
            </div>
          </div>
        </AnimatedSection>

        {error && !loading && (
          <AnimatedSection>
            <div className="mb-5 p-3 rounded-xl border border-warning/20 bg-warning/8 flex gap-3">
              <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </AnimatedSection>
        )}

        {/* ── Market list view (Kalshi-inspired table) ── */}
        {!loading && viewMode === "list" && filtered.length > 0 && (
          <AnimatedSection>
            <div className="glass-card rounded-xl overflow-hidden mb-6">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_64px] sm:grid-cols-[1fr_80px_90px_90px_100px] gap-3 sm:gap-4 px-4 py-2.5 border-b border-border/30 bg-secondary/10">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Mercado</p>
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">SIM</p>
                <p className="hidden sm:block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Volume</p>
                <p className="hidden sm:block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Hype</p>
                <p className="hidden sm:block text-[10px] font-semibold text-muted-foreground uppercase tracking-wider text-right">Fonte</p>
              </div>
              {/* Rows */}
              <div className="divide-y divide-border/20">
                {filtered.slice(0, visibleCount).map((item) => {
                  const pct = item.yesProb !== undefined ? parseFloat((item.yesProb * 100).toFixed(1)) : null;
                  const pctColor = pct === null ? "text-muted-foreground" : pct >= 70 ? "text-positive" : pct <= 30 ? "text-negative" : "text-gold";
                  return (
                    <div key={item.id} className="grid grid-cols-[1fr_64px] sm:grid-cols-[1fr_80px_90px_90px_100px] gap-3 sm:gap-4 px-4 py-3 hover:bg-secondary/10 transition-colors items-center">
                      {/* Title */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          {item.badge && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${BADGE_CONFIG[item.badge].cls}`}>
                              {BADGE_CONFIG[item.badge].label}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground line-clamp-1">{item.title}</p>
                        {item.parsedOutcomes && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{item.parsedOutcomes.length} resultados</p>
                        )}
                      </div>
                      {/* Prob */}
                      <div className="text-right">
                        {pct !== null ? (
                          <>
                            <p className={`text-base font-mono font-bold ${pctColor}`}>{pct}%</p>
                            <p className="text-[9px] text-muted-foreground">SIM</p>
                          </>
                        ) : (
                          <p className="text-sm text-muted-foreground">—</p>
                        )}
                      </div>
                      {/* Volume */}
                      <div className="hidden sm:block text-right">
                        <p className="text-sm font-mono text-foreground">{item.volume ? formatVolume(item.volume) : "—"}</p>
                        {item.volume24h && <p className="text-[9px] text-neon-blue">{formatVolume(item.volume24h)} 24h</p>}
                      </div>
                      {/* Hype bar */}
                      <div className="hidden sm:flex items-center justify-end gap-1.5">
                        <div className="w-16 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${item.score >= 70 ? "bg-positive" : item.score >= 40 ? "bg-gold" : "bg-primary/50"}`}
                            style={{ width: `${item.score}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{Math.round(item.score)}%</span>
                      </div>
                      {/* Source + link */}
                      <div className="hidden sm:flex items-center justify-end gap-1.5">
                        <SourceBadge source={item.source} subreddit={item.subreddit} />
                        <a href={item.externalUrl} target="_blank" rel="noopener noreferrer"
                          className="p-1 rounded text-muted-foreground/40 hover:text-primary transition-colors">
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </AnimatedSection>
        )}

        {/* ── Compact view ── */}
        {!loading && viewMode === "compact" && filtered.length > 0 && (
          <AnimatedSection>
            <div className="glass-card rounded-xl overflow-hidden mb-6">
              {filtered.slice(0, visibleCount).map((item) => (
                <CompactRow
                  key={item.id}
                  item={item}
                  onCompare={toggleCompare}
                  inCompare={compareMap.has(item.id)}
                  onWatch={(i) => {
                    if (watchedSet.has(i.id)) {
                      removeFromWatchlist(i.id);
                      setWatchedSet((prev) => { const s = new Set(prev); s.delete(i.id); return s; });
                      toast("Removido da watchlist");
                    } else {
                      addToWatchlist({ id: i.id, title: i.title, source: i.source as "polymarket" | "kalshi" | "reddit", yesProb: i.yesProb, externalUrl: i.externalUrl, category: i.normalizedCategory });
                      void syncPushWatchlist();
                      setWatchedSet((prev) => new Set(prev).add(i.id));
                      toast("Adicionado à watchlist", { description: "Visível no Dashboard." });
                    }
                  }}
                  watched={watchedSet.has(item.id)}
                />
              ))}
            </div>
          </AnimatedSection>
        )}

        {/* ── Grid view ── */}
        {(viewMode === "grid" || loading) && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {loading
              ? Array.from({ length: 9 }).map((_, i) => <LoadingSkeleton key={i} />)
              : filtered.slice(0, visibleCount).map((item) => (
                  <TrendingCard key={item.id} item={item}
                    onCompare={toggleCompare}
                    inCompare={compareMap.has(item.id)}
                  />
                ))
            }
          </div>
        )}

        {/* ── Infinite scroll sentinel ── */}
        {!loading && filtered.length > visibleCount && (
          <div ref={sentinelRef} className="flex justify-center items-center gap-2 py-6 text-xs text-muted-foreground/50">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
            Carregando mais · {filtered.length - visibleCount} restantes
          </div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <AnimatedSection>
            <div className="text-center py-16">
              <Flame className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground/50 mb-1">Nenhum mercado para este filtro</p>
              <p className="text-xs text-muted-foreground/40">Tente "Todos" ou outro filtro de categoria</p>
            </div>
          </AnimatedSection>
        )}

        {!loading && filtered.length > 0 && (viewMode === "list" || viewMode === "compact") && (
          <p className="text-xs text-muted-foreground text-center mb-4">
            {filtered.length} mercados · Clique nos cards (modo grade) para análise completa e calculadora de edge
          </p>
        )}

        {!loading && (
          <AnimatedSection>
            <div className={`mt-6 p-3 rounded-xl border border-border/15 bg-obsidian/20 ${compareMap.size > 0 ? "mb-44" : ""}`}>
              <p className="text-[11px] text-muted-foreground/60 text-center leading-relaxed">
                Caráter educacional e informativo. Nenhum conteúdo constitui recomendação de aposta ou investimento.
                Apostar envolve risco de perda. Jogue com responsabilidade.
              </p>
            </div>
          </AnimatedSection>
        )}
      </div>

      {/* Sticky comparison panel */}
      {compareMap.size > 0 && (
        <ComparePanel items={compareItems} onClear={() => setCompareMap(new Map())} />
      )}
    </div>
  );
}
