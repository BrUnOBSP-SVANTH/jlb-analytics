/**
 * KellyCalc — calculadora do Criterio de Kelly (sizing). Extraida de pages/Calculadoras.tsx.
 */
import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { CalcCard, FormulaBox, ResultBox, InsightBox, inputClass, labelClass } from "@/components/calculadoras/CalcPrimitives";

export function KellyCalc() {
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
