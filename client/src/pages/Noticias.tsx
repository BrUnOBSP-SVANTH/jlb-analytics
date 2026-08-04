/**
 * Notícias — JLB Analytics
 * Mercados Polymarket (Gamma API, direta do cliente) + Reddit (JSON API pública).
 * Prediction Tracker: registre sua estimativa, acompanhe o Brier Score acumulado.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import {
  Newspaper, TrendingUp, RefreshCw, AlertCircle, Loader2, Check,
  Target, BarChart2, Search, BookOpen,
} from "lucide-react";
import MercadosTabs from "@/components/MercadosTabs";
import { PostCard, ArticleCard, ArticleCardSkeleton, ARTICLE_TOPICS } from "@/components/noticias/cards";
import { MarketCard } from "@/components/noticias/MarketCard";
import { KalshiCard } from "@/components/noticias/KalshiCard";
import { fetchPolymarketDirect, fetchKalshiMarkets, fetchRedditPosts, SUBREDDITS } from "@/lib/noticiasData";
import { type Article, type PolyMarket, type KalshiMarket, type RedditPost } from "@/lib/noticiasShared";
import { ArticleDetailModal } from "@/components/noticias/AnalysisModals";
import { loadPredictions, type StoredPrediction } from "@/lib/predictions";
import { useSEO } from "@/hooks/useSEO";

// ── Articles ───────────────────────────────────────────────────────────────


interface ArticlesResponse {
  articles: Article[];
  source?: string;
  count?: number;
  error?: string;
}
// ── Main page ──────────────────────────────────────────────────────────────

type Tab = "markets" | "kalshi" | "news" | "articles";

export default function Noticias() {
  useSEO("Notícias dos Mercados", "Notícias que movem os mercados preditivos, cruzadas com probabilidades ao vivo e análise de IA.");
  const [tab, setTab] = useState<Tab>("markets");
  const [markets, setMarkets] = useState<PolyMarket[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [errorMarkets, setErrorMarkets] = useState<string | null>(null);
  const [kalshiMarkets, setKalshiMarkets] = useState<KalshiMarket[]>([]);
  const [loadingKalshi, setLoadingKalshi] = useState(false);
  const [errorKalshi, setErrorKalshi] = useState<string | null>(null);
  const [posts, setPosts] = useState<RedditPost[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [errorNews, setErrorNews] = useState<string | null>(null);

  // Articles state
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [errorArticles, setErrorArticles] = useState<string | null>(null);
  const [articleQuery, setArticleQuery] = useState("polymarket OR mercados preditivos OR apostas esportivas");
  const [articleSearch, setArticleSearch] = useState("");

  // Track which market IDs already have a saved prediction in this session
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    const preds = loadPredictions();
    return new Set<string>(preds.map((p) => p.marketId));
  });

  const [recentSaves, setRecentSaves] = useState<StoredPrediction[]>([]);
  const feedbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  // O flag "featured" da Gamma API vem em ~80% dos eventos — badge em todo card
  // não destaca nada. Estrela só nos 3 featured de maior volume.
  const topFeaturedIds = useMemo(() => new Set(
    markets
      .filter((m) => m.featured)
      .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
      .slice(0, 3)
      .map((m) => m.id)
  ), [markets]);

  const fetchMarkets = useCallback(async () => {
    setLoadingMarkets(true);
    setErrorMarkets(null);
    try {
      setMarkets(await fetchPolymarketDirect());
    } catch (err) {
      setErrorMarkets(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoadingMarkets(false);
    }
  }, []);

  const fetchNews = useCallback(async () => {
    setLoadingNews(true);
    setErrorNews(null);
    try {
      const results = await Promise.allSettled(SUBREDDITS.map(fetchRedditPosts));
      const all: RedditPost[] = [];
      results.forEach((r) => { if (r.status === "fulfilled") all.push(...r.value); });
      if (all.length === 0) throw new Error("Nenhum post retornado pelo Reddit");
      const seen = new Set<string>();
      const deduped = all
        .sort((a, b) => b.score - a.score)
        .filter((p) => { if (seen.has(p.title)) return false; seen.add(p.title); return true; });
      setPosts(deduped.slice(0, 30));
    } catch (err) {
      setErrorNews(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoadingNews(false);
    }
  }, []);

  const fetchKalshi = useCallback(async () => {
    setLoadingKalshi(true);
    setErrorKalshi(null);
    try {
      setKalshiMarkets(await fetchKalshiMarkets());
    } catch (err) {
      setErrorKalshi(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoadingKalshi(false);
    }
  }, []);

  const fetchArticles = useCallback(async (q?: string) => {
    setLoadingArticles(true);
    setErrorArticles(null);
    const query = q ?? articleQuery;
    try {
      const res = await fetch(`/api/articles?q=${encodeURIComponent(query)}&pageSize=18`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as ArticlesResponse;
      if (data.error) throw new Error(data.error);
      setArticles(data.articles ?? []);
    } catch (err) {
      setErrorArticles(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoadingArticles(false);
    }
  }, [articleQuery]);

  useEffect(() => { void fetchMarkets(); }, [fetchMarkets]);
  useEffect(() => {
    if (tab === "kalshi" && kalshiMarkets.length === 0 && !loadingKalshi) void fetchKalshi();
  }, [tab, kalshiMarkets.length, loadingKalshi, fetchKalshi]);
  useEffect(() => {
    if (tab === "news" && posts.length === 0 && !loadingNews) void fetchNews();
  }, [tab, posts.length, loadingNews, fetchNews]);
  useEffect(() => {
    if (tab === "articles" && articles.length === 0 && !loadingArticles) void fetchArticles();
  }, [tab, articles.length, loadingArticles, fetchArticles]);
  function handleSaved(p: StoredPrediction) {
    setSavedIds((prev) => { const next = new Set<string>(Array.from(prev)); next.add(p.marketId); return next; });
    setRecentSaves((prev) => [p, ...prev].slice(0, 3));
    if (feedbackRef.current) clearTimeout(feedbackRef.current);
    feedbackRef.current = setTimeout(() => setRecentSaves([]), 4000);
  }

  function handleTopicSelect(q: string) {
    setArticleQuery(q);
    setArticleSearch("");
    setArticles([]);
    void fetchArticles(q);
  }

  function handleArticleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!articleSearch.trim()) return;
    const q = articleSearch.trim();
    setArticleQuery(q);
    setArticles([]);
    void fetchArticles(q);
  }

  const loading = tab === "markets" ? loadingMarkets : tab === "kalshi" ? loadingKalshi : tab === "articles" ? loadingArticles : loadingNews;
  const error   = tab === "markets" ? errorMarkets   : tab === "kalshi" ? errorKalshi   : tab === "articles" ? errorArticles   : errorNews;
  const refresh = tab === "markets" ? fetchMarkets   : tab === "kalshi" ? fetchKalshi   : tab === "articles" ? () => fetchArticles() : fetchNews;
  const totalPredictions = loadPredictions().length;

  return (
    <div>
      <MercadosTabs />
      <PageHeader
        title="Mercados Preditivos"
        subtitle="Polymarket · Kalshi · Reddit · Artigos — registe as suas estimativas e acompanhe o Brier Score."
        badge="Dados de Contexto"
      />

      <div className="container py-10 space-y-8">
        {/* Tab bar + prediction counter */}
        <AnimatedSection>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary/30">
              <button
                onClick={() => setTab("markets")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === "markets" ? "bg-gold text-on-accent shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <TrendingUp className="w-4 h-4" aria-hidden="true" />
                Polymarket
              </button>
              <button
                onClick={() => setTab("kalshi")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === "kalshi" ? "bg-gold text-on-accent shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BarChart2 className="w-4 h-4" aria-hidden="true" />
                Kalshi
              </button>
              <button
                onClick={() => setTab("news")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === "news" ? "bg-gold text-on-accent shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Newspaper className="w-4 h-4" aria-hidden="true" />
                Comunidade
              </button>
              <button
                onClick={() => setTab("articles")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  tab === "articles" ? "bg-gold text-on-accent shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BookOpen className="w-4 h-4" aria-hidden="true" />
                Artigos
              </button>
            </div>

            {totalPredictions > 0 && (
              <a href="/dashboard" className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gold/30 bg-gold/5 text-xs text-gold hover:bg-gold/10 transition-colors">
                <Target className="w-3.5 h-3.5" />
                {totalPredictions} {totalPredictions > 1 ? "previsões registradas" : "previsão registrada"}
              </a>
            )}
          </div>

        </AnimatedSection>

        {/* Recent save toast */}
        {recentSaves.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-positive/30 bg-positive/5">
            <Check className="w-4 h-4 text-positive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-positive">Previsão registrada</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{recentSaves[0].question}</p>
              <p className="text-xs text-muted-foreground">
                Sua estimativa: <span className="font-mono text-foreground">{recentSaves[0].userProb}%</span>
                {" "}· Mercado: <span className="font-mono">{recentSaves[0].marketProb.toFixed(1)}%</span>
                {" "}· Edge: <span className={`font-mono ${recentSaves[0].userProb - recentSaves[0].marketProb > 0 ? "text-positive" : "text-negative"}`}>
                  {recentSaves[0].userProb - recentSaves[0].marketProb > 0 ? "+" : ""}
                  {(recentSaves[0].userProb - recentSaves[0].marketProb).toFixed(1)}pp
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {tab === "markets"
              ? markets.length > 0 ? `${markets.length} mercados · maior volume no Polymarket` : ""
              : tab === "kalshi"
              ? kalshiMarkets.length > 0 ? `${kalshiMarkets.length} mercados · Kalshi (EUA)` : ""
              : tab === "articles"
              ? articles.length > 0 ? `${articles.length} artigos` : ""
              : posts.length > 0 ? `${posts.length} posts · r/Polymarket + r/predictionmarkets` : ""}
          </p>
          <button
            onClick={() => void refresh()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Atualizar
          </button>
        </div>

        {/* Error */}
        {error && !loading && (
          <AnimatedSection>
            <div className="flex items-start gap-3 p-4 rounded-xl bg-negative/10 border border-negative/30" role="alert">
              <AlertCircle className="w-4 h-4 text-negative shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-negative">Erro ao carregar</p>
                <p className="text-xs text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          </AnimatedSection>
        )}

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="glass-card rounded-xl p-4 animate-pulse h-44">
                <div className="h-3 bg-secondary/50 rounded w-3/4 mb-3" />
                <div className="h-3 bg-secondary/50 rounded w-full mb-2" />
                <div className="h-3 bg-secondary/50 rounded w-1/2 mb-4" />
                <div className="h-8 bg-secondary/30 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* Markets */}
        {!loading && tab === "markets" && markets.length > 0 && (
          <AnimatedSection>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {markets.map((m) => (
                <MarketCard key={m.id} market={m} savedIds={savedIds} onSaved={handleSaved} highlight={topFeaturedIds.has(m.id)} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-6">
              Dados:{" "}
              <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="text-gold underline underline-offset-2 decoration-gold/40 hover:decoration-gold">Polymarket</a>
              {" "}via Gamma API · Probabilidades implícitas do mercado de previsão.
            </p>
          </AnimatedSection>
        )}

        {/* Kalshi */}
        {!loading && tab === "kalshi" && kalshiMarkets.length > 0 && (
          <AnimatedSection>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {kalshiMarkets.map((m) => (
                <KalshiCard key={m.ticker} market={m} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-6">
              Dados:{" "}
              <a href="https://kalshi.com" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">Kalshi</a>
              {" "}via Trading API · Mercados preditivos regulamentados nos EUA.
            </p>
          </AnimatedSection>
        )}

        {/* Reddit */}
        {!loading && tab === "news" && posts.length > 0 && (
          <AnimatedSection>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {posts.map((p) => <PostCard key={p.permalink} post={p} />)}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-6">
              {SUBREDDITS.map((s, i) => (
                <span key={s}>
                  <a href={`https://reddit.com/r/${s}`} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">r/{s}</a>
                  {i < SUBREDDITS.length - 1 ? " · " : ""}
                </span>
              ))}
            </p>
          </AnimatedSection>
        )}

        {/* Articles */}
        {tab === "articles" && (
          <AnimatedSection>
            {/* Search bar */}
            <form onSubmit={handleArticleSearch} className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                <input
                  type="text"
                  value={articleSearch}
                  onChange={(e) => setArticleSearch(e.target.value)}
                  placeholder="Buscar artigos…"
                  className="w-full pl-9 pr-4 py-2 rounded-lg bg-secondary/30 border border-border/40 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/40 transition-colors"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-gold text-on-accent text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Buscar
              </button>
            </form>

            {/* Topic chips */}
            <div className="flex flex-wrap gap-2 mb-6">
              {ARTICLE_TOPICS.map((t) => (
                <button
                  key={t.query}
                  onClick={() => handleTopicSelect(t.query)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    articleQuery === t.query
                      ? "bg-gold/20 border-gold/40 text-gold"
                      : "bg-secondary/30 border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Loading skeletons */}
            {loadingArticles && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => <ArticleCardSkeleton key={i} />)}
              </div>
            )}

            {/* Error */}
            {errorArticles && !loadingArticles && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-negative/10 border border-negative/30" role="alert">
                <AlertCircle className="w-4 h-4 text-negative shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-negative">Erro ao carregar artigos</p>
                  <p className="text-xs text-muted-foreground mt-1">{errorArticles}</p>
                </div>
              </div>
            )}

            {/* Articles grid */}
            {!loadingArticles && !errorArticles && articles.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {articles.map((a, i) => (
                  <ArticleCard
                    key={`${a.url}-${i}`}
                    article={a}
                    onCardClick={setSelectedArticle}
                  />
                ))}
              </div>
            )}

            {/* Empty */}
            {!loadingArticles && !errorArticles && articles.length === 0 && (
              <div className="text-center py-20">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Aguardando artigos…</p>
              </div>
            )}
          </AnimatedSection>
        )}

        {/* Empty / waiting */}
        {!loading && !error && (
          (tab === "markets" && markets.length === 0) ||
          (tab === "news" && posts.length === 0)
        ) && (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Aguardando dados…</p>
          </div>
        )}
      </div>

      {/* Article detail modal */}
      {selectedArticle && (
        <ArticleDetailModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}

    </div>
  );
}
