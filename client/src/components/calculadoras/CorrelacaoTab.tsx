/**
 * CorrelacaoTab — correlacao entre series de precos (recharts + @/lib/data).
 * HistoryPoint + fetchHistory + CorrelacaoTab. Extraido de pages/Calculadoras.tsx.
 */
import { useState, useMemo, useEffect } from "react";
import { GitCompare, AlertTriangle, Info } from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";
import { stocks, calculateCorrelation, CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TICK_STYLE } from "@/lib/data";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from "recharts";

interface HistoryPoint { t: number; close: number }

async function fetchHistory(ticker: string): Promise<number[]> {
  const res = await fetch(`/api/quotes/history/${encodeURIComponent(ticker)}?months=12`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { points?: HistoryPoint[] };
  return (data.points ?? []).map((p) => p.close);
}

export function CorrelacaoTab() {
  const [asset1, setAsset1] = useState("AAPL");
  const [asset2, setAsset2] = useState("MSFT");
  const [history1, setHistory1] = useState<number[]>([]);
  const [history2, setHistory2] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([fetchHistory(asset1), fetchHistory(asset2)])
      .then(([h1, h2]) => {
        if (cancelled) return;
        setHistory1(h1);
        setHistory2(h2);
        setUpdatedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao buscar dados"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [asset1, asset2]);

  const result = useMemo(() => {
    if (history1.length < 4 || history2.length < 4) return { correlation: 0, covariance: 0, lengthsMatch: true, n: 0 };
    return calculateCorrelation(history1, history2);
  }, [history1, history2]);

  // Align by index for chart — use shorter series length
  const chartData = useMemo(() => {
    const n = Math.min(history1.length, history2.length);
    return Array.from({ length: n }, (_, i) => ({
      month: `M${i + 1}`,
      [asset1]: history1[history1.length - n + i],
      [asset2]: history2[history2.length - n + i],
    }));
  }, [history1, history2, asset1, asset2]);

  const corrColor = result.correlation > 0.5 ? "text-positive" : result.correlation < -0.5 ? "text-negative" : "text-gold";
  const corrLabel = result.correlation > 0.7 ? "Forte positiva" : result.correlation > 0.3 ? "Moderada positiva" : result.correlation > -0.3 ? "Fraca / Neutra" : result.correlation > -0.7 ? "Moderada negativa" : "Forte negativa";
  const selectClass = "w-full mt-1.5 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="space-y-8">
      <AnimatedSection>
        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
            <div className="flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-neon-blue" aria-hidden="true" />
              <h3 className="font-display font-semibold text-foreground">Correlação de Pearson — dados reais Yahoo Finance</h3>
            </div>
            <div className="flex items-center gap-2">
              {loading && <span className="w-3 h-3 rounded-full border-2 border-neon-blue border-t-transparent animate-spin" />}
              {updatedAt && !loading && (
                <span className="text-[10px] text-positive/70 border border-positive/20 rounded-full px-2 py-0.5">
                  ● Ao vivo · {updatedAt}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider" htmlFor="corr-asset1">Ativo 1</label>
              <select id="corr-asset1" value={asset1} onChange={(e) => setAsset1(e.target.value)} className={selectClass}>
                {stocks.map((s) => (
                  <option key={s.ticker} value={s.ticker}>{s.ticker} — {s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase tracking-wider" htmlFor="corr-asset2">Ativo 2</label>
              <select id="corr-asset2" value={asset2} onChange={(e) => setAsset2(e.target.value)} className={selectClass}>
                {stocks.map((s) => (
                  <option key={s.ticker} value={s.ticker}>{s.ticker} — {s.name}</option>
                ))}
              </select>
            </div>
          </div>
          {error && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-negative/10 border border-negative/20">
              <AlertTriangle className="w-4 h-4 text-negative shrink-0 mt-0.5" />
              <p className="text-xs text-negative">{error} — verifique a conexão com o servidor.</p>
            </div>
          )}
          {!result.lengthsMatch && result.n > 0 && (
            <div className="mt-4 flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30" role="alert">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
              <p className="text-xs text-amber-300 leading-relaxed">
                Séries de tamanhos diferentes. Cálculo com os {result.n} pontos em comum.
              </p>
            </div>
          )}
        </div>
      </AnimatedSection>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground text-sm">
          <span className="w-4 h-4 rounded-full border-2 border-neon-blue border-t-transparent animate-spin" />
          Buscando dados reais do Yahoo Finance…
        </div>
      ) : result.n >= 4 ? (
        <>
          <AnimatedSection>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="glass-card rounded-xl p-5 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Correlação (r)</p>
                <p className={`text-3xl font-mono font-bold mt-2 ${corrColor}`}>{result.correlation.toFixed(3)}</p>
                <p className="text-xs text-muted-foreground mt-1">{corrLabel}</p>
              </div>
              <div className="glass-card rounded-xl p-5 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Covariância (amostral)</p>
                <p className="text-3xl font-mono font-bold text-foreground mt-2">{result.covariance.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">{result.n} meses de dados</p>
              </div>
              <div className="glass-card rounded-xl p-5 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Interpretação</p>
                <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                  {result.correlation > 0.5
                    ? "Movem-se juntos. Diversificação limitada entre eles."
                    : result.correlation < -0.5
                    ? "Movem-se em sentidos opostos. Boa diversificação."
                    : "Correlação fraca. Movem-se de forma relativamente independente."}
                </p>
              </div>
            </div>
          </AnimatedSection>

          <AnimatedSection>
            <div className="glass-card rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold text-foreground">Preço de Fechamento Mensal — últimos 12 meses</h3>
                <span className="text-[10px] text-muted-foreground/50">Fonte: Yahoo Finance</span>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={CHART_TICK_STYLE} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={CHART_TICK_STYLE} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={CHART_TICK_STYLE} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => v.toFixed(2)} />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey={asset1} stroke={CHART_COLORS.secondary} strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey={asset2} stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </AnimatedSection>
        </>
      ) : null}

      <AnimatedSection>
        <div className="glass-card rounded-xl p-8">
          <div className="flex items-start gap-4">
            <Info className="w-5 h-5 text-neon-blue shrink-0 mt-1" aria-hidden="true" />
            <div className="space-y-4">
              <h3 className="font-display font-semibold text-foreground">Fórmulas Utilizadas</h3>
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Correlação de Pearson (amostral)</p>
                <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20">
                  <p className="font-mono text-sm text-gold">corr(X,Y) = cov(X,Y) / (σX × σY)</p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Varia de -1 (negativa perfeita) a +1 (positiva perfeita). Dados: preços de fechamento mensais reais via Yahoo Finance.</p>
              </div>
              <div>
                <p className="text-sm font-medium text-foreground mb-1">Covariância Amostral</p>
                <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20">
                  <p className="font-mono text-sm text-gold">cov(X,Y) = Σ((Xi − μX)(Yi − μY)) / (n − 1)</p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Usa divisor (n − 1) — Correção de Bessel — correto para dados financeiros amostrais.</p>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}
