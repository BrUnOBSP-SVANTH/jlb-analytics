/**
 * Painéis de análise expansíveis dos cards de Apostas — extraídos de Apostas.tsx.
 * EdgeCalculator, MarketAnalysis (IA + notícias), NewsArticleList e NewsAnalysisPanel.
 * A conta de EV/Kelly vem de lib/edge.ts — a mesma da tela de detalhe.
 */
import { useState } from "react";
import {
  AlertTriangle, Calculator, ChevronDown, ChevronUp, ExternalLink,
  Flame, Info, Newspaper, Sparkles, Target, Zap,
} from "lucide-react";
import { type TrendingItem, formatOdds } from "@/lib/trending";
import { volumeNaMoeda } from "@shared/plataforma";
import { awardPoints } from "@/lib/userProgress";
import { maybeAuthGate } from "@/lib/upgrade";
import { VolumeTrend } from "@/components/mercados/cards";
import { apiFetch } from "@/lib/api";
import { num, pct, pp } from "@shared/formato";
import { calcularVantagem, precoCalculavel } from "@/lib/edge";

/**
 * Calculadora compacta do card de /mercados.
 *
 * Esta era a TERCEIRA cópia das fórmulas de EV e Kelly, e divergiu da tela de
 * detalhe como toda cópia diverge: continuava imprimindo o "0.0" literal (com
 * ponto), nascia no preço arredondado, andava de 1 em 1 ponto — e dizia "½ Kelly
 * (recomendado)" e "arrisque X% da banca", o conselho de posição que o aviso
 * institucional diz que a JLB não dá. O DET-04 da auditoria tirou isso da tela
 * de detalhe e esqueceu esta.
 *
 * Agora a conta vem de `lib/edge.ts` (a mesma do detalhe) e o texto segue as
 * mesmas decisões; só o tamanho é de card.
 */
const PASSO_PP = 0.5;

function EdgeCalculator({ marketProb }: { marketProb: number }) {
  // Nasce NO preço exato (encaixado na grade de 0,5 pp), e não no arredondado:
  // 18,5% virava 19% e o card mostrava meio ponto de vantagem que ninguém pediu.
  const [estimativaPp, setEstimativaPp] = useState(
    () => Math.round(Math.min(99, Math.max(1, marketProb * 100)) / PASSO_PP) * PASSO_PP,
  );
  const [mexeu, setMexeu] = useState(false);
  const v = calcularVantagem(estimativaPp / 100, marketProb);
  const calculavel = precoCalculavel(marketProb);
  const neutro = !mexeu || v.neutro;
  const temVantagem = !neutro && v.ev !== null && v.ev > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="w-3.5 h-3.5 text-primary/70" />
        <p className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider">Calculadora de Edge</p>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Diga qual chance você acredita ser a real. A calculadora mostra o Valor Esperado e a fração de Kelly
        para essa estimativa.
      </p>
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[11px] text-muted-foreground">Sua estimativa</span>
          <span className="text-sm font-mono font-bold text-foreground tabular-nums">{pct(estimativaPp, 1)}</span>
        </div>
        <input type="range" min={1} max={99} step={PASSO_PP} value={estimativaPp}
          aria-label="Sua estimativa, em porcento"
          onChange={(e) => { setEstimativaPp(Number(e.target.value)); setMexeu(true); }}
          className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
        />
        <div className="flex justify-between text-[11px] text-muted-foreground mt-0.5">
          <span>1%</span><span>mercado {pct(marketProb * 100, 1)}</span><span>99%</span>
        </div>
      </div>
      {!calculavel ? (
        <p className="text-[11px] text-muted-foreground leading-relaxed p-2.5 rounded-lg border border-border/20 bg-secondary/10">
          Preço muito {marketProb < 0.5 ? "baixo" : "alto"} para calcular EV e Kelly com segurança — o resultado seria
          dominado por arredondamento.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2" aria-live="polite">
          <div className={`p-2.5 rounded-lg border ${neutro ? "border-border/20 bg-secondary/10" : temVantagem ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"}`}>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Valor Esperado (EV)</p>
            <p className={`text-base font-mono font-bold tabular-nums ${neutro ? "text-muted-foreground" : temVantagem ? "text-positive" : "text-negative"}`}>
              {neutro ? pct(0, 1) : `${v.ev! >= 0 ? "+" : ""}${num(v.ev! * 100, 1)}%`}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">por real na posição</p>
          </div>
          <div className={`p-2.5 rounded-lg border ${!neutro && v.edgePp > 0 ? "border-neon-blue/20 bg-neon-blue/5" : "border-border/20 bg-secondary/10"}`}>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Edge vs Mercado</p>
            <p className={`text-base font-mono font-bold tabular-nums ${!neutro && v.edgePp > 0 ? "text-neon-blue" : "text-muted-foreground"}`}>
              {neutro ? "0,0 pp" : pp(v.edgePp)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Mercado {pct(marketProb * 100, 1)} · você {pct(estimativaPp, 1)}</p>
          </div>
          <div className="p-2.5 rounded-lg border border-gold/20 bg-gold/5">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Kelly Completo</p>
            <p className="text-base font-mono font-bold text-[var(--gold-legivel)] tabular-nums">{num(v.kellyCheio! * 100, 1)}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">da banca</p>
          </div>
          <div className="p-2.5 rounded-lg border border-gold/10 bg-gold/[0.03]">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">½ Kelly (mais conservador)</p>
            <p className="text-base font-mono font-bold text-[var(--gold-legivel)] tabular-nums">{num(v.kellyMeio! * 100, 1)}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">da banca</p>
          </div>
        </div>
      )}
      <div className={`flex items-center gap-2 p-2 rounded-lg ${temVantagem ? "bg-positive/10 border border-positive/20" : "bg-secondary/20 border border-border/20"}`}>
        <Zap className={`w-3 h-3 shrink-0 ${temVantagem ? "text-positive" : "text-muted-foreground"}`} />
        <p className="text-[11px] leading-relaxed">
          {!mexeu
            ? "Sua estimativa está no preço do mercado. Mova o controle para procurar vantagem."
            : !calculavel
            ? "Neste preço a conta de EV e Kelly não é confiável — compare pelo edge em pontos percentuais."
            : temVantagem
            ? `Sua estimativa implica valor esperado positivo: ${pct(v.ev! * 100, 1)} por posição no longo prazo. Com ½ Kelly, a fração seria ${pct(v.kellyMeio! * 100, 1)} da banca.`
            : neutro
            ? "Sua estimativa coincide com o preço do mercado. Não há vantagem matemática de nenhum lado."
            : "Com esta estimativa não há valor esperado positivo — o mercado paga menos do que a sua probabilidade justificaria."}
        </p>
      </div>
      {calculavel && (
        <details className="group">
          <summary className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1 select-none">
            <Info className="w-3 h-3" />Como foi calculado
          </summary>
          <div className="mt-2 p-2.5 rounded-lg bg-obsidian/40 border border-border/20 space-y-1.5 text-[11px] text-muted-foreground font-mono">
            <p>p (preço) = {num(marketProb, 4)} · q (sua estimativa) = {num(estimativaPp / 100, 4)}</p>
            <p>EV = q ÷ p − 1 = {num(v.ev!, 3)}</p>
            <p>Kelly = (q − p) ÷ (1 − p) = {num(v.kellyCheio!, 3)}</p>
          </div>
        </details>
      )}
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
        <p className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-2 flex items-center gap-1">
          <Target className="w-3 h-3" />Análise de Mercado
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-positive/5 border border-positive/15">
            <p className="text-[11px] text-muted-foreground mb-1">SIM — Probabilidade</p>
            <p className="text-sm font-mono font-bold text-positive">{Math.round(prob * 100)}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Odds justas: {formatOdds(prob)}</p>
          </div>
          <div className="p-2.5 rounded-lg bg-negative/5 border border-negative/15">
            <p className="text-[11px] text-muted-foreground mb-1">NÃO — Probabilidade</p>
            <p className="text-sm font-mono font-bold text-negative">{Math.round(noProb * 100)}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Odds justas: {formatOdds(noProb)}</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {item.volume !== undefined && (
          <div className="p-2 rounded-lg bg-secondary/20 border border-border/10 text-center">
            <p className="text-[11px] text-muted-foreground mb-0.5">Volume Total</p>
            <p className="text-xs font-mono font-bold text-foreground">{volumeNaMoeda(item.volume, item.source)}</p>
          </div>
        )}
        {item.volume24h !== undefined && (
          <div className="p-2 rounded-lg bg-secondary/20 border border-border/10 text-center">
            <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center justify-center gap-1">
              Volume 24h <VolumeTrend volume={item.volume} volume24h={item.volume24h} />
            </p>
            <p className="text-xs font-mono font-bold text-neon-blue">{volumeNaMoeda(item.volume24h, item.source)}</p>
          </div>
        )}
        {(item.liquidity ?? item.openInterest) !== undefined && (
          <div className="p-2 rounded-lg bg-secondary/20 border border-border/10 text-center">
            <p className="text-[11px] text-muted-foreground mb-0.5">{item.source === "kalshi" ? "Open Interest" : "Liquidez"}</p>
            <p className="text-xs font-mono font-bold text-gold">{volumeNaMoeda((item.openInterest ?? item.liquidity) as number, item.source)}</p>
          </div>
        )}
      </div>
      {(probChange !== undefined || item.weekPriceChange !== undefined) && (
        <div className="flex gap-2">
          {probChange !== undefined && Math.abs(probChange) > 0.005 && (
            <div className={`flex-1 p-2 rounded-lg border text-center ${probChange > 0 ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"}`}>
              <p className="text-[11px] text-muted-foreground mb-0.5">Variação Recente</p>
              <p className={`text-xs font-mono font-bold ${probChange > 0 ? "text-positive" : "text-negative"}`}>
                {probChange > 0 ? "+" : ""}{Math.round(probChange * 100)}pp
              </p>
            </div>
          )}
          {item.weekPriceChange !== undefined && Math.abs(item.weekPriceChange) > 0.01 && (
            <div className={`flex-1 p-2 rounded-lg border text-center ${item.weekPriceChange > 0 ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"}`}>
              <p className="text-[11px] text-muted-foreground mb-0.5">Variação 7d</p>
              <p className={`text-xs font-mono font-bold ${item.weekPriceChange > 0 ? "text-positive" : "text-negative"}`}>
                {item.weekPriceChange > 0 ? "+" : ""}{Math.round(item.weekPriceChange * 100)}pp
              </p>
            </div>
          )}
        </div>
      )}
      <div>
        <p className="text-[11px] text-muted-foreground mb-2">EV de referência (lado SIM)</p>
        <div className="space-y-1">
          {[40, 50, 60, 70].map((estimativa) => {
            // Mesma conta do resto da tela (lib/edge.ts). Em preço extremo o EV
            // vem null: a linha diz "—" em vez de desenhar um "+900%" de ruído.
            const ev = calcularVantagem(estimativa / 100, prob).ev;
            const hasVal = ev !== null && ev > 0;
            return (
              <div key={estimativa} className="flex items-center gap-2">
                <span className="text-[11px] font-mono text-muted-foreground w-16">Prob {estimativa}%</span>
                <div className="flex-1 h-1 bg-secondary/30 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${hasVal ? "bg-positive" : "bg-negative/50"}`}
                    style={{ width: `${ev === null ? 0 : Math.min(100, Math.abs(ev) * 200)}%` }} />
                </div>
                <span className={`text-[11px] font-mono w-16 text-right tabular-nums ${hasVal ? "text-positive" : "text-negative/70"}`}>
                  {ev === null ? "—" : `EV ${ev >= 0 ? "+" : ""}${num(ev * 100, 1)}%`}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">
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
  contexto?: string | null;
  cenarios?: { sim: string; nao: string } | null;
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
      <p className="text-[11px] text-muted-foreground text-center py-1">
        Nenhuma notícia recente encontrada.
      </p>
    );
  }
  return (
    <div>
      <p className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5 flex items-center gap-1">
        <Newspaper className="w-3 h-3" />Notícias relacionadas
      </p>
      <div className="space-y-2">
        {articles.map((a, i) => (
          <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
            className="block p-2.5 rounded-lg bg-secondary/10 border border-border/10 hover:border-border/30 transition-colors">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[11px] font-medium text-primary/60 uppercase tracking-wider">{a.source}</span>
              <span className="text-[11px] text-muted-foreground">· {a.publishedAt.slice(0, 10)}</span>
            </div>
            <p className="text-xs text-foreground/80 leading-snug mb-0.5">{a.title}</p>
            {a.description && (
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{a.description}</p>
            )}
            <span className="text-[11px] text-primary/50 flex items-center gap-0.5 mt-1">
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
        const res = await apiFetch("/api/ai/reddit-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: item.title,
            subreddit: item.subreddit,
            // Só envia o que existe: o feed RSS não traz votos, e mandar 0 faria
            // a IA raciocinar sobre um post "sem votos" que na verdade tem, só não
            // sabemos quantos. Omitir é honesto; zerar é afirmar algo falso.
            ...(item.upvotes !== undefined ? { score: item.upvotes } : {}),
            ...(item.comments !== undefined ? { comments: item.comments } : {}),
          }),
        });
        if (await maybeAuthGate(res)) return;
        if (res.status === 429) throw new Error("RATE_LIMIT");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json() as RedditContextResult;
      } else {
        const res = await apiFetch("/api/ai/analyze", {
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
          <p className="text-[11px] text-negative/80">{error}</p>
        </div>
      )}

      {result && isRedditResult(result) && (
        <div className="mt-2 space-y-3">
          {/* Why trending — contextual */}
          <div className="p-3 rounded-lg bg-neon-blue/5 border border-neon-blue/15">
            <p className="text-[11px] font-semibold text-neon-blue/80 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Flame className="w-3 h-3" />Por que está viral — análise contextual
              {result.cached && <span className="ml-1 opacity-60" title="Esta análise já tinha sido gerada hoje">de hoje</span>}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{result.whyTrending}</p>
          </div>

          {/* Background context */}
          {result.context && (
            <div className="p-2.5 rounded-lg bg-secondary/20 border border-border/20">
              <p className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1">Contexto de fundo</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{result.context}</p>
            </div>
          )}

          {/* Key facts */}
          {result.keyFacts.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5 flex items-center gap-1">
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
              <p className="text-[11px] font-semibold text-gold/70 uppercase tracking-wider mb-1">Ângulo de mercado</p>
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
              <span className="text-[11px] text-gold/70 uppercase tracking-wider">Fair Value JLB</span>
              <span className="font-mono font-bold text-gold text-sm">{result.fairValue}%</span>
              {result.edgePp != null && Math.abs(result.edgePp) >= 1 && (
                <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${result.edgePp > 0 ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>
                  {result.edgePp > 0 ? "+" : ""}{result.edgePp}pp vs mercado
                </span>
              )}
              {result.confidence && (
                <span className="ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-full border border-border/30 bg-secondary/20 text-muted-foreground uppercase">conf. {result.confidence}</span>
              )}
            </div>
          )}
          {/* O assunto, para quem chegou agora — antes da análise, porque quem
              não sabe do que se trata não aproveita o que vem depois. */}
          {result.contexto && (
            <div className="p-3 rounded-lg bg-secondary/20 border border-border/20">
              <p className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5">Entenda o assunto</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{result.contexto}</p>
            </div>
          )}

          {/* AI analysis */}
          <div className="p-3 rounded-lg bg-neon-blue/5 border border-neon-blue/15">
            <p className="text-[11px] font-semibold text-neon-blue/80 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />Análise de IA
              {result.cached && <span className="ml-1 opacity-60" title="Esta análise já tinha sido gerada hoje">de hoje</span>}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">{result.analysis}</p>
          </div>

          {/* Key factors */}
          {result.keyFactors.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-foreground/80 uppercase tracking-wider mb-1.5 flex items-center gap-1">
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

          {result.cenarios && (
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg bg-positive/5 border border-positive/20">
                <p className="text-[11px] font-semibold text-positive/80 uppercase tracking-wider mb-1">Para dar SIM</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{result.cenarios.sim}</p>
              </div>
              <div className="p-2.5 rounded-lg bg-negative/5 border border-negative/20">
                <p className="text-[11px] font-semibold text-negative/80 uppercase tracking-wider mb-1">Para dar NÃO</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{result.cenarios.nao}</p>
              </div>
            </div>
          )}

          {result.watchFor && (
            <div className="p-2.5 rounded-lg bg-gold/5 border border-gold/15">
              <p className="text-[11px] font-semibold text-gold/70 uppercase tracking-wider mb-1">O que acompanhar</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{result.watchFor}</p>
            </div>
          )}

          {result.biasAlert && (
            <div className="p-2 rounded-lg bg-warning/5 border border-warning/15 flex items-start gap-2">
              <AlertTriangle className="w-3 h-3 text-warning shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">{result.biasAlert}</p>
            </div>
          )}

          <NewsArticleList articles={result.articles} />
        </div>
      )}
    </div>
  );
}
