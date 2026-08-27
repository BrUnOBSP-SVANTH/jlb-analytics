/**
 * Painéis de análise expansíveis dos cards de Apostas — extraídos de Apostas.tsx.
 * EdgeCalculator, MarketAnalysis (IA + notícias), NewsArticleList e NewsAnalysisPanel.
 * calcEV/calcKelly ficam aqui (usados só por estes painéis).
 */
import { useState } from "react";
import {
  AlertTriangle, Calculator, ChevronDown, ChevronUp, ExternalLink,
  Flame, Info, Newspaper, Sparkles, Target, Zap,
} from "lucide-react";
import { type TrendingItem, formatVolume, formatOdds } from "@/lib/trending";
import { awardPoints } from "@/lib/userProgress";
import { maybeAuthGate } from "@/lib/upgrade";
import { VolumeTrend } from "@/components/mercados/cards";

function calcEV(yourProb: number, marketProb: number): number {
  if (marketProb <= 0 || marketProb >= 1) return 0;
  const b = 1 / marketProb - 1;
  return yourProb * b - (1 - yourProb);
}

function calcKelly(yourProb: number, marketProb: number): number {
  if (marketProb <= 0 || marketProb >= 1) return 0;
  const b = 1 / marketProb - 1;
  return Math.max(0, (b * yourProb - (1 - yourProb)) / b);
}

function EdgeCalculator({ marketProb }: { marketProb: number }) {
  const [yourPct, setYourPct] = useState(Math.round(marketProb * 100));
  const yourProb = yourPct / 100;
  const ev = calcEV(yourProb, marketProb);
  const kelly = calcKelly(yourProb, marketProb);
  const halfKelly = kelly / 2;
  const edge = yourProb - marketProb;
  const hasValue = ev > 0;
  // EV que arredonda para 0.0% é neutro — "+0.0%" pintado de vermelho contradiz o próprio sinal
  const evNeutral = Math.abs(ev * 100) < 0.05;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="w-3.5 h-3.5 text-primary/70" />
        <p className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider">Calculadora de Edge</p>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Insira sua estimativa de probabilidade. O sistema calcula automaticamente o Valor Esperado e a fração de Kelly recomendada.
      </p>
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] text-muted-foreground">Sua estimativa</span>
          <span className="text-sm font-mono font-bold text-foreground">{yourPct}%</span>
        </div>
        <input type="range" min={1} max={99} value={yourPct}
          onChange={(e) => setYourPct(Number(e.target.value))}
          className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
        />
        <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-0.5">
          <span>1%</span><span>50%</span><span>99%</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-2.5 rounded-lg border ${evNeutral ? "border-border/20 bg-secondary/10" : hasValue ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"}`}>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Valor Esperado (EV)</p>
          <p className={`text-base font-mono font-bold ${evNeutral ? "text-muted-foreground" : hasValue ? "text-positive" : "text-negative"}`}>
            {evNeutral ? "0.0" : `${ev >= 0 ? "+" : ""}${(ev * 100).toFixed(1)}`}%
          </p>
          <p className="text-[9px] text-muted-foreground mt-0.5">por real na posição</p>
        </div>
        <div className={`p-2.5 rounded-lg border ${edge > 0 ? "border-neon-blue/20 bg-neon-blue/5" : "border-border/20 bg-secondary/10"}`}>
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Edge vs Mercado</p>
          <p className={`text-base font-mono font-bold ${edge > 0 ? "text-neon-blue" : "text-muted-foreground"}`}>
            {edge >= 0 ? "+" : ""}{(edge * 100).toFixed(1)}pp
          </p>
          <p className="text-[9px] text-muted-foreground mt-0.5">Mercado: {Math.round(marketProb * 100)}% | Você: {yourPct}%</p>
        </div>
        <div className="p-2.5 rounded-lg border border-gold/20 bg-gold/5">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Kelly Completo</p>
          <p className="text-base font-mono font-bold text-gold">{(kelly * 100).toFixed(1)}%</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">da banca</p>
        </div>
        <div className="p-2.5 rounded-lg border border-gold/10 bg-gold/[0.03]">
          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">½ Kelly (recomendado)</p>
          <p className="text-base font-mono font-bold text-gold/70">{(halfKelly * 100).toFixed(1)}%</p>
          <p className="text-[9px] text-muted-foreground mt-0.5">da banca</p>
        </div>
      </div>
      <div className={`flex items-center gap-2 p-2 rounded-lg ${hasValue ? "bg-positive/10 border border-positive/20" : "bg-secondary/20 border border-border/20"}`}>
        <Zap className={`w-3 h-3 shrink-0 ${hasValue ? "text-positive" : "text-muted-foreground"}`} />
        <p className="text-[10px] leading-relaxed">
          {hasValue
            ? `Valor positivo detectado. Com ½ Kelly: arrisque ${(halfKelly * 100).toFixed(1)}% da banca. EV de longo prazo: ${(ev * 100).toFixed(1)}% por posição.`
            : evNeutral
            ? "EV zero — sua estimativa coincide com o preço do mercado. Não há vantagem matemática de nenhum lado."
            : "Sem valor com esta estimativa — o mercado está pagando menos do que sua probabilidade justifica. Reduza o tamanho ou reavalie."}
        </p>
      </div>
      <details className="group">
        <summary className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground cursor-pointer flex items-center gap-1 select-none">
          <Info className="w-3 h-3" />Como foi calculado
        </summary>
        <div className="mt-2 p-2.5 rounded-lg bg-obsidian/40 border border-border/20 space-y-1.5 text-[10px] text-muted-foreground font-mono">
          <p>Odds justas = 1 ÷ {marketProb.toFixed(2)} = {(1/marketProb).toFixed(2)}x</p>
          <p>b (ganho líquido) = {(1/marketProb).toFixed(2)} − 1 = {(1/marketProb - 1).toFixed(2)}</p>
          <p>EV = {yourProb.toFixed(2)} × {(1/marketProb - 1).toFixed(2)} − {(1-yourProb).toFixed(2)} = {ev.toFixed(3)}</p>
          <p>Kelly = (b×p − q) ÷ b = {kelly.toFixed(3)}</p>
        </div>
      </details>
    </div>
  );
}

export function MarketAnalysis({ item }: { item: TrendingItem }) {
  const prob = item.yesProb ?? 0.5;
  const noProb = 1 - prob;
  const probChange = item.prevYesProb !== undefined ? prob - item.prevYesProb : undefined;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold text-foreground/70 uppercase tracking-wider mb-2 flex items-center gap-1">
          <Target className="w-3 h-3" />Análise de Mercado
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-positive/5 border border-positive/15">
            <p className="text-[9px] text-muted-foreground mb-1">SIM — Probabilidade</p>
            <p className="text-sm font-mono font-bold text-positive">{Math.round(prob * 100)}%</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">Odds justas: {formatOdds(prob)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-negative/5 border border-negative/15">
            <p className="text-[9px] text-muted-foreground mb-1">NÃO — Probabilidade</p>
            <p className="text-sm font-mono font-bold text-negative">{Math.round(noProb * 100)}%</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">Odds justas: {formatOdds(noProb)}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {item.volume !== undefined && (
          <div className="p-2 rounded-lg bg-secondary/20 border border-border/10 text-center">
            <p className="text-[9px] text-muted-foreground mb-0.5">Volume Total</p>
            <p className="text-xs font-mono font-bold text-foreground">{formatVolume(item.volume)}</p>
          </div>
        )}
        {item.volume24h !== undefined && (
          <div className="p-2 rounded-lg bg-secondary/20 border border-border/10 text-center">
            <p className="text-[9px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
              Volume 24h <VolumeTrend volume={item.volume} volume24h={item.volume24h} />
            </p>
            <p className="text-xs font-mono font-bold text-neon-blue">{formatVolume(item.volume24h)}</p>
          </div>
        )}
        {(item.liquidity ?? item.openInterest) !== undefined && (
          <div className="p-2 rounded-lg bg-secondary/20 border border-border/10 text-center">
            <p className="text-[9px] text-muted-foreground mb-0.5">{item.source === "kalshi" ? "Open Interest" : "Liquidez"}</p>
            <p className="text-xs font-mono font-bold text-gold">{formatVolume((item.openInterest ?? item.liquidity) as number)}</p>
          </div>
        )}
      </div>
      {(probChange !== undefined || item.weekPriceChange !== undefined) && (
        <div className="flex gap-2">
          {probChange !== undefined && Math.abs(probChange) > 0.005 && (
            <div className={`flex-1 p-2 rounded-lg border text-center ${probChange > 0 ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"}`}>
              <p className="text-[9px] text-muted-foreground mb-0.5">Variação Recente</p>
              <p className={`text-xs font-mono font-bold ${probChange > 0 ? "text-positive" : "text-negative"}`}>
                {probChange > 0 ? "+" : ""}{Math.round(probChange * 100)}pp
              </p>
            </div>
          )}
          {item.weekPriceChange !== undefined && Math.abs(item.weekPriceChange) > 0.01 && (
            <div className={`flex-1 p-2 rounded-lg border text-center ${item.weekPriceChange > 0 ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"}`}>
              <p className="text-[9px] text-muted-foreground mb-0.5">Variação 7d</p>
              <p className={`text-xs font-mono font-bold ${item.weekPriceChange > 0 ? "text-positive" : "text-negative"}`}>
                {item.weekPriceChange > 0 ? "+" : ""}{Math.round(item.weekPriceChange * 100)}pp
              </p>
            </div>
          )}
        </div>
      )}
      <div>
        <p className="text-[10px] text-muted-foreground mb-2">EV de referência (lado SIM)</p>
        <div className="space-y-1">
          {[40, 50, 60, 70].map((pct) => {
            const p = pct / 100;
            const ev = calcEV(p, prob);
            const hasVal = ev > 0;
            return (
              <div key={pct} className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground w-16">Prob {pct}%</span>
                <div className="flex-1 h-1 bg-secondary/30 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${hasVal ? "bg-positive" : "bg-negative/50"}`}
                    style={{ width: `${Math.min(100, Math.abs(ev) * 200)}%` }} />
                </div>
                <span className={`text-[10px] font-mono w-16 text-right ${hasVal ? "text-positive" : "text-negative/70"}`}>
                  EV {ev >= 0 ? "+" : ""}{(ev * 100).toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[9px] text-muted-foreground/60 mt-1.5">
          EV positivo = sua prob {'>'} prob do mercado ({Math.round(prob * 100)}%)
        </p>
      </div>
      <div className="border-t border-border/20 pt-3">
        <EdgeCalculator marketProb={prob} />
      </div>
    </div>
  );
}

// Shapes retornados pelos dois endpoints de análise
interface MarketAnalysisResult {
  analysis: string;
  keyFactors: string[];
  watchFor?: string;
  biasAlert?: string | null;
  fairValue?: number | null;
  edgePp?: number | null;
  confidence?: "baixa" | "media" | "alta";
  articles: { title: string; description: string | null; url: string; source: string; publishedAt: string; urlToImage: string | null }[];
  cached: boolean;
}

interface RedditContextResult {
  whyTrending: string;
  context: string;
  bettingAngle: string;
  keyFacts: string[];
  articles: { title: string; description: string | null; url: string; source: string; publishedAt: string; urlToImage: string | null }[];
  cached: boolean;
}

type AnyAnalysisResult = MarketAnalysisResult | RedditContextResult;

function isRedditResult(r: AnyAnalysisResult): r is RedditContextResult {
  return "whyTrending" in r;
}

// Shared news article list renderer
function NewsArticleList({ articles }: { articles: MarketAnalysisResult["articles"] }) {
  if (articles.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/60 text-center py-1">
        Nenhuma notícia recente encontrada.
      </p>
    );
  }
  return (
    <div>
      <p className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wider mb-1.5 flex items-center gap-1">
        <Newspaper className="w-3 h-3" />Notícias relacionadas
      </p>
      <div className="space-y-2">
        {articles.map((a, i) => (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
            className="block p-2.5 rounded-lg bg-secondary/10 border border-border/10 hover:border-border/30 transition-colors">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[9px] font-medium text-primary/60 uppercase tracking-wider">{a.source}</span>
              <span className="text-[9px] text-muted-foreground/50">· {a.publishedAt.slice(0, 10)}</span>
            </div>
            <p className="text-xs text-foreground/80 leading-snug mb-0.5">{a.title}</p>
            {a.description && (
              <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{a.description}</p>
            )}
            <span className="text-[9px] text-primary/50 flex items-center gap-0.5 mt-1">
              <ExternalLink className="w-2.5 h-2.5" />Ler artigo completo
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function NewsAnalysisPanel({ item }: { item: TrendingItem }) {
  const [result, setResult] = useState<AnyAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReddit = item.source === "reddit";
  const label = isReddit ? "Cruzar com notícias e resultados recentes" : "Analisar com IA + notícias recentes";
  const labelLoading = "Buscando notícias e analisando...";
  const labelHide = isReddit ? "Ocultar análise contextual" : "Ocultar análise de IA + notícias";

  async function handleAnalyze() {
    if (result) { setResult(null); return; }
    setLoading(true);
    setError(null);
    try {
      let data: AnyAnalysisResult;
      if (isReddit) {
        const res = await fetch("/api/ai/reddit-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title,
            subreddit: item.subreddit,
            score: item.upvotes ?? 0,
            comments: item.comments ?? 0,
          }),
        });
        if (await maybeAuthGate(res)) return;
        if (res.status === 429) throw new Error("RATE_LIMIT");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json() as RedditContextResult;
      } else {
        const res = await fetch("/api/ai/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: item.title, yesProb: item.yesProb ?? 0.5, source: item.source }),
          signal: AbortSignal.timeout(50_000),
        });
        if (await maybeAuthGate(res)) return;
        if (res.status === 429) throw new Error("RATE_LIMIT");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json() as MarketAnalysisResult;
      }
      setResult(data);
      awardPoints("market_analyzed", "Analisou tendência com IA");
    } catch (e) {
      const isTimeout = (e instanceof DOMException && e.name === "TimeoutError")
        || (e instanceof Error && /timed out|abort/i.test(e.message));
      const msg = e instanceof Error ? e.message : "Erro ao gerar análise";
      setError(msg === "RATE_LIMIT"
        ? "Limite de requisições atingido. Aguarde ~1 minuto e tente novamente."
        : isTimeout
        ? "A análise demorou mais que o esperado. Toque para tentar novamente."
        : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleAnalyze}
        disabled={loading}
        className="w-full flex items-center justify-between gap-1 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        <span className="flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          {loading ? labelLoading : result ? labelHide : label}
        </span>
        {result ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {error && (
        <div className="mt-2 p-2 rounded-lg bg-negative/10 border border-negative/20 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3 text-negative shrink-0" />
          <p className="text-[10px] text-negative/80">{error}</p>
        </div>
      )}

      {result && isRedditResult(result) && (
        <div className="mt-2 space-y-3">
          {/* Why trending — contextual */}
          <div className="p-3 rounded-lg bg-neon-blue/5 border border-neon-blue/15">
            <p className="text-[10px] font-semibold text-neon-blue/80 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Flame className="w-3 h-3" />Por que está viral — análise contextual
              {result.cached && <span className="ml-1 opacity-50">(cache)</span>}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{result.whyTrending}</p>
          </div>

          {/* Background context */}
          {result.context && (
            <div className="p-2.5 rounded-lg bg-secondary/20 border border-border/20">
              <p className="text-[9px] font-semibold text-foreground/60 uppercase tracking-wider mb-1">Contexto de fundo</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{result.context}</p>
            </div>
          )}

          {/* Key facts */}
          {result.keyFacts.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Target className="w-3 h-3" />Fatos-chave
              </p>
              <ul className="space-y-1">
                {result.keyFacts.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-neon-blue shrink-0 mt-0.5">▸</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Betting angle */}
          {result.bettingAngle && (
            <div className="p-2.5 rounded-lg bg-gold/5 border border-gold/15">
              <p className="text-[9px] font-semibold text-gold/70 uppercase tracking-wider mb-1">Ângulo de mercado</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{result.bettingAngle}</p>
            </div>
          )}

          <NewsArticleList articles={result.articles} />
        </div>
      )}

      {result && !isRedditResult(result) && (
        <div className="mt-2 space-y-3">
          {/* Fair Value / Edge — a saída mais decisória do cérebro (antes só aparecia no Detalhe) */}
          {result.fairValue != null && (
            <div className="flex items-center gap-2 flex-wrap p-2.5 rounded-lg bg-gold/5 border border-gold/20">
              <span className="text-[9px] text-gold/70 uppercase tracking-wider">Fair Value JLB</span>
              <span className="font-mono font-bold text-gold text-sm">{result.fairValue}%</span>
              {result.edgePp != null && Math.abs(result.edgePp) >= 1 && (
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${result.edgePp > 0 ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>
                  {result.edgePp > 0 ? "+" : ""}{result.edgePp}pp vs mercado
                </span>
              )}
              {result.confidence && (
                <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-border/30 bg-secondary/20 text-muted-foreground uppercase">conf. {result.confidence}</span>
              )}
            </div>
          )}
          {/* AI analysis */}
          <div className="p-3 rounded-lg bg-neon-blue/5 border border-neon-blue/15">
            <p className="text-[10px] font-semibold text-neon-blue/80 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />Análise de IA
              {result.cached && <span className="ml-1 opacity-50">(cache)</span>}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{result.analysis}</p>
          </div>

          {/* Key factors */}
          {result.keyFactors.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Target className="w-3 h-3" />Fatores-chave
              </p>
              <ul className="space-y-1">
                {result.keyFactors.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-neon-blue shrink-0 mt-0.5">▸</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.watchFor && (
            <div className="p-2.5 rounded-lg bg-gold/5 border border-gold/15">
              <p className="text-[9px] font-semibold text-gold/70 uppercase tracking-wider mb-1">O que acompanhar</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{result.watchFor}</p>
            </div>
          )}

          {result.biasAlert && (
            <div className="p-2 rounded-lg bg-warning/5 border border-warning/15 flex items-start gap-2">
              <AlertTriangle className="w-3 h-3 text-warning shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">{result.biasAlert}</p>
            </div>
          )}

          <NewsArticleList articles={result.articles} />
        </div>
      )}
    </div>
  );
}
