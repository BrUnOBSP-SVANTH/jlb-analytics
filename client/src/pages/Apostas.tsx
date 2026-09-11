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
  type TrendingItem, type CategoryFilter, CATEGORY_LABELS, formatVolume, fetchRedditSub, fetchPolymarketSports, fetchManifold, fetchKalshi, intercalarPorFonte, REDDIT_SUBS,
} from "@/lib/trending";
import { SourceBadge, BADGE_CONFIG } from "@/components/mercados/cards";
import { TrendingCard } from "@/components/mercados/TrendingCard";
import { ComparePanel } from "@/components/mercados/ComparePanel";
import { MercadoLinha, EixoDeProbabilidade } from "@/components/mercados/MercadoLinha";
import { LoadingSkeleton } from "@/components/mercados/LoadingSkeleton";
import { DivergencesSection } from "@/components/mercados/DivergencesSection";
import { casaBusca } from "@/lib/marketSearch";
import { ehSobreBrasil } from "@/lib/brasil";
import { num } from "@shared/formato";

// ─── Helpers ──────────────────────────────────────────────────────────────────

// formatAge foi para components/mercados/TrendingCard.tsx (único consumidor).

// ─── Comparison Panel ─────────────────────────────────────────────────────────

// ─── Main page ────────────────────────────────────────────────────────────────

type Filter = "all" | "reddit" | "polymarket" | "kalshi" | "manifold";
type ViewMode = "grid" | "list";
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
  useSEO("Mercados Ao Vivo", "Mercados preditivos em tempo real do Polymarket e Kalshi com probabilidades, volume, divergências da IA e análise contextual.");
  const [items, setItems]           = useState<TrendingItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [filter, setFilter]         = useState<Filter>(() => (localStorage.getItem("apostas_filter") as Filter) ?? "all");
  const [catFilter, setCatFilter]   = useState<CategoryFilter>(() => (localStorage.getItem("apostas_catFilter") as CategoryFilter) ?? "all");
  // NEG-04: "tem alguma coisa daqui?" é a pergunta mais óbvia de quem chega.
  const [soBrasil, setSoBrasil] = useState(false);
  const [viewMode, setViewMode]     = useState<ViewMode>(() => (localStorage.getItem("apostas_viewMode") as ViewMode) ?? "list");
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
    const dir = latestAlert.delta > 0 ? `+${num(latestAlert.delta, 1)}pp ↑` : `${num(latestAlert.delta, 1)}pp ↓`;
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
          const dir = a.delta > 0 ? `+${num(a.delta, 1)}pp ↑` : `${num(a.delta, 1)}pp ↓`;
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
      // Cota por fonte para nenhuma sufocar as outras. As cotas subiram muito em
      // 31/08 (poly 30→120, kalshi 20→100): elas eram o ÚLTIMO de quatro cortes
      // empilhados — servidor, cache, trending e aqui — e o efeito somado era o
      // site mostrar 50 mercados das duas bolsas quando existiam centenas vivos.
      // O que aparece na tela continua paginado por PAGE_SIZE (rolagem infinita),
      // então a lista maior não pesa na renderização: só dá mais o que rolar.
      const redditItems   = (reddit.status   === "fulfilled" ? reddit.value   : []).sort((a, b) => b.score - a.score).slice(0, 60);
      const polyItems     = (poly.status     === "fulfilled" ? poly.value     : []).sort((a, b) => b.score - a.score).slice(0, 120);
      const kalshiItems   = (kalshi.status   === "fulfilled" ? kalshi.value   : []).sort((a, b) => b.score - a.score).slice(0, 100);
      const manifoldItems = (manifold.status === "fulfilled" ? manifold.value : []).sort((a, b) => b.score - a.score).slice(0, 30);
      // MKT-05: `sort` é ESTÁVEL e as três fontes empatam em score 100, então a
      // ordem desta concatenação virava a ordem da TELA — 20 de 20 cards eram
      // Polymarket, embaixo de um subtítulo que promete "Reddit · Polymarket ·
      // Kalshi". `intercalarPorFonte` faz o rodízio depois de ordenar.
      const all = intercalarPorFonte(
        [...redditItems, ...polyItems, ...kalshiItems, ...manifoldItems].sort((a, b) => b.score - a.score),
      );

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

  /**
   * Ligar/desligar o acompanhamento. Estava escrito por extenso em três lugares
   * (grade, lista e compacta) — três cópias da mesma regra é três regras que por
   * acaso coincidem hoje.
   */
  const alternarWatchlist = useCallback((i: TrendingItem) => {
    if (watchedSet.has(i.id)) {
      removeFromWatchlist(i.id);
      setWatchedSet((prev) => { const s = new Set(prev); s.delete(i.id); return s; });
      toast("Removido da watchlist");
      return;
    }
    addToWatchlist({
      id: i.id, title: i.title,
      source: i.source as "polymarket" | "kalshi" | "reddit",
      yesProb: i.yesProb, externalUrl: i.externalUrl, category: i.normalizedCategory,
    });
    void syncPushWatchlist();
    setWatchedSet((prev) => new Set(prev).add(i.id));
    toast("Adicionado à watchlist", { description: "Aparece no seu Dashboard." });
  }, [watchedSet]);

  const bySource = useMemo(
    () => filter === "all" ? items : items.filter((i) => i.source === filter),
    [items, filter]
  );

  /**
   * O filtro Brasil só aparece quando há mercado brasileiro no catálogo.
   *
   * Um filtro que sempre devolve zero é pior que filtro nenhum: ele promete
   * conteúdo, entrega vazio e ainda faz o site parecer quebrado. Medido em
   * 10/09/2026: 3 mercados de 150, todos sobre a eleição.
   */
  const temBrasil = useMemo(() => items.some((i) => ehSobreBrasil(i.title, i.category)), [items]);

  const filtered = useMemo(() => {
    let result = catFilter === "all" ? bySource : bySource.filter((i) => i.normalizedCategory === catFilter);
    // NEG-04: o recorte que faltava. Nos 20 primeiros mercados a auditoria só
    // encontrou US Open, primárias americanas, Fed e Champions — e o único
    // conteúdo brasileiro estava escondido, em inglês, sem como filtrar.
    if (soBrasil) result = result.filter((i) => ehSobreBrasil(i.title, i.category));
    if (deferredSearch.trim()) {
      // Busca BILÍNGUE: as bolsas publicam em inglês (medido: 0% dos 600 títulos
      // em português) e o público é brasileiro. Antes, buscar "eleição" devolvia
      // zero sobre um catálogo com 51 mercados de "election".
      result = result.filter((i) => casaBusca(i.title, deferredSearch, i.category));
    }
    return sortItems(result, sortBy);
  }, [bySource, catFilter, sortBy, deferredSearch, soBrasil]);

  // reset pagination + comparison when filters/sort change
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter, catFilter, sortBy, soBrasil]);
  useEffect(() => { setCompareMap(new Map()); }, [filter, catFilter, soBrasil]);

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
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              {/* "Em Hype" era jargão, e em inglês. O que esta tela é: o que os
                  mercados estão precificando agora. */}
              <h1 className="text-2xl font-display font-bold text-[var(--titulo)]">Mercados ao vivo</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-xl">
                O que Polymarket, Kalshi e Manifold estão precificando agora, com a nossa leitura ao lado.
              </p>
            </div>

            {/* Os três blocos em caixa alta ("MERCADOS / ATUALIZADO / PRÓXIMA")
                viraram uma frase. Eram rótulo de sistema com moldura de card, o
                tratamento de dashboard genérico: três números boxeados no canto,
                nenhum deles a resposta de uma pergunta que alguém tenha feito.
                Uma frase diz a mesma coisa e cabe numa linha. */}
            {!loading && items.length > 0 && (
              <p className="text-[0.8125rem] text-muted-foreground flex items-center gap-2 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" aria-hidden="true" />
                <span>
                  <span className="font-mono tabular-nums text-foreground">{filtered.length}</span>
                  {filtered.length !== items.length && <> de <span className="font-mono tabular-nums">{items.length}</span></>}
                  {" "}mercados
                </span>
                <span aria-hidden="true">·</span>
                {/* aria-live: a lista se atualiza sozinha a cada 3 minutos e nada
                    anunciava isso a quem usa leitor de tela (TRV-14). */}
                <span aria-live="polite">
                  {lastUpdated
                    ? <>atualizado {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</>
                    : "atualizando"}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  próxima em <span className="font-mono tabular-nums">
                    {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
                  </span>
                </span>
              </p>
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
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none rolagem-lateral pb-1">
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

              {/* Brasil: separado das fontes de propósito — é um recorte de
                  ASSUNTO, não de origem, e some quando o catálogo não tem
                  nenhum, para não prometer o que não existe. */}
              {temBrasil && (
                <>
                  <div className="w-px h-5 bg-border/40 mx-1 shrink-0" aria-hidden="true" />
                  <button
                    onClick={() => setSoBrasil((v) => !v)}
                    aria-pressed={soBrasil}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      soBrasil
                        ? "bg-positive text-background border-positive"
                        : "border-positive/40 text-positive hover:bg-positive/10"
                    }`}>
                    🇧🇷 Brasil
                  </button>
                </>
              )}

              <div className="w-px h-5 bg-border/40 mx-1 shrink-0" aria-hidden="true" />

              {/* Category pills */}
              {!loading && availableCats.filter((c) => c !== "all").map((cat) => (
                <button key={cat}
                  onClick={() => setCatFilter(catFilter === cat ? "all" : cat)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    catFilter === cat
                      ? "border-gold/50 bg-gold/10 text-gold"
                      : "border-border/30 text-muted-foreground hover:text-foreground hover:border-border/50"
                  }`}>
                  {CATEGORY_LABELS[cat]}
                  <span className="ml-1 opacity-50">{catCounts.get(cat) ?? 0}</span>
                </button>
              ))}
            </div>

            {/* Fileira 2: busca, ordenação e modo — juntas. Eram TRÊS fileiras
                de controle antes do primeiro mercado da tela. */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Busca */}
              <div className="relative">
                <input
                  ref={searchRef}
                  type="search"
                  aria-label="Buscar mercados"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar mercados… (/ para focar)"
                  className="w-full sm:w-72 pl-8 pr-3 py-1.5 rounded-lg text-xs bg-secondary/30 border border-border/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                </svg>
              </div>



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

        {/* MKT-07: a mensagem de erro existia, o botão de REPETIR não. Sem ele
            a única saída é recarregar a página inteira — e o erro aqui costuma
            ser uma fonte lenta que responde na segunda tentativa. */}
        {error && !loading && (
          <AnimatedSection>
            <div className="mb-5 p-3 rounded-xl border border-warning/20 bg-warning/8 flex gap-3 items-start">
              <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-sm text-muted-foreground flex-1">{error}</p>
              <button
                onClick={() => { void load(false); }}
                className="alvo-toque shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-warning/40 text-xs font-semibold text-warning hover:bg-warning/10 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Tentar de novo
              </button>
            </div>
          </AnimatedSection>
        )}

        {/* ── Market list view (Kalshi-inspired table) ── */}
        {/* ── A LISTA (padrão) ──
            Substitui a tabela e o modo compacto, que eram a mesma informação em
            duas densidades e nenhuma das duas desenhada. Ver
            components/mercados/MercadoLinha.tsx para a decisão que carrega o
            desenho: a linha É a barra. */}
        {!loading && viewMode === "list" && filtered.length > 0 && (
          <div className="relative rounded-xl border border-border/30 overflow-hidden mb-8 bg-background">
            <EixoDeProbabilidade />
            {filtered.slice(0, visibleCount).map((item) => (
              <MercadoLinha
                key={item.id}
                item={item}
                onCompare={toggleCompare}
                inCompare={compareMap.has(item.id)}
                onWatch={alternarWatchlist}
                watched={watchedSet.has(item.id)}
              />
            ))}
          </div>
        )}

        {/* ── Grid view ── */}
        {(viewMode === "grid" || loading) && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
            {loading
              ? Array.from({ length: 9 }).map((_, i) => <LoadingSkeleton key={i} />)
              : filtered.slice(0, visibleCount).map((item, i) => (
                  <TrendingCard key={item.id} item={item} indice={i}
                    onCompare={toggleCompare}
                    inCompare={compareMap.has(item.id)}
                  />
                ))
            }
          </div>
        )}

        {/* ── Infinite scroll sentinel ── */}
        {!loading && filtered.length > visibleCount && (
          /* O spinner girava para sempre: ele não está carregando nada — está
             esperando você rolar até ele. Movimento permanente sem processo por
             trás lê como travado, e ensina a ignorar spinner de verdade. */
          <div ref={sentinelRef} className="flex justify-center py-8 text-[0.8125rem] text-muted-foreground">
            mais {filtered.length - visibleCount} {filtered.length - visibleCount === 1 ? "mercado" : "mercados"} abaixo
          </div>
        )}

        {!loading && filtered.length === 0 && !error && (
          <AnimatedSection>
            {/* O vazio sugeria a saída em TEXTO ("tente Todos"), sem botão —
                deixando o trabalho de desfazer o filtro para o usuário. */}
            <div className="text-center py-16">
              <Flame className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground mb-1">Nenhum mercado com este filtro agora</p>
              <p className="text-xs text-muted-foreground mb-4">
                Isso acontece: as fontes têm coberturas diferentes e algumas categorias ficam vazias por horas.
              </p>
              <button
                onClick={() => { setFilter("all"); setCatFilter("all"); }}
                className="alvo-toque inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border/40 text-xs font-semibold text-foreground hover:border-primary/40 transition-colors">
                Ver todos os mercados
              </button>
            </div>
          </AnimatedSection>
        )}

        {!loading && filtered.length > 0 && viewMode === "list" && (
          <p className="text-xs text-muted-foreground text-center mb-4">
            A barra é a chance que o mercado dá ao desfecho principal. Clique no título para abrir o
            mercado, ou na seta para ver a nossa análise sem sair da lista.
          </p>
        )}

        {!loading && (
          <AnimatedSection>
            <div className={`mt-6 p-3 rounded-xl border border-border/15 bg-obsidian/20 ${compareMap.size > 0 ? "mb-44" : ""}`}>
              <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                Caráter educacional e informativo. Nada aqui é recomendação de posição ou investimento.
                Prever é errar parte das vezes — é para isso que a plataforma mede e publica os próprios erros.
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
