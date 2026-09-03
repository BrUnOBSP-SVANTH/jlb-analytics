/**
 * KellyCalc — calculadora do Criterio de Kelly (sizing). Extraida de pages/Calculadoras.tsx.
 */
import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { CalcCard, FormulaBox, ResultBox, InsightBox, Field, inputClass } from "@/components/calculadoras/CalcPrimitives";

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
          <Field label="Sua estimativa de probabilidade (%)" htmlFor="kelly-prob" hint="A chance REAL que VOCÊ acredita — a sua leitura, não a da casa.">
            <input id="kelly-prob" type="number" min={1} max={99} step={0.5} value={prob}
              onChange={(e) => setProb(Math.min(99, Math.max(1, parseFloat(e.target.value) || 1)))}
              className={inputClass} />
          </Field>
          <Field label="Odd decimal oferecida" htmlFor="kelly-odd" hint="O retorno pago se ganhar. Odd 2.0 = dobra o valor.">
            <input id="kelly-odd" type="number" min={1.01} step={0.01} value={odd}
              onChange={(e) => setOdd(Math.max(1.01, parseFloat(e.target.value) || 1.01))}
              className={inputClass} />
          </Field>
          <Field label="Bankroll total (R$)" htmlFor="kelly-bankroll" hint="Todo o dinheiro que você separou pra operar.">
            <input id="kelly-bankroll" type="number" min={0} step={100} value={bankroll}
              onChange={(e) => setBankroll(Math.max(0, parseFloat(e.target.value) || 0))}
              className={inputClass} />
          </Field>

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
                Com esta probabilidade e odd, o Kelly recomenda não entrar.
                A odd implica {(impliedProb * 100).toFixed(1)}% mas você estima {prob}%.
              </p>
            </div>
          ) : (
            <>
              <ResultBox big label="½ Kelly — quanto pôr"
                value={`${(halfKelly * 100).toFixed(1)}%`}
                color="text-positive"
                hint={`Aposte esta fração do bankroll — R$ ${halfStake.toFixed(0)}. É o padrão dos profissionais: cresce quase igual ao Kelly cheio, com muito menos risco.`} />
              <div className="grid grid-cols-2 gap-3">
                <ResultBox label="Kelly completo" termo="kelly"
                  value={`${(kelly * 100).toFixed(1)}%`}
                  color="text-gold"
                  hint={`o máximo matemático (R$ ${kellyStake.toFixed(0)}) — mais volátil`} />
                <ResultBox label="¼ Kelly (cauteloso)"
                  value={`${(quarterKelly * 100).toFixed(1)}%`}
                  color="text-neon-blue"
                  hint="quando você não tem certeza da sua estimativa" />
              </div>
            </>
          )}

          <InsightBox>
            <strong className="text-foreground">Regra prática:</strong> nunca ponha mais que o Kelly completo. Profissionais usam ½ Kelly como padrão. Se sua estimativa de probabilidade tem incerteza alta, use ¼ Kelly.
          </InsightBox>
        </div>
      </div>
    </CalcCard>
  );
}
