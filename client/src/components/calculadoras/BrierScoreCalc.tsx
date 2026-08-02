/**
 * BrierScoreCalc — calculadora de Brier Score (calibracao). Extraida de pages/Calculadoras.tsx.
 */
import { useState, useMemo } from "react";
import { Target } from "lucide-react";
import { CalcCard, FormulaBox, ResultBox, InsightBox, inputClass } from "@/components/calculadoras/CalcPrimitives";

interface Prediction { prob: number; outcome: 0 | 1 }

export function BrierScoreCalc() {
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
