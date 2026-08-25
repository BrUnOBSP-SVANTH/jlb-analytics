/**
 * Modal de análise da página Notícias — extraído de Noticias.tsx.
 * ArticleDetailModal cruza um artigo com mercados relacionados (Polymarket/Kalshi).
 * A análise de um mercado isolado agora vive na tela dedicada /apostas/:id.
 * Tipos privados aqui; Article/timeAgoISO compartilhados via lib/noticiasShared.
 */
import { useState, useEffect, useRef } from "react";
import {
  AlertCircle, BookOpen, Brain, ExternalLink, Globe, Loader2, Minus,
  RefreshCw, TrendingDown, TrendingUp, X as XIcon, Zap,
} from "lucide-react";
import { useModalA11y } from "@/hooks/useModalA11y";
import { type Article, timeAgoISO } from "@/lib/noticiasShared";


// ── Article Cross-Reference types ─────────────────────────────────────────

interface CrossRefMarket {
  source: "Polymarket" | "Kalshi";
  marketTitle: string;
  marketProb: number;
  id: string;
  jlbProb: number;
  verdict: "higher" | "lower" | "aligned";
  reasoning: string;
  confidence: "low" | "medium" | "high";
}

interface CrossRefResult {
  relatedMarkets: CrossRefMarket[];
  overallContext: string;
  marketsAvailable: number;
  cached?: boolean;
}

// ── Article Detail Modal ───────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: CrossRefMarket["verdict"] }) {
  if (verdict === "higher") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border text-positive bg-positive/10 border-positive/20">
      <TrendingUp className="w-3 h-3" />SUBESTIMADO
    </span>
  );
  if (verdict === "lower") return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border text-negative bg-negative/10 border-negative/20">
      <TrendingDown className="w-3 h-3" />SUPERESTIMADO
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border text-muted-foreground bg-secondary/40 border-border/20">
      <Minus className="w-3 h-3" />ALINHADO
    </span>
  );
}

function ProbCompare({ marketProb, jlbProb }: { marketProb: number; jlbProb: number }) {
  const diff = jlbProb - marketProb;
  const diffColor = diff > 3 ? "text-positive" : diff < -3 ? "text-negative" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-3">
      <div className="text-center">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5">Mercado</p>
        <p className="font-mono text-base font-bold text-foreground">{marketProb}%</p>
      </div>
      <div className="flex-1 flex flex-col items-center gap-0.5">
        <div className="w-full h-0.5 bg-border/30 relative">
          <div
            className={`absolute top-1/2 -translate-y-1/2 text-[9px] font-bold ${diffColor}`}
            style={{ left: diff >= 0 ? "50%" : "auto", right: diff < 0 ? "50%" : "auto" }}
          >
            {diff >= 0 ? "+" : ""}{diff.toFixed(0)}pp
          </div>
        </div>
      </div>
      <div className="text-center">
        <p className="text-[9px] text-gold uppercase tracking-wide mb-0.5">JLB Honesto</p>
        <p className={`font-mono text-base font-bold text-gold`}>{jlbProb}%</p>
      </div>
    </div>
  );
}

interface ArticleDetailModalProps {
  article: Article;
  onClose: () => void;
}

export function ArticleDetailModal({ article, onClose }: ArticleDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<CrossRefResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await fetch("/api/ai/article-crossref", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: article.title, description: article.description }),
          signal: AbortSignal.timeout(35_000),
        });
        if (!res.ok) {
          if (res.status === 429) throw new Error("rate_limited");
          throw new Error(`http_${res.status}`);
        }
        const data = await res.json() as CrossRefResult;
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) {
          const isTimeout = (err instanceof DOMException && err.name === "TimeoutError")
            || (err instanceof Error && /timed out|abort/i.test(err.message));
          setError(isTimeout ? "timeout" : err instanceof Error ? err.message : "unknown");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [article.title, article.description, attempt]);

  // Fechar com Escape
  useModalA11y(onClose, panelRef);

  const confidenceLabel = (c: string) =>
    c === "high" ? "Alta confiança" : c === "low" ? "Baixa confiança" : "Confiança média";
  const confidenceColor = (c: string) =>
    c === "high" ? "text-positive" : c === "low" ? "text-muted-foreground" : "text-gold";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Análise do artigo"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-obsidian/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div ref={panelRef} tabIndex={-1} className="relative z-10 w-full max-w-xl h-full overflow-y-auto bg-card border-l border-border/40 shadow-2xl flex flex-col focus:outline-none">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start gap-3 p-4 border-b border-border/30 bg-card/95 backdrop-blur-sm">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-gold shrink-0" />
              <span className="text-xs font-semibold text-gold uppercase tracking-wide">Mercados relacionados</span>
            </div>
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{article.title}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {article.source && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Globe className="w-3 h-3" />
                  {article.source}
                </span>
              )}
              <span className="text-[10px] text-muted-foreground">{timeAgoISO(article.publishedAt)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors shrink-0"
            aria-label="Fechar"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        {article.description && (
          <div className="px-4 py-3 border-b border-border/20 bg-secondary/10">
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{article.description}</p>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 p-4 space-y-4">
          {/* Loading */}
          {loading && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" />
                Cruzando artigo com mercados preditivos…
              </div>
              {[0, 1, 2].map((i) => (
                <div key={i} className="glass-card rounded-xl p-4 space-y-2 animate-pulse">
                  <div className="h-3 bg-secondary/50 rounded w-3/4" />
                  <div className="h-3 bg-secondary/40 rounded w-full" />
                  <div className="flex justify-between mt-2">
                    <div className="h-6 bg-secondary/40 rounded w-16" />
                    <div className="h-6 bg-secondary/30 rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="p-4 rounded-xl bg-negative/10 border border-negative/30 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-negative shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {error === "timeout" ? "A análise demorou mais que o esperado"
                      : error === "rate_limited" ? "Muitas análises em sequência"
                      : "Não foi possível cruzar com os mercados"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {error === "timeout" ? "O cruzamento com os mercados pode levar alguns segundos a mais sob carga. Tente novamente."
                      : error === "rate_limited" ? "Aguarde alguns segundos antes de pedir uma nova análise."
                      : "Houve uma falha temporária. Tente novamente em instantes."}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAttempt((a) => a + 1)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gold/15 hover:bg-gold/25 border border-gold/30 text-gold text-xs font-semibold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar novamente
              </button>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <>
              {/* Overall context */}
              {result.overallContext && (
                <div className="flex items-start gap-2.5 p-3 rounded-xl border border-gold/15 bg-gold/5">
                  <Brain className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground/80 leading-relaxed">{result.overallContext}</p>
                </div>
              )}

              {/* No markets */}
              {result.relatedMarkets.length === 0 && (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-muted-foreground">Nenhum mercado diretamente relacionado encontrado.</p>
                  {result.marketsAvailable === 0 && (
                    <p className="text-xs text-muted-foreground/60">
                      Os mercados ainda não foram carregados. Acesse a aba Polymarket ou Kalshi primeiro.
                    </p>
                  )}
                </div>
              )}

              {/* Market cards */}
              {result.relatedMarkets.map((m, i) => (
                <div key={`${m.id}-${i}`} className="glass-card rounded-xl p-4 space-y-3">
                  {/* Source + verdict */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide ${
                      m.source === "Polymarket"
                        ? "text-blue-400 bg-blue-400/10 border-blue-400/20"
                        : "text-purple-400 bg-purple-400/10 border-purple-400/20"
                    }`}>
                      {m.source}
                    </span>
                    <VerdictBadge verdict={m.verdict} />
                    <span className={`ml-auto text-[10px] font-medium ${confidenceColor(m.confidence)}`}>
                      {confidenceLabel(m.confidence)}
                    </span>
                  </div>

                  {/* Market title */}
                  <p className="text-sm font-medium text-foreground leading-snug">{m.marketTitle}</p>

                  {/* Prob comparison */}
                  <ProbCompare marketProb={m.marketProb} jlbProb={m.jlbProb} />

                  {/* Reasoning */}
                  <p className="text-xs text-muted-foreground leading-relaxed border-t border-border/20 pt-2">
                    {m.reasoning}
                  </p>
                </div>
              ))}

              <p className="text-[10px] text-muted-foreground/50 text-center pt-2">
                Análise educacional — não é recomendação de compra · {result.marketsAvailable} mercados analisados
              </p>
            </>
          )}
        </div>

        {/* Footer: link para artigo original */}
        <div className="sticky bottom-0 p-4 border-t border-border/30 bg-card/95 backdrop-blur-sm">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-gold/10 border border-gold/20 text-gold text-sm font-medium hover:bg-gold/20 transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            Ver artigo original
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}


