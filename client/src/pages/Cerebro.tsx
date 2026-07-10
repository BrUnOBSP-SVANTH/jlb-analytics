/**
 * Cerebro — JLB Analytics
 * Base de conhecimento proprietária: artigos RSS/Reddit + sínteses IA.
 * Motor de contexto para análises e previsões da plataforma.
 */

import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import AnaliseTabs from "@/components/AnaliseTabs";
import { supabase, type CerebroArticle, type CerebroAnalysis } from "@/lib/supabase";
import {
  Brain, Search, Clock, Globe, ExternalLink, AlertCircle,
  RefreshCw, Zap, ChevronRight, BookOpen, Tag,
  TrendingUp, TrendingDown, Minus, Loader2, Scale,
} from "lucide-react";
import { Link } from "wouter";
import { awardPoints } from "@/lib/userProgress";

// ── Category colors ────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  esportes:   "text-green-400 bg-green-400/10 border-green-400/20",
  macro:      "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  cripto:     "text-orange-400 bg-orange-400/10 border-orange-400/20",
  politica:   "text-blue-400 bg-blue-400/10 border-blue-400/20",
  ciencia:    "text-purple-400 bg-purple-400/10 border-purple-400/20",
  tecnologia: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  clima:      "text-teal-400 bg-teal-400/10 border-teal-400/20",
  financas:   "text-gold bg-gold/10 border-gold/20",
};

function CategoryBadge({ category }: { category?: string }) {
  if (!category) return null;
  const key = category.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const colors = CAT_COLORS[key] ?? "text-muted-foreground bg-secondary/50 border-border/30";
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border ${colors}`}>
      {category}
    </span>
  );
}

/** Preview de texto vindo da IA pode conter markdown cru (**negrito**, `código`, ###) — remove para exibição */
function stripMd(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "");
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m atrás`;
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 30) return `${d}d atrás`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ── Cards ─────────────────────────────────────────────────────────────────

function AnalysisCard({ analysis }: { analysis: CerebroAnalysis }) {
  return (
    <div className="glass-card card-lift rounded-xl p-5 space-y-3 border border-gold/10">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Chip discreto — a seção já se chama "Sínteses por IA"; 9 chips dourados brilhando juntos viram ruído */}
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide text-gold/70 border-gold/20">
          Síntese IA
        </span>
        {analysis.domains.slice(0, 2).map((d) => (
          <span key={d} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground border border-border/20">
            {d}
          </span>
        ))}
        {analysis.wiki_date && (
          <span className="ml-auto text-[10px] text-muted-foreground/60 flex items-center gap-1">
            <Clock className="w-3 h-3" aria-hidden="true" />
            {timeAgo(analysis.wiki_date)}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-foreground leading-snug">{analysis.title}</p>
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{stripMd(analysis.content)}</p>
      {analysis.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {analysis.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground border border-border/20">
              {tag}
            </span>
          ))}
        </div>
      )}
      {analysis.sources_used.length > 0 && (
        <p className="text-[10px] text-muted-foreground/50">
          Fontes: {analysis.sources_used.slice(0, 3).join(", ")}
        </p>
      )}
    </div>
  );
}

function ArticleSkeleton() {
  return (
    <div className="glass-card rounded-xl p-5 space-y-3 animate-pulse">
      <div className="flex gap-2">
        <div className="h-3 w-12 bg-secondary/40 rounded" />
        <div className="h-3 w-20 bg-secondary/30 rounded" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3.5 bg-secondary/40 rounded w-full" />
        <div className="h-3.5 bg-secondary/40 rounded w-4/5" />
      </div>
      <div className="h-3 bg-secondary/20 rounded w-3/5" />
    </div>
  );
}

interface RelatedMarket {
  source: "Polymarket" | "Kalshi";
  marketTitle: string;
  marketProb: number;
  id: string;
  jlbProb: number;
  verdict: "higher" | "lower" | "aligned";
  reasoning: string;
  confidence: string;
}

function ArticleCard({ article }: { article: CerebroArticle }) {
  const [related, setRelated] = useState<RelatedMarket[] | null>(null);
  const [loadingRel, setLoadingRel] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [relError, setRelError] = useState(false);

  async function loadRelated() {
    setExpanded((v) => !v);
    if (related !== null || loadingRel) return; // já carregado ou carregando
    setLoadingRel(true); setRelError(false);
    try {
      const res = await fetch("/api/ai/article-crossref", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: article.title, description: article.summary ?? "" }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { relatedMarkets?: RelatedMarket[] };
      setRelated(data.relatedMarkets ?? []);
    } catch { setRelError(true); setRelated([]); }
    finally { setLoadingRel(false); }
  }

  return (
    <div className="glass-card card-lift rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <CategoryBadge category={article.category} />
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Globe className="w-3 h-3" aria-hidden="true" />
          {article.source}
        </span>
        {article.published_at && (
          <span className="ml-auto text-[10px] text-muted-foreground/60 flex items-center gap-1">
            <Clock className="w-3 h-3" aria-hidden="true" />
            {timeAgo(article.published_at)}
          </span>
        )}
      </div>
      <a href={article.url ?? "#"} target="_blank" rel="noopener noreferrer" className="group block">
        <p className="text-sm font-semibold text-foreground group-hover:text-gold transition-colors leading-snug line-clamp-3">
          {article.title}
        </p>
      </a>
      {article.summary && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{article.summary}</p>
      )}
      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {article.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/40 text-muted-foreground border border-border/20">
              {tag}
            </span>
          ))}
        </div>
      )}
      {/* Ações quietas — 60 cards × 2 links coloridos viravam um brilho constante;
          a cor aparece no hover (mesmo padrão dos gatilhos do TrendingCard) */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <a href={article.url ?? "#"} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium hover:text-gold transition-colors">
          <BookOpen className="w-3 h-3" aria-hidden="true" /> Ver fonte
          <ExternalLink className="w-3 h-3 ml-0.5" aria-hidden="true" />
        </a>
        <button onClick={loadRelated}
          className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium hover:text-neon-blue transition-colors">
          <Scale className="w-3 h-3" aria-hidden="true" />
          Mercados relacionados
          <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true" />
        </button>
      </div>

      {/* Mercados relacionados (cross-ref sob demanda) */}
      {expanded && (
        <div className="pt-2 border-t border-border/15 space-y-2">
          {loadingRel && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-neon-blue" />
              IA cruzando este artigo com mercados ativos…
            </div>
          )}
          {!loadingRel && related && related.length === 0 && (
            <p className="text-[11px] text-muted-foreground/60 py-1">
              {relError ? "Não foi possível cruzar agora — tente novamente." : "Nenhum mercado ativo diretamente relacionado a este artigo."}
            </p>
          )}
          {!loadingRel && related && related.map((m, i) => {
            const VIcon = m.verdict === "higher" ? TrendingUp : m.verdict === "lower" ? TrendingDown : Minus;
            const vColor = m.verdict === "higher" ? "text-positive" : m.verdict === "lower" ? "text-negative" : "text-muted-foreground";
            const href = m.source === "Kalshi" ? `/apostas/kalshi-${m.id}` : `/apostas/poly-${m.id}`;
            return (
              <Link key={i} href={href}>
                <div className="flex items-start gap-2 p-2 rounded-lg bg-secondary/20 border border-border/15 hover:border-neon-blue/30 transition-colors cursor-pointer">
                  <VIcon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${vColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-foreground line-clamp-1">{m.marketTitle}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Mercado <span className="font-mono">{m.marketProb}%</span> ·
                      JLB <span className={`font-mono ${vColor}`}>{m.jlbProb}%</span>
                    </p>
                    {m.reasoning && <p className="text-[10px] text-muted-foreground/70 mt-0.5 line-clamp-2">{m.reasoning}</p>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────

const CATEGORIES = [
  { label: "Todos",     value: "" },
  { label: "Macro",     value: "macro" },
  { label: "Política",  value: "política" },
  { label: "Esportes",  value: "esportes" },
  { label: "Cripto",    value: "cripto" },
  { label: "Ciência",   value: "ciência" },
  { label: "Mercados",  value: "mercados" },
];

// ── Main page ─────────────────────────────────────────────────────────────

export default function Cerebro() {
  useSEO("Cerebro — base de conhecimento", "Mais de 7.000 artigos curados e sínteses por IA sobre mercados, política, economia e cripto — o motor de contexto das análises da JLB.");
  const [articles, setArticles]               = useState<CerebroArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [errorArticles, setErrorArticles]     = useState<string | null>(null);
  const [search, setSearch]                   = useState("");
  const [activeCategory, setActiveCategory]   = useState("");

  const [analyses, setAnalyses]               = useState<CerebroAnalysis[]>([]);
  const [loadingAnalyses, setLoadingAnalyses] = useState(false);

  const [stats, setStats] = useState<{ articles: number; analyses: number } | null>(null);

  const fetchArticles = useCallback(async (q?: string, cat?: string) => {
    setLoadingArticles(true);
    setErrorArticles(null);
    try {
      let query = supabase
        .from("cerebro_articles")
        .select("id, slug, title, source, category, url, summary, tags, published_at, ingested_at, status")
        .eq("status", "active")
        .order("published_at", { ascending: false })
        .limit(48);

      if (q?.trim()) {
        query = query.textSearch("fts", q.trim(), { config: "portuguese" });
      }
      if (cat) {
        query = query.eq("category", cat);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      setArticles((data ?? []) as CerebroArticle[]);
    } catch (err) {
      setErrorArticles(err instanceof Error ? err.message : "Erro ao carregar artigos");
    } finally {
      setLoadingArticles(false);
    }
  }, []);

  const fetchAnalyses = useCallback(async () => {
    setLoadingAnalyses(true);
    try {
      const { data } = await supabase
        .from("cerebro_analyses")
        .select("id, slug, title, wiki_type, domains, tags, content, sources_used, status, wiki_date, synced_at")
        .eq("status", "active")
        .order("wiki_date", { ascending: false })
        .limit(9);
      setAnalyses((data ?? []) as CerebroAnalysis[]);
    } catch {
      // syntheses são suplementares
    } finally {
      setLoadingAnalyses(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const [artRes, anaRes] = await Promise.all([
        supabase.from("cerebro_articles").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("cerebro_analyses").select("id", { count: "exact", head: true }).eq("status", "active"),
      ]);
      setStats({ articles: artRes.count ?? 0, analyses: anaRes.count ?? 0 });
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    awardPoints("level_visited", "Acessou o Cerebro", "level_visited_cerebro");
    void fetchArticles();
    void fetchAnalyses();
    void fetchStats();
  }, [fetchArticles, fetchAnalyses, fetchStats]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    void fetchArticles(search, activeCategory);
  }

  function handleCategory(cat: string) {
    setActiveCategory(cat);
    void fetchArticles(search, cat);
  }

  function handleRefresh() {
    void fetchArticles(search, activeCategory);
    void fetchAnalyses();
    void fetchStats();
  }

  return (
    <div>
      <AnaliseTabs />
      <PageHeader
        title="Cerebro"
        subtitle="Base de conhecimento proprietária do JLB. Artigos coletados via RSS e Reddit, sintetizados pela IA — motor de contexto para todas as nossas análises e previsões."
        badge="Base de Conhecimento"
      />

      <div className="container py-10 space-y-8">

        {/* Stats */}
        <AnimatedSection>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card rounded-xl p-4 text-center">
              <Brain className="w-5 h-5 text-gold mx-auto mb-2" aria-hidden="true" />
              <p className="text-2xl font-bold font-mono text-foreground">{stats?.articles ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Artigos coletados</p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <Zap className="w-5 h-5 text-neon-blue mx-auto mb-2" aria-hidden="true" />
              <p className="text-2xl font-bold font-mono text-foreground">{stats?.analyses ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Sínteses IA ativas</p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <Globe className="w-5 h-5 text-positive mx-auto mb-2" aria-hidden="true" />
              <p className="text-2xl font-bold font-mono text-foreground">24h</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Ciclo de atualização</p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center border border-gold/20 bg-gold/3">
              <Tag className="w-5 h-5 text-gold mx-auto mb-2" aria-hidden="true" />
              <p className="text-xs font-bold text-gold">Alimenta a IA</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Contexto em Previsão</p>
            </div>
          </div>
        </AnimatedSection>

        {/* Banner: conexão com Previsão */}
        <AnimatedSection>
          <div className="flex items-center gap-3 p-4 rounded-xl border border-gold/20 bg-gold/3">
            <div className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-gold" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                Cerebro alimenta a Previsão Guiada por IA
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Quando você usa a Previsão, o Cerebro busca automaticamente artigos e sínteses relevantes
                e os injeta como contexto no Claude — tornando as análises mais fundamentadas e proprietárias.
              </p>
            </div>
            <Link href="/previsao">
              <span className="flex items-center gap-1 text-xs text-gold font-semibold whitespace-nowrap hover:underline cursor-pointer">
                Usar agora
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </Link>
          </div>
        </AnimatedSection>

        {/* Sínteses IA */}
        <AnimatedSection>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Brain className="w-4 h-4 text-gold" aria-hidden="true" />
                Sínteses por IA
                {loadingAnalyses && (
                  <span className="w-3 h-3 rounded-full border-2 border-gold border-t-transparent animate-spin ml-1" aria-hidden="true" />
                )}
              </h2>
              {analyses.length > 0 && (
                <span className="text-[10px] text-muted-foreground">{analyses.length} sínteses</span>
              )}
            </div>

            {!loadingAnalyses && analyses.length === 0 && (
              <div className="text-center py-10">
                <Brain className="w-8 h-8 mx-auto mb-3 text-muted-foreground/30" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Nenhuma síntese ativa.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Rode o pipeline de análise IA para gerar sínteses.
                </p>
              </div>
            )}

            {!loadingAnalyses && analyses.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {analyses.map((a) => <AnalysisCard key={a.slug} analysis={a} />)}
              </div>
            )}
          </div>
        </AnimatedSection>

        {/* Artigos coletados */}
        <AnimatedSection>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground flex items-center gap-2">
                <Globe className="w-4 h-4 text-neon-blue" aria-hidden="true" />
                Artigos Coletados
              </h2>
              <button
                onClick={handleRefresh}
                disabled={loadingArticles}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingArticles ? "animate-spin" : ""}`} aria-hidden="true" />
                Atualizar
              </button>
            </div>

            {/* Busca */}
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar no Cerebro… (petróleo, eleições, Bitcoin…)"
                  className="w-full pl-9 pr-4 py-2 rounded-lg bg-secondary/30 border border-border/40 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-gold/40 transition-colors"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-gold text-on-accent text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Buscar
              </button>
              {(search || activeCategory) && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setActiveCategory(""); void fetchArticles(); }}
                  className="px-3 py-2 rounded-lg border border-border/40 text-muted-foreground text-sm hover:text-foreground transition-colors"
                >
                  Limpar
                </button>
              )}
            </form>

            {/* Categorias */}
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  onClick={() => handleCategory(c.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    activeCategory === c.value
                      ? "bg-gold/20 border-gold/40 text-gold"
                      : "bg-secondary/30 border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Error */}
            {errorArticles && (
              <div className="flex items-start gap-4 p-5 rounded-xl bg-negative/5 border border-negative/20" role="alert">
                <AlertCircle className="w-5 h-5 text-negative shrink-0 mt-0.5" aria-hidden="true" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium text-foreground">Não foi possível carregar os artigos</p>
                  <p className="text-xs text-muted-foreground">{errorArticles}</p>
                  <button
                    onClick={handleRefresh}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <RefreshCw className="w-3 h-3" /> Tentar novamente
                  </button>
                </div>
              </div>
            )}

            {/* Loading skeletons */}
            {loadingArticles && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 9 }).map((_, i) => <ArticleSkeleton key={i} />)}
              </div>
            )}

            {/* Grid de artigos */}
            {!loadingArticles && articles.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {articles.map((a) => <ArticleCard key={a.slug} article={a} />)}
              </div>
            )}

            {/* Vazio */}
            {!loadingArticles && !errorArticles && articles.length === 0 && (
              <div className="text-center py-20">
                <Brain className="w-8 h-8 mx-auto mb-3 text-muted-foreground/30" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">Nenhum artigo encontrado.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Rode o rss_collector.py para coletar novas fontes.
                </p>
              </div>
            )}

            {articles.length > 0 && (
              <p className="text-xs text-muted-foreground text-center mt-4">
                {articles.length} artigos · Atualizado diariamente via RSS + Reddit
              </p>
            )}
          </div>
        </AnimatedSection>

      </div>
    </div>
  );
}
