/**
 * Calculadoras — JLB Analytics
 * Ferramentas quantitativas para mercados preditivos com guia educacional completo.
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { type LucideIcon } from "lucide-react";
import { awardPoints } from "@/lib/userProgress";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import LaboratorioTabs from "@/components/LaboratorioTabs";
import {
  Calculator, Percent, Target, TrendingUp,
  BookOpen, CheckCircle, AlertCircle, Info, ChevronDown, ChevronUp,
  GitCompare, AlertTriangle,
} from "lucide-react";
import {
  IMAGES,
  stocks,
  calculateCorrelation,
  CHART_COLORS,
  CHART_TOOLTIP_STYLE,
  CHART_TICK_STYLE,
} from "@/lib/data";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

type CalcTab = "ev" | "overround" | "brier" | "kelly" | "correlacao" | "guia";

const inputClass =
  "w-full mt-1.5 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "text-xs text-muted-foreground uppercase tracking-wider";

// ─── Educational intro ──────────────────────────────────────────────────────

function ToolIntro({ icon: Icon, tagline, description, example, accuracy }: {
  icon: LucideIcon;
  tagline: string;
  description: string;
  example: string;
  accuracy?: { label: string; value: string; color: string };
}) {
  return (
    <AnimatedSection>
      <div className="mb-6 flex gap-4 p-5 rounded-xl border border-primary/20 bg-primary/5">
        <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-1 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{tagline}</p>
            {accuracy && (
              <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${accuracy.color}`}>
                {accuracy.label}: {accuracy.value}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          <p className="text-xs text-primary/80 font-medium mt-2">Exemplo: {example}</p>
        </div>
      </div>
    </AnimatedSection>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────────────

function CalcCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <AnimatedSection>
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Icon className="w-5 h-5 text-neon-blue" aria-hidden="true" />
          <h3 className="font-display font-semibold text-foreground">{title}</h3>
        </div>
        {children}
      </div>
    </AnimatedSection>
  );
}

function ResultBox({ label, value, color = "text-foreground", sub }: {
  label: string; value: string; color?: string; sub?: string;
}) {
  return (
    <div className="p-4 rounded-lg bg-obsidian/50 border border-border/20">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-mono font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>}
    </div>
  );
}

function FormulaBox({ formula, legend }: { formula: string; legend?: string }) {
  return (
    <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Fórmula</p>
      <p className="font-mono text-sm text-gold">{formula}</p>
      {legend && <p className="text-xs text-muted-foreground mt-1">{legend}</p>}
    </div>
  );
}

function InsightBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
      <div className="flex gap-2">
        <Info className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}

// ─── 1. Valor Esperado ──────────────────────────────────────────────────────

interface Outcome { prob: number; payout: number }

function ValorEsperado() {
  const [stake, setStake] = useState(100);
  const [outcomes, setOutcomes] = useState<Outcome[]>([
    { prob: 55, payout: 1.8 },
    { prob: 45, payout: 0 },
  ]);

  const update = (i: number, field: keyof Outcome, raw: string) => {
    const v = parseFloat(raw);
    if (isNaN(v)) return;
    setOutcomes((prev) => prev.map((o, idx) => idx === i ? { ...o, [field]: v } : o));
  };

  const addOutcome = () => setOutcomes((prev) => [...prev, { prob: 0, payout: 0 }]);
  const removeOutcome = (i: number) => setOutcomes((prev) => prev.filter((_, idx) => idx !== i));

  const totalProb = outcomes.reduce((s, o) => s + o.prob, 0);

  const ev = useMemo(
    () => outcomes.reduce((s, o) => s + (o.prob / 100) * (o.payout - 1), 0),
    [outcomes],
  );

  const evReais = ev * stake;
  const roi = ev * 100;
  const isPositive = ev > 0;
  const probWarning = Math.abs(totalProb - 100) > 0.5;

  return (
    <CalcCard title="Calculadora de Valor Esperado" icon={Calculator}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="ev-stake">Valor da Posição (R$)</label>
            <input id="ev-stake" type="number" min={0} step={10} value={stake}
              onChange={(e) => setStake(Math.max(0, parseFloat(e.target.value) || 0))}
              className={inputClass} />
          </div>

          <div className="space-y-2">
            <p className={labelClass}>Cenários</p>
            {outcomes.map((o, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground/60" htmlFor={`ev-prob-${i}`}>
                    Probabilidade (%)
                  </label>
                  <input id={`ev-prob-${i}`} type="number" min={0} max={100} step={0.5} value={o.prob}
                    onChange={(e) => update(i, "prob", e.target.value)} className={inputClass} />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground/60" htmlFor={`ev-pay-${i}`}>
                    Odd (retorno total)
                  </label>
                  <input id={`ev-pay-${i}`} type="number" min={0} step={0.01} value={o.payout}
                    onChange={(e) => update(i, "payout", e.target.value)} className={inputClass} />
                </div>
                {outcomes.length > 2 && (
                  <button onClick={() => removeOutcome(i)}
                    className="mb-0.5 px-2 py-2.5 rounded-lg bg-negative/10 text-negative text-xs hover:bg-negative/20">×</button>
                )}
              </div>
            ))}
            <button onClick={addOutcome} className="text-xs text-primary hover:text-primary/80 transition-colors py-1">
              + Adicionar cenário
            </button>
          </div>

          {probWarning && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-xs text-yellow-500">Soma das probabilidades: {totalProb.toFixed(1)}% (deveria ser 100%)</p>
            </div>
          )}

          <FormulaBox formula="E[X] = Σ pᵢ × (oddᵢ − 1)" legend="oddᵢ = retorno total (ex: 1.8 = lucro de 80%)" />
        </div>

        <div className="space-y-4">
          <ResultBox label="Valor Esperado por posição"
            value={`${isPositive ? "+" : ""}R$ ${evReais.toFixed(2)}`}
            color={isPositive ? "text-positive" : "text-negative"}
            sub={`por R$ ${stake} apostado`} />
          <ResultBox label="ROI esperado"
            value={`${isPositive ? "+" : ""}${roi.toFixed(2)}%`}
            color={isPositive ? "text-positive" : "text-negative"} />
          <ResultBox label="EV por R$ 1,00 apostado"
            value={`${isPositive ? "+" : ""}R$ ${ev.toFixed(4)}`}
            color={isPositive ? "text-positive" : "text-negative"} />

          <div className={`p-4 rounded-xl border ${isPositive ? "bg-positive/10 border-positive/30" : "bg-negative/10 border-negative/30"}`}>
            <p className={`text-sm font-semibold ${isPositive ? "text-positive" : "text-negative"}`}>
              {isPositive ? "EV+ — matematicamente favorável" : "EV− — matematicamente perdedor"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isPositive
                ? "No longo prazo, esta posição tende a lucrar. Mas variância de curto prazo é inevitável."
                : "No longo prazo, toda posição EV− resulta em perda. A frequência de acerto não muda isso."}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Probabilidade implícita da odd</p>
            {outcomes.map((o, i) => (
              <div key={i} className="flex justify-between text-xs mt-1">
                <span className="text-muted-foreground">Cenário {i + 1} (odd {o.payout.toFixed(2)})</span>
                <span className="font-mono text-foreground">{o.payout > 0 ? (100 / o.payout).toFixed(1) : "—"}%</span>
              </div>
            ))}
          </div>

          <InsightBox>
            No Polymarket e Kalshi, a odd implícita já é a probabilidade do mercado. Compare com a sua estimativa — se você acha que a chance é maior, o EV é positivo.
          </InsightBox>
        </div>
      </div>
    </CalcCard>
  );
}

// ─── 2. Overround ───────────────────────────────────────────────────────────

function OverroundCalc() {
  const [odds, setOdds] = useState<string[]>(["1.90", "1.90"]);

  const updateOdd = (i: number, v: string) => setOdds((prev) => prev.map((o, idx) => idx === i ? v : o));
  const addOdd = () => setOdds((prev) => [...prev, "2.00"]);
  const removeOdd = (i: number) => setOdds((prev) => prev.filter((_, idx) => idx !== i));

  const parsed = odds.map((o) => parseFloat(o) || 0);
  const impliedProbs = parsed.map((o) => o > 0 ? 1 / o : 0);
  const totalImplied = impliedProbs.reduce((s, p) => s + p, 0);
  const overround = (totalImplied - 1) * 100;
  const margin = totalImplied > 0 ? ((totalImplied - 1) / totalImplied) * 100 : 0;
  const fairOdds = impliedProbs.map((p) => totalImplied > 0 && p > 0 ? 1 / (p / totalImplied) : 0);

  const marginLabel = overround < 2 ? { text: "Excelente (< 2%)", color: "text-positive" }
    : overround < 4 ? { text: "Bom (2–4%)", color: "text-neon-blue" }
    : overround < 6 ? { text: "Aceitável (4–6%)", color: "text-yellow-500" }
    : { text: "Alto (> 6%) — evite", color: "text-negative" };

  return (
    <CalcCard title="Overround / Margem da Casa" icon={Percent}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className={labelClass}>Odds decimais</p>
            {odds.map((o, i) => (
              <div key={i} className="flex gap-2">
                <div className="flex-1">
                  <label className="sr-only" htmlFor={`odd-${i}`}>Odd {i + 1}</label>
                  <input id={`odd-${i}`} type="number" min={1.01} step={0.01} value={o}
                    onChange={(e) => updateOdd(i, e.target.value)} placeholder={`Odd ${i + 1}`} className={inputClass} />
                </div>
                {odds.length > 2 && (
                  <button onClick={() => removeOdd(i)} className="px-2 rounded-lg bg-negative/10 text-negative text-xs hover:bg-negative/20">×</button>
                )}
              </div>
            ))}
            <button onClick={addOdd} className="text-xs text-primary hover:text-primary/80 transition-colors py-1">
              + Adicionar odd
            </button>
          </div>

          <FormulaBox formula="Overround = (Σ 1/oddᵢ − 1) × 100" legend="Margem = overround / Σ(1/oddᵢ)" />

          <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Probabilidades implícitas</p>
            {parsed.map((o, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-muted-foreground">Odd {o.toFixed(2)}</span>
                <span className="font-mono text-foreground">{o > 0 ? (impliedProbs[i] * 100).toFixed(1) : "—"}%</span>
              </div>
            ))}
            <div className="border-t border-border/20 mt-1 pt-1 flex justify-between text-xs">
              <span className="text-muted-foreground font-medium">Total</span>
              <span className={`font-mono font-bold ${totalImplied > 1.001 ? "text-negative" : "text-positive"}`}>
                {(totalImplied * 100).toFixed(2)}%
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <ResultBox label="Overround"
            value={`${overround.toFixed(2)}%`}
            color={overround > 5 ? "text-negative" : overround > 2 ? "text-yellow-500" : "text-positive"}
            sub="excesso acima de 100% na soma das probs implícitas" />
          <ResultBox label="Margem da casa"
            value={`${margin.toFixed(2)}%`}
            color={margin > 5 ? "text-negative" : margin > 2 ? "text-yellow-500" : "text-positive"}
            sub="do volume apostado que é lucro garantido da casa" />

          <div className={`p-3 rounded-xl border flex items-center gap-2 ${marginLabel.color.includes("positive") ? "bg-positive/10 border-positive/30" : marginLabel.color.includes("neon") ? "bg-neon-blue/10 border-neon-blue/30" : marginLabel.color.includes("yellow") ? "bg-yellow-500/10 border-yellow-500/30" : "bg-negative/10 border-negative/30"}`}>
            <span className={`text-sm font-semibold ${marginLabel.color}`}>{marginLabel.text}</span>
          </div>

          <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20 space-y-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Fair odds (sem margem)</p>
            {fairOdds.map((fo, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-muted-foreground">Odd {i + 1} (original: {parsed[i].toFixed(2)})</span>
                <span className="font-mono text-neon-blue">{fo > 0 ? fo.toFixed(3) : "—"}</span>
              </div>
            ))}
          </div>

          <InsightBox>
            Polymarket e Kalshi têm overround próximo de 0% — o preço é literalmente a probabilidade. Compare as fair odds das casas esportivas com as probabilidades do Polymarket para detectar ineficiências.
          </InsightBox>
        </div>
      </div>
    </CalcCard>
  );
}

// ─── 3. Brier Score ─────────────────────────────────────────────────────────

interface Prediction { prob: number; outcome: 0 | 1 }

function BrierScoreCalc() {
  const [preds, setPreds] = useState<Prediction[]>([
    { prob: 70, outcome: 1 },
    { prob: 30, outcome: 0 },
    { prob: 60, outcome: 1 },
    { prob: 80, outcome: 1 },
    { prob: 40, outcome: 0 },
  ]);

  const updatePred = (i: number, field: keyof Prediction, v: number | 0 | 1) => {
    setPreds((prev) => prev.map((p, idx) => idx === i ? { ...p, [field]: v } : p));
  };
  const addPred = () => setPreds((prev) => [...prev, { prob: 50, outcome: 1 }]);
  const removePred = (i: number) => setPreds((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  const brierScore = useMemo(() => {
    if (preds.length === 0) return 0;
    return preds.reduce((s, p) => s + Math.pow(p.prob / 100 - p.outcome, 2), 0) / preds.length;
  }, [preds]);

  const skillScore = 1 - brierScore / 0.25;
  const isSkilled = skillScore > 0;

  const classification = brierScore < 0.05 ? { label: "Excepcional", color: "text-neon-blue" }
    : brierScore < 0.10 ? { label: "Muito bom", color: "text-positive" }
    : brierScore < 0.15 ? { label: "Bom", color: "text-primary" }
    : brierScore < 0.20 ? { label: "Mediano", color: "text-yellow-500" }
    : brierScore < 0.25 ? { label: "Fraco", color: "text-orange-500" }
    : { label: "Pior que chutar 50%", color: "text-negative" };

  return (
    <CalcCard title="Calculadora de Brier Score" icon={Target}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground uppercase tracking-wider px-1">
              <span>Previsão (%)</span>
              <span>Resultado</span>
              <span>Erro²</span>
            </div>
            {preds.map((p, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 items-center">
                <input type="number" min={0} max={100} step={1} value={p.prob}
                  onChange={(e) => updatePred(i, "prob", Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))}
                  className={inputClass} aria-label={`Previsão ${i + 1}`} />
                <select value={p.outcome}
                  onChange={(e) => updatePred(i, "outcome", parseInt(e.target.value) as 0 | 1)}
                  className={inputClass} aria-label={`Resultado ${i + 1}`}>
                  <option value={1}>Aconteceu</option>
                  <option value={0}>Não aconteceu</option>
                </select>
                <div className="flex items-center gap-1">
                  <span className={`text-xs font-mono ${Math.pow(p.prob / 100 - p.outcome, 2) < 0.1 ? "text-positive" : "text-negative"}`}>
                    {Math.pow(p.prob / 100 - p.outcome, 2).toFixed(3)}
                  </span>
                  <button onClick={() => removePred(i)} className="text-muted-foreground hover:text-negative text-xs px-1">×</button>
                </div>
              </div>
            ))}
            <button onClick={addPred} className="text-xs text-primary hover:text-primary/80 transition-colors py-1">
              + Adicionar previsão
            </button>
          </div>
          <FormulaBox formula="BS = (1/n) × Σ (p̂ᵢ − oᵢ)²" legend="p̂ = prob. prevista · o = resultado (0 ou 1)" />
        </div>

        <div className="space-y-4">
          <ResultBox label="Brier Score"
            value={brierScore.toFixed(4)}
            color={brierScore < 0.20 ? "text-positive" : brierScore < 0.25 ? "text-yellow-500" : "text-negative"}
            sub="0 = perfeito · 0.25 = equivale a chutar 50% sempre" />
          <ResultBox label="Skill Score"
            value={`${(skillScore * 100).toFixed(1)}%`}
            color={isSkilled ? "text-positive" : "text-negative"}
            sub={isSkilled ? "melhor que a referência de 50% constante" : "pior que chutar 50% sempre"} />

          <div className={`p-4 rounded-xl border ${isSkilled ? "bg-positive/10 border-positive/30" : "bg-negative/10 border-negative/30"}`}>
            <p className={`text-sm font-semibold ${classification.color}`}>{classification.label}</p>
            <p className="text-xs text-muted-foreground mt-1">Com {preds.length} previsões · Skill Score = 1 − BS / 0,25</p>
          </div>

          <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Benchmarks reais</p>
            {[
              ["< 0.05", "Superforecasters (Good Judgment Project)"],
              ["< 0.10", "Forecasters experientes"],
              ["< 0.15", "Bom usuário de mercado preditivo"],
              ["= 0.25", "Chutar 50% sempre"],
              ["> 0.25", "Pior que aleatório"],
            ].map(([v, l]) => (
              <div key={v} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{l}</span>
                <span className="font-mono text-foreground">{v}</span>
              </div>
            ))}
          </div>

          <InsightBox>
            O Polymarket publica o histórico de probabilidades de cada mercado. Salve suas previsões antes do resultado e use o Brier Score para medir sua calibração ao longo do tempo.
          </InsightBox>
        </div>
      </div>
    </CalcCard>
  );
}

// ─── 4. Critério de Kelly ────────────────────────────────────────────────────

function KellyCalc() {
  const [prob, setProb] = useState(55);
  const [odd, setOdd] = useState(2.0);
  const [bankroll, setBankroll] = useState(1000);

  const b = odd - 1;
  const p = prob / 100;
  const q = 1 - p;
  const kelly = b > 0 ? (b * p - q) / b : 0;
  const halfKelly = kelly / 2;
  const quarterKelly = kelly / 4;
  const kellyStake = Math.max(0, kelly) * bankroll;
  const halfStake = Math.max(0, halfKelly) * bankroll;
  const isPositiveEV = b * p - q > 0;
  const impliedProb = odd > 0 ? 1 / odd : 0;
  const edge = p - impliedProb;

  return (
    <CalcCard title="Critério de Kelly" icon={TrendingUp}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className={labelClass} htmlFor="kelly-prob">Sua estimativa de probabilidade (%)</label>
            <input id="kelly-prob" type="number" min={1} max={99} step={0.5} value={prob}
              onChange={(e) => setProb(Math.min(99, Math.max(1, parseFloat(e.target.value) || 1)))}
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="kelly-odd">Odd decimal oferecida</label>
            <input id="kelly-odd" type="number" min={1.01} step={0.01} value={odd}
              onChange={(e) => setOdd(Math.max(1.01, parseFloat(e.target.value) || 1.01))}
              className={inputClass} />
          </div>
          <div>
            <label className={labelClass} htmlFor="kelly-bankroll">Bankroll total (R$)</label>
            <input id="kelly-bankroll" type="number" min={0} step={100} value={bankroll}
              onChange={(e) => setBankroll(Math.max(0, parseFloat(e.target.value) || 0))}
              className={inputClass} />
          </div>

          <FormulaBox formula="f* = (b×p − q) / b" legend="b = odd−1 · p = prob. própria · q = 1−p" />

          <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20 space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Decomposição</p>
            {[
              ["Prob. implícita da odd", `${(impliedProb * 100).toFixed(1)}%`, false],
              ["Sua estimativa", `${prob.toFixed(1)}%`, false],
              ["Edge (vantagem)", `${(edge * 100).toFixed(2)}%`, true],
              ["Retorno líquido (b)", `${(b * 100).toFixed(1)}%`, false],
            ].map(([l, v, colored]) => (
              <div key={l as string} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{l}</span>
                <span className={`font-mono ${colored ? (edge > 0 ? "text-positive" : "text-negative") : "text-foreground"}`}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {!isPositiveEV ? (
            <div className="p-4 rounded-xl bg-negative/10 border border-negative/30">
              <p className="text-sm font-semibold text-negative">EV negativo — Kelly = 0%</p>
              <p className="text-xs text-muted-foreground mt-1">
                Com esta probabilidade e odd, o Kelly recomenda não apostar.
                A odd implica {(impliedProb * 100).toFixed(1)}% mas você estima {prob}%.
              </p>
            </div>
          ) : (
            <>
              <ResultBox label="Kelly completo"
                value={`${(kelly * 100).toFixed(2)}%`}
                color="text-gold"
                sub={`R$ ${kellyStake.toFixed(2)} do bankroll`} />
              <ResultBox label="½ Kelly (recomendado)"
                value={`${(halfKelly * 100).toFixed(2)}%`}
                color="text-positive"
                sub={`R$ ${halfStake.toFixed(2)} — reduz variância sem sacrificar EV`} />
              <ResultBox label="¼ Kelly (conservador)"
                value={`${(quarterKelly * 100).toFixed(2)}%`}
                color="text-neon-blue"
                sub={`R$ ${(quarterKelly * bankroll).toFixed(2)} — para estimativas incertas`} />
            </>
          )}

          <InsightBox>
            <strong className="text-foreground">Regra prática:</strong> nunca aposte mais que o Kelly completo. Apostadores profissionais usam ½ Kelly como padrão. Se sua estimativa de probabilidade tem incerteza alta, use ¼ Kelly.
          </InsightBox>
        </div>
      </div>
    </CalcCard>
  );
}

// ─── 5. Guia de Modelos ──────────────────────────────────────────────────────

interface ModelGuide {
  id: string;
  icon: LucideIcon;
  name: string;
  tagline: string;
  whenToUse: string[];
  howItWorks: string;
  accuracy: string;
  accuracyColor: string;
  limitacao: string;
  polymarketUso: string;
  steps: string[];
  benchmarks: [string, string][];
}

const MODELS: ModelGuide[] = [
  {
    id: "ev",
    icon: Calculator,
    name: "Valor Esperado (EV)",
    tagline: "O motor de toda decisão racional em apostas",
    whenToUse: [
      "Antes de qualquer aposta — sem EV+ não há razão matemática para entrar",
      "Para comparar múltiplas apostas e escolher a melhor",
      "Para calcular retorno esperado de uma estratégia ao longo do tempo",
    ],
    howItWorks: "EV = Σ (probabilidade × retorno). Se a soma dos resultados esperados for positiva, a aposta tem vantagem matemática. A chave é que sua estimativa de probabilidade precisa ser mais precisa que a do mercado.",
    accuracy: "~100% (matemático)",
    accuracyColor: "text-positive border-positive/30 bg-positive/10",
    limitacao: "O resultado depende 100% da qualidade da sua estimativa de probabilidade. Se você subestima ou superestima, o EV calculado é enganoso.",
    polymarketUso: "No Polymarket, o preço de mercado (ex: 0.65) é a probabilidade implícita. Se você acha que a chance real é 75%, o EV = 0.75×(1/0.65 − 1) − 0.25 > 0.",
    steps: [
      "1. Identifique um evento e estime a probabilidade real (ex: 65%)",
      "2. Veja a odd ou probabilidade implícita do mercado (ex: 55%)",
      "3. Se sua prob > prob do mercado, EV é positivo",
      "4. Calcule: EV = sua_prob × (1/prob_mercado − 1) − (1 − sua_prob)",
      "5. Se EV > 0, considere entrar. Use Kelly para dimensionar.",
    ],
    benchmarks: [
      ["EV > +5%", "Aposta atraente — procure confirmar com mais dados"],
      ["EV > +10%", "Oportunidade forte — rara em mercados eficientes"],
      ["EV 0–5%", "Marginal — só entre se tiver alta confiança na sua estimativa"],
      ["EV < 0", "Não aposte — você está pagando para perder no longo prazo"],
    ],
  },
  {
    id: "overround",
    icon: Percent,
    name: "Overround / Margem",
    tagline: "Detecta quanto a casa está cobrando de pedágio",
    whenToUse: [
      "Antes de comparar odds entre casas de apostas",
      "Para identificar mercados mais justos (menor margem)",
      "Para calcular a odd 'fair' sem a comissão da casa",
    ],
    howItWorks: "A soma das probabilidades implícitas de todas as odds deveria ser 100% se não houvesse margem. Quando passa de 100%, o excesso é o overround — o lucro garantido da casa independente do resultado.",
    accuracy: "~100% (matemático)",
    accuracyColor: "text-positive border-positive/30 bg-positive/10",
    limitacao: "Overround baixo não significa que o mercado está precificado corretamente — só que a margem da casa é pequena. Você ainda precisa estimar melhor que o consenso.",
    polymarketUso: "Polymarket e Kalshi têm overround de ~1-3% (taxa de protocolo). Casas esportivas tradicionais têm 5-10%. A diferença entre a odd da Betano e a probabilidade do Polymarket frequentemente revela valor.",
    steps: [
      "1. Colete as odds de todos os resultados possíveis (ex: 1.90 / 1.90)",
      "2. Calcule 1/odd para cada resultado",
      "3. Some todos os valores — se > 1, o excesso é o overround",
      "4. Calcule a fair odd: divide cada prob implícita pela soma total",
      "5. Compare a fair odd com sua estimativa para calcular o EV real",
    ],
    benchmarks: [
      ["< 2%", "Mercado preditivo (Polymarket/Kalshi) — quase justo"],
      ["2–4%", "Exchange de apostas (Betfair) — boa opção"],
      ["4–6%", "Casa esportiva competitiva — aceitável"],
      ["> 8%", "Loteria ou mercado de alto risco — evitar"],
    ],
  },
  {
    id: "brier",
    icon: Target,
    name: "Brier Score",
    tagline: "O único indicador honesto de qualidade de previsão",
    whenToUse: [
      "Para medir se suas previsões passadas foram boas ou só 'pareciam' boas",
      "Para comparar sua calibração com a do mercado (Polymarket)",
      "Para identificar áreas onde você sistemicamente erra (viés de confiança)",
    ],
    howItWorks: "Para cada previsão, calcula (sua_prob − resultado)². Médio ao longo de muitas previsões. Um forecaster que diz 70% em algo que acontece 70% das vezes tem BS próximo de 0.21 — melhor que quem diz 90% e erra frequentemente.",
    accuracy: "Benchmark: Superforecasters do GJP têm BS ≈ 0.14",
    accuracyColor: "text-neon-blue border-neon-blue/30 bg-neon-blue/10",
    limitacao: "Requer muitas previsões para ser estatisticamente significativo (mínimo 30). Com poucas previsões, o BS pode variar por sorte.",
    polymarketUso: "O Polymarket publica o preço histórico de cada mercado antes do resultado. Você pode comparar: se o mercado tinha 70% e você tinha 80% em um evento que aconteceu, quem teve menor BS estava mais calibrado.",
    steps: [
      "1. Antes de cada evento, registre sua estimativa (ex: 65%)",
      "2. Após o resultado, anote se aconteceu (1) ou não (0)",
      "3. Calcule (0.65 − 1)² = 0.1225 para esse evento",
      "4. Acumule 20+ previsões e tire a média",
      "5. Compare seu BS com o BS do Polymarket no mesmo período",
    ],
    benchmarks: [
      ["< 0.10", "Forecaster experiente — calibração excelente"],
      ["0.10–0.15", "Bom — melhor que a maioria dos apostadores"],
      ["0.15–0.20", "Mediano — espaço para melhorar a calibração"],
      ["0.20–0.25", "Fraco — previsões sistematicamente imprecisas"],
      ["> 0.25", "Pior que chutar 50% sempre — revisar metodologia"],
    ],
  },
  {
    id: "kelly",
    icon: TrendingUp,
    name: "Critério de Kelly",
    tagline: "O tamanho certo da aposta para crescer sem risco de ruína",
    whenToUse: [
      "Após confirmar que uma aposta tem EV positivo",
      "Para gerenciar o bankroll de forma sustentável no longo prazo",
      "Para comparar o tamanho relativo de diferentes apostas",
    ],
    howItWorks: "f* = (b×p − q) / b. Maximiza o crescimento logarítmico do bankroll. Apostar acima do Kelly é matematicamente equivalente a aceitar variância crescente sem recompensa adicional — a chance de ruína aumenta exponencialmente.",
    accuracy: "Crescimento ótimo provado matematicamente (Shannon/Kelly, 1956)",
    accuracyColor: "text-gold border-gold/30 bg-gold/10",
    limitacao: "Assume que sua estimativa de p é precisa. Na prática, há incerteza — daí usar ½ Kelly como proteção contra erros de estimativa.",
    polymarketUso: "No Polymarket, você opera contra o mercado. Se o mercado diz 60% e você acha 75%, o edge = 15pp. Com odd implícita de 1/0.6 = 1.67, o Kelly seria: (0.67×0.75 − 0.25) / 0.67 ≈ 37% — o que seria muito. Use ½ ou ¼ Kelly.",
    steps: [
      "1. Calcule o EV — só prossiga se positivo",
      "2. Identifique b = odd − 1, p = sua prob, q = 1 − p",
      "3. Aplique f* = (b×p − q) / b",
      "4. Multiplique por ½ para ser conservador (½ Kelly)",
      "5. Aposte f* × bankroll. Recalcule após cada resultado.",
    ],
    benchmarks: [
      ["f* < 5%", "Posição pequena — edge marginal ou incerteza alta"],
      ["f* 5–15%", "Posição moderada — edge razoável"],
      ["f* 15–25%", "Posição grande — edge forte, use ½ Kelly"],
      ["f* > 25%", "Suspeite da sua estimativa — improvável em mercados eficientes"],
    ],
  },
];

function ModelCard({ model }: { model: ModelGuide }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = model.icon;

  return (
    <AnimatedSection>
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">{model.name}</h3>
                <p className="text-xs text-muted-foreground">{model.tagline}</p>
              </div>
            </div>
            <span className={`shrink-0 text-[9px] font-semibold px-2 py-0.5 rounded-full border ${model.accuracyColor}`}>
              {model.accuracy}
            </span>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed mb-3">{model.howItWorks}</p>

          <div className="mb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">Quando usar</p>
            <ul className="space-y-1">
              {model.whenToUse.map((u) => (
                <li key={u} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <CheckCircle className="w-3 h-3 text-positive shrink-0 mt-0.5" />
                  {u}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 mb-3">
            <p className="text-[10px] font-semibold text-gold uppercase tracking-wider mb-1">Uso em Mercados Preditivos</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{model.polymarketUso}</p>
          </div>

          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            <span>{expanded ? "Ocultar" : "Ver"} passo a passo e benchmarks</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {expanded && (
          <div className="border-t border-border/20 p-5 space-y-4 bg-obsidian/20">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Passo a passo</p>
              <ol className="space-y-1">
                {model.steps.map((s) => (
                  <li key={s} className="text-xs text-muted-foreground leading-relaxed">{s}</li>
                ))}
              </ol>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Benchmarks de referência</p>
              <div className="space-y-1">
                {model.benchmarks.map(([v, l]) => (
                  <div key={v} className="flex justify-between text-xs gap-4">
                    <span className="text-muted-foreground">{l}</span>
                    <span className="font-mono text-foreground shrink-0">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 rounded-lg bg-negative/5 border border-negative/20">
              <div className="flex gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-negative shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground"><strong className="text-foreground">Limitação:</strong> {model.limitacao}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </AnimatedSection>
  );
}

function GuiaModelos() {
  return (
    <div className="space-y-6">
      <AnimatedSection>
        <div className="p-5 rounded-xl border border-gold/20 bg-gold/5">
          <div className="flex gap-3">
            <BookOpen className="w-5 h-5 text-gold shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-foreground mb-1">Como usar este guia</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Cada modelo resolve um problema específico. A sequência correta é:{" "}
                <strong className="text-foreground">Overround</strong> (qual o custo do mercado?) →{" "}
                <strong className="text-foreground">EV</strong> (vale a pena entrar?) →{" "}
                <strong className="text-foreground">Kelly</strong> (quanto apostar?) →{" "}
                <strong className="text-foreground">Brier Score</strong> (minhas previsões foram boas?).
              </p>
              <p className="text-xs text-gold/80 font-medium mt-2">
                No Polymarket e Kalshi, o preço de mercado já é a probabilidade — use diretamente nas fórmulas.
              </p>
            </div>
          </div>
        </div>
      </AnimatedSection>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {MODELS.map((m) => <ModelCard key={m.id} model={m} />)}
      </div>
    </div>
  );
}

// ─── 6. Correlação ──────────────────────────────────────────────────────────

interface HistoryPoint { t: number; close: number }

async function fetchHistory(ticker: string): Promise<number[]> {
  const res = await fetch(`/api/quotes/history/${encodeURIComponent(ticker)}?months=12`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json() as { points?: HistoryPoint[] };
  return (data.points ?? []).map((p) => p.close);
}

function CorrelacaoTab() {
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

// ─── Main ────────────────────────────────────────────────────────────────────

const CALC_LABELS: Partial<Record<CalcTab, string>> = {
  ev:          "Usou calculadora de Valor Esperado",
  overround:   "Usou calculadora de Overround",
  brier:       "Usou calculadora de Brier Score",
  kelly:       "Usou calculadora de Kelly",
  correlacao:  "Usou calculadora de Correlação",
};

export default function Calculadoras() {
  const [tab, setTab] = useState<CalcTab>("guia");
  const awardedTabs = useRef<Set<CalcTab>>(new Set());

  function switchTab(next: CalcTab) {
    if (next !== "guia" && !awardedTabs.current.has(next)) {
      awardedTabs.current.add(next);
      awardPoints("calculator_used", CALC_LABELS[next]!);
    }
    setTab(next);
  }

  const tabs: { id: CalcTab; label: string; icon: LucideIcon }[] = [
    { id: "guia",        label: "Guia de Modelos",  icon: BookOpen   },
    { id: "ev",          label: "Valor Esperado",   icon: Calculator },
    { id: "overround",   label: "Overround",        icon: Percent    },
    { id: "brier",       label: "Brier Score",      icon: Target     },
    { id: "kelly",       label: "Kelly",            icon: TrendingUp },
    { id: "correlacao",  label: "Correlação",       icon: GitCompare },
  ];

  const introMap: Record<Exclude<CalcTab, "guia" | "correlacao">, React.ReactNode> = {
    ev: (
      <ToolIntro icon={Calculator}
        tagline="Descubra se uma aposta vale a pena matematicamente antes de colocar dinheiro."
        description="O Valor Esperado (EV) responde: se você fizesse esta aposta mil vezes, lucraria ou perderia? Uma aposta pode ter 70% de chance de ganhar e ainda assim ser um mau negócio — depende da odd. Use no Polymarket comparando a probabilidade do mercado com a sua estimativa."
        example="Odd 1.8 com 60% de chance real → EV = +8% por aposta. Matematicamente favorável no longo prazo."
        accuracy={{ label: "Precisão", value: "100% (matemático)", color: "text-positive border-positive/30 bg-positive/10" }} />
    ),
    overround: (
      <ToolIntro icon={Percent}
        tagline="Veja quanto a casa está cobrando e calcule as odds que você realmente merece."
        description="Toda casa embutiu uma margem nas odds para garantir lucro independente do resultado. O Overround mostra esse valor — e as 'fair odds' revelam a odd justa sem taxa. Polymarket e Kalshi têm ~1–3% de overround; casas esportivas tradicionais cobram 5–10%."
        example="Odds 1.90/1.90 → overround 5.3% → fair odds seriam 2.0/2.0. A casa já embolsou 5.3%."
        accuracy={{ label: "Precisão", value: "100% (matemático)", color: "text-positive border-positive/30 bg-positive/10" }} />
    ),
    brier: (
      <ToolIntro icon={Target}
        tagline="Meça se suas previsões são boas de verdade — não só se você acertou."
        description="Taxa de acerto engana. O Brier Score mede calibração: se você diz 70%, isso acontece 70% das vezes? Superforecasters do Good Judgment Project têm BS < 0.10. Compare sua calibração com o mercado usando o histórico de probabilidades do Polymarket."
        example="Polymarket tinha 60% em evento que aconteceu (erro² = 0.16). Você tinha 80% (erro² = 0.04). Você estava melhor calibrado."
        accuracy={{ label: "Benchmark GJP", value: "BS < 0.10", color: "text-neon-blue border-neon-blue/30 bg-neon-blue/10" }} />
    ),
    kelly: (
      <ToolIntro icon={TrendingUp}
        tagline="Saiba exatamente quanto apostar para crescer sem risco de ruína."
        description="Kelly calcula o tamanho ótimo que maximiza o crescimento do bankroll. Apostar acima do Kelly aumenta a chance de ruína exponencialmente. Profissionais usam ½ Kelly para proteger contra erros de estimativa. Combine com EV+ para entrar apenas em posições com vantagem matemática."
        example="Edge de +15pp com odd 1.67 (Polymarket a 60%, você estima 75%) → Kelly ≈ 37% → use ½ Kelly ≈ 18%."
        accuracy={{ label: "Prova matemática", value: "Shannon/Kelly 1956", color: "text-gold border-gold/30 bg-gold/10" }} />
    ),
  };

  return (
    <div>
      <LaboratorioTabs />
      <PageHeader
        title="Calculadoras Quantitativas"
        subtitle="Ferramentas para Valor Esperado, Overround, Brier Score e Kelly — com guia completo de uso em mercados preditivos."
        badge="Ferramentas"
      />

      <div className="container py-12">
        <AnimatedSection>
          <div className="flex flex-wrap gap-2 mb-8" role="tablist" aria-label="Tipo de calculadora">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => switchTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="w-4 h-4" aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>
        </AnimatedSection>

        {tab === "guia"       && <GuiaModelos />}
        {tab === "correlacao" && <CorrelacaoTab />}
        {tab !== "guia" && tab !== "correlacao" && (
          <>
            {introMap[tab]}
            {tab === "ev"        && <ValorEsperado />}
            {tab === "overround" && <OverroundCalc />}
            {tab === "brier"     && <BrierScoreCalc />}
            {tab === "kelly"     && <KellyCalc />}
          </>
        )}
      </div>
    </div>
  );
}
