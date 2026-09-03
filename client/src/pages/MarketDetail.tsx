/**
 * MarketDetail — JLB Analytics
 * Página de detalhe de mercado: /apostas/:id
 */
import { useParams, Link } from "wouter";
import {
  ChevronLeft, BarChart2, TrendingUp, TrendingDown,
  Sparkles, Target, AlertTriangle, RefreshCw, Clock, BookOpen, Globe, CheckCircle,
  ExternalLink, Newspaper,
} from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";
import MercadosTabs from "@/components/MercadosTabs";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, ReferenceLine,
} from "recharts";
import { CHART_TOOLTIP_STYLE, CHART_TICK_STYLE } from "@/lib/data";
import { useMarketDetail } from "@/hooks/useMarketDetail";
import { formatCountdown, formatVolume } from "@/components/marketDetail/utils";
import { Explain } from "@/components/marketDetail/Explain";
import { EdgeCalculator } from "@/components/marketDetail/EdgeCalculator";
import { ConsensusCard } from "@/components/marketDetail/ConsensusCard";
import { ForecastEvolution } from "@/components/marketDetail/ForecastEvolution";
import { MarketHeader } from "@/components/marketDetail/MarketHeader";
import { OutcomesBreakdown } from "@/components/marketDetail/OutcomesBreakdown";
import { Termo } from "@/components/Termo";

// ── Types ──────────────────────────────────────────────────────────────────────


// ── Main Component ─────────────────────────────────────────────────────────────

export default function MarketDetail() {
  const params = useParams<{ id: string }>();
  const marketId = params.id ?? "";

  // Toda a camada de dados (estado, efeitos, fetches e derivados) vive no hook —
  // o JSX abaixo ficou intacto de propósito: o risco desta tela mora na renderização.
  const {
    source, rawId,
    market, snapshotRows, aiAnalysis, loadingMarket, loadingAi, aiError,
    communityForecast, cerebroArticles, trackRecord,
    handleAnalyzeAi,
    chartData, currentProb, probPct, probColor, chartStroke, isResolved,
  } = useMarketDetail(marketId);

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
            <MarketHeader market={market} />

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

            <OutcomesBreakdown market={market} />

            {/* Stats row */}
            <AnimatedSection delay={0.1}>
              {/* Probabilidade protagonista: nos binários vira o herói da tela — número
                  grande, NÃO complementar e barra SIM/NÃO. Os demais números viram uma
                  linha secundária compacta. (Multi-desfecho usa a seção de Desfechos acima.) */}
              {!market.parsedOutcomes && (
                <div className="glass-card rounded-xl p-6 mb-3">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">Probabilidade de SIM</p>
                  <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap">
                    <span className={`font-mono font-bold leading-none tabular-nums ${probColor}`} style={{ fontSize: "clamp(3.25rem, 9vw, 4.75rem)" }}>
                      {probPct}<span className="text-3xl align-top leading-none">%</span>
                    </span>
                    <span className="text-sm text-muted-foreground">de chance segundo o mercado</span>
                  </div>
                  {/* Barra SIM/NÃO — o complemento ancorado no fim (sem vazio morto no meio) */}
                  <div className="mt-5 flex items-center gap-3">
                    <div className="flex-1 h-2.5 rounded-full bg-secondary/40 overflow-hidden">
                      <div className={`h-full rounded-l-full rounded-r-[2px] min-w-[6px] ${probColor.replace("text-", "bg-")} transition-all duration-700`} style={{ width: `${probPct}%` }} />
                    </div>
                    <span className="text-sm font-mono font-bold text-muted-foreground tabular-nums shrink-0">Não {100 - probPct}%</span>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
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
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1"><Termo nome="volume">Volume 24h</Termo></p>
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
                  Estes números são o retrato rápido do mercado. A <strong className="text-foreground">Probabilidade de SIM</strong> é a
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
                          <stop offset="5%" stopColor={chartStroke} stopOpacity={0.3} />
                          <stop offset="95%" stopColor={chartStroke} stopOpacity={0.02} />
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
                        stroke={chartStroke}
                        strokeWidth={2}
                        fill="url(#probGradient)"
                        dot={false}
                        activeDot={{ r: 4, fill: chartStroke }}
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
                  <strong className="text-foreground"><Termo nome="edge">Edge</Termo></strong> é a diferença entre esse valor justo e o mercado — é ali que pode estar a vantagem.
                  Pense nela como uma segunda opinião fundamentada, com as fontes à mostra — nunca um palpite ou recomendação de compra.
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
                              <p className="text-[9px] uppercase opacity-70"><Termo nome="edge">Edge</Termo></p>
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
                      <div className="p-3 rounded-lg bg-warning/5 border border-warning/15 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground leading-relaxed">{aiAnalysis.biasAlert}</p>
                      </div>
                    )}

                    {/* Fontes que a IA leu — cumpre a promessa "com as fontes à mostra" (antes o payload trazia, a tela descartava) */}
                    {aiAnalysis.articles && aiAnalysis.articles.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Newspaper className="w-3 h-3" aria-hidden="true" />Fontes que a IA leu
                        </p>
                        <ul className="space-y-1.5">
                          {aiAnalysis.articles.slice(0, 5).map((a, i) => (
                            <li key={i}>
                              {a.url ? (
                                <a href={a.url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-start gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                                  <ExternalLink className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/50 group-hover:text-primary" aria-hidden="true" />
                                  <span className="line-clamp-2">{a.title} <span className="text-muted-foreground/50">· {a.source}</span></span>
                                </a>
                              ) : (
                                <span className="flex items-start gap-2 text-xs text-muted-foreground">
                                  <Newspaper className="w-3 h-3 shrink-0 mt-0.5 text-muted-foreground/40" aria-hidden="true" />
                                  <span className="line-clamp-2">{a.title} <span className="text-muted-foreground/50">· {a.source}</span></span>
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AnimatedSection>

            {/* Kelly Calculator */}
            <AnimatedSection delay={0.25}>
              <div className="glass-card rounded-xl p-6">
                <EdgeCalculator marketProb={market.yesProb} marketId={market.id} question={market.title} />
              </div>
            </AnimatedSection>
          </>
        )}
      </div>
    </>
  );
}
