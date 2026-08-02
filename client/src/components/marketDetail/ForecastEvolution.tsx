/**
 * ForecastEvolution — evolucao do fair value da IA vs mercado no tempo.
 * Extraido de pages/MarketDetail.tsx.
 */
import { useState, useEffect } from "react";
import { TrendingUp } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, YAxis, Tooltip } from "recharts";
import { CHART_TICK_STYLE, CHART_TOOLTIP_STYLE } from "@/lib/data";
import AnimatedSection from "@/components/AnimatedSection";
import { Explain } from "@/components/marketDetail/Explain";

// ── Evolução da previsão da IA ────────────────────────────────────────────────
// Mostra como o fair value da IA evoluiu ao longo do tempo vs o mercado.

interface ForecastPoint { aiFairValue: number; marketProb: number; confidence: string; date: string }

export function ForecastEvolution({ marketId, source }: { marketId: string; source: string }) {
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
