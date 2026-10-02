/**
 * ValorEsperado — calculadora de valor esperado (EV). Extraida de pages/Calculadoras.tsx.
 *
 * ⚠️ O ESTADO GUARDA O TEXTO DOS CAMPOS, não o número (01/10/2026). Guardando o
 * número, apagar "55" para digitar "60" era impossível: o campo vazio não vira
 * número, a mudança era ignorada e o 55 voltava — a digitação virava "5560".
 * Ver lib/campoNumerico.ts. Campo vazio deixa o resultado em "—", nunca em zero.
 */
import { useState } from "react";
import { Calculator } from "lucide-react";
import { CalcCard, FormulaBox, ResultBox, InsightBox, Field, inputClass, labelClass } from "@/components/calculadoras/CalcPrimitives";
import { numeroDoCampo } from "@/lib/campoNumerico";
import { num, pct } from "@shared/formato";

/** O que está escrito em cada campo de um cenário. */
interface Outcome { prob: string; payout: string }

export function ValorEsperado() {
  const [stakeTexto, setStakeTexto] = useState("100");
  const [outcomes, setOutcomes] = useState<Outcome[]>([
    { prob: "55", payout: "1.8" },
    { prob: "45", payout: "0" },
  ]);

  const update = (i: number, field: keyof Outcome, texto: string) =>
    setOutcomes((prev) => prev.map((o, idx) => idx === i ? { ...o, [field]: texto } : o));

  const addOutcome = () => setOutcomes((prev) => [...prev, { prob: "0", payout: "0" }]);
  const removeOutcome = (i: number) => setOutcomes((prev) => prev.filter((_, idx) => idx !== i));

  // Os números, derivados do texto. `null` = campo vazio ou ilegível.
  const stakeN = numeroDoCampo(stakeTexto);
  const valores = outcomes.map((o) => ({ prob: numeroDoCampo(o.prob), payout: numeroDoCampo(o.payout) }));
  const completo = stakeN !== null && stakeN >= 0 && valores.every((v) => v.prob !== null && v.payout !== null);

  const totalProb = valores.reduce((s, v) => s + (v.prob ?? 0), 0);
  // Conta barata (um cenário por linha): sem useMemo, que teria de declarar
  // `valores` como dependência e seria recriado a cada render de qualquer jeito.
  const ev = valores.reduce((s, v) => s + ((v.prob ?? 0) / 100) * ((v.payout ?? 0) - 1), 0);

  const stake = stakeN ?? 0;
  const evReais = ev * stake;
  const roi = ev * 100;
  const isPositive = ev > 0;
  // EV que arredonda para zero é neutro — vermelho em "R$ 0,00" contradiz o número
  const isNeutral = Math.abs(ev) < 0.00005;
  const evColor = !completo ? "text-muted-foreground" : isNeutral ? "text-muted-foreground" : isPositive ? "text-positive" : "text-negative";
  // Só reclama da soma com tudo preenchido: no meio da troca de um número a
  // soma está incompleta por definição, e o aviso piscaria a cada tecla.
  const probWarning = completo && Math.abs(totalProb - 100) > 0.5;
  const traco = "—";

  return (
    <CalcCard title="Calculadora de Valor Esperado" icon={Calculator}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Field label="Valor da Posição (R$)" htmlFor="ev-stake" hint="Quanto você vai colocar de verdade.">
            <input id="ev-stake" type="number" min={0} step={10} value={stakeTexto}
              onChange={(e) => setStakeTexto(e.target.value)}
              className={inputClass} />
          </Field>

          <div className="space-y-2">
            <p className={labelClass}>Cenários</p>
            <p className="text-[11px] text-muted-foreground/80 leading-snug">Probabilidade = a chance REAL que você acredita · Odd = quanto recebe de volta (1,8 devolve 1,8× a posição).</p>
            {outcomes.map((o, i) => (
              <div key={i} className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="text-[11px] text-muted-foreground" htmlFor={`ev-prob-${i}`}>
                    Probabilidade (%)
                  </label>
                  <input id={`ev-prob-${i}`} type="number" min={0} max={100} step={0.5} value={o.prob}
                    onChange={(e) => update(i, "prob", e.target.value)} className={inputClass} />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-muted-foreground" htmlFor={`ev-pay-${i}`}>
                    Odd (retorno total)
                  </label>
                  <input id={`ev-pay-${i}`} type="number" min={0} step={0.01} value={o.payout}
                    onChange={(e) => update(i, "payout", e.target.value)} className={inputClass} />
                </div>
                {outcomes.length > 2 && (
                  <button onClick={() => removeOutcome(i)} aria-label={`Remover cenário ${i + 1}`}
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
              <p className="text-xs text-warning">Soma das probabilidades: {num(totalProb, 1)}% (deveria ser 100%)</p>
            </div>
          )}

          <FormulaBox formula="E[X] = Σ pᵢ × (oddᵢ − 1)" legend="oddᵢ = retorno total (ex.: 1,8 é lucro de 80%)" />
        </div>

        <div className="space-y-4">
          <ResultBox big label="Valor Esperado por posição" termo="ev"
            value={completo ? `${isPositive ? "+" : ""}R$ ${num(evReais, 2)}` : traco}
            color={evColor}
            hint="Se você fizesse esta posição muitas vezes, ganharia (ou perderia) isso EM MÉDIA por vez."
            sub={completo ? `por R$ ${num(stake, 2)} na posição` : "preencha todos os campos"} />
          <div className="grid grid-cols-2 gap-3">
            <ResultBox label="ROI esperado" termo="roi"
              value={completo ? `${isPositive ? "+" : ""}${num(roi, 1)}%` : traco}
              color={evColor}
              hint="retorno médio sobre o que você põe" />
            <ResultBox label="EV por R$ 1" termo="ev"
              value={completo ? `${isPositive ? "+" : ""}R$ ${num(ev, 3)}` : traco}
              color={evColor}
              hint="pra comparar posições de tamanhos diferentes" />
          </div>

          {completo && (
            <div className={`p-4 rounded-xl border ${isNeutral ? "bg-secondary/20 border-border/30" : isPositive ? "bg-positive/10 border-positive/30" : "bg-negative/10 border-negative/30"}`}>
              <p className={`text-sm font-semibold ${evColor}`}>
                {isNeutral ? "EV zero — posição justa" : isPositive ? "EV+ — matematicamente favorável" : "EV− — matematicamente perdedor"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isNeutral
                  ? "Retorno esperado igual ao valor da posição. Sem margem da casa e sem vantagem sua — raro no mundo real."
                  : isPositive
                  ? "No longo prazo, esta posição tende a lucrar. Mas variância de curto prazo é inevitável."
                  : "No longo prazo, toda posição EV− resulta em perda. A frequência de acerto não muda isso."}
              </p>
            </div>
          )}

          <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Probabilidade implícita da odd</p>
            {valores.map((v, i) => (
              <div key={i} className="flex justify-between text-xs mt-1">
                <span className="text-muted-foreground">Cenário {i + 1} (odd {num(v.payout, 2)})</span>
                <span className="font-mono text-foreground">{v.payout !== null && v.payout > 0 ? pct(100 / v.payout, 1) : "—"}</span>
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
