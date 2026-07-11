/**
 * Apostas — Apostas em Hype
 * Fontes: Reddit + Polymarket + Kalshi
 */
import { useState, useEffect, useCallback, useMemo, useRef, memo, useDeferredValue } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import {
  Flame, TrendingUp, MessageSquare, ExternalLink,
  RefreshCw, BarChart2, AlertCircle, Clock, Languages,
  ChevronDown, ChevronUp, Calculator, Target, Info,
  Sparkles, Bookmark, BookmarkCheck, Bell, BellOff,
  LayoutGrid, List, ArrowUpDown, Scale, X as CloseX, AlignJustify, Link2,
} from "lucide-react";
import MercadosTabs from "@/components/MercadosTabs";
import { addToWatchlist, removeFromWatchlist, isWatched, loadWatchlist, updateWatchlistProbs } from "@/lib/watchlist";
import { useMarketAlerts } from "@/hooks/useMarketAlerts";
import { syncPushWatchlist } from "@/hooks/usePushNotifications";
import { useLivePrice } from "@/lib/livePrices";
import {
  type TrendingItem, type CategoryFilter, CATEGORY_LABELS, formatVolume, fetchRedditSub, fetchPolymarketSports, fetchManifold, fetchKalshi, REDDIT_SUBS,
} from "@/lib/trending";
import {
  ProbSparkline, MarketBadge, HypeBar,
  SentimentBadge, SourceBadge, ProbPill, MultiOutcomePills, BADGE_CONFIG,
} from "@/components/apostas/cards";
import { MarketAnalysis, NewsAnalysisPanel } from "@/components/apostas/panels";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatAge(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}min atrás`;
  if (hours < 24) return `${Math.round(hours)}h atrás`;
  return `${Math.round(hours / 24)}d atrás`;
}

// ─── Comparison Panel ─────────────────────────────────────────────────────────

function ComparePanel({ items, onClear }: { items: TrendingItem[]; onClear: () => void }) {
  const [a, b] = items;

  function insight(): string {
    if (!a || !b) return "";
    const parts: string[] = [];
    if (a.normalizedCategory === b.normalizedCategory && a.normalizedCategory !== "other")
      parts.push(`Ambos são mercados de ${CATEGORY_LABELS[a.normalizedCategory].toLowerCase()}`);
    const volA = a.volume ?? 0;
    const volB = b.volume ?? 0;
    if (volA > 0 && volB > 0) {
      const ratio = Math.max(volA, volB) / Math.min(volA, volB);
      if (ratio >= 2)
        parts.push(`${volA > volB ? a.source === "polymarket" ? "Polymarket" : "Kalshi" : b.source === "polymarket" ? "Polymarket" : "Kalshi"} tem ${ratio.toFixed(0)}× mais volume`);
    }
    const probA = a.yesProb ?? 0.5;
    const probB = b.yesProb ?? 0.5;
    const bothAbove = probA > 0.6 && probB > 0.6;
    const bothBelow = probA < 0.4 && probB < 0.4;
    if (bothAbove) parts.push("Ambos têm consenso de probabilidade alta (>60%)");
    if (bothBelow) parts.push("Ambos têm baixa probabilidade (<40%) — possíveis contrárias");
    if (a.source !== b.source)
      parts.push(`Fontes diferentes: compare a liquidez antes de entrar nos dois`);
    return parts.length > 0 ? parts.join(" · ") : "Mercados de naturezas distintas — correlação baixa esperada.";
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background/95 backdrop-blur-xl shadow-2xl">
      <div className="container py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-neon-blue" aria-hidden="true" />
            <span className="text-sm font-semibold text-foreground">Comparação de Mercados</span>
            {items.length < 2 && (
              <span className="text-xs text-muted-foreground">— selecione um segundo mercado</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                  toast("Link copiado!", { description: "Cole em qualquer lugar para compartilhar a comparação." });
                });
              }}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md border border-border/30"
            >
              <Link2 className="w-3 h-3" />
              Copiar link
            </button>
            <button onClick={onClear} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors" aria-label="Fechar comparação">
              <CloseX className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((item, idx) => {
            const pct = item.yesProb !== undefined ? parseFloat((item.yesProb * 100).toFixed(1)) : null;
            const pctColor = pct === null ? "text-muted-foreground" : pct >= 70 ? "text-positive" : pct <= 30 ? "text-negative" : "text-gold";
            return (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/30 bg-secondary/10">
                <div className="w-6 h-6 rounded-full bg-neon-blue/15 flex items-center justify-center shrink-0 text-xs font-bold text-neon-blue">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <SourceBadge source={item.source} subreddit={item.subreddit} />
                    {item.volume !== undefined && (
                      <span className="text-[10px] text-muted-foreground">{formatVolume(item.volume)}</span>
                    )}
                  </div>
                </div>
                {pct !== null && (
                  <div className="shrink-0 text-right">
                    <p className={`text-xl font-bold font-mono ${pctColor}`}>{pct}%</p>
                    <p className="text-[9px] text-muted-foreground">SIM</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Placeholder for second slot */}
          {items.length < 2 && (
            <div className="flex items-center justify-center p-3 rounded-xl border border-dashed border-border/30 text-muted-foreground/40">
              <p className="text-xs">Clique em <Scale className="w-3 h-3 inline mx-0.5" /> num segundo mercado</p>
            </div>
          )}
        </div>

        {items.length === 2 && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-neon-blue/5 border border-neon-blue/15">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <span className="text-neon-blue font-semibold">Análise: </span>{insight()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function TrendingCardBase({ item, onCompare, inCompare }: {
  item: TrendingItem;
  onCompare?: (item: TrendingItem) => void;
  inCompare?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [watched, setWatched] = useState(() => isWatched(item.id));
  const [probFlash, setProbFlash] = useState<"up" | "down" | null>(null);
  const prevProbRef = useRef<number | undefined>(item.yesProb);
  const jlbEdge = useEdge(item.id);
  // Preço ao vivo via WebSocket (fallback = valor do fetch da lista)
  const { pct: livePct, flash: liveFlash } = useLivePrice(item.id, (item.yesProb ?? 0.5) * 100);

  const isMarket = item.source === "polymarket" || item.source === "kalshi";

  // Detecta mudança de probabilidade e dispara animação de flash
  useEffect(() => {
    const prev = prevProbRef.current;
    if (prev === undefined || item.yesProb === undefined) { prevProbRef.current = item.yesProb; return; }
    const diff = item.yesProb - prev;
    if (Math.abs(diff) >= 0.005) {
      setProbFlash(diff > 0 ? "up" : "down");
      const t = setTimeout(() => setProbFlash(null), 900);
      prevProbRef.current = item.yesProb;
      return () => clearTimeout(t);
    }
  }, [item.yesProb]);

  useEffect(() => {
    if (!isMarket) return;
    const ptWords = new Set(["do", "da", "de", "no", "na", "em", "com", "que", "por", "uma", "um", "são", "vai", "para"]);
    const words = item.title.toLowerCase().split(/\s+/);
    if (words.filter((w) => ptWords.has(w)).length >= 2) return;
    let cancelled = false;
    setTranslating(true);
    fetch(`/api/translate?text=${encodeURIComponent(item.title)}`)
      .then((r) => r.json())
      .then((data: { translation?: string }) => { if (!cancelled && data.translation) setTranslation(data.translation); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTranslating(false); });
    return () => { cancelled = true; };
  }, [item.id, isMarket, item.title]);

  function handleBookmark() {
    if (watched) {
      removeFromWatchlist(item.id);
      setWatched(false);
      toast("Removido da watchlist");
    } else {
      addToWatchlist({
        id: item.id,
        title: item.title,
        source: item.source as "polymarket" | "kalshi" | "reddit",
        yesProb: item.yesProb,
        externalUrl: item.externalUrl,
        category: item.normalizedCategory,
      });
      setWatched(true);
      toast("Adicionado à watchlist", { description: "Visível no Dashboard." });
    }
  }

  async function handleTranslate() {
    if (translation) { setTranslation(null); return; }
    setTranslating(true);
    try {
      const res = await fetch(`/api/translate?text=${encodeURIComponent(item.title)}`);
      const data = await res.json() as { translation?: string };
      setTranslation(data.translation ?? null);
    } catch { /* ignore */ } finally { setTranslating(false); }
  }

  return (
    <AnimatedSection>
      <div className="glass-card card-lift rounded-xl p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
            item.score >= 70 ? "bg-positive animate-pulse" : item.score >= 40 ? "bg-gold" : "bg-primary/50"
          }`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-snug mb-1">{item.title}</p>
            {translating && !translation && isMarket && (
              <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                <Languages className="w-3 h-3" /> Traduzindo...
              </p>
            )}
            {translation && <p className="text-xs text-gold/80 mb-1 leading-snug italic">{translation}</p>}
            {!isMarket && (
              <button onClick={handleTranslate} disabled={translating}
                className="mb-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-gold transition-colors disabled:opacity-50">
                <Languages className="w-3 h-3" />
                {translating ? "Traduzindo..." : translation ? "Ocultar tradução" : "Traduzir"}
              </button>
            )}
            {isMarket && translation && (
              <button onClick={() => setTranslation(null)}
                className="mb-1.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-gold transition-colors">
                <Languages className="w-3 h-3" /> Ocultar tradução
              </button>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <SourceBadge source={item.source} subreddit={item.subreddit} />
              {item.badge && <MarketBadge badge={item.badge} endDate={item.endDate} />}
              {jlbEdge && Math.abs(jlbEdge.edge) >= 4 && (
                <span
                  title={`Fair value JLB: ${jlbEdge.aiFairValue}% vs mercado — clique para a análise`}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    jlbEdge.edge > 0
                      ? "border-positive/40 bg-positive/10 text-positive"
                      : "border-negative/40 bg-negative/10 text-negative"
                  }`}
                >
                  JLB {jlbEdge.edge > 0 ? "+" : ""}{jlbEdge.edge}pp
                </span>
              )}
              {/* Neutro é o estado default — só desvios merecem badge */}
              {item.sentiment.label !== "Neutro" && <SentimentBadge label={item.sentiment.label} />}
              {item.normalizedCategory !== "other" && item.normalizedCategory !== "all" && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-primary/20 bg-primary/5 text-primary/70">
                  {CATEGORY_LABELS[item.normalizedCategory]}
                </span>
              )}
              {item.ageHours > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />{formatAge(item.ageHours)}
                </span>
              )}
            </div>

            {/* Multi-outcome bar chart (inline, below badges) */}
            {item.parsedOutcomes && (
              <div className="mt-3">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5">Probabilidades</p>
                <MultiOutcomePills outcomes={item.parsedOutcomes} />
              </div>
            )}
            {item.source === "polymarket" && item.clobTokenIds && !item.parsedOutcomes && (
              <ProbSparkline tokenIds={item.clobTokenIds} marketId={item.id} source="polymarket" />
            )}
            {item.source === "kalshi" && !item.parsedOutcomes && (
              <ProbSparkline marketId={item.id} source="kalshi" />
            )}
          </div>
          {/* Binary prob pill — only shown when there are NOT multiple outcomes */}
          {item.yesProb !== undefined && !item.parsedOutcomes && (
            <div className="shrink-0"><ProbPill prob={livePct / 100} flash={liveFlash ?? probFlash} /></div>
          )}
        </div>

        <div className="mb-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Nível de Hype</p>
          <HypeBar score={item.score} />
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          {item.upvotes !== undefined && (
            <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{item.upvotes.toLocaleString()} votos</span>
          )}
          {item.comments !== undefined && (
            <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{item.comments.toLocaleString()} comentários</span>
          )}
          {item.volume !== undefined && (
            <span className="flex items-center gap-1"><BarChart2 className="w-3 h-3" />{formatVolume(item.volume)} volume</span>
          )}
        </div>

        {/* Container quieto — o lampejo dourado fica só no rótulo; caixa âmbar em
            todo card virava ruído repetido em vez de destaque */}
        <div className="p-3 rounded-lg bg-secondary/15 border border-border/15 mb-3">
          <p className="text-[10px] font-semibold text-primary/80 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Flame className="w-3 h-3" />Por que está em alta
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">{item.whyTrending}</p>
        </div>

        {/* Quantitative analysis toggle */}
        <button
          className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-between gap-1 py-1"
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="flex items-center gap-1">
            {isMarket
              ? <><Calculator className="w-3 h-3" />{expanded ? "Ocultar análise quantitativa" : "Ver análise quantitativa + calculadora"}</>
              : <><TrendingUp className="w-3 h-3" />{expanded ? "Ocultar análise de aposta" : "Ver análise de aposta"}</>
            }
          </span>
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {expanded && (
          <div className="mt-2 p-3 rounded-lg bg-obsidian/50 border border-border/20 mb-2">
            {isMarket && item.yesProb !== undefined
              ? <MarketAnalysis item={item} />
              : <p className="text-xs text-muted-foreground leading-relaxed">{item.bestBetNote}</p>
            }
          </div>
        )}

        {/* News + AI analysis — available for all sources */}
        <div className="border-t border-border/10 pt-2 mt-1">
          <NewsAnalysisPanel item={item} />
        </div>

        {/* Fair Value independente JLB — apenas para mercados Polymarket/Kalshi */}
        {(item.source === "polymarket" || item.source === "kalshi") && (
          <FairValuePanel item={item} />
        )}

        {/* Explicar meu edge — apenas para mercados binários */}
        {(item.source === "polymarket" || item.source === "kalshi") && (
          <ExplainEdgePanel item={item} />
        )}

        <div className="mt-3 pt-3 border-t border-border/20 flex items-center justify-between gap-2">
          <a href={item.externalUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors">
            <ExternalLink className="w-3 h-3" />
            {item.source === "reddit" ? "Ver discussão no Reddit"
              : item.source === "kalshi" ? "Ver mercado no Kalshi"
              : "Ver mercado no Polymarket"}
          </a>
          <div className="flex items-center gap-1">
            {onCompare && (
              <button
                onClick={() => onCompare(item)}
                title={inCompare ? "Remover da comparação" : "Adicionar à comparação"}
                className={`flex items-center gap-1 text-[10px] transition-colors px-2 py-1 rounded-md border ${
                  inCompare
                    ? "border-neon-blue/40 bg-neon-blue/10 text-neon-blue"
                    : "border-border/30 text-muted-foreground hover:text-neon-blue hover:border-neon-blue/30"
                }`}
              >
                <Scale className="w-3 h-3" />
                {inCompare ? "Comparando" : "Comparar"}
              </button>
            )}
            <button
              onClick={handleBookmark}
              title={watched ? "Remover da watchlist" : "Salvar na watchlist"}
              className={`flex items-center gap-1 text-[10px] transition-colors px-2 py-1 rounded-md border ${
                watched
                  ? "border-gold/40 bg-gold/10 text-gold hover:bg-gold/20"
                  : "border-border/30 text-muted-foreground hover:text-gold hover:border-gold/30"
              }`}
            >
              {watched
                ? <><BookmarkCheck className="w-3 h-3" />Salvo</>
                : <><Bookmark className="w-3 h-3" />Salvar</>
              }
            </button>
          </div>
        </div>
      </div>
    </AnimatedSection>
  );
}


// ─── Explain My Edge Panel ────────────────────────────────────────────────────

interface ExplainEdgeResult {
  explanation: string;
  whyMarketMightBeMistaken: string;
  keyInsight: string;
  riskFactor: string;
  confidence: "low" | "medium" | "high";
  edge: number;
}

// Memoizado: numa lista de dezenas de cards, só re-renderiza o card cujo `item`
// mudou (ex.: atualização de preço ao vivo) — não a lista inteira.
const TrendingCard = memo(TrendingCardBase);

function ExplainEdgePanel({ item }: { item: TrendingItem }) {
  const [open, setOpen] = useState(false);
  const [userProbPct, setUserProbPct] = useState<number>(() =>
    item.yesProb !== undefined ? Math.round(item.yesProb * 100) : 50
  );
  const [result, setResult] = useState<ExplainEdgeResult | null>(null);
  const [loading, setLoading] = useState(false);

  const isMarket = item.source === "polymarket" || item.source === "kalshi";
  if (!isMarket || item.yesProb === undefined) return null;

  const marketPct = Math.round(item.yesProb * 100);
  const edgePp = userProbPct - marketPct;
  const CONF_LABEL = { low: "Baixa", medium: "Média", high: "Alta" };
  const CONF_COLOR = { low: "text-muted-foreground", medium: "text-gold", high: "text-positive" };

  async function handleAnalyze() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/explain-edge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: item.title, marketProb: item.yesProb, userProb: userProbPct / 100, source: item.source }),
      });
      const data = await res.json() as ExplainEdgeResult;
      setResult(data);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  return (
    <div className="border-t border-border/10 pt-2 mt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-between gap-1 py-1"
      >
        <span className="flex items-center gap-1">
          <Target className="w-3 h-3" />
          {open ? "Ocultar análise de edge" : "Explicar meu edge vs. mercado"}
        </span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {open && (
        <div className="mt-2 p-3 rounded-lg bg-neon-blue/5 border border-neon-blue/15 space-y-3">
          {/* User prob input */}
          <div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
              <span>Sua estimativa de probabilidade</span>
              <span className={`font-mono font-bold ${edgePp > 0 ? "text-positive" : edgePp < 0 ? "text-negative" : "text-muted-foreground"}`}>
                {edgePp > 0 ? "+" : ""}{edgePp}pp vs. mercado ({marketPct}%)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range" min={1} max={99} value={userProbPct}
                onChange={(e) => { setUserProbPct(Number(e.target.value)); setResult(null); }}
                className="flex-1 h-1.5 accent-primary"
              />
              <span className="text-sm font-mono font-bold text-foreground w-10 text-right">{userProbPct}%</span>
            </div>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading || edgePp === 0}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium bg-neon-blue/15 border border-neon-blue/30 text-neon-blue hover:bg-neon-blue/25 transition-colors disabled:opacity-40"
          >
            {loading ? <><RefreshCw className="w-3 h-3 animate-spin" /> Analisando...</> : <><Sparkles className="w-3 h-3" /> Analisar edge com IA</>}
          </button>

          {result && (
            <div className="space-y-2 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neon-blue">Análise de Edge</span>
                <span className={`${CONF_COLOR[result.confidence]} font-medium`}>Confiança: {CONF_LABEL[result.confidence]}</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">{result.explanation}</p>
              <div className="p-2 rounded bg-secondary/20 space-y-1.5">
                <p><span className="text-gold font-semibold">Por que o mercado pode errar: </span><span className="text-muted-foreground">{result.whyMarketMightBeMistaken}</span></p>
                <p><span className="text-positive font-semibold">Insight principal: </span><span className="text-muted-foreground">{result.keyInsight}</span></p>
                <p><span className="text-negative font-semibold">Risco da tese: </span><span className="text-muted-foreground">{result.riskFactor}</span></p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Fair Value Panel ─────────────────────────────────────────────────────────

interface FairValueResult {
  fairValue: number;
  confidence: "low" | "medium" | "high";
  edge: number;
  signal: "bullish" | "bearish" | "neutral";
  reasoning: string;
  factors: string[];
  caveat: string;
  categoryBaseRate: number;
  cached?: boolean;
}

function FairValuePanel({ item }: { item: TrendingItem }) {
  const [result, setResult] = useState<FairValueResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMarket = item.source === "polymarket" || item.source === "kalshi";
  if (!isMarket || item.yesProb === undefined) return null;

  async function handleFetch() {
    if (result) { setResult(null); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/fair-value", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          marketProb: item.yesProb,
          source: item.source,
          category: item.normalizedCategory,
          volume24h: typeof item.volume24h === "number" ? item.volume24h : undefined,
          weekPriceChange: item.weekPriceChange !== undefined ? Number(item.weekPriceChange) : undefined,
          liquidity: typeof item.liquidity === "number" ? item.liquidity : undefined,
        }),
      });
      if (res.status === 429) {
        const data = await res.json() as { message?: string };
        throw new Error(data.message ?? "RATE_LIMIT");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json() as FairValueResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao calcular fair value");
    } finally {
      setLoading(false);
    }
  }

  const signalColor = result
    ? result.signal === "bullish" ? "text-positive" : result.signal === "bearish" ? "text-negative" : "text-muted-foreground"
    : "";
  const edgeColor = result
    ? result.edge > 3 ? "text-positive" : result.edge < -3 ? "text-negative" : "text-muted-foreground"
    : "";
  const confidenceDot = result
    ? result.confidence === "high" ? "bg-positive" : result.confidence === "medium" ? "bg-gold" : "bg-muted-foreground"
    : "";

  return (
    <div className="border-t border-border/10 pt-2 mt-1">
      <button
        onClick={handleFetch}
        disabled={loading}
        className="w-full text-left flex items-center justify-between gap-1 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex items-center gap-1">
          <Target className="w-3 h-3" />
          {loading ? "Calculando fair value..." : result ? "Ocultar fair value JLB" : "Ver fair value independente JLB"}
        </span>
        {!loading && (result ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
        {loading && <div className="w-3 h-3 border border-primary/40 border-t-transparent rounded-full animate-spin" />}
      </button>

      {error && (
        <p className="text-[10px] text-negative mt-1 px-1">{error}</p>
      )}

      {result && (
        <div className="mt-2 p-3 rounded-lg bg-obsidian/50 border border-border/20 space-y-3">
          {/* Header: fair value vs mercado */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Fair Value JLB</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-xl font-bold font-mono ${signalColor}`}>{result.fairValue}%</span>
                <span className="text-[10px] text-muted-foreground">mercado: {item.yesProb?.toFixed(1)}%</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Edge</p>
              <p className={`text-lg font-bold font-mono ${edgeColor}`}>
                {result.edge >= 0 ? "+" : ""}{result.edge.toFixed(1)}pp
              </p>
            </div>
          </div>

          {/* Confiança + sinal */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${confidenceDot}`} />
              <span className="text-[10px] text-muted-foreground capitalize">
                Confiança {result.confidence === "high" ? "alta" : result.confidence === "medium" ? "média" : "baixa"}
              </span>
            </div>
            <span className={`text-[10px] font-semibold uppercase ${signalColor}`}>
              {result.signal === "bullish" ? "Subavaliado" : result.signal === "bearish" ? "Superavaliado" : "Alinhado"}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Base: {result.categoryBaseRate}%
            </span>
          </div>

          {/* Reasoning */}
          {result.reasoning && (
            <p className="text-xs text-muted-foreground leading-relaxed">{result.reasoning}</p>
          )}

          {/* Fatores */}
          {result.factors.length > 0 && (
            <ul className="space-y-1">
              {result.factors.map((f, i) => (
                <li key={i} className="flex items-start gap-1.5 text-[10px] text-muted-foreground/80">
                  <span className="text-primary/40 mt-0.5">•</span>
                  {f}
                </li>
              ))}
            </ul>
          )}

          {/* Caveat */}
          {result.caveat && (
            <div className="flex items-start gap-1.5 p-2 rounded-md bg-secondary/20 text-[10px] text-muted-foreground/70">
              <Info className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/50" />
              {result.caveat}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompactRow({ item, onCompare, inCompare, onWatch, watched }: {
  item: TrendingItem;
  onCompare?: (item: TrendingItem) => void;
  inCompare?: boolean;
  onWatch?: (item: TrendingItem) => void;
  watched?: boolean;
}) {
  const pct = item.yesProb !== undefined ? Math.round(item.yesProb * 100) : null;
  const pctColor = pct === null ? "text-muted-foreground" : pct >= 70 ? "text-positive" : pct <= 30 ? "text-negative" : "text-gold";
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border/10 hover:bg-secondary/10 transition-colors text-xs">
      <SourceBadge source={item.source} subreddit={item.subreddit} />
      {pct !== null && (
        <span className={`font-mono font-bold w-10 shrink-0 ${pctColor}`}>{pct}%</span>
      )}
      <span className="flex-1 min-w-0 truncate text-foreground/80" title={item.title}>{item.title}</span>
      {item.volume !== undefined && (
        <span className="hidden sm:block text-muted-foreground/60 shrink-0 w-14 text-right">{formatVolume(item.volume)}</span>
      )}
      {item.normalizedCategory !== "other" && item.normalizedCategory !== "all" && (
        <span className="hidden md:block text-[9px] text-muted-foreground/50 shrink-0 w-16 truncate">{CATEGORY_LABELS[item.normalizedCategory]}</span>
      )}
      {item.badge && (
        <span className="hidden lg:block"><MarketBadge badge={item.badge} endDate={item.endDate} /></span>
      )}
      <div className="flex items-center gap-1 shrink-0">
        {onCompare && (
          <button onClick={() => onCompare(item)} title={inCompare ? "Remover comparação" : "Comparar"}
            className={`p-1 rounded transition-colors ${inCompare ? "text-neon-blue" : "text-muted-foreground/40 hover:text-neon-blue"}`}>
            <Scale className="w-3 h-3" />
          </button>
        )}
        <button onClick={() => onWatch?.(item)} title={watched ? "Remover watchlist" : "Watchlist"}
          className={`p-1 rounded transition-colors ${watched ? "text-gold" : "text-muted-foreground/40 hover:text-gold"}`}>
          {watched ? <BookmarkCheck className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
        </button>
        <a href={item.externalUrl} target="_blank" rel="noopener noreferrer"
          className="p-1 rounded text-muted-foreground/40 hover:text-primary transition-colors">
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="glass-card rounded-xl p-5 space-y-4 animate-pulse">
      {/* Title row + prob pill */}
      <div className="flex items-start gap-3">
        <div className="w-2 h-2 rounded-full bg-secondary/50 mt-1.5 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 bg-secondary/50 rounded w-11/12" />
          <div className="h-3 bg-secondary/30 rounded w-5/12" />
          <div className="flex gap-1.5 mt-1">
            <div className="h-4 w-14 bg-secondary/30 rounded-full" />
            <div className="h-4 w-10 bg-secondary/20 rounded-full" />
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-secondary/30 shrink-0" />
      </div>
      {/* Hype bar */}
      <div className="space-y-1">
        <div className="h-2.5 bg-secondary/25 rounded w-20" />
        <div className="h-1.5 bg-secondary/30 rounded-full w-full" />
      </div>
      {/* Stats row */}
      <div className="flex gap-4">
        <div className="h-3 bg-secondary/25 rounded w-16" />
        <div className="h-3 bg-secondary/25 rounded w-20" />
      </div>
      {/* Why trending box */}
      <div className="p-3 rounded-lg bg-secondary/10 space-y-1.5">
        <div className="h-2.5 bg-secondary/30 rounded w-24" />
        <div className="h-3 bg-secondary/20 rounded w-full" />
        <div className="h-3 bg-secondary/15 rounded w-10/12" />
      </div>
      {/* Footer */}
      <div className="flex justify-between items-center pt-1">
        <div className="h-3 bg-secondary/25 rounded w-32" />
        <div className="h-5 bg-secondary/20 rounded w-16" />
      </div>
    </div>
  );
}

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

interface Divergence {
  marketId: string; source: string; title: string; category: string;
  currentProb: number; aiFairValue: number; edge: number; confidence: string;
}

// Store global de edges (fair value IA vs preço) — lido pelos cards sem prop-drilling.
const edgeStore = new Map<string, { edge: number; aiFairValue: number }>();
const edgeListeners = new Set<() => void>();
function publishEdges(divs: Divergence[]) {
  edgeStore.clear();
  for (const d of divs) edgeStore.set(d.marketId, { edge: d.edge, aiFairValue: d.aiFairValue });
  edgeListeners.forEach((l) => l());
}
function useEdge(id: string): { edge: number; aiFairValue: number } | undefined {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((x) => x + 1);
    edgeListeners.add(l);
    return () => { edgeListeners.delete(l); };
  }, []);
  return edgeStore.get(id);
}

function DivergencesSection() {
  const [divs, setDivs] = useState<Divergence[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/ai/divergences")
      .then((r) => r.ok ? r.json() as Promise<{ divergences: Divergence[] }> : null)
      .then((d) => { if (d?.divergences) { setDivs(d.divergences); publishEdges(d.divergences); } })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || divs.length === 0) return null;

  return (
    <AnimatedSection>
      <div className="mb-5 rounded-xl border border-gold/25 bg-gold/3 overflow-hidden">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gold/5 transition-colors text-left"
        >
          <Scale className="w-4 h-4 text-gold shrink-0" />
          <span className="text-sm font-semibold text-foreground">Onde a JLB discorda do mercado</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/15 border border-gold/30 text-gold">{divs.length}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{collapsed ? "mostrar" : "ocultar"}</span>
        </button>
        {!collapsed && (
          <div className="px-4 pb-4 space-y-2">
            <p className="text-[11px] text-muted-foreground mb-1">
              Mercados onde nosso fair value de IA mais difere do preço atual. Edge = nossa estimativa − preço de mercado.
            </p>
            {divs.map((d) => {
              const slug = d.marketId.replace(/^(poly-|kalshi-)/, "");
              const href = d.source === "kalshi" ? `/apostas/kalshi-${slug}` : `/apostas/poly-${slug}`;
              return (
                <Link key={d.marketId} href={href}>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/20 border border-border/15 hover:border-gold/30 transition-colors cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{d.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Mercado <span className="font-mono text-foreground">{d.currentProb}%</span> ·
                        JLB <span className="font-mono text-gold">{d.aiFairValue}%</span>
                        <span className="ml-1">({d.source === "kalshi" ? "Kalshi" : "Polymarket"})</span>
                      </p>
                    </div>
                    <div className={`text-center px-2.5 py-1 rounded-lg shrink-0 ${d.edge > 0 ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>
                      <p className="text-[9px] uppercase">Edge</p>
                      <p className="text-sm font-mono font-bold">{d.edge > 0 ? "+" : ""}{d.edge}pp</p>
                    </div>
                  </div>
                </Link>
              );
            })}
            <p className="text-[10px] text-muted-foreground/50 pt-1">
              Edge alto não é lucro garantido — o mercado pode ter informação que o modelo não tem. Sempre verifique a análise completa.
            </p>
          </div>
        )}
      </div>
    </AnimatedSection>
  );
}

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
            <div className="mb-5 p-3 rounded-xl border border-yellow-500/20 bg-yellow-500/8 flex gap-3">
              <AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" aria-hidden="true" />
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
