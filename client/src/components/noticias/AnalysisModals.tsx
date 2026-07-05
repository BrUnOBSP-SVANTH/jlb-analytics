/**
 * Modais de análise da página Notícias — extraídos de Noticias.tsx.
 * MarketAnalysisModal (análise IA de um mercado, stream SSE) e ArticleDetailModal
 * (cruza um artigo com mercados relacionados). Tipos privados aqui; Article/
 * timeAgoISO/SelectedMarket compartilhados via lib/noticiasShared + export local.
 */
import { useState, useEffect, useRef } from "react";
import {
  AlertCircle, BookOpen, Brain, ExternalLink, Globe, Loader2, Minus,
  Newspaper, RefreshCw, TrendingDown, TrendingUp, X as XIcon, Zap,
} from "lucide-react";
import { useModalA11y } from "@/hooks/useModalA11y";
import { type Article, timeAgoISO } from "@/lib/noticiasShared";

export interface SelectedMarket {
  title: string;
  prob: number;
  source: "Polymarket" | "Kalshi";
  id?: string;
  category?: string;
}

interface AnalyzeResult {
  analysis: string;
  keyFactors: string[];
  watchFor?: string;
  biasAlert?: string | null;
  newsRelevance?: "high" | "medium" | "low" | "none";
  probabilityAssessment?: "fair" | "underpriced" | "overpriced" | "uncertain";
  edgeSignal?: string | null;
  fairValue?: number | null;
  edgePp?: number | null;
  confidence?: "baixa" | "media" | "alta";
  referenceClass?: string | null;
  cerebroHits?: number;
  hasMomentum?: boolean;
  isBR?: boolean;
  articles: Array<{ title: string; description: string; url: string; source: string; publishedAt: string; urlToImage?: string }>;
  cached?: boolean;
}

export function MarketAnalysisModal({ market, onClose }: { market: SelectedMarket; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    // Consome o stream SSE de /analyze/stream — mostra fases REAIS (buscando
    // fontes → cruzando → IA analisando) em vez de um cronômetro adivinhado.
    async function load() {
      setLoading(true); setError(null); setResult(null); setPhase(null);
      try {
        const res = await fetch("/api/ai/analyze/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: market.title,
            yesProb: market.prob / 100,
            source: market.source.toLowerCase(),
            marketId: market.id,
            category: market.category,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          if (res.status === 429) throw new Error("rate_limited");
          throw new Error(`http_${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let gotResult = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const block = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            let evt = "message"; let dataStr = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) evt = line.slice(6).trim();
              else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
            }
            if (!dataStr) continue;
            const payload = JSON.parse(dataStr) as Record<string, unknown>;
            if (cancelled) return;
            if (evt === "phase") setPhase(String(payload.step));
            else if (evt === "result") { setResult(payload as unknown as AnalyzeResult); gotResult = true; }
            else if (evt === "error") throw new Error(String(payload.message ?? "stream_error"));
          }
        }
        if (!gotResult && !cancelled) throw new Error("no_result");
      } catch (err) {
        if (!cancelled) {
          const isTimeout = (err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError"))
            || (err instanceof Error && /timed out|abort/i.test(err.message));
          setError(isTimeout ? "timeout" : err instanceof Error ? err.message : "unknown");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    const killTimer = setTimeout(() => ctrl.abort(), 55_000); // rede de segurança
    void load();
    return () => { cancelled = true; clearTimeout(killTimer); ctrl.abort(); };
  }, [market.title, market.prob, market.source, market.id, market.category, attempt]);

  // Contador de tempo decorrido — comunica progresso durante a análise (que é densa).
  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading, attempt]);

  useModalA11y(onClose, panelRef);

  const probColor = market.prob >= 70 ? "text-positive" : market.prob <= 30 ? "text-negative" : "text-gold";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-obsidian/70 backdrop-blur-sm" onClick={onClose} />
      <div ref={panelRef} tabIndex={-1} className="relative z-10 w-full max-w-xl h-full overflow-y-auto bg-card border-l border-border/40 shadow-2xl flex flex-col focus:outline-none">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start gap-3 p-4 border-b border-border/30 bg-card/95 backdrop-blur-sm">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-gold shrink-0" />
              <span className="text-xs font-semibold text-gold uppercase tracking-wide">Análise + Notícias</span>
              <span className={`ml-auto text-xs font-bold px-1.5 py-0.5 rounded border ${
                market.source === "Polymarket"
                  ? "text-blue-400 bg-blue-400/10 border-blue-400/20"
                  : "text-purple-400 bg-purple-400/10 border-purple-400/20"
              }`}>{market.source}</span>
            </div>
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-3">{market.title}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Prob. SIM:</span>
              <span className={`font-mono text-sm font-bold ${probColor}`}>{market.prob}%</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                market.prob >= 70 ? "border-positive/30 bg-positive/10 text-positive" :
                market.prob >= 55 ? "border-gold/30 bg-gold/10 text-gold" :
                market.prob >= 45 ? "border-border/30 bg-secondary/20 text-muted-foreground" :
                market.prob >= 30 ? "border-negative/20 bg-negative/5 text-negative/70" :
                "border-negative/30 bg-negative/10 text-negative"
              }`}>
                {market.prob >= 70 ? "Muito provável" :
                 market.prob >= 55 ? "Provável" :
                 market.prob >= 45 ? "Incerto" :
                 market.prob >= 30 ? "Improvável" : "Muito improvável"}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors shrink-0" aria-label="Fechar">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 p-4 space-y-4">
          {loading && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" />
                  <span>{phase === "analyzing" ? "IA calculando o fair value…" : "Buscando notícias e cruzando fontes…"}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground/60 tabular-nums">{elapsed}s</span>
                </div>
                {/* Passos guiados pela FASE REAL do servidor (stream SSE), não por tempo */}
                <div className="flex flex-col gap-1 pl-5">
                  <span className={`text-[10px] transition-colors ${(phase === null || phase === "sources") ? "text-gold" : "text-muted-foreground/40"}`}>{(phase === null || phase === "sources") ? "›" : "✓"} IA interpreta o contexto e busca notícias</span>
                  <span className={`text-[10px] transition-colors ${phase === "sources_done" ? "text-gold" : phase === "analyzing" ? "text-muted-foreground/40" : "text-muted-foreground/30"}`}>{phase === "analyzing" ? "✓" : phase === "sources_done" ? "›" : "·"} Cruza Cerebro, momentum e base rate da categoria</span>
                  <span className={`text-[10px] transition-colors ${phase === "analyzing" ? "text-gold" : "text-muted-foreground/30"}`}>{phase === "analyzing" ? "›" : "·"} Calcula fair value e detecta viés/edge</span>
                </div>
                {elapsed >= 25 && (
                  <p className="text-[10px] text-muted-foreground/50 pl-5">Análise mais densa que o normal — quase lá.</p>
                )}
              </div>
              {[0, 1].map((i) => (
                <div key={i} className="glass-card rounded-xl p-4 space-y-2 animate-pulse">
                  <div className="h-3 bg-secondary/50 rounded w-full" />
                  <div className="h-3 bg-secondary/40 rounded w-4/5" />
                  <div className="h-3 bg-secondary/30 rounded w-2/3" />
                </div>
              ))}
            </div>
          )}

          {error && !loading && (
            <div className="p-4 rounded-xl bg-negative/10 border border-negative/30 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-negative shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {error === "timeout" ? "A análise demorou mais que o esperado"
                      : error === "rate_limited" ? "Muitas análises em sequência"
                      : "Não foi possível concluir a análise"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {error === "timeout" ? "O motor cruza várias fontes em tempo real e pode levar alguns segundos a mais sob carga. Tente novamente."
                      : error === "rate_limited" ? "Aguarde alguns segundos antes de pedir uma nova análise."
                      : "Houve uma falha temporária ao cruzar as fontes. Tente novamente em instantes."}
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

          {result && !loading && (
            <>
              {/* Fair Value JLB — estimativa independente cruzando todas as fontes */}
              {result.fairValue != null && (
                <div className={`p-4 rounded-xl border space-y-3 ${
                  result.probabilityAssessment === "underpriced" ? "border-positive/25 bg-positive/5"
                    : result.probabilityAssessment === "overpriced" ? "border-negative/25 bg-negative/5"
                    : "border-border/25 bg-secondary/10"
                }`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <p className="text-[9px] text-muted-foreground/60 uppercase">Mercado</p>
                        <p className="font-mono font-bold text-foreground">{market.prob}%</p>
                      </div>
                      <span className="text-muted-foreground/40">vs</span>
                      <div className="text-center">
                        <p className="text-[9px] text-gold/70 uppercase">Fair Value JLB</p>
                        <p className="font-mono font-bold text-gold text-lg">{result.fairValue}%</p>
                      </div>
                      {result.edgePp != null && Math.abs(result.edgePp) >= 1 && (
                        <div className={`text-center px-2 py-1 rounded-lg ${result.edgePp > 0 ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>
                          <p className="text-[9px] uppercase opacity-70">Edge</p>
                          <p className="font-mono font-bold text-sm">{result.edgePp > 0 ? "+" : ""}{result.edgePp}pp</p>
                        </div>
                      )}
                    </div>
                    {result.confidence && (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                        result.confidence === "alta" ? "border-positive/30 bg-positive/10 text-positive" :
                        result.confidence === "media" ? "border-gold/30 bg-gold/10 text-gold" :
                        "border-border/30 bg-secondary/20 text-muted-foreground"
                      }`}>conf. {result.confidence}</span>
                    )}
                  </div>
                  {result.edgeSignal && (
                    <p className="text-xs text-foreground/80 leading-relaxed">{result.edgeSignal}</p>
                  )}
                  {result.referenceClass && (
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed border-t border-border/15 pt-2">
                      <span className="font-semibold">Âncora:</span> {result.referenceClass}
                    </p>
                  )}
                </div>
              )}

              {/* Análise principal */}
              {result.analysis && (
                <div className="p-3 rounded-xl border border-gold/15 bg-gold/5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gold uppercase tracking-wide flex-wrap">
                    <Brain className="w-3.5 h-3.5" />
                    Análise JLB
                    {result.isBR && <span className="text-[9px] px-1.5 py-0.5 rounded bg-gold/15 border border-gold/30">🇧🇷 PT</span>}
                    {(result.cerebroHits ?? 0) > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-neon-blue/10 border border-neon-blue/30 text-neon-blue normal-case">
                        🧠 Cerebro ×{result.cerebroHits}
                      </span>
                    )}
                    {result.hasMomentum && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/40 border border-border/30 text-muted-foreground normal-case">
                        📈 momentum
                      </span>
                    )}
                    {result.cached && <span className="text-[9px] text-muted-foreground/50">(cache)</span>}
                  </div>
                  <p className="text-sm text-foreground/85 leading-relaxed">{result.analysis}</p>
                </div>
              )}

              {/* Fatores-chave */}
              {result.keyFactors?.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Fatores-chave</p>
                  <ul className="space-y-1">
                    {result.keyFactors.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground/80">
                        <span className="text-gold mt-0.5 shrink-0">•</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* O que acompanhar */}
              {result.watchFor && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-secondary/20 border border-border/20">
                  <TrendingUp className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">O que acompanhar</p>
                    <p className="text-xs text-foreground/75">{result.watchFor}</p>
                  </div>
                </div>
              )}

              {/* Alerta de viés */}
              {result.biasAlert && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-negative/8 border border-negative/20">
                  <AlertCircle className="w-3.5 h-3.5 text-negative/70 shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground/70">{result.biasAlert}</p>
                </div>
              )}

              {/* Notícias — com indicador de relevância */}
              {(() => {
                const rel = result.newsRelevance;
                const relConfig = {
                  high:   { label: "Alta relevância",    color: "text-positive",   dot: "bg-positive",   desc: "Notícias diretamente sobre este mercado" },
                  medium: { label: "Relevância média",   color: "text-gold",       dot: "bg-gold",       desc: "Notícias relacionadas ao contexto" },
                  low:    { label: "Baixa relevância",   color: "text-muted-foreground", dot: "bg-muted-foreground", desc: "Poucas notícias específicas encontradas" },
                  none:   { label: "Sem notícias relevantes", color: "text-muted-foreground/60", dot: "bg-muted-foreground/40", desc: "Não localizamos notícias recentes sobre este tópico" },
                } as const;
                const cfg = relConfig[rel ?? "low"];

                return (
                  <div className="space-y-2">
                    {/* Header com relevância */}
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Notícias recentes
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    </div>

                    {result.articles?.length > 0 ? (
                      <>
                        <p className="text-[10px] text-muted-foreground/50 -mt-1">{cfg.desc} · {result.articles.length} artigo{result.articles.length !== 1 ? "s" : ""} selecionado{result.articles.length !== 1 ? "s" : ""} de múltiplas buscas</p>
                        {result.articles.map((a, i) => (
                          <a
                            key={i}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex gap-3 p-3 rounded-xl border border-border/20 hover:border-gold/20 bg-secondary/10 hover:bg-secondary/20 transition-colors group"
                          >
                            {a.urlToImage && (
                              <img
                                src={a.urlToImage}
                                alt=""
                                aria-hidden="true"
                                loading="lazy"
                                className="w-16 h-12 rounded-lg object-cover shrink-0 opacity-70 group-hover:opacity-90 transition-opacity"
                                onError={(e) => { e.currentTarget.style.display = "none"; }}
                              />
                            )}
                            <div className="flex-1 min-w-0 space-y-1">
                              <p className="text-xs font-medium text-foreground leading-snug line-clamp-2 group-hover:text-gold transition-colors">{a.title}</p>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                                <span>{a.source}</span>
                                <span>·</span>
                                <span>{timeAgoISO(a.publishedAt)}</span>
                                <ExternalLink className="w-2.5 h-2.5 ml-auto" />
                              </div>
                            </div>
                          </a>
                        ))}
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 py-6 text-center">
                        <Newspaper className="w-6 h-6 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground/60">{cfg.desc}</p>
                        <p className="text-[10px] text-muted-foreground/40">
                          A análise acima foi gerada com o conhecimento interno do modelo.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              <p className="text-[10px] text-muted-foreground/40 text-center pt-2">
                Análise educacional · não é recomendação de aposta
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

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
              <span className="text-xs font-semibold text-gold uppercase tracking-wide">Apostas relacionadas</span>
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
                Análise educacional — não é recomendação de aposta · {result.marketsAvailable} mercados analisados
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


