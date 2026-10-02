/**
 * BrierScoreCalc — calculadora de Brier Score (calibracao). Extraida de pages/Calculadoras.tsx.
 */
import { useState, useMemo } from "react";
import { Target } from "lucide-react";
import { CalcCard, FormulaBox, ResultBox, InsightBox, inputClass } from "@/components/calculadoras/CalcPrimitives";
import { numeroDoCampo } from "@/lib/campoNumerico";
import { BRIER_SUPERFORECASTER, BRIER_DO_CHUTE, FONTE_SUPERFORECASTER } from "@shared/referencias";
import { plural, num } from "@shared/formato";

/**
 * `prob` é o TEXTO do campo (01/10/2026). Guardando o número, apagar a previsão
 * a fazia virar 0 — a pessoa via um "0" que não digitou e o Brier mudava na hora,
 * calculado sobre uma previsão de 0% que ninguém fez. Ver lib/campoNumerico.ts.
 */
interface Prediction { prob: string; outcome: 0 | 1 }

export function BrierScoreCalc() {
  const [preds, setPreds] = useState<Prediction[]>([
    { prob: "70", outcome: 1 },
    { prob: "30", outcome: 0 },
    { prob: "60", outcome: 1 },
    { prob: "80", outcome: 1 },
    { prob: "40", outcome: 0 },
  ]);

  const updatePred = (i: number, field: keyof Prediction, v: string | 0 | 1) => {
    setPreds((prev) => prev.map((p, idx) => idx === i ? { ...p, [field]: v } : p));
  };
  const addPred = () => setPreds((prev) => [...prev, { prob: "50", outcome: 1 }]);
  const removePred = (i: number) => setPreds((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);

  // Só entra na conta a previsão que tem número entre 0 e 100. Linha vazia (no
  // meio da troca) ou fora da faixa fica de fora e é avisada — nunca vira 0%.
  const validas = preds
    .map((p) => ({ prob: numeroDoCampo(p.prob), outcome: p.outcome }))
    .filter((p): p is { prob: number; outcome: 0 | 1 } => p.prob !== null && p.prob >= 0 && p.prob <= 100);
  const foraDaConta = preds.length - validas.length;

  const brierScore = useMemo(() => {
    if (validas.length === 0) return 0;
    return validas.reduce((s, p) => s + Math.pow(p.prob / 100 - p.outcome, 2), 0) / validas.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `validas` deriva de `preds`
  }, [preds]);

  const skillScore = 1 - brierScore / BRIER_DO_CHUTE;
  const isSkilled = skillScore > 0;

  const classification = brierScore < BRIER_SUPERFORECASTER ? { label: "Excepcional", color: "text-dado" }
    : brierScore < 0.15 ? { label: "Muito bom", color: "text-positive" }
    : brierScore < 0.20 ? { label: "Bom", color: "text-primary" }
    : brierScore < BRIER_DO_CHUTE ? { label: "Mediano", color: "text-warning" }
    : { label: "Pior que chutar 50%", color: "text-negative" };

  return (
    <CalcCard title="Calculadora de Brier Score" icon={Target}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <p className="text-[11px] text-muted-foreground/80 leading-snug">Liste suas previsões passadas: a chance (%) que você deu e se o evento aconteceu. O “Erro²” mostra onde você errou mais.</p>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground uppercase tracking-wider px-1">
              <span>Previsão (%)</span>
              <span>Resultado</span>
              <span>Erro²</span>
            </div>
            {preds.map((p, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 items-center">
                <input type="number" min={0} max={100} step={1} value={p.prob}
                  onChange={(e) => updatePred(i, "prob", e.target.value)}
                  className={inputClass} aria-label={`Previsão ${i + 1}`} />
                <select value={p.outcome}
                  onChange={(e) => updatePred(i, "outcome", parseInt(e.target.value) as 0 | 1)}
                  className={inputClass} aria-label={`Resultado ${i + 1}`}>
                  <option value={1}>Aconteceu</option>
                  <option value={0}>Não aconteceu</option>
                </select>
                <div className="flex items-center gap-1">
                  {(() => {
                    const n = numeroDoCampo(p.prob);
                    if (n === null || n < 0 || n > 100) {
                      return <span className="text-xs text-muted-foreground" title="Entre 0 e 100">—</span>;
                    }
                    const erro = Math.pow(n / 100 - p.outcome, 2);
                    return (
                      <span className={`text-xs font-mono ${erro < 0.1 ? "text-positive" : "text-negative"}`}>
                        {num(erro, 3)}
                      </span>
                    );
                  })()}
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
          <ResultBox big label="Brier Score — sua nota de calibração"
            value={num(brierScore, 3)}
            color={brierScore < 0.20 ? "text-positive" : brierScore < 0.25 ? "text-warning" : "text-negative"}
            hint="mede se, quando você diz “70%”, acontece mesmo ~70% das vezes. MENOR é melhor: 0 = perfeito, 0,25 = igual a chutar 50%." />
          <ResultBox label="Skill Score" termo="skill"
            value={`${num((skillScore * 100), 0)}%`}
            color={isSkilled ? "text-positive" : "text-negative"}
            hint={isSkilled ? "acima de 0% = você é melhor que quem só chuta 50%" : "abaixo de 0% = pior que chutar 50%"} />

          <div className={`p-4 rounded-xl border ${isSkilled ? "bg-positive/10 border-positive/30" : "bg-negative/10 border-negative/30"}`}>
            <p className={`text-sm font-semibold ${classification.color}`}>{classification.label}</p>
            <p className="text-xs text-muted-foreground mt-1">Com {plural(validas.length, "previsão", "previsões")}{foraDaConta > 0 ? ` (${foraDaConta} fora da conta: vazia ou fora de 0 a 100)` : ""} · Skill Score = 1 − BS / 0,25</p>
          </div>

          <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20 space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Benchmarks reais</p>
            {/* Uma tabela só, vinda de shared/referencias.ts. Esta lista dizia
                "< 0.05 — Superforecasters", enquanto outra tela dizia 0.10 e uma
                terceira, 0.14. O 0,05 não aparece em nenhuma publicação do GJP. */}
            {[
              [`< ${num(BRIER_SUPERFORECASTER, 2)}`, `Superforecasters — ${FONTE_SUPERFORECASTER}`],
              ["< 0.15", "Forecaster experiente"],
              ["< 0.20", "Bom usuário de mercado preditivo"],
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
