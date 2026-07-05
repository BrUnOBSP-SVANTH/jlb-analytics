/**
 * Nível 5 — Análise Integrada (Premium)
 * Divergência modelo vs. mercado + Ensemble multi-modelo.
 *
 * O coração do produto: nunca diz o que fazer.
 * Mostra onde o modelo diverge do mercado, por que, e o que isso significa.
 */

import { useState, useEffect } from "react";
import { GitMerge, Layers, Lock, Info, AlertTriangle, Star, ArrowRight } from "lucide-react";
import { useModelCall } from "@/hooks/useModels";
import { loadProgress, UNLOCK_THRESHOLDS, awardPoints } from "@/lib/userProgress";
import { Link } from "wouter";
import { useSEO } from "@/hooks/useSEO";

interface DivergenceResult {
  divergence_pct: number; signal: string; label: string;
  educational_note: string; model_probability?: number;
  market_probability?: number; tier?: string; action_note?: string;
  model_confidence?: number; behavioral_note?: string;
}
interface EnsembleResult {
  ensemble_probability: number; ensemble_std: number; method: string;
  weights: Record<string, number>; excluded_models: string[];
  n_models_used: number; signal: string; explanation: string;
  warning?: string;
}

function PointsGate({ level, required, current }: { level: number; required: number; current: number }) {
  const missing = required - current;
  const pct = Math.min(100, Math.round((current / required) * 100));
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center space-y-5 max-w-md">
        <div className="w-16 h-16 rounded-full bg-neon-blue/10 border border-neon-blue/20 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7 text-neon-blue" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Nível {level} — Bloqueado</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Exige <span className="font-bold text-foreground">{required} pontos</span>.
            Você tem <span className="font-bold text-gold">{current} pts</span>. Faltam{" "}
            <span className="font-bold text-primary">{missing} pts</span>.
          </p>
        </div>
        <div className="w-full">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>{current} pts</span><span>{required} pts</span>
          </div>
          <div className="h-2 rounded-full bg-secondary/40 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-neon-blue/60 to-primary transition-all duration-700"
              style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
          <Link href="/perfil">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              <Star className="w-4 h-4" /> Ver como ganhar pontos
            </span>
          </Link>
          <Link href="/apostas">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border/50 text-foreground text-sm hover:bg-secondary/30 transition-colors">
              Apostas em Hype <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function EducationalNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 p-4 rounded-xl bg-primary/5 border border-primary/20">
      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

// ─── Calculadora de Divergência ───────────────────────────────────────────────
function DivergenceCalculator() {
  const [modelP, setModelP] = useState("0.62");
  const [marketP, setMarketP] = useState("0.45");
  const [confidence, setConfidence] = useState("0.7");
  const [context, setContext] = useState("esportes");
  const { data, loading, error, run } = useModelCall<DivergenceResult>("/api/level5/divergence");

  const tierColors: Record<string, string> = {
    negligible: "text-muted-foreground",
    moderate: "text-yellow-500",
    strong: "text-primary",
    extreme_low: "text-negative",
    extreme: "text-negative",
  };

  const divAbs = data ? Math.abs(data.divergence_pct) : 0;

  return (
    <div className="glass-card rounded-xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <GitMerge className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Divergência Modelo vs. Mercado</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        O sistema compara a probabilidade calculada pelos modelos com a probabilidade
        precificada pelo mercado preditivo e explica o desvio. Nunca recomenda posição.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Probabilidade do modelo (0–1)</label>
          <input type="range" min="0.01" max="0.99" step="0.01" value={modelP}
            onChange={(e) => setModelP(e.target.value)} className="w-full accent-primary" />
          <div className="flex justify-between text-xs mt-0.5">
            <span className="text-muted-foreground">0%</span>
            <span className="font-medium text-foreground">{(parseFloat(modelP) * 100).toFixed(0)}%</span>
            <span className="text-muted-foreground">100%</span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Probabilidade do mercado (0–1)</label>
          <input type="range" min="0.01" max="0.99" step="0.01" value={marketP}
            onChange={(e) => setMarketP(e.target.value)} className="w-full accent-primary" />
          <div className="flex justify-between text-xs mt-0.5">
            <span className="text-muted-foreground">0%</span>
            <span className="font-medium text-foreground">{(parseFloat(marketP) * 100).toFixed(0)}%</span>
            <span className="text-muted-foreground">100%</span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Confiança no modelo (Skill Score calibrado)</label>
          <input type="range" min="0" max="1" step="0.05" value={confidence}
            onChange={(e) => setConfidence(e.target.value)} className="w-full accent-primary" />
          <div className="flex justify-between text-xs mt-0.5">
            <span className="text-muted-foreground">0%</span>
            <span className="font-medium text-foreground">{(parseFloat(confidence) * 100).toFixed(0)}%</span>
            <span className="text-muted-foreground">100%</span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Segmento</label>
          <select value={context} onChange={(e) => setContext(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
            {["economia", "esportes", "eleições", "clima", "tecnologia", "empresas", "cripto"].map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      <button onClick={() => run({ model_probability: parseFloat(modelP), market_probability: parseFloat(marketP), model_confidence: parseFloat(confidence), context })}
        disabled={loading}
        className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Analisando divergência..." : "Calcular divergência"}
      </button>

      {data && (
        <div className="space-y-4">
          {/* Visualização da divergência */}
          <div className="p-4 rounded-xl bg-secondary/30 space-y-3">
            <div className="flex justify-between items-end">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{(parseFloat(modelP) * 100).toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">Modelo</div>
              </div>
              <div className="text-center flex-1">
                <div className={`text-3xl font-bold ${data.divergence_pct > 0 ? "text-positive" : "text-negative"}`}>
                  {data.divergence_pct > 0 ? "+" : ""}{data.divergence_pct.toFixed(1)} pp
                </div>
                <div className={`text-xs ${tierColors[data.tier ?? ""] ?? "text-muted-foreground"}`}>
                  {data.label}
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-foreground">{(parseFloat(marketP) * 100).toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">Mercado</div>
              </div>
            </div>

            {/* Barra visual */}
            <div className="relative h-3 rounded-full bg-border/20 overflow-hidden">
              <div className="absolute inset-y-0 bg-border/40" style={{ left: "50%", width: "1px" }} />
              <div
                className={`absolute inset-y-0 rounded-full ${data.divergence_pct > 0 ? "bg-positive/60" : "bg-negative/60"}`}
                style={{
                  left: data.divergence_pct > 0 ? "50%" : `${50 + data.divergence_pct / 2}%`,
                  width: `${Math.min(50, divAbs / 2)}%`,
                }}
              />
            </div>
          </div>

          {data.action_note && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/30 border border-border/30">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{data.action_note}</p>
            </div>
          )}

          {data.behavioral_note && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
              <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{data.behavioral_note}</p>
            </div>
          )}

          <EducationalNote text={data.educational_note} />
        </div>
      )}
      {error && <div className="text-xs text-negative p-2">{error}</div>}
    </div>
  );
}

// ─── Ensemble Multi-Modelo ────────────────────────────────────────────────────
function EnsembleCalculator() {
  const [modelsText, setModelsText] = useState(
    JSON.stringify({ arima: 0.62, poisson: 0.58, elo: 0.70 }, null, 2)
  );
  const [skillsText, setSkillsText] = useState(
    JSON.stringify({ arima: 0.18, poisson: 0.25, elo: 0.10 }, null, 2)
  );
  const { data, loading, error, run } = useModelCall<EnsembleResult>("/api/level5/ensemble");

  const parseJSON = (s: string) => {
    try { return JSON.parse(s) as Record<string, number>; } catch { return null; }
  };

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Ensemble Multi-Modelo</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Combina múltiplos modelos ponderados pelo Skill Score histórico.
        Modelos com SS ≤ 0 são excluídos — pior que chutar não agrega informação.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Probabilidades dos modelos (JSON)</label>
          <textarea value={modelsText} onChange={(e) => setModelsText(e.target.value)} rows={5}
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Skill Scores históricos (JSON)</label>
          <textarea value={skillsText} onChange={(e) => setSkillsText(e.target.value)} rows={5}
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
        </div>
      </div>

      <button
        onClick={() => {
          const mp = parseJSON(modelsText);
          const ms = parseJSON(skillsText);
          if (!mp || !ms) return;
          run({ model_probabilities: mp, model_skill_scores: ms });
        }}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Calculando ensemble..." : "Calcular ensemble"}
      </button>

      {data && (
        <div className="space-y-4">
          <div className="text-center p-4 rounded-xl bg-secondary/30">
            <div className="text-xs text-muted-foreground">P ensemble (ponderado por Skill Score)</div>
            <div className="text-4xl font-bold text-primary my-1">{(data.ensemble_probability * 100).toFixed(1)}%</div>
            <div className="text-xs text-muted-foreground">± {(data.ensemble_std * 100).toFixed(1)}% dispersão entre modelos</div>
          </div>

          {data.warning && (
            <div className="p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/30">
              <p className="text-xs text-yellow-600 dark:text-yellow-400">{data.warning}</p>
            </div>
          )}

          <div>
            <div className="text-xs text-muted-foreground mb-2">Pesos por modelo ({data.n_models_used} usados)</div>
            <div className="space-y-1.5">
              {Object.entries(data.weights).map(([name, weight]) => (
                <div key={name} className="flex items-center gap-2">
                  <span className="text-xs text-foreground w-20">{name}</span>
                  <div className="flex-1 h-2 rounded-full bg-border/20 overflow-hidden">
                    <div className="h-2 rounded-full bg-primary/70" style={{ width: `${weight * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-10 text-right">{(weight * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>

          {data.excluded_models.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Modelos excluídos (SS ≤ 0): <span className="text-negative">{data.excluded_models.join(", ")}</span>
            </div>
          )}

          <EducationalNote text={data.explanation} />
        </div>
      )}
      {error && <div className="text-xs text-negative p-2">{error}</div>}
    </div>
  );
}

export default function Nivel5() {
  useSEO("Nível 5 — Análise Integrada", "Combine modelos, dados e julgamento calibrado numa análise completa de mercado.");
  const progress = loadProgress();
  const required = UNLOCK_THRESHOLDS[5];

  useEffect(() => {
    if (progress.totalPoints >= required) {
      awardPoints("level_visited", "Visitou o Nível 5 — Análise Integrada", "level_visited_5");
    }
  }, []);

  if (progress.totalPoints < required) {
    return <PointsGate level={5} required={required} current={progress.totalPoints} />;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">Nível 5</span>
          <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-xs font-medium">Premium</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Análise Integrada</h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
          O sistema nunca diz o que fazer. Mostra onde os modelos divergem do mercado,
          por que divergem, e o que essa divergência significa — para que você decida com informação real.
        </p>
      </div>

      {/* Aviso pedagógico principal */}
      <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Princípio central do Nível 5:</strong>{" "}
          divergência modelo-mercado não é sinal de compra ou venda. É um sinal de investigação.
          O mercado pode ter informação que o modelo não tem. O modelo pode ter capturado uma
          anomalia que o mercado ainda não precificou. Sua função é descobrir qual dos dois está certo —
          e com qual grau de confiança.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <DivergenceCalculator />
        </div>
        <div className="lg:col-span-2">
          <EnsembleCalculator />
        </div>
      </div>
    </div>
  );
}
