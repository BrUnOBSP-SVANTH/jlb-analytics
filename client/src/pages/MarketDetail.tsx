/**
 * MarketDetail — JLB Analytics
 * Página de detalhe de mercado: /apostas/:id
 */
import { useState, useEffect, type ReactNode } from "react";
import { useParams, Link } from "wouter";
import {
  ChevronLeft, ExternalLink, BarChart2, TrendingUp, TrendingDown,
  Sparkles, Target, AlertTriangle, Info, Calculator, Zap, RefreshCw,
  Clock, BookOpen, Globe, GitMerge,
} from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";
import MercadosTabs from "@/components/MercadosTabs";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, ReferenceLine,
} from "recharts";
import { CHART_TOOLTIP_STYLE, CHART_TICK_STYLE } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { getMarkets } from "@/lib/marketsCache";
import { computeConsensus, marketWeight, aiWeight, communityWeight, type ConsensusSignal } from "@/lib/consensus";
import { useSEO } from "@/hooks/useSEO";

// ── Types ──────────────────────────────────────────────────────────────────────

interface MarketBasic {
  id: string;
  title: string;
  yesProb: number;
  volume?: number;
  volume24h?: number;
  liquidity?: number;
  weekPriceChange?: number;
  externalUrl: string;
  source: string;
  category?: string;
  endDate?: string;
  closed?: boolean;   // status real da fonte — fidelidade acima da endDate nominal
  active?: boolean;
  status?: string;    // Kalshi: "active" | "closed" | "settled" | "finalized" | …
}

interface CerebroArticleSnippet {
  id: string;
  title: string;
  source: string;
  category: string;
  url: string | null;
  published_at: string | null;
  summary: string | null;
}

interface AiResult {
  analysis: string;
  keyFactors: string[];
  watchFor?: string;
  biasAlert?: string | null;
  probabilityAssessment?: "fair" | "underpriced" | "overpriced" | "uncertain";
  edgeSignal?: string | null;
  fairValue?: number | null;
  edgePp?: number | null;
  confidence?: "baixa" | "media" | "alta";
  referenceClass?: string | null;
  cerebroHits?: number;
  hasMomentum?: boolean;
  cached: boolean;
}

interface CommunityForecast {
  n_forecasters: number;
  median_prob: number;
  mean_prob: number;
  std_prob: number | null;
  min_prob: number;
  max_prob: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCountdown(dateStr: string): { label: string; urgent: boolean; ended: boolean } {
  const end = new Date(dateStr).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return { label: "Encerrado", urgent: false, ended: true };
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 30) return { label: `${Math.floor(days / 30)}m restantes`, urgent: false, ended: false };
  if (days > 0) return { label: `${days}d ${hours}h restantes`, urgent: days <= 3, ended: false };
  return { label: `${hours}h restantes`, urgent: true, ended: false };
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

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

// ── Explain: nota educacional de seção ───────────────────────────────────────
// "O que é este tópico + como ele te ajuda a decidir." Sempre visível e leve —
// a plataforma é de educação, então explicar cada número é parte do produto.
function Explain({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-neon-blue/[0.04] border border-neon-blue/15 px-3 py-2">
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-neon-blue/70" aria-hidden="true" />
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

// ── EdgeCalculator (inline) ────────────────────────────────────────────────────

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
        <Calculator className="w-4 h-4 text-primary/70" />
        <p className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">Calculadora de Edge</p>
      </div>
      <Explain>
        Esta é a ponte entre o "eu acho" e os números: diga qual chance <strong className="text-foreground">você</strong> acredita ser a real,
        e a calculadora mostra se a aposta tem <strong className="text-foreground">Valor Esperado positivo</strong> (lucro esperado a longo prazo)
        e <strong className="text-foreground">quanto arriscar</strong> sem quebrar a banca (a fração de Kelly). Mova o controle e veja os números reagirem.
      </Explain>
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-muted-foreground">Sua estimativa</span>
          <span className="text-lg font-mono font-bold text-foreground">{yourPct}%</span>
        </div>
        <input
          type="range" min={1} max={99} value={yourPct}
          onChange={(e) => setYourPct(Number(e.target.value))}
          className="w-full h-2 rounded-full accent-primary cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/50 mt-0.5">
          <span>1%</span><span>50%</span><span>99%</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={`p-3 rounded-lg border ${evNeutral ? "border-border/20 bg-secondary/10" : hasValue ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"}`}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Valor Esperado (EV)</p>
          <p className={`text-xl font-mono font-bold ${evNeutral ? "text-muted-foreground" : hasValue ? "text-positive" : "text-negative"}`}>
            {evNeutral ? "0.0" : `${ev >= 0 ? "+" : ""}${(ev * 100).toFixed(1)}`}%
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">por real apostado</p>
        </div>
        <div className={`p-3 rounded-lg border ${edge > 0 ? "border-neon-blue/20 bg-neon-blue/5" : "border-border/20 bg-secondary/10"}`}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Edge vs Mercado</p>
          <p className={`text-xl font-mono font-bold ${edge > 0 ? "text-neon-blue" : "text-muted-foreground"}`}>
            {edge >= 0 ? "+" : ""}{(edge * 100).toFixed(1)}pp
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Mercado: {Math.round(marketProb * 100)}% | Você: {yourPct}%
          </p>
        </div>
        <div className="p-3 rounded-lg border border-gold/20 bg-gold/5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Kelly Completo</p>
          <p className="text-xl font-mono font-bold text-gold">{(kelly * 100).toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">da banca</p>
        </div>
        <div className="p-3 rounded-lg border border-gold/10 bg-gold/[0.03]">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">½ Kelly (recomendado)</p>
          <p className="text-xl font-mono font-bold text-gold/70">{(halfKelly * 100).toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">da banca</p>
        </div>
      </div>
      <div className={`flex items-center gap-2 p-3 rounded-lg ${hasValue ? "bg-positive/10 border border-positive/20" : "bg-secondary/20 border border-border/20"}`}>
        <Zap className={`w-4 h-4 shrink-0 ${hasValue ? "text-positive" : "text-muted-foreground"}`} />
        <p className="text-xs leading-relaxed">
          {hasValue
            ? `Valor positivo detectado. Com ½ Kelly: arrisque ${(halfKelly * 100).toFixed(1)}% da banca. EV de longo prazo: ${(ev * 100).toFixed(1)}% por aposta.`
            : evNeutral
            ? "EV zero — sua estimativa coincide com o preço do mercado. Não há vantagem matemática de nenhum lado."
            : "Sem valor com esta estimativa — o mercado está pagando menos do que sua probabilidade justifica. Reduza o tamanho ou reavalie."}
        </p>
      </div>
      <details className="group">
        <summary className="text-xs text-muted-foreground/60 hover:text-muted-foreground cursor-pointer flex items-center gap-1 select-none">
          <Info className="w-3 h-3" />Como foi calculado
        </summary>
        <div className="mt-2 p-3 rounded-lg bg-obsidian/40 border border-border/20 space-y-1.5 text-xs text-muted-foreground font-mono">
          <p>Odds justas = 1 ÷ {marketProb.toFixed(2)} = {(1 / marketProb).toFixed(2)}x</p>
          <p>b (ganho líquido) = {(1 / marketProb).toFixed(2)} − 1 = {(1 / marketProb - 1).toFixed(2)}</p>
          <p>EV = {yourProb.toFixed(2)} × {(1 / marketProb - 1).toFixed(2)} − {(1 - yourProb).toFixed(2)} = {ev.toFixed(3)}</p>
          <p>Kelly = (b×p − q) ÷ b = {kelly.toFixed(3)}</p>
        </div>
      </details>
    </div>
  );
}

// ── Consensus Card ──────────────────────────────────────────────────────────────
// Unifica os 3 sinais (mercado + IA + comunidade) num número calibrado via
// agregação logit extremizada ponderada por skill (Good Judgment Project).

function ConsensusCard({ market, community, ai, trackRecord }: {
  market: MarketBasic;
  community: CommunityForecast | null;
  ai: AiResult | null;
  trackRecord: { skillVsMarket: number | null; resolvedCount: number } | null;
}) {
  const marketPct = Math.round(market.yesProb * 100);

  const signals: ConsensusSignal[] = [];
  const mw = marketWeight(market.liquidity);
  signals.push({ name: "Mercado", prob: marketPct, weight: mw.weight, note: mw.note });

  if (ai?.fairValue != null) {
    const aw = aiWeight({ skillVsMarket: trackRecord?.skillVsMarket, resolvedCount: trackRecord?.resolvedCount, confidence: ai.confidence });
    signals.push({ name: "IA JLB", prob: ai.fairValue, weight: aw.weight, note: aw.note });
  }
  if (community && community.n_forecasters >= 1) {
    const cw = communityWeight(community.n_forecasters);
    if (cw.weight > 0) signals.push({ name: "Comunidade", prob: Number(community.median_prob), weight: cw.weight, note: cw.note });
  }

  const result = computeConsensus(signals);
  if (!result) return null;

  const diff = result.consensus - marketPct;
  const diffColor = Math.abs(diff) < 3 ? "text-muted-foreground" : diff > 0 ? "text-positive" : "text-negative";
  const agreePct = Math.round(result.agreement * 100);
  const agreeLabel = agreePct >= 75 ? "forte" : agreePct >= 45 ? "moderada" : "baixa";
  const agreeColor = agreePct >= 75 ? "text-positive" : agreePct >= 45 ? "text-gold" : "text-negative";

  return (
    <AnimatedSection delay={0.12}>
      <div className="glass-card rounded-xl p-5 border border-gold/25 bg-gold/3">
        <div className="flex items-center gap-2 mb-4">
          <GitMerge className="w-4 h-4 text-gold" />
          <h2 className="text-sm font-semibold text-foreground">Consenso JLB</h2>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold/15 border border-gold/30 text-gold">{result.nSources} {result.nSources === 1 ? "fonte" : "fontes"}</span>
          <span className="ml-auto text-[10px] text-muted-foreground/60">agregação logit extremizada</span>
        </div>

        <div className="mb-4">
          <Explain>
            Aqui juntamos três opiniões — o <strong className="text-foreground">mercado</strong>, a <strong className="text-foreground">IA do JLB</strong>{" "}
            e a <strong className="text-foreground">comunidade</strong> — num único número calibrado (cada fonte pesa conforme a confiabilidade dela).
            Quando o consenso difere bastante do mercado, pode haver uma oportunidade — ou um erro de preço — a investigar. A barra de{" "}
            <strong className="text-foreground">concordância</strong> mostra o quanto as fontes concordam entre si: quanto mais forte, mais sólido o número.
          </Explain>
        </div>

        {/* Número principal + intervalo */}
        <div className="flex items-end gap-4 flex-wrap mb-4">
          <div>
            <p className="text-[10px] text-muted-foreground/60 uppercase">Estimativa de consenso</p>
            <p className="text-4xl font-mono font-bold text-gold leading-none">{result.consensus}%</p>
            <p className="text-[10px] text-muted-foreground mt-1">IC 80%: {result.low}%–{result.high}%</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground/60 uppercase">vs Mercado</p>
            <p className={`text-xl font-mono font-bold ${diffColor}`}>{diff >= 0 ? "+" : ""}{diff}pp</p>
          </div>
          <div className="flex-1 min-w-[120px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground/60 uppercase">Concordância</span>
              <span className={`text-[10px] font-semibold ${agreeColor}`}>{agreeLabel}</span>
            </div>
            <div className="h-1.5 bg-secondary/40 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${agreePct >= 75 ? "bg-positive" : agreePct >= 45 ? "bg-gold" : "bg-negative"}`} style={{ width: `${agreePct}%` }} />
            </div>
          </div>
        </div>

        {/* Breakdown das fontes */}
        <div className="space-y-1.5 border-t border-border/15 pt-3">
          {result.sources.map((s) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="text-xs text-foreground w-24 shrink-0">{s.name}</span>
              <span className="text-xs font-mono text-foreground w-10 text-right">{s.prob}%</span>
              <div className="flex-1 h-1 bg-secondary/30 rounded-full overflow-hidden">
                <div className="h-full bg-gold/50 rounded-full" style={{ width: `${s.weight * 100}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground/60 w-16 text-right">peso {Math.round(s.weight * 100)}%</span>
              {s.note && <span className="hidden sm:block text-[10px] text-muted-foreground/50 w-32 truncate">{s.note}</span>}
            </div>
          ))}
        </div>

        {!ai?.fairValue && (
          <p className="text-[10px] text-muted-foreground/60 mt-3">
            💡 Rode a <span className="text-gold">Análise por IA</span> abaixo para incluir o sinal da IA e refinar o consenso.
          </p>
        )}
        <p className="text-[10px] text-muted-foreground/40 mt-2">
          Método Good Judgment Project (Satopää et al. 2014). Pesos por liquidez, track record da IA e tamanho da amostra. Não é recomendação de posição.
        </p>
      </div>
    </AnimatedSection>
  );
}

// ── Evolução da previsão da IA ────────────────────────────────────────────────
// Mostra como o fair value da IA evoluiu ao longo do tempo vs o mercado.

interface ForecastPoint { aiFairValue: number; marketProb: number; confidence: string; date: string }

function ForecastEvolution({ marketId, source }: { marketId: string; source: string }) {
  const [history, setHistory] = useState<ForecastPoint[]>([]);

  useEffect(() => {
    fetch(`/api/ai/forecast-history?marketId=${encodeURIComponent(`${source}-${marketId}`)}`)
      .then((r) => r.ok ? r.json() as Promise<{ history: ForecastPoint[] }> : null)
      .then((d) => { if (d?.history) setHistory(d.history); })
      .catch(() => {});
  }, [marketId, source]);

  if (history.length < 2) return null;

  const first = history[0];
  const last = history[history.length - 1];
  const aiDelta = last.aiFairValue - first.aiFairValue;
  const days = Math.max(1, Math.round((new Date(last.date).getTime() - new Date(first.date).getTime()) / 86_400_000));
  const chartData = history.map((h, i) => ({ i, IA: h.aiFairValue, Mercado: h.marketProb }));

  return (
    <AnimatedSection delay={0.14}>
      <div className="glass-card rounded-xl p-5 border border-neon-blue/15">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-neon-blue" />
          <h2 className="text-sm font-semibold text-foreground">Evolução da estimativa da IA</h2>
          <span className="ml-auto text-[10px] text-muted-foreground/60">{history.length} pontos · {days}d</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          A IA foi de <span className="font-mono text-neon-blue">{first.aiFairValue}%</span> →
          {" "}<span className="font-mono text-neon-blue">{last.aiFairValue}%</span>
          {Math.abs(aiDelta) >= 2 && (
            <span className={aiDelta > 0 ? "text-positive" : "text-negative"}> ({aiDelta > 0 ? "+" : ""}{aiDelta}pp)</span>
          )} conforme novas informações chegaram.
        </p>
        <div className="mb-3">
          <Explain>
            Mostra como a estimativa da IA mudou ao longo do tempo, lado a lado com o mercado. Ajuda a perceber se a IA{" "}
            <strong className="text-foreground">antecipou</strong> um movimento — sinal de que ela leu algo antes do mercado — ou se está apenas seguindo o preço.
          </Explain>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="aiEvo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.62 0.2 250)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="oklch(0.62 0.2 250)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <YAxis domain={[0, 100]} tick={CHART_TICK_STYLE} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}%`} width={32} />
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, n: string) => [`${v}%`, n]} labelFormatter={() => ""} />
            <Area type="monotone" dataKey="Mercado" stroke="oklch(0.6 0 0)" strokeWidth={1.5} strokeDasharray="3 3" fill="none" dot={false} />
            <Area type="monotone" dataKey="IA" stroke="oklch(0.62 0.2 250)" strokeWidth={2} fill="url(#aiEvo)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-muted-foreground/40 mt-1 text-center">
          Azul = fair value da IA · Tracejado = preço do mercado
        </p>
      </div>
    </AnimatedSection>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MarketDetail() {
  const params = useParams<{ id: string }>();
  const marketId = params.id ?? "";

  const source = marketId.startsWith("kalshi-") ? "kalshi"
    : marketId.startsWith("manifold-") ? "manifold"
    : "polymarket";
  const rawId = marketId.replace(/^(poly-|kalshi-|manifold-)/, "");

  const [market, setMarket] = useState<MarketBasic | null>(null);
  const [snapshotRows, setSnapshotRows] = useState<{ t: number; p: number }[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<AiResult | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [communityForecast, setCommunityForecast] = useState<CommunityForecast | null>(null);
  const [cerebroArticles, setCerebroArticles] = useState<CerebroArticleSnippet[]>([]);
  const [trackRecord, setTrackRecord] = useState<{ skillVsMarket: number | null; resolvedCount: number } | null>(null);

  useSEO(
    market?.title ?? "Detalhe do Mercado",
    "Probabilidades ao vivo, histórico de preços, consenso da comunidade e análise quantitativa deste mercado preditivo.",
  );

  // Track record da IA — usado para ponderar o voto da IA no consenso
  useEffect(() => {
    fetch("/api/ai/track-record")
      .then((r) => r.ok ? r.json() as Promise<{ available: boolean; skillVsMarket: number | null; resolvedCount: number }> : null)
      .then((d) => { if (d?.available) setTrackRecord({ skillVsMarket: d.skillVsMarket, resolvedCount: d.resolvedCount }); })
      .catch(() => {});
  }, []);

  // ── Fetch market data ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!rawId) return;
    setLoadingMarket(true);

    async function loadMarket() {
      try {
        if (source === "kalshi") {
          const data = await getMarkets<{
            ticker: string; title: string; yesProb: number;
            volume?: number; volume24h?: number; openInterest?: number;
            closeTime?: string; category?: string; status?: string;
          }>("kalshi");
          const found = data.find((m) => m.ticker === rawId || m.ticker.includes(rawId));
          if (found) {
            setMarket({
              id: found.ticker,
              title: found.title,
              yesProb: found.yesProb,
              volume: found.volume,
              volume24h: found.volume24h,
              liquidity: found.openInterest,
              externalUrl: `https://kalshi.com/markets/${found.ticker}`,
              source: "kalshi",
              category: found.category,
              status: found.status,
            });
          }
        } else {
          const data = await getMarkets<{
            id: string; question: string; eventTitle?: string; slug?: string; yesProb?: number;
            volume?: number | string; liquidity?: number | string;
            volume24h?: number | string; weekPriceChange?: number | string;
            outcomePrices?: string; category?: string; clobTokenIds?: string; endDate?: string;
            closed?: boolean; active?: boolean;
          }>("polymarket");
          const found = data.find((m) => m.id === rawId || m.slug === rawId);
          if (found) {
            const yesProb = found.yesProb ?? (() => {
              try {
                const prices = JSON.parse(found.outcomePrices ?? "[]") as string[];
                return prices[0] ? parseFloat(prices[0]) : 0.5;
              } catch { return 0.5; }
            })();
            const displayTitle =
              found.eventTitle && found.eventTitle.length > 10 && found.eventTitle !== found.question
                ? found.eventTitle
                : found.question;
            setMarket({
              id: found.id,
              title: displayTitle,
              yesProb,
              volume: found.volume !== undefined ? Number(found.volume) : undefined,
              volume24h: found.volume24h !== undefined ? Number(found.volume24h) : undefined,
              liquidity: found.liquidity !== undefined ? Number(found.liquidity) : undefined,
              weekPriceChange: found.weekPriceChange !== undefined ? Number(found.weekPriceChange) : undefined,
              externalUrl: `https://polymarket.com/event/${found.slug ?? found.id}`,
              source: "polymarket",
              category: found.category,
              endDate: found.endDate,
              closed: found.closed,
              active: found.active,
            });
          }
        }
      } catch {
        // market stays null — show not found state
      } finally {
        setLoadingMarket(false);
      }
    }

    void loadMarket();
  }, [rawId, source]);

  // ── Fetch snapshot history ────────────────────────────────────────────────────

  useEffect(() => {
    if (!rawId) return;
    fetch(`/api/snapshots/history/${source}/${encodeURIComponent(rawId)}?days=90`)
      .then((r) => r.ok ? r.json() as Promise<{ rows: { yes_prob: number; snapped_at: string }[] }> : null)
      .then((data) => {
        if (!data?.rows) return;
        const mapped = data.rows.map((r) => ({
          t: Math.floor(new Date(r.snapped_at).getTime() / 1000),
          p: r.yes_prob,
        }));
        if (mapped.length >= 4) setSnapshotRows(mapped);
      })
      .catch(() => {});
  }, [rawId, source]);

  // ── AI analysis ───────────────────────────────────────────────────────────────

  async function handleAnalyzeAi() {
    if (!market) return;
    if (aiAnalysis) { setAiAnalysis(null); return; }
    setLoadingAi(true);
    setAiError(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: market.title, yesProb: market.yesProb, source: market.source,
          marketId: `${source}-${rawId}`, category: market.category,
        }),
        signal: AbortSignal.timeout(50_000),
      });
      if (res.status === 429) throw new Error("RATE_LIMIT");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as AiResult;
      setAiAnalysis(data);
    } catch (e) {
      const isTimeout = (e instanceof DOMException && e.name === "TimeoutError")
        || (e instanceof Error && /timed out|abort/i.test(e.message));
      const msg = e instanceof Error ? e.message : "Erro ao gerar análise";
      setAiError(msg === "RATE_LIMIT"
        ? "Limite de requisições atingido. Aguarde ~1 minuto e tente novamente."
        : isTimeout
        ? "A análise demorou mais que o esperado. Tente novamente."
        : msg);
    } finally {
      setLoadingAi(false);
    }
  }

  // ── Cerebro articles related to this market ──────────────────────────────────

  useEffect(() => {
    if (!market?.title) return;
    // Extract 2-3 keywords from market title for FTS search
    const keywords = market.title
      .replace(/[^a-zA-ZÀ-ú0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 3)
      .join(" & ");
    if (!keywords) return;

    void supabase
      .from("cerebro_articles")
      .select("id, title, source, category, url, published_at, summary")
      .textSearch("fts", keywords, { config: "portuguese" })
      .eq("status", "active")
      .order("published_at", { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (data && data.length > 0) setCerebroArticles(data as CerebroArticleSnippet[]);
      });
  }, [market?.title]);

  // ── Community forecast ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!rawId) return;
    void supabase
      .from("market_community_forecast")
      .select("*")
      .eq("market_id", rawId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setCommunityForecast(data as CommunityForecast);
      });
  }, [rawId]);

  // ── Chart data ────────────────────────────────────────────────────────────────

  const chartData = snapshotRows.map((pt) => ({
    date: new Date(pt.t * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    // yes_prob dos snapshots já é 0-100 (não 0-1) — o *100 dava "8720%" no eixo
    prob: Math.round(pt.p),
  }));

  const currentProb = market?.yesProb ?? 0;
  const probPct = Math.round(currentProb * 100);
  const probColor = probPct >= 60 ? "text-positive" : probPct >= 40 ? "text-gold" : "text-negative";
  // Fidelidade: o status real da fonte (closed/active/status) vale mais que a endDate
  // nominal — um mercado que a Polymarket/Kalshi já resolveu nunca mostra "faltam Xh".
  const isResolved = !!market && (market.closed === true || market.active === false
    || (!!market.status && market.status !== "active"));

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <>
      <MercadosTabs />

      <div className="container py-6 space-y-6">
        {/* Back link */}
        <AnimatedSection delay={0}>
          <Link href="/apostas">
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
              Voltar para mercados
            </span>
          </Link>
        </AnimatedSection>

        {/* Loading state */}
        {loadingMarket && (
          <AnimatedSection delay={0.05}>
            <div className="glass-card rounded-xl p-8 flex items-center justify-center gap-3">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground text-sm">Carregando mercado...</span>
            </div>
          </AnimatedSection>
        )}

        {/* Not found */}
        {!loadingMarket && !market && (
          <AnimatedSection delay={0.05}>
            <div className="glass-card rounded-xl p-8 text-center space-y-2">
              <BarChart2 className="w-10 h-10 text-muted-foreground mx-auto" />
              <p className="text-foreground font-semibold">Mercado não encontrado</p>
              <p className="text-sm text-muted-foreground">
                O ID <code className="font-mono text-xs bg-secondary/30 px-1 rounded">{marketId}</code> não foi localizado nos dados disponíveis.
              </p>
            </div>
          </AnimatedSection>
        )}

        {market && (
          <>
            {/* Header */}
            <AnimatedSection delay={0.05}>
              <div className="glass-card rounded-xl p-6 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">
                    {market.source}
                  </span>
                  {market.category && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary/30 text-muted-foreground border border-border/20 uppercase tracking-wider">
                      {market.category}
                    </span>
                  )}
                  <a
                    href={market.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Ver no {market.source === "kalshi" ? "Kalshi" : "Polymarket"}
                  </a>
                </div>
                <h1 className="text-2xl font-bold text-foreground leading-snug">{market.title}</h1>
                <p className="text-xs text-muted-foreground/70 leading-relaxed">
                  Esta tela reúne tudo sobre este mercado — o preço atual, o histórico, o consenso das fontes e as ferramentas
                  para você decidir com lógica, não no achismo. Abaixo, cada seção explica o que mostra e como usar.
                </p>
              </div>
            </AnimatedSection>

            {/* Resolution countdown + Cerebro articles row */}
            {(market.endDate || isResolved || cerebroArticles.length > 0) && (
              <AnimatedSection delay={0.08}>
                <div className="flex flex-wrap gap-3">
                  {/* Status / Countdown — status real da fonte tem prioridade sobre a endDate */}
                  {(market.endDate || isResolved) && (() => {
                    const cd = market.endDate ? formatCountdown(market.endDate) : { label: "", urgent: false, ended: true };
                    const ended = isResolved || cd.ended;
                    return (
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium ${
                        ended
                          ? "border-muted/20 bg-secondary/20 text-muted-foreground"
                          : cd.urgent
                          ? "border-negative/30 bg-negative/5 text-negative"
                          : "border-border/30 bg-secondary/10 text-muted-foreground"
                      }`}>
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        {ended ? "Mercado encerrado" : `Encerra em: ${cd.label}`}
                      </div>
                    );
                  })()}

                  {/* Cerebro articles chips */}
                  {cerebroArticles.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-semibold uppercase tracking-wider">
                        <BookOpen className="w-3 h-3" />
                        Cerebro
                      </span>
                      {cerebroArticles.map((a) => (
                        <a
                          key={a.id}
                          href={a.url ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-gold/5 border border-gold/20 text-[11px] text-gold/80 hover:bg-gold/10 transition-colors max-w-[200px]"
                          title={a.title}
                        >
                          <Globe className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{a.title.length > 35 ? a.title.slice(0, 34) + "…" : a.title}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </AnimatedSection>
            )}

            {/* Stats row */}
            <AnimatedSection delay={0.1}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Prob SIM */}
                <div className="glass-card rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Probabilidade SIM</p>
                  <p className={`text-3xl font-mono font-bold ${probColor}`}>{probPct}%</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Consenso atual</p>
                </div>
                {/* Volume Total */}
                <div className="glass-card rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Volume Total</p>
                  <p className="text-2xl font-mono font-bold text-foreground">
                    {market.volume !== undefined ? formatVolume(market.volume) : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">Negociado</p>
                </div>
                {/* Volume 24h */}
                <div className="glass-card rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Volume 24h</p>
                  <p className="text-2xl font-mono font-bold text-neon-blue">
                    {market.volume24h !== undefined ? formatVolume(market.volume24h) : "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">Últimas 24 horas</p>
                </div>
                {/* Variação 7d */}
                <div className="glass-card rounded-xl p-4 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Variação 7d</p>
                  {market.weekPriceChange !== undefined ? (
                    <>
                      <p className={`text-2xl font-mono font-bold flex items-center justify-center gap-1 ${market.weekPriceChange >= 0 ? "text-positive" : "text-negative"}`}>
                        {market.weekPriceChange >= 0
                          ? <TrendingUp className="w-5 h-5" />
                          : <TrendingDown className="w-5 h-5" />}
                        {market.weekPriceChange >= 0 ? "+" : ""}{Math.round(market.weekPriceChange * 100)}pp
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1">vs semana anterior</p>
                    </>
                  ) : (
                    <p className="text-2xl font-mono font-bold text-muted-foreground">—</p>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <Explain>
                  Estes quatro números são o retrato rápido do mercado. A <strong className="text-foreground">Probabilidade SIM</strong> é a
                  chance que o mercado dá para o evento acontecer. O <strong className="text-foreground">Volume</strong> mostra quanto dinheiro —
                  e confiança — está em jogo: quanto maior, mais difícil de manipular e mais confiável o preço. A{" "}
                  <strong className="text-foreground">Variação 7d</strong> revela se a opinião mudou na última semana — uma virada grande
                  costuma significar que algo novo aconteceu, e vale entender o porquê.
                </Explain>
              </div>
            </AnimatedSection>

            {/* Consenso JLB — unifica mercado + IA + comunidade */}
            <ConsensusCard
              market={market}
              community={communityForecast}
              ai={aiAnalysis}
              trackRecord={trackRecord}
            />

            {/* Evolução da estimativa da IA ao longo do tempo */}
            <ForecastEvolution marketId={rawId} source={source} />

            {/* Probability history chart */}
            <AnimatedSection delay={0.15}>
              <div className="glass-card rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-neon-blue" />
                      Histórico de Probabilidade (90 dias)
                    </h2>
                    {snapshotRows.length >= 4 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">({snapshotRows.length} snapshots)</p>
                    )}
                  </div>
                </div>

                <Explain>
                  A linha do tempo da probabilidade. Serve para você enxergar a <strong className="text-foreground">tendência</strong>{" "}
                  (subindo ou caindo) em vez de olhar só o número de agora — e para não se assustar com um pico isolado. A linha
                  tracejada em 50% marca a fronteira do "cara ou coroa": acima dela, o mercado acredita mais no SIM.
                </Explain>

                {chartData.length >= 4 ? (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                      <defs>
                        <linearGradient id="probGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={CHART_TICK_STYLE}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={CHART_TICK_STYLE}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(v: number) => [`${v}%`, "Prob SIM"]}
                        labelStyle={{ color: "oklch(0.85 0 0)", fontSize: 11 }}
                      />
                      <ReferenceLine y={50} stroke="oklch(0.6 0 0)" strokeDasharray="3 3" strokeOpacity={0.4} />
                      <Area
                        type="monotone"
                        dataKey="prob"
                        stroke="#22c55e"
                        strokeWidth={2}
                        fill="url(#probGradient)"
                        dot={false}
                        activeDot={{ r: 4, fill: "#22c55e" }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-40 flex flex-col items-center justify-center gap-2 text-center">
                    <BarChart2 className="w-8 h-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Dados históricos disponíveis após snapshots serem coletados</p>
                    <p className="text-[10px] text-muted-foreground/60">Os dados aparecem aqui conforme o sistema coleta snapshots periódicos</p>
                  </div>
                )}
              </div>
            </AnimatedSection>

            {/* AI Analysis */}
            <AnimatedSection delay={0.2}>
              <div className="glass-card rounded-xl p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-400" />
                  <h2 className="text-sm font-semibold text-foreground">Análise por IA</h2>
                </div>

                <Explain>
                  A IA lê <strong className="text-foreground">notícias reais</strong> e compara este evento com casos parecidos do passado para
                  estimar um <strong className="text-foreground">valor justo</strong> independente do preço do mercado. O{" "}
                  <strong className="text-foreground">Edge</strong> é a diferença entre esse valor justo e o mercado — é ali que pode estar a vantagem.
                  Pense nela como uma segunda opinião fundamentada, com as fontes à mostra — nunca um palpite ou recomendação de aposta.
                </Explain>

                <button
                  onClick={handleAnalyzeAi}
                  disabled={loadingAi}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary/10 border border-primary/20 text-sm font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  {loadingAi
                    ? <><RefreshCw className="w-4 h-4 animate-spin" />Analisando mercado...</>
                    : aiAnalysis
                      ? <><Sparkles className="w-4 h-4" />Ocultar análise de IA</>
                      : <><Sparkles className="w-4 h-4" />Analisar com IA</>}
                </button>

                {aiError && (
                  <div className="p-3 rounded-lg bg-negative/10 border border-negative/20 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-negative shrink-0 mt-0.5" />
                    <p className="text-xs text-negative/80">{aiError}</p>
                  </div>
                )}

                {aiAnalysis && (
                  <div className="space-y-3">
                    {/* Fair Value JLB — estimativa independente cruzando todas as fontes */}
                    {aiAnalysis.fairValue != null && (
                      <div className={`p-4 rounded-lg border space-y-2.5 ${
                        aiAnalysis.probabilityAssessment === "underpriced" ? "bg-positive/5 border-positive/25"
                          : aiAnalysis.probabilityAssessment === "overpriced" ? "bg-negative/5 border-negative/25"
                          : "bg-secondary/15 border-border/25"
                      }`}>
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="text-center">
                            <p className="text-[9px] text-muted-foreground/60 uppercase">Mercado</p>
                            <p className="font-mono font-bold text-foreground">{Math.round(market.yesProb * 100)}%</p>
                          </div>
                          <span className="text-muted-foreground/40 text-xs">vs</span>
                          <div className="text-center">
                            <p className="text-[9px] text-gold/70 uppercase">Fair Value JLB</p>
                            <p className="font-mono font-bold text-gold text-xl">{aiAnalysis.fairValue}%</p>
                          </div>
                          {aiAnalysis.edgePp != null && Math.abs(aiAnalysis.edgePp) >= 1 && (
                            <div className={`text-center px-2.5 py-1 rounded-lg ${aiAnalysis.edgePp > 0 ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>
                              <p className="text-[9px] uppercase opacity-70">Edge</p>
                              <p className="font-mono font-bold">{aiAnalysis.edgePp > 0 ? "+" : ""}{aiAnalysis.edgePp}pp</p>
                            </div>
                          )}
                          {aiAnalysis.confidence && (
                            <span className={`ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase ${
                              aiAnalysis.confidence === "alta" ? "border-positive/30 bg-positive/10 text-positive" :
                              aiAnalysis.confidence === "media" ? "border-gold/30 bg-gold/10 text-gold" :
                              "border-border/30 bg-secondary/20 text-muted-foreground"
                            }`}>conf. {aiAnalysis.confidence}</span>
                          )}
                        </div>
                        {aiAnalysis.edgeSignal && (
                          <p className="text-xs text-muted-foreground leading-relaxed">{aiAnalysis.edgeSignal}</p>
                        )}
                        {aiAnalysis.referenceClass && (
                          <p className="text-[10px] text-muted-foreground/70 leading-relaxed border-t border-border/15 pt-2">
                            <span className="font-semibold">Âncora:</span> {aiAnalysis.referenceClass}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Main analysis */}
                    <div className="p-4 rounded-lg bg-neon-blue/5 border border-neon-blue/15">
                      <p className="text-[10px] font-semibold text-neon-blue/80 uppercase tracking-wider mb-2 flex items-center gap-1 flex-wrap">
                        <Sparkles className="w-3 h-3" />Análise de IA
                        {(aiAnalysis.cerebroHits ?? 0) > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-neon-blue/10 border border-neon-blue/30 normal-case">🧠 Cerebro ×{aiAnalysis.cerebroHits}</span>
                        )}
                        {aiAnalysis.hasMomentum && (
                          <span className="px-1.5 py-0.5 rounded bg-secondary/40 border border-border/30 text-muted-foreground normal-case">📈 momentum</span>
                        )}
                        {aiAnalysis.cached && <span className="ml-1 opacity-50">(cache)</span>}
                      </p>
                      <p className="text-sm text-muted-foreground leading-relaxed">{aiAnalysis.analysis}</p>
                    </div>

                    {/* Key factors */}
                    {aiAnalysis.keyFactors.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Target className="w-3 h-3" />Fatores-chave
                        </p>
                        <ul className="space-y-1.5">
                          {aiAnalysis.keyFactors.map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <span className="text-neon-blue shrink-0 mt-0.5">▸</span>{f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Watch for */}
                    {aiAnalysis.watchFor && (
                      <div className="p-3 rounded-lg bg-gold/5 border border-gold/15">
                        <p className="text-[10px] font-semibold text-gold/70 uppercase tracking-wider mb-1">O que acompanhar</p>
                        <p className="text-sm text-muted-foreground leading-relaxed">{aiAnalysis.watchFor}</p>
                      </div>
                    )}

                    {/* Bias alert */}
                    {aiAnalysis.biasAlert && (
                      <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/15 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground leading-relaxed">{aiAnalysis.biasAlert}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AnimatedSection>

            {/* Kelly Calculator */}
            <AnimatedSection delay={0.25}>
              <div className="glass-card rounded-xl p-6">
                <EdgeCalculator marketProb={market.yesProb} />
              </div>
            </AnimatedSection>
          </>
        )}
      </div>
    </>
  );
}
