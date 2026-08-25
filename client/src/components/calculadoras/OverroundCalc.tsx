/**
 * OverroundCalc — calculadora de overround/vig do mercado. Extraida de pages/Calculadoras.tsx.
 */
import { useState } from "react";
import { Percent } from "lucide-react";
import { CalcCard, FormulaBox, ResultBox, InsightBox, inputClass, labelClass } from "@/components/calculadoras/CalcPrimitives";

export function OverroundCalc() {
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
    : overround < 6 ? { text: "Aceitável (4–6%)", color: "text-warning" }
    : { text: "Alto (> 6%) — evite", color: "text-negative" };

  return (
    <CalcCard title="Overround / Margem da Casa" icon={Percent}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className={labelClass}>Odds decimais</p>
            <p className="text-[11px] text-muted-foreground/80 leading-snug">Coloque as odds de todos os lados do mesmo mercado (ex.: 1.90 e 1.90 num mercado de 2 resultados).</p>
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
          <ResultBox big label="Overround — o que a casa cobra"
            value={`${overround.toFixed(1)}%`}
            color={overround > 5 ? "text-negative" : overround > 2 ? "text-warning" : "text-positive"}
            hint="quanto a casa embutiu nas odds pra lucrar sempre. Quanto MENOR, melhor pra você — Polymarket/Kalshi ~0–3%, casas esportivas 5–10%." />
          <ResultBox label="Margem da casa"
            value={`${margin.toFixed(1)}%`}
            color={margin > 5 ? "text-negative" : margin > 2 ? "text-warning" : "text-positive"}
            hint="a fatia do total apostado que vira lucro garantido da casa" />

          <div className={`p-3 rounded-xl border flex items-center gap-2 ${marginLabel.color.includes("positive") ? "bg-positive/10 border-positive/30" : marginLabel.color.includes("neon") ? "bg-neon-blue/10 border-neon-blue/30" : marginLabel.color.includes("yellow") ? "bg-warning/10 border-warning/30" : "bg-negative/10 border-negative/30"}`}>
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
