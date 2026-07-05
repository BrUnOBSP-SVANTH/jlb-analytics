/**
 * Nível 4 — Vieses e Psicologia (50 pontos)
 * Prospect Theory, Brier Score, Falácia do Jogador, Overconfidence, Perfil de Maturidade.
 *
 * Este é o módulo mais educacionalmente valioso — e o mais negligenciado.
 * Não existe modelo matemático que compense decisões tomadas sob viés emocional.
 */

import { useState, useEffect } from "react";
import { Brain, Target, Shuffle, TrendingUp, Lock, Info, AlertCircle, Star, ArrowRight } from "lucide-react";
import { useModelCall } from "@/hooks/useModels";
import { loadProgress, UNLOCK_THRESHOLDS, awardPoints } from "@/lib/userProgress";
import { Link } from "wouter";

interface ProspectResult { ev_objective: number; subjective_value: number; gap: number; loss_aversion_lambda: number; signal: string; bias_diagnosis: string; explanation: string; }
interface BrierResult { brier_score: number; skill_score: number; resolution: number; reliability: number; n: number; stable: boolean; signal: string; explanation: string; calibration_by_decile?: { confidence_range: string; avg_confidence: number; actual_accuracy: number; n: number; calibration_error: number }[]; }
interface GamblerResult { max_run: number; n_runs: number; expected_runs: number; fallacy_risk: string; signal: string; explanation: string; n: number; }
interface OverconfidenceResult { mean_confidence: number; accuracy: number; overconfidence_index: number; signal: string; explanation: string; }
interface MaturityResult { stage: number; label: string; score: number; max_score: number; priority_improvements: string[]; signal: string; explanation: string; }

function PointsGate({ level, required, current }: { level: number; required: number; current: number }) {
  const missing = required - current;
  const pct = Math.min(100, Math.round((current / required) * 100));
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center space-y-5 max-w-md">
        <div className="w-16 h-16 rounded-full bg-gold/10 border border-gold/20 flex items-center justify-center mx-auto">
          <Lock className="w-7 h-7 text-gold" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Nível {level} — Bloqueado</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Este nível é gratuito, mas exige <span className="font-bold text-foreground">{required} pontos</span> para desbloquear.
            Você tem <span className="font-bold text-gold">{current} pts</span>. Faltam <span className="font-bold text-primary">{missing} pts</span>.
          </p>
        </div>
        <div className="w-full">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>{current} pts</span><span>{required} pts</span>
          </div>
          <div className="h-2 rounded-full bg-secondary/40 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-gold/60 to-primary transition-all duration-700"
              style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-1">
          <Link href="/perfil">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
              <Star className="w-4 h-4" /> Ver como ganhar pontos
            </span>
          </Link>
          <Link href="/calculadoras">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border/50 text-foreground text-sm hover:bg-secondary/30 transition-colors">
              Usar calculadoras <ArrowRight className="w-4 h-4" />
            </span>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          Ganhe pontos usando calculadoras (+2), fazendo previsões (+5) e explorando os outros níveis (+10 cada).
        </p>
      </div>
    </div>
  );
}

function ExplanationBox({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

// ─── Prospect Theory ─────────────────────────────────────────────────────────
function ProspectCalculator() {
  const [rows, setRows] = useState([
    { outcome: "200", probability: "0.40" },
    { outcome: "-100", probability: "0.60" },
  ]);
  const { data, loading, error, run } = useModelCall<ProspectResult>("/api/level4/prospect");

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm text-foreground">Prospect Theory — Como o cérebro avalia risco</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Kahneman & Tversky (1992): perdas psicologicamente pesam 2.25× mais que ganhos equivalentes.
        Isso explica por que apostadores aceitam EV negativo quando há chance de recuperar perdas.
      </p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <input type="number" value={row.outcome}
              onChange={(e) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, outcome: e.target.value } : r))}
              placeholder="Resultado R$"
              className="px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
            <input type="number" value={row.probability} step="0.01" min="0" max="1"
              onChange={(e) => setRows((p) => p.map((r, idx) => idx === i ? { ...r, probability: e.target.value } : r))}
              placeholder="Probabilidade"
              className="px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        ))}
        <button onClick={() => setRows((p) => [...p, { outcome: "0", probability: "0" }])} className="text-xs text-primary hover:underline">+ Linha</button>
      </div>
      <button onClick={() => run({ outcomes: rows.map((r) => parseFloat(r.outcome)), probabilities: rows.map((r) => parseFloat(r.probability)) })}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Calculando..." : "Analisar"}
      </button>
      {data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <div className="text-xs text-muted-foreground">EV objetivo</div>
              <div className={`text-lg font-bold ${data.ev_objective >= 0 ? "text-positive" : "text-negative"}`}>
                R$ {data.ev_objective >= 0 ? "+" : ""}{data.ev_objective.toFixed(2)}
              </div>
            </div>
            <div className="text-center p-3 rounded-lg bg-secondary/30">
              <div className="text-xs text-muted-foreground">Valor subjetivo</div>
              <div className={`text-lg font-bold ${data.subjective_value >= 0 ? "text-positive" : "text-negative"}`}>
                {data.subjective_value >= 0 ? "+" : ""}{data.subjective_value.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5">
            <p className="text-xs text-muted-foreground"><strong className="text-foreground">Diagnóstico: </strong>{data.bias_diagnosis}</p>
          </div>
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <div className="text-xs text-negative p-2">{error}</div>}
    </div>
  );
}

// ─── Brier Score ─────────────────────────────────────────────────────────────
function BrierCalculator() {
  const [forecastsText, setForecastsText] = useState("0.7, 0.8, 0.6, 0.9, 0.4, 0.75, 0.85, 0.5, 0.65, 0.9");
  const [outcomesText, setOutcomesText] = useState("1, 1, 0, 1, 0, 1, 0, 1, 1, 1");
  const { data, loading, error, run } = useModelCall<BrierResult>("/api/level4/brier");

  const parse = (s: string, isInt: boolean) =>
    s.split(",").map((v) => isInt ? parseInt(v.trim()) : parseFloat(v.trim())).filter((v) => !isNaN(v as number));

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm text-foreground">Brier Score + Skill Score</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        A única métrica honesta de calibração. Penaliza overconfidence (dizer "90%" e errar)
        mais do que dizer "60%". Skill Score compara com baseline de chutar 50% sempre.
      </p>
      <div className="space-y-3">
        {[
          { label: "Previsões declaradas (0–1)", val: forecastsText, set: setForecastsText, hint: "ex: 0.7, 0.8, 0.6" },
          { label: "Resultados reais (0 ou 1)", val: outcomesText, set: setOutcomesText, hint: "ex: 1, 1, 0" },
        ].map(({ label, val, set, hint }) => (
          <div key={label}>
            <label className="block text-xs text-muted-foreground mb-1">{label} <span className="text-muted-foreground/60">{hint}</span></label>
            <input type="text" value={val} onChange={(e) => set(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        ))}
      </div>
      <button onClick={() => run({ forecasts: parse(forecastsText, false), outcomes: parse(outcomesText, true) })}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Calculando..." : "Calcular calibração"}
      </button>
      {data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="p-3 rounded-lg bg-secondary/30">
              <div className="text-xs text-muted-foreground">Brier Score</div>
              <div className={`text-xl font-bold ${data.brier_score < 0.2 ? "text-positive" : data.brier_score < 0.3 ? "text-yellow-500" : "text-negative"}`}>
                {data.brier_score.toFixed(4)}
              </div>
              <div className="text-xs text-muted-foreground">(0 = perfeito, 1 = péssimo)</div>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <div className="text-xs text-muted-foreground">Skill Score</div>
              <div className={`text-xl font-bold ${data.skill_score > 0.15 ? "text-positive" : data.skill_score > 0 ? "text-yellow-500" : "text-negative"}`}>
                {data.skill_score >= 0 ? "+" : ""}{data.skill_score.toFixed(4)}
              </div>
              <div className="text-xs text-muted-foreground">{data.skill_score > 0 ? "melhor que baseline" : "pior que chutar 50%"}</div>
            </div>
          </div>
          {!data.stable && (
            <div className="flex items-start gap-2 p-2 rounded bg-yellow-500/10 border border-yellow-500/30">
              <AlertCircle className="w-3 h-3 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-600 dark:text-yellow-400">n={data.n} — resultado instável (mínimo recomendado: 30)</p>
            </div>
          )}
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <div className="text-xs text-negative p-2">{error}</div>}
    </div>
  );
}

// ─── Falácia do Jogador ───────────────────────────────────────────────────────
function GamblerCalculator() {
  const [seqText, setSeqText] = useState("1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 0, 1");
  const { data, loading, error, run } = useModelCall<GamblerResult>("/api/level4/gambler");

  const riskColor = { baixo: "text-positive", moderado: "text-yellow-500", alto: "text-negative" };

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Shuffle className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm text-foreground">Falácia do Jogador</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        "Após 5 vermelhos seguidos na roleta, preto é mais provável." FALSO.
        Detecta padrões em sequências que criam a ilusão de dependência onde existe independência.
      </p>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Sequência de resultados (0=perda, 1=ganho)</label>
        <input type="text" value={seqText} onChange={(e) => setSeqText(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
      </div>
      <button onClick={() => run({ sequence: seqText.split(",").map((v) => parseInt(v.trim())).filter((v) => v === 0 || v === 1) })}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Analisando..." : "Analisar sequência"}
      </button>
      {data && (
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-xs text-muted-foreground">Risco de falácia</span>
            <span className={`text-sm font-bold ${riskColor[data.fallacy_risk as keyof typeof riskColor] ?? "text-foreground"}`}>
              {data.fallacy_risk.toUpperCase()}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div><div className="text-muted-foreground">Maior run</div><div className="font-bold text-foreground">{data.max_run}</div></div>
            <div><div className="text-muted-foreground">Runs reais</div><div className="font-bold text-foreground">{data.n_runs}</div></div>
            <div><div className="text-muted-foreground">Runs esperados</div><div className="font-bold text-foreground">{data.expected_runs.toFixed(1)}</div></div>
          </div>
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <div className="text-xs text-negative p-2">{error}</div>}
    </div>
  );
}

// ─── Perfil de Maturidade ─────────────────────────────────────────────────────
function MaturityCalculator() {
  const [bss, setBss] = useState("0.1");
  const [oi, setOi] = useState("0.12");
  const [gfr, setGfr] = useState("moderado");
  const [ns, setNs] = useState("20");
  const [lar, setLar] = useState("2.5");
  const { data, loading, error, run } = useModelCall<MaturityResult>("/api/level4/maturity");

  const stageColors = ["text-negative", "text-negative", "text-yellow-500", "text-primary", "text-positive"];

  return (
    <div className="glass-card rounded-xl p-6 space-y-4 lg:col-span-2">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm text-foreground">Perfil de Maturidade Analítica</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Combina suas métricas comportamentais para classificar seu estágio analítico
        e indicar o foco de melhoria mais urgente. Dado de impacto para investidores do produto.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Brier Skill Score</label>
          <input type="number" value={bss} onChange={(e) => setBss(e.target.value)} step="0.01" min="-1" max="1"
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Overconfidence index</label>
          <input type="number" value={oi} onChange={(e) => setOi(e.target.value)} step="0.01"
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Risco falácia jogador</label>
          <select value={gfr} onChange={(e) => setGfr(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
            <option value="baixo">Baixo</option><option value="moderado">Moderado</option><option value="alto">Alto</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Sessões de análise</label>
          <input type="number" value={ns} onChange={(e) => setNs(e.target.value)} min="0"
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Loss aversion ratio (λ)</label>
          <input type="number" value={lar} onChange={(e) => setLar(e.target.value)} step="0.1" min="0.1"
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </div>
      <button onClick={() => run({ brier_skill_score: parseFloat(bss), overconfidence_idx: parseFloat(oi), gambler_fallacy_risk: gfr, n_sessions: parseInt(ns), loss_aversion_ratio: parseFloat(lar) })}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Calculando..." : "Gerar perfil"}
      </button>
      {data && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className={`text-4xl font-bold ${stageColors[data.stage]}`}>{data.stage}/4</div>
              <div className="text-xs text-muted-foreground">Estágio</div>
            </div>
            <div className="flex-1">
              <div className="font-medium text-foreground text-sm">{data.label}</div>
              <div className="mt-2 w-full bg-border/30 rounded-full h-2">
                <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${(data.score / data.max_score) * 100}%` }} />
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{data.score}/{data.max_score} pontos</div>
            </div>
          </div>
          {data.priority_improvements.length > 0 && (
            <div>
              <div className="text-xs font-medium text-foreground mb-2">Foco de melhoria:</div>
              <ul className="space-y-1">
                {data.priority_improvements.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-negative mt-0.5">▶</span>{item}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <div className="text-xs text-negative p-2">{error}</div>}
    </div>
  );
}

export default function Nivel4() {
  const progress = loadProgress();
  const required = UNLOCK_THRESHOLDS[4];

  useEffect(() => {
    if (progress.totalPoints >= required) {
      awardPoints("level_visited", "Visitou o Nível 4 — Vieses e Psicologia", "level_visited_4");
    }
  }, []);

  if (progress.totalPoints < required) {
    return <PointsGate level={4} required={required} current={progress.totalPoints} />;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">Nível 4</span>
          <span className="px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 text-xs font-medium">Premium</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Vieses e Psicologia</h1>
        <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
          Dados corretos com decisões erradas produzem perdas. Este nível te ensina a identificar
          os padrões de comportamento que destroem retorno — mesmo quando você tem as informações certas.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ProspectCalculator />
        <BrierCalculator />
        <GamblerCalculator />
        <MaturityCalculator />
      </div>
    </div>
  );
}
