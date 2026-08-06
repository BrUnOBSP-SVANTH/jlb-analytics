/**
 * EdgeCalculator — calculadora de EV/Kelly inline do detalhe. Extraido de pages/MarketDetail.tsx.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Calculator, Zap, Info, Check, BookmarkPlus } from "lucide-react";
import { calcEV, calcKelly } from "@/components/marketDetail/utils";
import { Explain } from "@/components/marketDetail/Explain";
import { addPrediction } from "@/lib/predictions";
import { awardPoints } from "@/lib/userProgress";
import { track } from "@/lib/analytics";

// ── EdgeCalculator (inline) ────────────────────────────────────────────────────

export function EdgeCalculator({ marketProb, marketId, question }: { marketProb: number; marketId: string; question: string }) {
  const [yourPct, setYourPct] = useState(Math.round(marketProb * 100));
  const [saved, setSaved] = useState(false);
  const yourProb = yourPct / 100;

  // Fecha o loop do Brier: registra a estimativa para rastrear a própria calibração
  // no Dashboard. Antes esse fluxo só existia nos cards de Notícias, não na tela forte.
  function handleSave() {
    addPrediction({ marketId, question, marketProb: Math.round(marketProb * 100), userProb: yourPct });
    awardPoints("prediction_made", `Previsão registrada: ${question.slice(0, 50)}`);
    track("prediction_registered", { source: "marketdetail" });
    setSaved(true);
  }
  const ev = calcEV(yourProb, marketProb);
  const kelly = calcKelly(yourProb, marketProb);
  const halfKelly = kelly / 2;
  const edge = yourProb - marketProb;
  const hasValue = ev > 0;
  // EV que arredonda para 0.0% é neutro — "+0.0%" pintado de vermelho contradiz o próprio sinal
  const evNeutral = Math.abs(ev * 100) < 0.05;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="w-4 h-4 text-primary/70" />
        <p className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">Calculadora de Edge</p>
      </div>
      <Explain>
        Esta é a ponte entre o "eu acho" e os números: diga qual chance <strong className="text-foreground">você</strong> acredita ser a real,
        e a calculadora mostra se a aposta tem <strong className="text-foreground">Valor Esperado positivo</strong> (lucro esperado a longo prazo)
        e <strong className="text-foreground">quanto arriscar</strong> sem quebrar a banca (a fração de Kelly). Mova o controle e veja os números reagirem.
      </Explain>
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-muted-foreground">Sua estimativa</span>
          <span className="text-lg font-mono font-bold text-foreground">{yourPct}%</span>
        </div>
        <input
          type="range" min={1} max={99} value={yourPct}
          onChange={(e) => setYourPct(Number(e.target.value))}
          className="w-full h-2 rounded-full accent-primary cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-muted-foreground/50 mt-0.5">
          <span>1%</span><span>50%</span><span>99%</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={`p-3 rounded-lg border ${evNeutral ? "border-border/20 bg-secondary/10" : hasValue ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"}`}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Valor Esperado (EV)</p>
          <p className={`text-xl font-mono font-bold ${evNeutral ? "text-muted-foreground" : hasValue ? "text-positive" : "text-negative"}`}>
            {evNeutral ? "0.0" : `${ev >= 0 ? "+" : ""}${(ev * 100).toFixed(1)}`}%
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">por real apostado</p>
        </div>
        <div className={`p-3 rounded-lg border ${edge > 0 ? "border-neon-blue/20 bg-neon-blue/5" : "border-border/20 bg-secondary/10"}`}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Edge vs Mercado</p>
          <p className={`text-xl font-mono font-bold ${edge > 0 ? "text-neon-blue" : "text-muted-foreground"}`}>
            {edge >= 0 ? "+" : ""}{(edge * 100).toFixed(1)}pp
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Mercado: {Math.round(marketProb * 100)}% | Você: {yourPct}%
          </p>
        </div>
        <div className="p-3 rounded-lg border border-gold/20 bg-gold/5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Kelly Completo</p>
          <p className="text-xl font-mono font-bold text-gold">{(kelly * 100).toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">da banca</p>
        </div>
        <div className="p-3 rounded-lg border border-gold/10 bg-gold/[0.03]">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">½ Kelly (recomendado)</p>
          <p className="text-xl font-mono font-bold text-gold/70">{(halfKelly * 100).toFixed(1)}%</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">da banca</p>
        </div>
      </div>
      <div className={`flex items-center gap-2 p-3 rounded-lg ${hasValue ? "bg-positive/10 border border-positive/20" : "bg-secondary/20 border border-border/20"}`}>
        <Zap className={`w-4 h-4 shrink-0 ${hasValue ? "text-positive" : "text-muted-foreground"}`} />
        <p className="text-xs leading-relaxed">
          {hasValue
            ? `Valor positivo detectado. Com ½ Kelly: arrisque ${(halfKelly * 100).toFixed(1)}% da banca. EV de longo prazo: ${(ev * 100).toFixed(1)}% por aposta.`
            : evNeutral
            ? "EV zero — sua estimativa coincide com o preço do mercado. Não há vantagem matemática de nenhum lado."
            : "Sem valor com esta estimativa — o mercado está pagando menos do que sua probabilidade justifica. Reduza o tamanho ou reavalie."}
        </p>
      </div>
      {/* Registrar a previsão — fecha o loop do Brier (rastreio de calibração no Dashboard) */}
      {saved ? (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-positive/10 border border-positive/20">
          <Check className="w-4 h-4 text-positive shrink-0" />
          <p className="text-xs text-foreground">
            Previsão registrada ({yourPct}%). Acompanhe sua calibração no{" "}
            <Link href="/dashboard"><span className="text-gold hover:underline cursor-pointer">Dashboard</span></Link>.
          </p>
        </div>
      ) : (
        <button
          onClick={handleSave}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <BookmarkPlus className="w-4 h-4" /> Registrar esta previsão ({yourPct}%)
        </button>
      )}
      <details className="group">
        <summary className="text-xs text-muted-foreground/60 hover:text-muted-foreground cursor-pointer flex items-center gap-1 select-none">
          <Info className="w-3 h-3" />Como foi calculado
        </summary>
        <div className="mt-2 p-3 rounded-lg bg-obsidian/40 border border-border/20 space-y-1.5 text-xs text-muted-foreground font-mono">
          <p>Odds justas = 1 ÷ {marketProb.toFixed(2)} = {(1 / marketProb).toFixed(2)}x</p>
          <p>b (ganho líquido) = {(1 / marketProb).toFixed(2)} − 1 = {(1 / marketProb - 1).toFixed(2)}</p>
          <p>EV = {yourProb.toFixed(2)} × {(1 / marketProb - 1).toFixed(2)} − {(1 - yourProb).toFixed(2)} = {ev.toFixed(3)}</p>
          <p>Kelly = (b×p − q) ÷ b = {kelly.toFixed(3)}</p>
        </div>
      </details>
    </div>
  );
}
