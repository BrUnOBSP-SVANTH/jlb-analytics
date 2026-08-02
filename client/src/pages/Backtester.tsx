/**
 * Backtester — JLB Analytics
 * Porta as estratégias de evan-kolberg/prediction-market-backtesting para TypeScript.
 * Estratégias: Mean Reversion, Panic Fade, RSI Reversion.
 * Dados: Polymarket CLOB (real) ou série sintética (fallback educacional).
 */
import { useState, useCallback, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import {
  ResponsiveContainer, Area, XAxis, YAxis, Tooltip,
  ReferenceLine, ComposedChart, Line, } from "recharts";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TICK_STYLE } from "@/lib/data";
import {
  Play, RefreshCw, AlertCircle, TrendingUp,
  TrendingDown, Activity, ChevronDown, ChevronUp, Info, Download,
} from "lucide-react";
import LaboratorioTabs from "@/components/LaboratorioTabs";
import { getMarkets } from "@/lib/marketsCache";
import {
  runBacktest, generateSyntheticSeries, fetchPolymarketHistory,
  EXIT_REASON_LABEL,
  DEFAULT_MEAN_REVERSION, DEFAULT_PANIC_FADE, DEFAULT_RSI_REVERSION,
  type PricePoint, type Trade, type BacktestMetrics, type StrategyConfig,
} from "@/lib/backtester";
import { useSEO } from "@/hooks/useSEO";
import { type PolyMarketResolved, type StrategyType, STRATEGY_LABELS } from "@/components/backtester/types";
import { pct, fmt2, dateFromTs, parseFirstTokenId, fetchSnapshotHistory } from "@/components/backtester/helpers";
import { MeanReversionPanel, PanicFadePanel, RsiReversionPanel } from "@/components/backtester/StrategyPanels";
import { MetricCard } from "@/components/backtester/MetricCard";
import { TradeRow } from "@/components/backtester/TradeRow";

export default function Backtester() {
  useSEO("Backtester de Estratégias", "Teste estratégias em mercados preditivos contra dados históricos reais de Polymarket e Kalshi — win rate, ROI, drawdown e exportação CSV.");
  // Market selection
  const [markets, setMarkets] = useState<PolyMarketResolved[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<PolyMarketResolved | null>(null);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [sourceTab, setSourceTab] = useState<"polymarket" | "kalshi">("polymarket");

  // Price series
  const [series, setSeries] = useState<PricePoint[]>([]);
  const [dataSource, setDataSource] = useState<"live" | "snapshots" | "synthetic" | null>(null);
  const [loadingSeries, setLoadingSeries] = useState(false);

  // Strategy config
  const [strategyType, setStrategyType] = useState<StrategyType>("meanReversion");
  const [mrCfg, setMrCfg] = useState(DEFAULT_MEAN_REVERSION);
  const [pfCfg, setPfCfg] = useState(DEFAULT_PANIC_FADE);
  const [rsiCfg, setRsiCfg] = useState(DEFAULT_RSI_REVERSION);

  // Results
  const [trades, setTrades] = useState<Trade[]>([]);
  const [metrics, setMetrics] = useState<BacktestMetrics | null>(null);
  const [showAllTrades, setShowAllTrades] = useState(false);

  // Fetch markets based on sourceTab — via cache compartilhado (marketsCache)
  useEffect(() => {
    let cancelled = false;
    setLoadingMarkets(true);
    setMarkets([]);
    setSelectedMarket(null);

    async function load() {
      try {
        if (sourceTab === "polymarket") {
          const raw = await getMarkets<{ id: string; question: string; slug: string; clobTokenIds?: string; outcomePrices?: string; volume?: number; closed?: boolean; resolutionTime?: string }>("polymarket");
          const list = raw
            .map(m => ({ ...m, source: "polymarket" as const }))
            .filter(m => m.closed || m.resolutionTime);
          if (!cancelled) {
            setMarkets(list.slice(0, 50));
            // Auto-seleciona o 1º — o select já o exibe; sem isso o painel de resultados fica morto
            if (list.length > 0) setSelectedMarket(list[0]);
          }
        } else {
          const raw = await getMarkets<{ ticker: string; eventTicker: string; seriesTicker: string; title: string; yesProb: number; volume: number }>("kalshi");
          const list = raw.map(m => ({
            id: `kalshi-${m.ticker}`,
            question: m.title,
            slug: m.ticker,
            volume: m.volume,
            source: "kalshi" as const,
          }));
          if (!cancelled) {
            setMarkets(list.slice(0, 50));
            if (list.length > 0) setSelectedMarket(list[0]);
          }
        }
      } catch { /* lista vazia */ }
      finally { if (!cancelled) setLoadingMarkets(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [sourceTab]);

  // Load price series when market changes
  const loadSeries = useCallback(async (market: PolyMarketResolved) => {
    setLoadingSeries(true);
    setSeries([]);
    setMetrics(null);
    setTrades([]);
    setDataSource(null);

    // 1. Try CLOB for Polymarket
    if (market.source !== "kalshi") {
      const tokenId = parseFirstTokenId(market.clobTokenIds);
      if (tokenId) {
        const clobPts = await fetchPolymarketHistory(tokenId);
        if (clobPts && clobPts.length >= 10) {
          setSeries(clobPts);
          setDataSource("live");
          setLoadingSeries(false);
          return;
        }
      }
    }

    // 2. Try Supabase snapshots (Polymarket fallback OR Kalshi primary)
    const source = market.source ?? "polymarket";
    const snapPts = await fetchSnapshotHistory(source, market.id);
    if (snapPts.length >= 5) {
      setSeries(snapPts);
      setDataSource("snapshots");
      setLoadingSeries(false);
      return;
    }

    // 3. Fallback to synthetic
    let endProb = 0.5;
    try {
      if (market.outcomePrices) {
        const arr = JSON.parse(market.outcomePrices) as string[];
        endProb = parseFloat(arr[0] ?? "0.5");
        if (endProb >= 0.99) endProb = 1;
        else if (endProb <= 0.01) endProb = 0;
      }
    } catch { /* ignore */ }

    const synthetic = generateSyntheticSeries(240, 0.5, endProb, 0.025, market.id.charCodeAt(0));
    setSeries(synthetic);
    setDataSource("synthetic");
    setLoadingSeries(false);
  }, []);

  useEffect(() => {
    if (selectedMarket) void loadSeries(selectedMarket);
  }, [selectedMarket, loadSeries]);

  // Série sintética como porta de entrada — usada pelo seletor e pelo empty state
  function loadDemoSeries() {
    const synthetic = generateSyntheticSeries(240, 0.5, 1, 0.025, 99);
    setSeries(synthetic);
    setDataSource("synthetic");
    setMetrics(null);
    setTrades([]);
    setSelectedMarket({ id: "demo", question: "Série sintética (demo)", slug: "demo" });
  }

  // Run backtest
  function handleRun() {
    if (series.length === 0) return;
    let config: StrategyConfig;
    if (strategyType === "meanReversion") config = { type: "meanReversion", params: mrCfg };
    else if (strategyType === "panicFade") config = { type: "panicFade", params: pfCfg };
    else config = { type: "rsiReversion", params: rsiCfg };

    const result = runBacktest(series, config);
    setTrades(result.trades);
    setMetrics(result.metrics);
  }

  function exportCsv() {
    if (trades.length === 0 || !selectedMarket) return;
    const header = ["#", "Entrada", "Saída", "Preço entrada (¢)", "Preço saída (¢)", "P&L (%)", "Motivo"].join(",");
    const rows = trades.map((t, i) =>
      [
        i + 1,
        dateFromTs(t.entryTime),
        dateFromTs(t.exitTime),
        (t.entryPrice * 100).toFixed(2),
        (t.exitPrice * 100).toFixed(2),
        (t.pnlPct * 100).toFixed(3),
        EXIT_REASON_LABEL[t.exitReason],
      ].join(",")
    );
    const meta = [
      `# Mercado: ${selectedMarket.question}`,
      `# Estratégia: ${STRATEGY_LABELS[strategyType]}`,
      `# Série: ${dataSource === "live" ? "CLOB Polymarket" : dataSource === "snapshots" ? "Supabase snapshots 90d" : "sintética"}`,
      `# Total return: ${metrics ? (metrics.totalReturn * 100).toFixed(2) + "%" : "—"}`,
      `# Win rate: ${metrics ? (metrics.winRate * 100).toFixed(0) + "%" : "—"}`,
      `# Sharpe: ${metrics ? metrics.sharpe.toFixed(3) : "—"}`,
      `# Max Drawdown: ${metrics ? (metrics.maxDrawdown * 100).toFixed(2) + "%" : "—"}`,
    ].join("\n");
    const csv = meta + "\n" + header + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jlb-backtest-${STRATEGY_LABELS[strategyType].toLowerCase().replace(/ /g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Chart data: price series + equity
  const priceChartData = series.map((pt, i) => ({
    i,
    date: dateFromTs(pt.t),
    price: parseFloat((pt.p * 100).toFixed(2)),
    equity: metrics ? parseFloat((metrics.equity[i] * 100).toFixed(2)) : undefined,
  }));

  // Entry/exit scatter overlays
  const entryDots = trades.map((t) => ({ i: t.entryIdx, price: t.entryPrice * 100, type: "entry" }));

  const profitColor = metrics && metrics.totalReturn >= 0 ? CHART_COLORS.tertiary : "#ef4444";
  const visibleTrades = showAllTrades ? trades : trades.slice(0, 10);

  return (
    <div>
      <LaboratorioTabs />
      <PageHeader
        title="Backtester"
        subtitle="Simule estratégias de Mean Reversion, Panic Fade e RSI em mercados preditivos reais do Polymarket."
        badge="Ferramentas"
        probability={metrics ? Math.round(metrics.winRate * 100) : undefined}
      />

      <div className="container py-10 space-y-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left panel: config ── */}
          <div className="space-y-5">
            {/* Market selector */}
            <div className="glass-card rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Activity className="w-4 h-4 text-gold" />
                Mercado
              </h3>
              <div className="flex rounded-lg overflow-hidden border border-border/30">
                {(["polymarket", "kalshi"] as const).map(src => (
                  <button
                    key={src}
                    onClick={() => setSourceTab(src)}
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                      sourceTab === src
                        ? "bg-secondary/60 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {src === "polymarket" ? "Polymarket" : "Kalshi"}
                  </button>
                ))}
              </div>
              {loadingMarkets ? (
                <div className="h-8 bg-secondary/30 rounded animate-pulse" />
              ) : markets.length > 0 ? (
                <select
                  value={selectedMarket?.id ?? ""}
                  onChange={(e) => {
                    const m = markets.find((x) => x.id === e.target.value);
                    if (m) setSelectedMarket(m);
                  }}
                  className="w-full bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-gold"
                >
                  {markets.map((m) => (
                    <option key={m.id} value={m.id}>{m.question.slice(0, 60)}{m.question.length > 60 ? "…" : ""}</option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  className="w-full bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-xs cursor-pointer text-gold text-left hover:border-gold/40 transition-colors"
                  onClick={loadDemoSeries}
                >
                  Usar série sintética (demo)
                </button>
              )}

              {selectedMarket && (
                <p className="text-[10px] text-muted-foreground leading-relaxed line-clamp-2">{selectedMarket.question}</p>
              )}

              {dataSource && (
                <div className="space-y-1.5">
                  <div className={`flex items-center gap-1.5 text-[10px] font-medium ${
                    dataSource === "live" ? "text-positive" : dataSource === "snapshots" ? "text-cyan-400" : "text-gold"
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                      dataSource === "live" ? "bg-positive" : dataSource === "snapshots" ? "bg-cyan-400" : "bg-gold"
                    }`} />
                    {dataSource === "live" && `CLOB 7d — Polymarket ao vivo (${series.length} candles)`}
                    {dataSource === "snapshots" && `Supabase 90d — snapshots diários (${series.length} pontos)`}
                    {dataSource === "synthetic" && `Sintético (educacional) — ${series.length} candles`}
                  </div>
                  {dataSource === "snapshots" && (
                    <div className="flex items-start gap-1.5 p-2 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                      <Info className="w-3 h-3 text-cyan-400/70 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        Dados de snapshots diários — 1 ponto por dia (90 dias). Estratégias intraday não se aplicam.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Strategy selector */}
            <div className="glass-card rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gold" />
                Estratégia
              </h3>
              <div className="flex flex-col gap-1">
                {(["meanReversion", "panicFade", "rsiReversion"] as StrategyType[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStrategyType(s)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors ${
                      strategyType === s
                        ? "bg-gold/15 text-gold border border-gold/30"
                        : "text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                  >
                    {STRATEGY_LABELS[s]}
                  </button>
                ))}
              </div>

              <div className="pt-2 border-t border-border/20">
                {strategyType === "meanReversion" && (
                  <MeanReversionPanel cfg={mrCfg} onChange={setMrCfg} />
                )}
                {strategyType === "panicFade" && (
                  <PanicFadePanel cfg={pfCfg} onChange={setPfCfg} />
                )}
                {strategyType === "rsiReversion" && (
                  <RsiReversionPanel cfg={rsiCfg} onChange={setRsiCfg} />
                )}
              </div>

              <button
                onClick={handleRun}
                disabled={series.length === 0 || loadingSeries}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gold text-on-accent text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {loadingSeries
                  ? <><RefreshCw className="w-4 h-4 animate-spin" />Carregando…</>
                  : <><Play className="w-4 h-4" />Rodar Backtest</>
                }
              </button>
            </div>

            {/* Source note */}
            <div className="flex items-start gap-2 p-3 rounded-lg border border-border/20 bg-secondary/5">
              <Info className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Estratégias portadas de{" "}
                <a href="https://github.com/evan-kolberg/prediction-market-backtesting" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
                  evan-kolberg/prediction-market-backtesting
                </a>
                {" "}(NautilusTrader). Fins educacionais — não constitui recomendação de operação.
              </p>
            </div>
          </div>

          {/* ── Right panel: results ── */}
          <div className="lg:col-span-2 space-y-6">
            {/* Price + equity chart */}
            {series.length > 0 && (
              <AnimatedSection>
                <div className="glass-card rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-foreground text-sm">
                      Preço (%) {metrics ? "· Curva de Equity" : ""}
                    </h3>
                    {dataSource === "synthetic" && (
                      <span className="text-[10px] text-gold/70 border border-gold/20 rounded-full px-2 py-0.5">
                        Sintético (educacional)
                      </span>
                    )}
                    {dataSource === "snapshots" && (
                      <span className="text-[10px] text-cyan-400/70 border border-cyan-400/20 rounded-full px-2 py-0.5">
                        Supabase 90d
                      </span>
                    )}
                  </div>
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={priceChartData}>
                      <XAxis
                        dataKey="date" axisLine={false} tickLine={false}
                        tick={CHART_TICK_STYLE} interval={Math.floor(priceChartData.length / 6)}
                      />
                      <YAxis axisLine={false} tickLine={false} tick={CHART_TICK_STYLE}
                        tickFormatter={(v) => `${v}%`} domain={["auto", "auto"]}
                      />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name === "price" ? "Probabilidade" : "Equity"]}
                      />
                      <Area type="monotone" dataKey="price" stroke={CHART_COLORS.primary}
                        fill={CHART_COLORS.primary} fillOpacity={0.08} strokeWidth={1.5} dot={false}
                      />
                      {metrics && (
                        <Line type="monotone" dataKey="equity" stroke={profitColor}
                          strokeWidth={2} dot={false} strokeDasharray="4 2"
                        />
                      )}
                      {/* Entry dots */}
                      {entryDots.map((d, i) => (
                        <ReferenceLine key={`e${i}`} x={priceChartData[d.i]?.date}
                          stroke={CHART_COLORS.tertiary} strokeDasharray="3 3" strokeWidth={1} strokeOpacity={0.5}
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                  {metrics && trades.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-2 text-center">
                      Linha tracejada = equity acumulado · Linhas verticais = entradas
                    </p>
                  )}
                  {metrics && trades.length === 0 && (
                    <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                      <AlertCircle className="w-4 h-4 text-yellow-500 shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Nenhuma entrada encontrada com esses parâmetros. Tente aumentar o limiar de entrada ou reduzir a janela.
                      </p>
                    </div>
                  )}
                </div>
              </AnimatedSection>
            )}

            {/* Metrics */}
            {metrics && trades.length > 0 && (
              <AnimatedSection>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <MetricCard
                    label="Retorno total"
                    value={pct(metrics.totalReturn)}
                    sub={`${metrics.totalTrades} operações`}
                    color={metrics.totalReturn >= 0 ? "text-positive" : "text-negative"}
                    tooltip="Soma de P&L em pontos percentuais, sem considerar custos de transação."
                  />
                  <MetricCard
                    label="Win Rate"
                    value={`${(metrics.winRate * 100).toFixed(0)}%`}
                    sub={`${trades.filter((t) => t.pnl > 0).length}W / ${trades.filter((t) => t.pnl <= 0).length}L`}
                    color={metrics.winRate >= 0.5 ? "text-positive" : "text-negative"}
                  />
                  <MetricCard
                    label="Sharpe"
                    value={metrics.sharpe.toFixed(2)}
                    sub={metrics.sharpe > 1 ? "bom" : metrics.sharpe > 0 ? "positivo" : "negativo"}
                    color={metrics.sharpe > 1 ? "text-positive" : metrics.sharpe > 0 ? "text-gold" : "text-negative"}
                    tooltip="Sharpe ratio baseado nos retornos por operação. > 1 é considerado bom."
                  />
                  <MetricCard
                    label="Max Drawdown"
                    value={pct(-metrics.maxDrawdown)}
                    sub="queda máx da equity"
                    color={metrics.maxDrawdown < 0.1 ? "text-positive" : metrics.maxDrawdown < 0.25 ? "text-gold" : "text-negative"}
                  />
                  <MetricCard
                    label="Média/operação"
                    value={pct(metrics.avgPnlPerTrade)}
                    sub="P&L médio por trade"
                    color={metrics.avgPnlPerTrade >= 0 ? "text-positive" : "text-negative"}
                  />
                  <MetricCard
                    label="Preço médio entrada"
                    value={`${(metrics.avgEntryPrice * 100).toFixed(1)}¢`}
                    sub="edge — quanto abaixo do mercado"
                    color="text-gold"
                    tooltip="Preço médio de entrada. Quanto menor, maior o edge capturado vs. o mercado."
                  />
                  <MetricCard
                    label="Brier Advantage"
                    value={fmt2(metrics.brierAdvantage)}
                    sub={Math.abs(metrics.brierAdvantage) < 0.0005 ? "igual ao baseline" : metrics.brierAdvantage > 0 ? "melhor que baseline" : "abaixo do baseline"}
                    color={Math.abs(metrics.brierAdvantage) < 0.0005 ? "text-muted-foreground" : metrics.brierAdvantage > 0 ? "text-positive" : "text-negative"}
                    tooltip="Melhoria no Brier Score vs. buy-and-hold. Positivo = estratégia entra com estimativas mais precisas."
                  />
                  <MetricCard
                    label="Série"
                    value={`${series.length}`}
                    sub={`${dataSource === "live" ? "candles reais" : dataSource === "snapshots" ? "snapshots 90d" : "sintéticos"}`}
                    color="text-muted-foreground"
                  />
                </div>
              </AnimatedSection>
            )}

            {/* Trades table */}
            {trades.length > 0 && (
              <AnimatedSection>
                <div className="glass-card rounded-xl overflow-hidden">
                  <div className="p-5 border-b border-border/20 flex items-center justify-between">
                    <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                      {metrics && metrics.totalReturn >= 0
                        ? <TrendingUp className="w-4 h-4 text-positive" />
                        : <TrendingDown className="w-4 h-4 text-negative" />}
                      {trades.length} Operações
                    </h3>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {trades.filter((t) => t.pnl > 0).length} lucrativas
                      </span>
                      <button
                        onClick={exportCsv}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-secondary/40 border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors"
                        title="Exportar trades como CSV"
                      >
                        <Download className="w-3 h-3" />
                        CSV
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/20">
                          {["#", "Entrada", "Saída", "Preço entrada", "Preço saída", "P&L", "Motivo"].map((h) => (
                            <th key={h} className="p-2 text-[10px] text-muted-foreground font-medium uppercase tracking-wider text-left">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleTrades.map((t, i) => <TradeRow key={i} trade={t} index={i} />)}
                      </tbody>
                    </table>
                  </div>
                  {trades.length > 10 && (
                    <button
                      onClick={() => setShowAllTrades((v) => !v)}
                      className="w-full flex items-center justify-center gap-1.5 py-3 text-xs text-muted-foreground hover:text-foreground transition-colors border-t border-border/20"
                    >
                      {showAllTrades
                        ? <><ChevronUp className="w-3.5 h-3.5" />Mostrar menos</>
                        : <><ChevronDown className="w-3.5 h-3.5" />Ver todas {trades.length} operações</>
                      }
                    </button>
                  )}
                </div>
              </AnimatedSection>
            )}

            {/* Empty state before run */}
            {series.length > 0 && !metrics && !loadingSeries && (
              <div className="text-center py-16 glass-card rounded-xl">
                <Play className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Configure a estratégia e clique em <strong>Rodar Backtest</strong>.</p>
              </div>
            )}

            {/* Loading skeleton while series fetches */}
            {(loadingSeries || loadingMarkets) && series.length === 0 && (
              <div className="glass-card rounded-xl p-6 space-y-4" aria-busy="true">
                <div className="h-4 w-40 bg-secondary/40 rounded animate-pulse" />
                <div className="h-56 bg-secondary/20 rounded-lg animate-pulse" />
              </div>
            )}

            {/* Empty state before any series (mercados indisponíveis / nada selecionado) */}
            {series.length === 0 && !loadingSeries && !loadingMarkets && (
              <div className="text-center py-16 glass-card rounded-xl px-6">
                <Activity className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground/70 mb-1">Nenhuma série carregada</p>
                <p className="text-xs text-muted-foreground mb-5">
                  Escolha um mercado no painel ao lado — ou comece agora com uma série de demonstração.
                </p>
                <button
                  type="button"
                  onClick={loadDemoSeries}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  Usar série sintética (demo)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
