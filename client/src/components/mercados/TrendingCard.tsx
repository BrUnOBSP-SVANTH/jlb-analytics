/**
 * TrendingCard — card de mercado/post da lista de Apostas. Extraído de
 * pages/Apostas.tsx. Comportamento idêntico. Memoizado para não re-renderizar a
 * lista inteira quando só um card muda (preço ao vivo).
 */
import { useState, useEffect, useRef, memo } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import AnimatedSection from "@/components/AnimatedSection";
import {
  Languages, Clock, TrendingUp, MessageSquare, BarChart2, Flame, Sparkles,
  ArrowRight, ChevronUp, ChevronDown, ExternalLink, Scale, BookmarkCheck, Bookmark,
} from "lucide-react";
import { addToWatchlist, removeFromWatchlist, isWatched } from "@/lib/watchlist";
import { useLivePrice } from "@/lib/livePrices";
import { type TrendingItem, CATEGORY_LABELS, formatVolume } from "@/lib/trending";
import {
  ProbSparkline, MarketBadge, SentimentBadge, SourceBadge, ProbHero, ProbBar, MultiOutcomePills,
} from "@/components/mercados/cards";
import { NewsAnalysisPanel } from "@/components/mercados/panels";
import { useEdge } from "@/components/mercados/edgeStore";

function formatAge(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)}min atrás`;
  if (hours < 24) return `${Math.round(hours)}h atrás`;
  return `${Math.round(hours / 24)}d atrás`;
}

function TrendingCardBase({ item, onCompare, inCompare }: {
  item: TrendingItem;
  onCompare?: (item: TrendingItem) => void;
  inCompare?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false); // botão único "Analisar" abre as ferramentas
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
    <AnimatedSection className="h-full flex flex-col">
      <div className="glass-card card-lift rounded-xl p-5 flex-1 flex flex-col">
        {/* ── Cabeçalho: pergunta + probabilidade protagonista ── */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
              item.score >= 70 ? "bg-positive animate-pulse" : item.score >= 40 ? "bg-gold" : "bg-primary/50"
            }`} />
            <div className="min-w-0">
              {/* Título clicável nos mercados (abre a tela de detalhe) — padrão Polymarket */}
              {isMarket ? (
                <Link href={`/apostas/${item.id}`}>
                  <p className="text-sm font-medium text-foreground leading-snug hover:text-gold transition-colors cursor-pointer">{item.title}</p>
                </Link>
              ) : (
                <p className="text-sm font-medium text-foreground leading-snug">{item.title}</p>
              )}
              {translating && !translation && isMarket && (
                <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                  <Languages className="w-3 h-3" /> Traduzindo...
                </p>
              )}
              {translation && <p className="text-xs text-gold/80 mt-1 leading-snug italic">{translation}</p>}
            </div>
          </div>
          {/* Número-herói (mercados binários) */}
          {item.yesProb !== undefined && !item.parsedOutcomes && (
            <ProbHero prob={livePct / 100} flash={liveFlash ?? probFlash} />
          )}
        </div>

        {/* ── Badges ── */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <SourceBadge source={item.source} subreddit={item.subreddit} />
          {item.badge && <MarketBadge badge={item.badge} endDate={item.endDate} />}
          {jlbEdge && Math.abs(jlbEdge.edge) >= 4 && (
            <span
              title={`Fair value JLB: ${jlbEdge.aiFairValue}% vs mercado — clique em Analisar`}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                jlbEdge.edge > 0
                  ? "border-positive/40 bg-positive/10 text-positive"
                  : "border-negative/40 bg-negative/10 text-negative"
              }`}
            >
              JLB {jlbEdge.edge > 0 ? "+" : ""}{jlbEdge.edge}pp
            </span>
          )}
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
          {/* Tradução como chip discreto no fim da linha (não gasta uma linha própria) */}
          {isMarket && translation && (
            <button onClick={() => setTranslation(null)}
              className="text-[10px] text-muted-foreground/70 hover:text-gold transition-colors flex items-center gap-0.5">
              <Languages className="w-3 h-3" />ocultar
            </button>
          )}
          {!isMarket && (
            <button onClick={handleTranslate} disabled={translating}
              className="text-[10px] text-muted-foreground/70 hover:text-gold transition-colors flex items-center gap-0.5 disabled:opacity-50">
              <Languages className="w-3 h-3" />
              {translating ? "traduzindo..." : translation ? "ocultar" : "traduzir"}
            </button>
          )}
        </div>

        {/* ── Probabilidade: barra SIM/NÃO (binário) ou breakdown (multi-outcome) ── */}
        {item.parsedOutcomes ? (
          <div className="mb-3">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5">Probabilidades</p>
            <MultiOutcomePills outcomes={item.parsedOutcomes} />
          </div>
        ) : item.yesProb !== undefined ? (
          <div className="mb-3"><ProbBar prob={livePct / 100} /></div>
        ) : null}

        {/* ── Mini-tendência 7d (mercados) ── */}
        {item.source === "polymarket" && item.clobTokenIds && !item.parsedOutcomes && (
          <ProbSparkline tokenIds={item.clobTokenIds} marketId={item.id} source="polymarket" />
        )}
        {item.source === "kalshi" && !item.parsedOutcomes && (
          <ProbSparkline marketId={item.id} source="kalshi" />
        )}

        {/* ── Stats + insight (compacto) ── */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2 mb-2">
          {item.upvotes !== undefined && (
            <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{item.upvotes.toLocaleString()} votos</span>
          )}
          {item.comments !== undefined && (
            <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{item.comments.toLocaleString()} coment.</span>
          )}
          {item.volume !== undefined && (
            <span className="flex items-center gap-1"><BarChart2 className="w-3 h-3" />{formatVolume(item.volume)} volume</span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground/60 leading-relaxed line-clamp-1 mb-3">
          <Flame className="w-3 h-3 text-primary/50 inline mr-1 align-[-2px]" />{item.whyTrending}
        </p>

        {/* ── Ações (Analisar + rodapé) ──
            mt-auto ancora este bloco na BASE do card: com o card em flex-col + h-full,
            todos os cards da linha ficam simétricos (mesma altura, ação alinhada embaixo,
            independente de título/badges/prob variarem). Mercados abrem a tela dedicada;
            Reddit/Manifold mantêm a análise inline. */}
        <div className="mt-auto">
        {isMarket ? (
          <Link href={`/apostas/${item.id}`}>
            <span className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border/30 bg-secondary/20 text-xs font-medium text-foreground/80 hover:text-foreground hover:border-primary/40 hover:bg-secondary/30 transition-colors cursor-pointer">
              <Sparkles className="w-3.5 h-3.5 text-primary/70" aria-hidden="true" />
              Analisar mercado
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </Link>
        ) : (
          <>
            <button
              onClick={() => setAnalysisOpen((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-border/30 bg-secondary/20 text-xs font-medium text-foreground/80 hover:text-foreground hover:border-primary/30 transition-colors"
              aria-expanded={analysisOpen}
            >
              <Sparkles className="w-3.5 h-3.5 text-primary/70" aria-hidden="true" />
              {analysisOpen ? "Ocultar análise" : "Analisar"}
              {analysisOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {analysisOpen && (
              <div className="mt-3 space-y-1">
                {/* Análise de aposta (Reddit) */}
                <button
                  className="w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-between gap-1 py-1"
                  onClick={() => setExpanded((v) => !v)}
                >
                  <span className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />{expanded ? "Ocultar análise do mercado" : "Análise do mercado"}
                  </span>
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
                {expanded && item.bestBetNote && (
                  <div className="mt-1 p-3 rounded-lg bg-obsidian/50 border border-border/20">
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.bestBetNote}</p>
                  </div>
                )}

                {/* IA + notícias */}
                <NewsAnalysisPanel item={item} />
              </div>
            )}
          </>
        )}

        {/* ── Rodapé ── */}
        <div className="mt-3 pt-3 border-t border-border/20 flex items-center justify-between gap-2">
          <a href={item.externalUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary/70 hover:text-primary transition-colors">
            <ExternalLink className="w-3 h-3" />
            {item.source === "reddit" ? "Ver no Reddit"
              : item.source === "kalshi" ? "Ver no Kalshi"
              : "Ver no Polymarket"}
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
      </div>
    </AnimatedSection>
  );
}

export const TrendingCard = memo(TrendingCardBase);
