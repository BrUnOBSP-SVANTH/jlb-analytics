/**
 * MarketDetail — JLB Analytics
 * Página de detalhe de mercado: /apostas/:id
 */
import { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import {
  ChevronLeft, ExternalLink, BarChart2, TrendingUp, TrendingDown,
  Sparkles, Target, AlertTriangle, RefreshCw, Clock, BookOpen, Globe, CheckCircle,
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
import { useSEO } from "@/hooks/useSEO";
import { type MarketBasic, type CerebroArticleSnippet, type AiResult, type CommunityForecast } from "@/components/marketDetail/types";
import { formatCountdown, formatVolume } from "@/components/marketDetail/utils";
import { Explain } from "@/components/marketDetail/Explain";
import { EdgeCalculator } from "@/components/marketDetail/EdgeCalculator";
import { ConsensusCard } from "@/components/marketDetail/ConsensusCard";
import { ForecastEvolution } from "@/components/marketDetail/ForecastEvolution";

// ── Types ──────────────────────────────────────────────────────────────────────


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
            outcomes?: { label: string; prob: number }[];
          }>("kalshi");
          const found = data.find((m) => m.ticker === rawId || m.ticker.includes(rawId));
          if (found) {
            setMarket({
              id: found.ticker,
              title: found.title,
              // Kalshi devolve yesProb em 0-100; o resto da tela espera decimal 0-1
              // (o *100 dava "2200%" no header/consenso/edge de todo mercado Kalshi).
              yesProb: found.yesProb / 100,
              volume: found.volume,
              volume24h: found.volume24h,
              liquidity: found.openInterest,
              externalUrl: `https://kalshi.com/markets/${found.ticker}`,
              source: "kalshi",
              category: found.category,
              status: found.status,
              parsedOutcomes: found.outcomes,
            });
          } else {
            // Fora da lista ao vivo — provável mercado resolvido. Busca o mercado único
            // (inclui resolvidos) para mostrá-lo como "Resolvido", não "não encontrado".
            const r = await fetch(`/api/kalshi/market/${encodeURIComponent(rawId)}`);
            if (r.ok) {
              const fb = await r.json() as { ticker: string; title: string; yesProb: number; volume?: number; volume24h?: number; openInterest?: number; category?: string; status?: string; resolvedOutcome?: string };
              setMarket({
                id: fb.ticker, title: fb.title, yesProb: fb.yesProb / 100,
                volume: fb.volume, volume24h: fb.volume24h, liquidity: fb.openInterest,
                externalUrl: `https://kalshi.com/markets/${fb.ticker}`, source: "kalshi",
                category: fb.category, status: fb.status, resolvedOutcome: fb.resolvedOutcome,
              });
            }
          }
        } else {
          const data = await getMarkets<{
            id: string; question: string; eventTitle?: string; slug?: string; yesProb?: number;
            volume?: number | string; liquidity?: number | string;
            volume24h?: number | string; weekPriceChange?: number | string;
            outcomePrices?: string; outcomes?: string; category?: string; clobTokenIds?: string; endDate?: string;
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
            // Multi-resultado (negRisk): o servidor manda outcomes/outcomePrices já
            // agregados. >2 rótulos ⇒ mostramos o breakdown de desfechos, não SIM/NÃO.
            let parsedOutcomes: { label: string; prob: number }[] | undefined;
            try {
              const labels = JSON.parse(found.outcomes ?? "[]") as string[];
              const prices = (JSON.parse(found.outcomePrices ?? "[]") as string[]).map(Number);
              if (labels.length > 2 && prices.length >= labels.length) {
                parsedOutcomes = labels
                  .map((label, i) => ({ label, prob: prices[i] ?? 0 }))
                  .filter((o) => o.prob > 0.005)
                  .sort((a, b) => b.prob - a.prob);
              }
            } catch { /* segue binário */ }
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
              parsedOutcomes,
            });
          } else {
            // Idem Kalshi: mercado provavelmente resolvido → busca o mercado único.
            const r = await fetch(`/api/polymarket/market/${encodeURIComponent(rawId)}`);
            if (r.ok) {
              const fb = await r.json() as { id: string; question?: string; outcomePrices?: string; volume?: number; volume24h?: number; liquidity?: number; weekPriceChange?: number; endDate?: string; category?: string; closed?: boolean; active?: boolean; resolvedOutcome?: string };
              const yp = (() => { try { const p = JSON.parse(fb.outcomePrices ?? "[]") as string[]; return p[0] ? parseFloat(p[0]) : 0.5; } catch { return 0.5; } })();
              setMarket({
                id: fb.id, title: fb.question ?? "Mercado", yesProb: yp,
                volume: fb.volume, volume24h: fb.volume24h, liquidity: fb.liquidity,
                weekPriceChange: fb.weekPriceChange,
                externalUrl: `https://polymarket.com/event/${fb.id}`, source: "polymarket",
                category: fb.category, endDate: fb.endDate, closed: fb.closed, active: fb.active,
                resolvedOutcome: fb.resolvedOutcome,
              });
            }
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
                          ? (market.resolvedOutcome
                              ? "border-positive/30 bg-positive/5 text-positive"
                              : "border-muted/20 bg-secondary/20 text-muted-foreground")
                          : cd.urgent
                          ? "border-negative/30 bg-negative/5 text-negative"
                          : "border-border/30 bg-secondary/10 text-muted-foreground"
                      }`}>
                        {ended && market.resolvedOutcome
                          ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                          : <Clock className="w-3.5 h-3.5 shrink-0" />}
                        {ended
                          ? (market.resolvedOutcome ? `Resolvido — resultado: ${market.resolvedOutcome}` : "Mercado encerrado")
                          : `Encerra em: ${cd.label}`}
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

            {/* Desfechos possíveis — mercados multi-resultado (negRisk): mostra TODAS as
                possibilidades com sua probabilidade real, como no Polymarket. */}
            {market.parsedOutcomes && market.parsedOutcomes.length > 2 && (
              <AnimatedSection delay={0.09}>
                <div className="glass-card rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-neon-blue" />
                    <h2 className="text-sm font-semibold text-foreground">Desfechos possíveis</h2>
                    <span className="ml-auto text-[10px] text-muted-foreground/60">{market.parsedOutcomes.length} opções · fonte: {market.source}</span>
                  </div>
                  <Explain>
                    Este mercado tem <strong className="text-foreground">mais de dois desfechos</strong>. Cada linha é uma
                    possibilidade e a probabilidade real que o mercado dá a ela (somam ~100%). É o retrato honesto do que
                    está sendo precificado — não só o "SIM/NÃO" do desfecho líder.
                  </Explain>
                  <div className="space-y-2">
                    {market.parsedOutcomes.map((o) => {
                      const pct = Math.round(o.prob * 100);
                      const barColor = pct >= 40 ? "bg-positive" : pct >= 15 ? "bg-gold" : "bg-neon-blue/60";
                      const txtColor = pct >= 40 ? "text-positive" : pct >= 15 ? "text-gold" : "text-muted-foreground";
                      return (
                        <div key={o.label} className="flex items-center gap-3">
                          <span className="text-xs text-foreground w-40 sm:w-56 shrink-0 truncate" title={o.label}>{o.label}</span>
                          <div className="flex-1 h-2 bg-secondary/40 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${Math.max(1, pct)}%` }} />
                          </div>
                          <span className={`text-sm font-mono font-bold w-11 text-right shrink-0 ${txtColor}`}>{pct}%</span>
                        </div>
                      );
                    })}
                  </div>
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
