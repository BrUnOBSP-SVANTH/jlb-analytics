/**
 * Nível 2 — Leitura de Dados
 * Z-score, Intervalo de Confiança, Correlação de Pearson.
 *
 * Objetivo: o usuário aprende a diferenciar correlação de causalidade,
 * a nunca apresentar uma estimativa sem intervalo de confiança,
 * e a identificar anomalias estatísticas em séries históricas.
 */

import { useState, useEffect } from "react";
import { BarChart3, Activity, GitBranch, Info, AlertCircle } from "lucide-react";
import { useModelCall } from "@/hooks/useModels";
import { awardPoints } from "@/lib/userProgress";
import { useSEO } from "@/hooks/useSEO";
import LevelNav from "@/components/LevelNav";

interface ZResult { z: number; p_two_tail: number; signal: string; explanation: string; }
interface CIResult { lower: number; upper: number; margin: number; se: number; dist_used: string; level_pct: number; signal: string; explanation: string; }
interface CorrResult { r: number; r_squared: number; t_stat: number; p_value: number; n: number; signal: string; explanation: string; }

function ExplanationBox({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-negative/10 border border-negative/30">
      <AlertCircle className="w-4 h-4 text-negative shrink-0 mt-0.5" />
      <p className="text-xs text-negative leading-relaxed">{text}</p>
    </div>
  );
}

// ─── Z-score ─────────────────────────────────────────────────────────────────
function ZScoreCalculator() {
  const [value, setValue] = useState("75");
  const [mean, setMean] = useState("60");
  const [std, setStd] = useState("12");
  const { data, loading, error, run } = useModelCall<ZResult>("/api/level2/zscore");

  const zColor = data
    ? Math.abs(data.z) > 3 ? "text-negative" : Math.abs(data.z) > 2 ? "text-yellow-500" : "text-positive"
    : "text-foreground";

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">Z-score — Detecção de Anomalias</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Quantos desvios padrões um valor está da média? Z {">"} 2 indica anomalia.
        Usado para detectar se uma probabilidade de mercado está fora do padrão histórico.
      </p>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Valor observado", val: value, set: setValue },
          { label: "Média histórica (μ)", val: mean, set: setMean },
          { label: "Desvio padrão (σ)", val: std, set: setStd },
        ].map(({ label, val, set }) => (
          <div key={label}>
            <label className="block text-xs text-muted-foreground mb-1">{label}</label>
            <input type="number" value={val} onChange={(e) => set(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        ))}
      </div>

      <button onClick={() => run({ value: parseFloat(value), mean: parseFloat(mean), std: parseFloat(std) })}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Calculando..." : "Calcular Z-score"}
      </button>

      {data && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">Z-score</span>
            <span className={`text-2xl font-bold ${zColor}`}>{data.z.toFixed(3)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>p-valor (bicaudal)</span>
            <span className="text-foreground font-medium">{(data.p_two_tail * 100).toFixed(2)}%</span>
          </div>
          {/* Escala visual */}
          <div className="relative h-2 rounded-full bg-gradient-to-r from-positive via-yellow-500 to-negative overflow-hidden">
            <div
              className="absolute top-0 w-2 h-2 rounded-full bg-white border-2 border-foreground"
              style={{ left: `${Math.min(100, Math.max(0, (Math.abs(data.z) / 4) * 100))}%`, transform: "translateX(-50%)" }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0σ (normal)</span><span>2σ</span><span>4σ (extremo)</span>
          </div>
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <ErrorBox text={error} />}
    </div>
  );
}

// ─── Intervalo de Confiança ───────────────────────────────────────────────────
function CICalculator() {
  const [mean, setMean] = useState("0.65");
  const [std, setStd] = useState("0.12");
  const [n, setN] = useState("50");
  const [level, setLevel] = useState("0.95");
  const { data, loading, error, run } = useModelCall<CIResult>("/api/level2/confidence-interval");

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">Intervalo de Confiança</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Nunca apresente uma estimativa sem incerteza. Um IC de 95% não significa "95% de chance
        de o valor estar aqui" — significa que este método captura o parâmetro real 95% das vezes.
        Essa distinção é fundamental e sistematicamente ignorada.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Média estimada (x̄)", val: mean, set: setMean, step: "0.01" },
          { label: "Desvio padrão (σ)", val: std, set: setStd, step: "0.01" },
          { label: "Tamanho da amostra (n)", val: n, set: setN, step: "1" },
        ].map(({ label, val, set, step }) => (
          <div key={label}>
            <label className="block text-xs text-muted-foreground mb-1">{label}</label>
            <input type="number" value={val} onChange={(e) => set(e.target.value)} step={step}
              className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        ))}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Nível de confiança</label>
          <select value={level} onChange={(e) => setLevel(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="0.90">90%</option>
            <option value="0.95">95%</option>
            <option value="0.99">99%</option>
          </select>
        </div>
      </div>

      <button onClick={() => run({ mean: parseFloat(mean), std: parseFloat(std), n: parseInt(n), level: parseFloat(level) })}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Calculando..." : "Calcular IC"}
      </button>

      {data && (
        <div className="space-y-3">
          <div className="text-center">
            <div className="text-xs text-muted-foreground mb-1">IC {data.level_pct.toFixed(0)}% ({data.dist_used})</div>
            <div className="text-xl font-bold text-foreground">
              [{data.lower.toFixed(4)}, {data.upper.toFixed(4)}]
            </div>
            <div className="text-xs text-muted-foreground">margem ± {data.margin.toFixed(4)} | EP = {data.se.toFixed(4)}</div>
          </div>
          {/* Linha visual do IC — posições e rótulos derivados dos valores REAIS.
              Antes as marcas eram fixas (15/50/85%), fingindo representar o cálculo. */}
          {(() => {
            const mid = (data.lower + data.upper) / 2;
            const half = Math.abs(data.upper - data.lower) / 2 || 1;
            // eixo centrado na estimativa, com folga para os limites não colarem na borda
            const pos = (x: number) => Math.max(6, Math.min(94, 50 + ((x - mid) / (half * 1.6)) * 50));
            const lo = pos(data.lower);
            const hi = pos(data.upper);
            return (
              <div className="space-y-1">
                <div className="relative h-8 flex items-center">
                  <div className="absolute inset-x-0 h-0.5 bg-border/30" />
                  <div className="absolute h-0.5 bg-primary/40" style={{ left: `${lo}%`, right: `${100 - hi}%` }} />
                  <div className="absolute h-4 w-0.5 bg-primary/60" style={{ left: `${lo}%` }} />
                  <div className="absolute h-4 w-0.5 bg-foreground" style={{ left: "50%" }} />
                  <div className="absolute h-4 w-0.5 bg-primary/60" style={{ left: `${hi}%` }} />
                </div>
                <div className="relative h-4 text-[10px] font-mono text-muted-foreground">
                  <span className="absolute -translate-x-1/2" style={{ left: `${lo}%` }}>{data.lower.toFixed(2)}</span>
                  <span className="absolute -translate-x-1/2 text-foreground" style={{ left: "50%" }}>{mid.toFixed(2)}</span>
                  <span className="absolute -translate-x-1/2" style={{ left: `${hi}%` }}>{data.upper.toFixed(2)}</span>
                </div>
              </div>
            );
          })()}
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <ErrorBox text={error} />}
    </div>
  );
}

// ─── Correlação ───────────────────────────────────────────────────────────────
function CorrelationCalculator() {
  const [xText, setXText] = useState("1.2, 2.3, 3.1, 4.0, 5.2, 6.1, 7.3, 8.0");
  const [yText, setYText] = useState("2.1, 4.5, 5.8, 7.2, 9.1, 10.8, 13.1, 14.5");
  const { data, loading, error, run } = useModelCall<CorrResult>("/api/level2/correlation");

  const parseList = (s: string) => s.split(",").map((v) => parseFloat(v.trim())).filter((v) => !isNaN(v));

  const rColor = data
    ? Math.abs(data.r) >= 0.7 ? (data.r > 0 ? "text-positive" : "text-negative")
    : Math.abs(data.r) >= 0.4 ? "text-yellow-500" : "text-muted-foreground"
    : "text-foreground";

  return (
    <div className="glass-card rounded-xl p-6 space-y-4 lg:col-span-2">
      <div className="flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-foreground text-sm">Correlação de Pearson — r ∈ [-1, 1]</h3>
      </div>

      <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">Aviso crítico:</strong> correlação mede associação LINEAR.
          Séries temporais não-estacionárias produzem correlações espúrias altíssimas sem nenhuma relação causal real
          (ex: vendas de sorvete e afogamentos têm r ≈ 0.9 por conta do calor).
          Sempre teste estacionariedade antes de interpretar.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Série X (separada por vírgulas)</label>
          <textarea value={xText} onChange={(e) => setXText(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Série Y (separada por vírgulas)</label>
          <textarea value={yText} onChange={(e) => setYText(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
        </div>
      </div>

      <button onClick={() => run({ x: parseList(xText), y: parseList(yText) })} disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Calculando..." : "Calcular correlação"}
      </button>

      {data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">r (Pearson)</div>
            <div className={`text-2xl font-bold ${rColor}`}>{data.r.toFixed(4)}</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">R² (variância explicada)</div>
            <div className="text-2xl font-bold text-foreground">{(data.r_squared * 100).toFixed(1)}%</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">p-valor</div>
            <div className={`text-2xl font-bold ${data.p_value < 0.05 ? "text-positive" : "text-negative"}`}>
              {data.p_value.toFixed(4)}
            </div>
            <div className="text-xs text-muted-foreground">{data.p_value < 0.05 ? "significante" : "não significante"}</div>
          </div>
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <ErrorBox text={error} />}
    </div>
  );
}

export default function Nivel2() {
  useSEO("Nível 2 — Leitura de Dados", "Aprenda a ler volume, liquidez e movimento de preços em mercados preditivos.");
  useEffect(() => {
    awardPoints("level_visited", "Visitou o Nível 2 — Leitura de Dados", "level_visited_2");
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">Nível 2</span>
          <span className="text-xs text-muted-foreground">Grátis</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Leitura de Dados</h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
          Dados sem contexto estatístico são ruído com aparência de sinal.
          Este nível te ensina a ler o que os números realmente dizem — e o que não dizem.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ZScoreCalculator />
        <CICalculator />
        <CorrelationCalculator />
      </div>

      <LevelNav current={2} />
    </div>
  );
}
