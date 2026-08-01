/**
 * Gráficos de calibração do Dashboard — extraídos de pages/Dashboard.tsx.
 * CalibrationChart (dispersão: estimada vs real) e CalibrationTrend (Brier no tempo).
 * Comportamento idêntico.
 */
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
  Tooltip, ReferenceLine, LineChart, Line, CartesianGrid,
} from "recharts";
import { BarChart2, TrendingUp } from "lucide-react";
import { calibrationBuckets, type StoredPrediction, type CalibrationSnapshot } from "@/lib/predictions";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TICK_STYLE } from "@/lib/data";

export function CalibrationChart({ predictions }: { predictions: StoredPrediction[] }) {
  const buckets = calibrationBuckets(predictions);

  if (buckets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
        <BarChart2 className="w-8 h-8 text-muted-foreground/30" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          Resolva pelo menos 5 previsões para ver a curva de calibração.
        </p>
      </div>
    );
  }

  // Build scatter data: each resolved prediction as a dot
  const scatterData = predictions
    .filter((p) => p.resolved && p.outcome !== null)
    .map((p) => ({
      x: p.userProb,
      y: p.outcome ? 100 : 0,
    }));

  // Perfect calibration reference line points
  const perfectLine = [{ x: 0, y: 0 }, { x: 100, y: 100 }];

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-6 h-0.5 bg-gold/60 inline-block" />
          Calibração perfeita
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-neon-blue inline-block" />
          Suas previsões
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart>
          <XAxis
            type="number" dataKey="x" domain={[0, 100]}
            tickFormatter={(v) => `${v}%`} tick={CHART_TICK_STYLE}
            axisLine={false} tickLine={false}
            label={{ value: "Prob. estimada", position: "insideBottom", offset: -2, fill: CHART_COLORS.muted, fontSize: 11 }}
          />
          <YAxis
            type="number" dataKey="y" domain={[-10, 110]}
            tickFormatter={(v) => `${v}%`} tick={CHART_TICK_STYLE}
            axisLine={false} tickLine={false}
            label={{ value: "Resultado real", angle: -90, position: "insideLeft", fill: CHART_COLORS.muted, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [`${v}%`, name === "x" ? "Estimada" : "Real"]}
          />
          {/* Perfect calibration diagonal */}
          <ReferenceLine
            segment={perfectLine as [{ x: number; y: number }, { x: number; y: number }]}
            stroke={CHART_COLORS.primary}
            strokeDasharray="4 4"
            strokeOpacity={0.6}
          />
          <Scatter data={scatterData} fill={CHART_COLORS.quaternary} opacity={0.8} r={4} />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted-foreground mt-2 text-center">
        Pontos próximos à linha dourada = boa calibração.
        Acima = subestimou. Abaixo = superestimou.
      </p>
    </div>
  );
}

export function CalibrationTrend({ history }: { history: CalibrationSnapshot[] }) {
  if (history.length < 2) return null;

  const data = history.map((s) => ({
    date: s.date.slice(5), // MM-DD
    brier: s.meanBrier !== null ? parseFloat(s.meanBrier.toFixed(3)) : null,
    skill: s.skillScore !== null ? parseFloat((s.skillScore * 100).toFixed(1)) : null,
    resolved: s.resolvedCount,
  }));

  const latest = history[history.length - 1];
  const first = history[0];
  const brierDelta = latest.meanBrier !== null && first.meanBrier !== null
    ? (latest.meanBrier - first.meanBrier)
    : null;
  const improving = brierDelta !== null && brierDelta < 0;

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-neon-blue" />
          Evolução da Calibração
        </h3>
        {brierDelta !== null && (
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
            improving ? "text-positive bg-positive/10" : "text-negative bg-negative/10"
          }`}>
            {improving ? "▼" : "▲"} {Math.abs(brierDelta).toFixed(3)} Brier
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-neon-blue inline-block rounded" />
          Brier Score (menor = melhor)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-gold inline-block rounded" style={{ borderStyle: "dashed" }} />
          Baseline (0.25)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date" tick={CHART_TICK_STYLE}
            axisLine={false} tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 0.4]} tick={CHART_TICK_STYLE}
            axisLine={false} tickLine={false}
            tickFormatter={(v) => v.toFixed(2)}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [
              name === "brier" ? v.toFixed(3) : `${v}%`,
              name === "brier" ? "Brier Score" : "Skill Score",
            ]}
          />
          <ReferenceLine y={0.25} stroke={CHART_COLORS.primary} strokeDasharray="4 4" strokeOpacity={0.5} />
          <Line
            type="monotone" dataKey="brier"
            stroke={CHART_COLORS.quaternary} strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS.quaternary }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-muted-foreground/60 text-center">
        Snapshot salvo automaticamente cada vez que você resolve uma previsão.
        {improving ? " Você está melhorando a calibração." : " Continue resolvendo para ver a tendência."}
      </p>
    </div>
  );
}
