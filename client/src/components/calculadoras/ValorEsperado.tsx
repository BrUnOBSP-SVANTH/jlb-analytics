/**
 * ValorEsperado — calculadora de valor esperado (EV). Extraida de pages/Calculadoras.tsx.
 */
import { useState, useMemo } from "react";
import { Calculator } from "lucide-react";
import { CalcCard, FormulaBox, ResultBox, InsightBox, inputClass, labelClass } from "@/components/calculadoras/CalcPrimitives";

interface Outcome { prob: number; payout: number }

export function ValorEsperado() {
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
  // EV que arredonda para zero é neutro — vermelho em "R$ 0.00" contradiz o número
  const isNeutral = Math.abs(ev) < 0.00005;
  const evColor = isNeutral ? "text-muted-foreground" : isPositive ? "text-positive" : "text-negative";
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
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
              <p className="text-xs text-warning">Soma das probabilidades: {totalProb.toFixed(1)}% (deveria ser 100%)</p>
            </div>
          )}

          <FormulaBox formula="E[X] = Σ pᵢ × (oddᵢ − 1)" legend="oddᵢ = retorno total (ex: 1.8 = lucro de 80%)" />
        </div>

        <div className="space-y-4">
          <ResultBox label="Valor Esperado por posição"
            value={`${isPositive ? "+" : ""}R$ ${evReais.toFixed(2)}`}
            color={evColor}
            sub={`por R$ ${stake} apostado`} />
          <ResultBox label="ROI esperado"
            value={`${isPositive ? "+" : ""}${roi.toFixed(2)}%`}
            color={evColor} />
          <ResultBox label="EV por R$ 1,00 apostado"
            value={`${isPositive ? "+" : ""}R$ ${ev.toFixed(4)}`}
            color={evColor} />

          <div className={`p-4 rounded-xl border ${isNeutral ? "bg-secondary/20 border-border/30" : isPositive ? "bg-positive/10 border-positive/30" : "bg-negative/10 border-negative/30"}`}>
            <p className={`text-sm font-semibold ${evColor}`}>
              {isNeutral ? "EV zero — aposta justa" : isPositive ? "EV+ — matematicamente favorável" : "EV− — matematicamente perdedor"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isNeutral
                ? "Retorno esperado igual ao valor apostado. Sem margem da casa e sem vantagem sua — raro no mundo real."
                : isPositive
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
