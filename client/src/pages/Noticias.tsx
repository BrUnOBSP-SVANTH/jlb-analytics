/**
 * Notícias — JLB Analytics
 * Mercados Polymarket (Gamma API, direta do cliente) + Reddit (JSON API pública).
 * Prediction Tracker: registre sua estimativa, acompanhe o Brier Score acumulado.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import {
  Newspaper, TrendingUp, ExternalLink, RefreshCw,
  AlertCircle, Loader2, BookmarkPlus, Check, X as XIcon,
  ChevronUp, Target, Languages, BarChart2,
  Search, BookOpen, Clock, Globe, Brain, ChevronRight,
  Zap,
} from "lucide-react";
import { Link } from "wouter";
import { getMarkets } from "@/lib/marketsCache";
import MercadosTabs from "@/components/MercadosTabs";
import { CategoryBadge, ProbArc } from "@/components/noticias/cards";
import { type Article, timeAgoISO } from "@/lib/noticiasShared";
import { MarketAnalysisModal, ArticleDetailModal, type SelectedMarket } from "@/components/noticias/AnalysisModals";
import {
  addPrediction, analyzeSentiment,
  edge, kellyFraction, loadPredictions,
  type StoredPrediction,
} from "@/lib/predictions";
import { awardPoints } from "@/lib/userProgress";
import { useSEO } from "@/hooks/useSEO";

// ── Types ──────────────────────────────────────────────────────────────────

interface PolyMarket {
  id: string;
  question: string;
  slug: string;
  eventSlug?: string;
  volume?: number;
  volume24hr?: number;
  liquidity?: number;
  weekPriceChange?: number;
  featured?: boolean;
  category?: string;
  endDate?: string;
  outcomePrices?: string;
  outcomes?: string;
  clobTokenIds?: string;
}

interface KalshiMarket {
  ticker: string;
  eventTicker: string;
  seriesTicker: string;
  title: string;
  yesProb: number;
  prevYesProb?: number;
  volume: number;
  volume24h?: number;
  openInterest?: number;
  liquidity?: number;
  closeTime?: string;
  category?: string;
}

interface RedditPost {
  title: string;
  url: string;
  permalink: string;
  subreddit: string;
  score: number;
  created_utc: number;
  author: string;
  selftext?: string;
}


// ── Helpers ────────────────────────────────────────────────────────────────

function formatVolume(v?: number | string): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (!n || isNaN(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function daysLeft(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return null;
  return Math.ceil(diff / 86_400_000);
}

function parseOutcomePrices(raw?: string): { yes: number; no: number } | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw) as string[];
    const yes = parseFloat(arr[0] ?? "0") * 100;
    const no = parseFloat(arr[1] ?? "0") * 100;
    if (isNaN(yes) || isNaN(no)) return null;
    return { yes, no };
  } catch { return null; }
}

function timeAgo(utcSeconds: number): string {
  const diff = Date.now() - utcSeconds * 1000;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))}m atrás`;
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

// ── Track form (inline, inside the card) ──────────────────────────────────

interface TrackFormProps {
  market: PolyMarket;
  marketProb: number;
  onSaved: (p: StoredPrediction) => void;
  onCancel: () => void;
}

function TrackForm({ market, marketProb, onSaved, onCancel }: TrackFormProps) {
  const [userProb, setUserProb] = useState(Math.round(marketProb));
  const e = edge(userProb, marketProb);
  const kf = kellyFraction(userProb, marketProb);
  const edgeColor = e > 3 ? "text-positive" : e < -3 ? "text-negative" : "text-muted-foreground";

  function handleSave() {
    const pred = addPrediction({
      marketId: market.id,
      question: market.question,
      marketProb,
      userProb,
    });
    awardPoints("prediction_made", `Previsão registrada: ${market.question.slice(0, 50)}`);
    onSaved(pred);
  }

  return (
    <div className="mt-3 pt-3 border-t border-border/30 space-y-3">
      <p className="text-xs text-muted-foreground font-medium">Sua estimativa</p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={99}
          value={userProb}
          onChange={(e) => setUserProb(parseInt(e.target.value))}
          className="flex-1 accent-gold"
          aria-label="Sua probabilidade estimada"
        />
        <span className="font-mono text-sm font-bold text-gold w-12 text-right">{userProb}%</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-lg bg-secondary/30">
          <p className="text-[10px] text-muted-foreground">Mercado</p>
          <p className="font-mono text-xs font-semibold text-foreground">{marketProb.toFixed(1)}%</p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30">
          <p className="text-[10px] text-muted-foreground">Edge</p>
          <p className={`font-mono text-xs font-semibold ${edgeColor}`}>
            {e >= 0 ? "+" : ""}{e.toFixed(1)}pp
          </p>
        </div>
        <div className="p-2 rounded-lg bg-secondary/30">
          <p className="text-[10px] text-muted-foreground">Kelly</p>
          <p className="font-mono text-xs font-semibold text-gold">
            {kf > 0 ? `${(kf * 100).toFixed(1)}%` : "—"}
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gold text-on-accent text-xs font-semibold hover:opacity-90 transition-opacity"
        >
          <Check className="w-3.5 h-3.5" />
          Registrar
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-lg border border-border/50 text-muted-foreground text-xs hover:text-foreground transition-colors"
          aria-label="Cancelar"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Market card ────────────────────────────────────────────────────────────

interface MarketCardProps {
  market: PolyMarket;
  savedIds: Set<string>;
  onSaved: (p: StoredPrediction) => void;
  onAnalyze: (m: SelectedMarket) => void;
}

function MarketCard({ market, savedIds, onSaved, onAnalyze }: MarketCardProps) {
  const [tracking, setTracking] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const prices = parseOutcomePrices(market.outcomePrices);
  const isSaved = savedIds.has(market.id);

  async function handleTranslate() {
    if (translation) { setTranslation(null); return; }
    setTranslating(true);
    try {
      const res = await fetch(`/api/translate?text=${encodeURIComponent(market.question)}`);
      const data = await res.json() as { translation?: string };
      setTranslation(data.translation ?? null);
    } catch { /* ignore */ } finally {
      setTranslating(false);
    }
  }

  function handleSaved(p: StoredPrediction) {
    setTracking(false);
    setJustSaved(true);
    onSaved(p);
    setTimeout(() => setJustSaved(false), 2000);
  }

  return (
    <div className={`glass-card rounded-xl p-4 flex flex-col gap-3 transition-colors ${
      isSaved || justSaved ? "border-gold/30 bg-gold/3" : "hover:border-gold/20"
    }`}>
      {/* Badges: categoria + destaque + tempo */}
      <div className="flex flex-wrap items-center gap-1">
        {market.featured && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border text-gold bg-gold/10 border-gold/20">
            ★ Destaque
          </span>
        )}
        <CategoryBadge category={market.category} />
        {(() => { const d = daysLeft(market.endDate); return d !== null ? (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${d <= 3 ? "text-negative bg-negative/10 border-negative/20" : "text-muted-foreground bg-secondary/40 border-border/20"}`}>
            {d === 0 ? "Encerra hoje" : `${d}d restantes`}
          </span>
        ) : null; })()}
        {market.weekPriceChange !== undefined && market.weekPriceChange !== 0 && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${market.weekPriceChange > 0 ? "text-positive bg-positive/10 border-positive/20" : "text-negative bg-negative/10 border-negative/20"}`}>
            {market.weekPriceChange > 0 ? "▲" : "▼"} {Math.abs(market.weekPriceChange * 100).toFixed(1)}pp semana
          </span>
        )}
      </div>

      {/* Question */}
      <div>
        <p className="text-sm font-medium text-foreground leading-snug line-clamp-3">
          {market.question}
        </p>
        {translation && (
          <p className="text-xs text-gold/80 mt-1 leading-snug italic">{translation}</p>
        )}
        <button
          onClick={handleTranslate}
          disabled={translating}
          className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-gold transition-colors disabled:opacity-50"
        >
          <Languages className="w-3 h-3" />
          {translating ? "Traduzindo..." : translation ? "Ocultar tradução" : "Traduzir"}
        </button>
      </div>

      {/* Arc gauge + YES/NO breakdown */}
      {prices ? (
        <div className="flex items-center gap-3">
          <ProbArc yes={prices.yes} />
          <div className="flex-1 space-y-1.5">
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>Sim</span>
                <span className="font-mono">{prices.yes.toFixed(1)}%</span>
              </div>
              <div className="h-1 rounded-full bg-secondary/50 overflow-hidden">
                <div className="h-full bg-positive rounded-full" style={{ width: `${Math.min(prices.yes, 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                <span>Não</span>
                <span className="font-mono">{prices.no.toFixed(1)}%</span>
              </div>
              <div className="h-1 rounded-full bg-secondary/50 overflow-hidden">
                <div className="h-full bg-negative/60 rounded-full" style={{ width: `${Math.min(prices.no, 100)}%` }} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Sem dados de preço</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/20">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Vol: <span className="font-mono text-foreground">{formatVolume(market.volume)}</span></span>
          {market.volume24hr != null && market.volume24hr > 0 && (
            <span className="text-[10px]">24h: <span className="font-mono text-foreground/70">{formatVolume(market.volume24hr)}</span></span>
          )}
          {market.liquidity != null && market.liquidity > 0 && (
            <span className="text-[10px]">Liq: <span className="font-mono text-foreground/70">{formatVolume(market.liquidity)}</span></span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {(isSaved || justSaved) && (
            <span className="text-[10px] text-gold/70 font-medium">Registrado</span>
          )}
          {!isSaved && !justSaved && prices && (
            <button
              onClick={() => setTracking((v) => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                tracking
                  ? "bg-gold/10 text-gold border border-gold/20"
                  : "text-muted-foreground hover:text-gold border border-transparent hover:border-gold/20"
              }`}
              aria-label="Registrar previsão"
            >
              {tracking ? <ChevronUp className="w-3 h-3" /> : <BookmarkPlus className="w-3 h-3" />}
              {tracking ? "Cancelar" : "Registrar"}
            </button>
          )}
          <a
            href={`https://polymarket.com/event/${market.eventSlug ?? market.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-muted-foreground/40 hover:text-gold transition-colors"
            aria-label="Abrir no Polymarket"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Inline track form */}
      {tracking && prices && (
        <TrackForm
          market={market}
          marketProb={prices.yes}
          onSaved={handleSaved}
          onCancel={() => setTracking(false)}
        />
      )}

      {/* Analisar + notícias */}
      {prices && (
        <button
          onClick={() => onAnalyze({ title: market.question, prob: Math.round(prices.yes), source: "Polymarket", id: `poly-${market.id}`, category: market.category })}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border/20 text-[11px] text-muted-foreground hover:text-gold hover:border-gold/20 transition-colors"
        >
          <Zap className="w-3 h-3" />
          Analisar + notícias
        </button>
      )}
    </div>
  );
}

// ── Reddit post card ───────────────────────────────────────────────────────

function PostCard({ post }: { post: RedditPost }) {
  const sentiment = analyzeSentiment(post.title + " " + (post.selftext ?? ""));
  const link = post.url.startsWith("http") ? post.url : `https://reddit.com${post.permalink}`;
  const isExternal = post.url.startsWith("http") && !post.url.includes("reddit.com");

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="glass-card rounded-xl p-4 flex flex-col gap-2 hover:border-gold/30 transition-colors group"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gold/70 uppercase tracking-wider">
          r/{post.subreddit}
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-medium ${sentiment.color}`}>{sentiment.label}</span>
          <span className="text-[10px] text-muted-foreground">{timeAgo(post.created_utc)}</span>
        </div>
      </div>
      <p className="text-sm font-medium text-foreground leading-snug group-hover:text-gold/90 transition-colors">
        {post.title}
      </p>
      <div className="flex items-center justify-between pt-1 border-t border-border/20">
        <span className="text-xs text-muted-foreground">
          <span className="font-mono text-foreground">↑{post.score}</span>
          <span className="ml-1.5 text-muted-foreground/60">u/{post.author}</span>
        </span>
        {isExternal && (
          <ExternalLink className="w-3 h-3 text-muted-foreground/50 group-hover:text-gold transition-colors" aria-hidden="true" />
        )}
      </div>
    </a>
  );
}

// ── Kalshi card ────────────────────────────────────────────────────────────

function KalshiCard({ market, onAnalyze }: { market: KalshiMarket; onAnalyze: (m: SelectedMarket) => void }) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [predictOpen, setPredictOpen] = useState(false);
  const [userProb, setUserProb] = useState(market.yesProb);
  const [saved, setSaved] = useState(false);

  async function handleTranslate() {
    if (translation) { setTranslation(null); return; }
    setTranslating(true);
    try {
      const res = await fetch(`/api/translate?text=${encodeURIComponent(market.title)}`);
      const data = await res.json() as { translation?: string };
      setTranslation(data.translation ?? null);
    } catch { /* ignore */ } finally {
      setTranslating(false);
    }
  }

  function handleSaveKalshi() {
    addPrediction({
      marketId: `kalshi-${market.ticker}`,
      question: translation ?? market.title,
      marketProb: market.yesProb,
      userProb,
    });
    awardPoints("prediction_made", `Previsão Kalshi: ${market.title.slice(0, 50)}`);
    setSaved(true);
    setTimeout(() => { setSaved(false); setPredictOpen(false); }, 1800);
  }

  const noProb = 100 - market.yesProb;
  const d = daysLeft(market.closeTime);
  const prevDiff = market.prevYesProb !== undefined ? market.yesProb - market.prevYesProb : null;

  return (
    <div className="glass-card rounded-xl p-4 flex flex-col gap-3 hover:border-gold/20 transition-colors">
      {/* Badges */}
      <div className="flex flex-wrap items-center gap-1">
        <CategoryBadge category={market.category} />
        {d !== null && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${d <= 3 ? "text-negative bg-negative/10 border-negative/20" : "text-muted-foreground bg-secondary/40 border-border/20"}`}>
            {d === 0 ? "Encerra hoje" : `${d}d restantes`}
          </span>
        )}
        {prevDiff !== null && prevDiff !== 0 && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border ${prevDiff > 0 ? "text-positive bg-positive/10 border-positive/20" : "text-negative bg-negative/10 border-negative/20"}`}>
            {prevDiff > 0 ? "▲" : "▼"} {Math.abs(prevDiff)}pp hoje
          </span>
        )}
      </div>

      {/* Title */}
      <div>
        <p className="text-sm font-medium text-foreground leading-snug line-clamp-3">{market.title}</p>
        {translation && <p className="text-xs text-gold/80 mt-1 leading-snug italic">{translation}</p>}
        <button
          onClick={handleTranslate}
          disabled={translating}
          className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-gold transition-colors disabled:opacity-50"
        >
          <Languages className="w-3 h-3" />
          {translating ? "Traduzindo..." : translation ? "Ocultar tradução" : "Traduzir"}
        </button>
      </div>

      {/* Prob bars */}
      <div className="space-y-1.5">
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>Sim</span>
            <span className="font-mono">{market.yesProb}%</span>
          </div>
          <div className="h-1 rounded-full bg-secondary/50 overflow-hidden">
            <div className="h-full bg-positive rounded-full" style={{ width: `${market.yesProb}%` }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>Não</span>
            <span className="font-mono">{noProb}%</span>
          </div>
          <div className="h-1 rounded-full bg-secondary/50 overflow-hidden">
            <div className="h-full bg-negative/60 rounded-full" style={{ width: `${noProb}%` }} />
          </div>
        </div>
      </div>

      {/* Quick predict */}
      {!predictOpen ? (
        <button
          onClick={() => { setPredictOpen(true); setUserProb(market.yesProb); }}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-gold transition-colors"
        >
          <BookmarkPlus className="w-3 h-3" />
          Registrar minha estimativa
        </button>
      ) : (
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide">Minha estimativa (SIM)</p>
            <span className={`text-xs font-mono font-bold ${(userProb - market.yesProb) > 3 ? "text-positive" : (userProb - market.yesProb) < -3 ? "text-negative" : "text-muted-foreground"}`}>
              Edge: {(userProb - market.yesProb) >= 0 ? "+" : ""}{(userProb - market.yesProb).toFixed(0)}pp
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Mercado: {market.yesProb}%</span>
              <span className="font-mono font-bold text-foreground">{userProb}%</span>
            </div>
            <input
              type="range" min={1} max={99} value={userProb}
              onChange={(e) => setUserProb(parseInt(e.target.value, 10))}
              className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
            />
          </div>
          <div className="flex items-center gap-2">
            {saved ? (
              <span className="flex items-center gap-1.5 text-xs text-positive font-medium">
                <Check className="w-3.5 h-3.5" /> Registrado!
              </span>
            ) : (
              <button onClick={handleSaveKalshi} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity">
                Salvar
              </button>
            )}
            <button onClick={() => setPredictOpen(false)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/20">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Vol: <span className="font-mono text-foreground">{formatVolume(market.volume)}</span></span>
          {market.volume24h != null && market.volume24h > 0 && (
            <span className="text-[10px]">24h: <span className="font-mono text-foreground/70">{formatVolume(market.volume24h)}</span></span>
          )}
          {market.openInterest != null && market.openInterest > 0 && (
            <span className="text-[10px]">OI: <span className="font-mono text-foreground/70">{market.openInterest.toLocaleString("pt-BR")}</span></span>
          )}
        </div>
        <a
          href={`https://kalshi.com/markets/${market.seriesTicker}/${market.eventTicker}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-muted-foreground/40 hover:text-gold transition-colors"
          aria-label="Abrir na Kalshi"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Analisar + notícias */}
      <button
        onClick={() => onAnalyze({ title: market.title, prob: Math.round(market.yesProb), source: "Kalshi", id: `kalshi-${market.ticker}`, category: market.category })}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border/20 text-[11px] text-muted-foreground hover:text-gold hover:border-gold/20 transition-colors"
      >
        <Zap className="w-3 h-3" />
        Analisar + notícias
      </button>
    </div>
  );
}

// ── Data fetchers ──────────────────────────────────────────────────────────

async function fetchPolymarketDirect(): Promise<PolyMarket[]> {
  // Cache compartilhado — reusa a resposta já buscada por Apostas/Home
  return (await getMarkets<PolyMarket>("polymarket")).slice(0, 24);
}

async function fetchKalshiMarkets(): Promise<KalshiMarket[]> {
  return (await getMarkets<KalshiMarket>("kalshi")).slice(0, 24);
}

async function fetchRedditPosts(subreddit: string): Promise<RedditPost[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(`/api/reddit/${subreddit}?limit=15`, { signal: controller.signal });
    if (!res.ok) throw new Error(`Reddit HTTP ${res.status}`);
    const json = await res.json() as { posts: RedditPost[] };
    return json.posts ?? [];
  } finally {
    clearTimeout(timer);
  }
}

const SUBREDDITS = ["Polymarket", "predictionmarkets"];

// ── Articles ───────────────────────────────────────────────────────────────


interface ArticlesResponse {
  articles: Article[];
  source?: string;
  count?: number;
  error?: string;
}

const ARTICLE_TOPICS = [
  { label: "Polymarket",          query: "polymarket" },
  { label: "Eleições Brasil",     query: "eleições Brasil apostas previsão" },
  { label: "Mercados Preditivos", query: "mercados preditivos apostas" },
  { label: "Cripto",              query: "bitcoin cripto mercado previsão" },
  { label: "Economia BR",        query: "economia Brasil Selic juros inflação" },
  { label: "Esportes",            query: "apostas esportivas futebol brasil" },
  { label: "Kalshi",              query: "kalshi prediction markets" },
];


function ArticleCard({ article, onCardClick }: { article: Article; onCardClick: (a: Article) => void }) {
  const langLabel = article.lang === "pt" ? "PT" : "EN";
  const langColor = article.lang === "pt" ? "text-positive bg-positive/10 border-positive/20" : "text-neon-blue bg-neon-blue/10 border-neon-blue/20";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onCardClick(article)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onCardClick(article); }}
      className="group cursor-pointer glass-card rounded-xl p-5 hover:border-gold/30 transition-colors space-y-3"
      aria-label={`Analisar apostas para: ${article.title}`}
    >
      {/* Image */}
      {article.imageUrl && (
        <div className="w-full h-32 rounded-lg overflow-hidden bg-secondary/30">
          <img
            src={article.imageUrl}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            onError={(e) => { (e.currentTarget.parentElement!).style.display = "none"; }}
          />
        </div>
      )}

      {/* Meta row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${langColor}`}>
          {langLabel}
        </span>
        {article.source && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Globe className="w-3 h-3" aria-hidden="true" />
            {article.source}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <Clock className="w-3 h-3" aria-hidden="true" />
          {timeAgoISO(article.publishedAt)}
        </span>
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-foreground group-hover:text-gold transition-colors leading-snug line-clamp-3">
        {article.title}
      </p>

      {/* Excerpt */}
      {article.description && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
          {article.description}
        </p>
      )}

      {/* Footer: dois CTAs */}
      <div className="flex items-center justify-between pt-1 border-t border-border/20">
        <div className="flex items-center gap-1 text-[11px] text-gold font-medium">
          <Zap className="w-3 h-3" aria-hidden="true" />
          Ver apostas relacionadas
        </div>
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          aria-label="Ler artigo original"
        >
          <ExternalLink className="w-3 h-3" />
          Artigo
        </a>
      </div>
    </div>
  );
}

function ArticleCardSkeleton() {
  return (
    <div className="glass-card rounded-xl p-5 space-y-3 animate-pulse">
      <div className="h-32 bg-secondary/30 rounded-lg" />
      <div className="flex gap-2">
        <div className="h-3 w-6 bg-secondary/40 rounded" />
        <div className="h-3 w-20 bg-secondary/30 rounded" />
      </div>
      <div className="space-y-1.5">
        <div className="h-3.5 bg-secondary/40 rounded w-full" />
        <div className="h-3.5 bg-secondary/40 rounded w-4/5" />
        <div className="h-3.5 bg-secondary/30 rounded w-3/5" />
      </div>
      <div className="h-3 bg-secondary/20 rounded w-2/3" />
    </div>
  );
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
  const [selectedMarket, setSelectedMarket] = useState<SelectedMarket | null>(null);

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
                {totalPredictions} previsão{totalPredictions > 1 ? "ões" : ""} registrada{totalPredictions > 1 ? "s" : ""}
              </a>
            )}
          </div>

          {/* Banner Cerebro */}
          <Link href="/cerebro">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gold/15 bg-gold/3 hover:bg-gold/8 transition-colors cursor-pointer">
              <Brain className="w-3.5 h-3.5 text-gold shrink-0" aria-hidden="true" />
              <span className="text-xs text-muted-foreground">
                <span className="text-gold font-medium">Cerebro</span> — base de conhecimento curada + sínteses IA
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-gold/50 ml-auto shrink-0" aria-hidden="true" />
            </div>
          </Link>
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
                <MarketCard key={m.id} market={m} savedIds={savedIds} onSaved={handleSaved} onAnalyze={setSelectedMarket} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground text-center mt-6">
              Dados:{" "}
              <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">Polymarket</a>
              {" "}via Gamma API · Probabilidades implícitas do mercado de previsão.
            </p>
          </AnimatedSection>
        )}

        {/* Kalshi */}
        {!loading && tab === "kalshi" && kalshiMarkets.length > 0 && (
          <AnimatedSection>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {kalshiMarkets.map((m) => (
                <KalshiCard key={m.ticker} market={m} onAnalyze={setSelectedMarket} />
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

      {/* Market analysis modal */}
      {selectedMarket && (
        <MarketAnalysisModal
          market={selectedMarket}
          onClose={() => setSelectedMarket(null)}
        />
      )}
    </div>
  );
}
