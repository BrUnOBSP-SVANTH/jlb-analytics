/**
 * EdgeCalculator — calculadora de EV/Kelly inline do detalhe. Extraido de pages/MarketDetail.tsx.
 */
import { useState } from "react";
import { Link } from "wouter";
import { Calculator, Zap, Info, Check, BookmarkPlus, Sparkles, RefreshCw } from "lucide-react";
import { calcEV, calcKelly } from "@/components/marketDetail/utils";
import { pct, pp, num } from "@shared/formato";
import { Explain } from "@/components/marketDetail/Explain";
import { addPrediction } from "@/lib/predictions";
import { awardPoints } from "@/lib/userProgress";
import { track } from "@/lib/analytics";
import { maybeAuthGate } from "@/lib/upgrade";
import { apiFetch } from "@/lib/api";

// ── EdgeCalculator (inline) ────────────────────────────────────────────────────

interface ExplainResult {
  explanation: string;
  whyMarketMightBeMistaken: string;
  keyInsight: string;
  riskFactor: string;
  confidence?: "low" | "medium" | "high";
  cached?: boolean;
}

export function EdgeCalculator({ marketProb, marketId, question }: { marketProb: number; marketId: string; question: string }) {
  const [yourPct, setYourPct] = useState(Math.round(marketProb * 100));
  // DET-03: o slider nasce NO preço do mercado, então o EV nasce em ~0 — e um
  // arredondamento para cima bastava para a tela anunciar "Valor positivo
  // detectado" e sugerir ½ Kelly antes de o usuário fazer qualquer coisa.
  // Enquanto ninguém mover o controle, não há comparação a declarar.
  const [mexeu, setMexeu] = useState(false);
  const [saved, setSaved] = useState(false);
  const [explain, setExplain] = useState<ExplainResult | null>(null);
  const [loadingExplain, setLoadingExplain] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const yourProb = yourPct / 100;

  // Fecha o loop do Brier: registra a estimativa para rastrear a própria calibração
  // no Dashboard. Antes esse fluxo só existia nos cards de Notícias, não na tela forte.
  function handleSave() {
    addPrediction({ marketId, question, marketProb: Math.round(marketProb * 100), userProb: yourPct });
    awardPoints("prediction_made", `Previsão registrada: ${question.slice(0, 50)}`);
    track("prediction_registered", { source: "marketdetail" });
    setSaved(true);
  }

  // Liga o endpoint /explain-edge (antes órfão): a ponte entre o "eu acho" do
  // slider e o professor — a IA explica de ONDE pode vir a vantagem e o risco.
  async function handleExplain() {
    if (explain) { setExplain(null); return; }
    setLoadingExplain(true);
    setExplainError(null);
    try {
      const res = await apiFetch("/api/ai/explain-edge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: question, marketProb, userProb: yourProb }),
        signal: AbortSignal.timeout(20_000),
      });
      if (await maybeAuthGate(res)) return;   // 401 login ou 429 cota → modal assume
      if (res.status === 429) throw new Error("RATE_LIMIT");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setExplain(await res.json() as ExplainResult);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro";
      setExplainError(msg === "RATE_LIMIT" ? "Limite de requisições — aguarde ~1 min." : "Não foi possível explicar agora. Tente novamente.");
    } finally {
      setLoadingExplain(false);
    }
  }
  const ev = calcEV(yourProb, marketProb);
  const kelly = calcKelly(yourProb, marketProb);
  const halfKelly = kelly / 2;
  const edge = yourProb - marketProb;

  /**
   * Limiar que separa vantagem de ruído de arredondamento (DET-02, DET-03).
   *
   * O slider anda de 1 em 1 ponto e o preço do mercado tem casas decimais, então
   * a MENOR diferença possível já produz um EV positivo minúsculo. A auditoria
   * fotografou "EDGE VS MERCADO +0,5 pp" logo acima de "Mercado: 53% | Você:
   * 53%" — a tela se contradizendo na mesma linha, porque um número aparecia
   * arredondado e o outro não.
   *
   * Meio ponto percentual é menos que a resolução do próprio controle. Abaixo
   * disso não há o que declarar.
   */
  const LIMIAR_PP = 0.005;
  const temVantagem = mexeu && ev > 0 && Math.abs(edge) >= LIMIAR_PP;
  const evNeutral = !mexeu || Math.abs(edge) < LIMIAR_PP;
  const hasValue = temVantagem;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Calculator className="w-4 h-4 text-primary/70" />
        <p className="text-sm font-semibold text-foreground/80 uppercase tracking-wider">Calculadora de Edge</p>
      </div>
      <Explain>
        Esta é a ponte entre o "eu acho" e os números: diga qual chance <strong className="text-foreground">você</strong> acredita ser a real,
        e a calculadora mostra se a posição tem <strong className="text-foreground">Valor Esperado positivo</strong> (lucro esperado a longo prazo)
        e <strong className="text-foreground">quanto arriscar</strong> sem quebrar a banca (a fração de Kelly). Mova o controle e veja os números reagirem.
      </Explain>
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-muted-foreground">Sua estimativa</span>
          <span className="text-lg font-mono font-bold text-foreground">{yourPct}%</span>
        </div>
        <input
          type="range" min={1} max={99} value={yourPct}
          onChange={(e) => { setYourPct(Number(e.target.value)); setMexeu(true); }}
          className="w-full h-2 rounded-full accent-primary cursor-pointer"
        />
        <div className="flex justify-between text-[11px] text-muted-foreground mt-0.5">
          <span>1%</span><span>50%</span><span>99%</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className={`p-3 rounded-lg border ${evNeutral ? "border-border/20 bg-secondary/10" : hasValue ? "border-positive/20 bg-positive/5" : "border-negative/20 bg-negative/5"}`}>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Valor Esperado (EV)</p>
          <p className={`text-xl font-mono font-bold ${evNeutral ? "text-muted-foreground" : hasValue ? "text-positive" : "text-negative"}`}>
            {evNeutral ? "0.0" : `${ev >= 0 ? "+" : ""}${num((ev * 100), 1)}`}%
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">por real na posição</p>
        </div>
        <div className={`p-3 rounded-lg border ${edge > 0 ? "border-neon-blue/20 bg-neon-blue/5" : "border-border/20 bg-secondary/10"}`}>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Edge vs Mercado</p>
          <p className={`text-xl font-mono font-bold ${edge > 0 ? "text-neon-blue" : "text-muted-foreground"}`}>
            {Math.abs(edge) < LIMIAR_PP ? "0,0 pp" : pp(edge * 100)}
          </p>
          {/* DET-02: os três números com a MESMA precisão. Antes o mercado
              aparecia arredondado (53%) ao lado de um edge calculado sobre o
              valor cheio (52,5%), e o card lia "+0,5 pp" com dois 53% embaixo. */}
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Mercado {pct(marketProb * 100, 1)} · você {pct(yourPct, 1)}
          </p>
        </div>
        <div className="p-3 rounded-lg border border-gold/20 bg-gold/5">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Kelly Completo</p>
          <p className="text-xl font-mono font-bold text-gold">{num((kelly * 100), 1)}%</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">da banca</p>
        </div>
        <div className="p-3 rounded-lg border border-gold/10 bg-gold/[0.03]">
          {/* DET-04: era "(recomendado)", que colide frontalmente com o aviso
              institucional de que a JLB não recomenda posições. Descreve a mesma
              escolha sem virar conselho. */}
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">½ Kelly (mais conservador)</p>
          <p className="text-xl font-mono font-bold text-gold/70">{num((halfKelly * 100), 1)}%</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">da banca</p>
        </div>
      </div>
      <div className={`flex items-center gap-2 p-3 rounded-lg ${hasValue ? "bg-positive/10 border border-positive/20" : "bg-secondary/20 border border-border/20"}`}>
        <Zap className={`w-4 h-4 shrink-0 ${hasValue ? "text-positive" : "text-muted-foreground"}`} />
        <p className="text-xs leading-relaxed">
          {!mexeu
            ? "Mova o controle para comparar a sua estimativa com o preço do mercado."
            : hasValue
            ? `Sua estimativa implica valor esperado positivo. Com ½ Kelly isso daria ${pct(halfKelly * 100, 1)} da banca, e ${pct(ev * 100, 1)} de retorno esperado por posição no longo prazo.`
            : evNeutral
            ? "Sua estimativa coincide com o preço do mercado. Não há vantagem matemática de nenhum lado."
            : "Com esta estimativa não há valor esperado positivo — o mercado paga menos do que a sua probabilidade justificaria."}
        </p>
      </div>

      {/* Ponte slider->professor: pede à IA a origem do edge (endpoint /explain-edge, antes órfão). Só quando há edge relevante. */}
      {Math.abs(edge) >= 0.02 && (
        <div className="space-y-2">
          <button onClick={handleExplain} disabled={loadingExplain}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-neon-blue/10 border border-neon-blue/20 text-xs font-medium text-neon-blue hover:bg-neon-blue/20 transition-colors disabled:opacity-50">
            {loadingExplain
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Analisando sua vantagem...</>
              : explain
                ? <><Sparkles className="w-3.5 h-3.5" />Ocultar explicação</>
                : <><Sparkles className="w-3.5 h-3.5" />Por que eu tenho essa vantagem?</>}
          </button>
          {explainError && <p className="text-xs text-negative/80 px-1">{explainError}</p>}
          {explain && (
            <div className="space-y-2 p-3 rounded-lg bg-neon-blue/5 border border-neon-blue/15 text-xs leading-relaxed">
              <p className="text-muted-foreground">{explain.explanation}</p>
              <div><span className="font-semibold text-foreground/80">Por que o mercado pode errar: </span><span className="text-muted-foreground">{explain.whyMarketMightBeMistaken}</span></div>
              <div><span className="font-semibold text-gold/80">💡 Insight: </span><span className="text-muted-foreground">{explain.keyInsight}</span></div>
              <div><span className="font-semibold text-negative/70">⚠️ Risco: </span><span className="text-muted-foreground">{explain.riskFactor}</span></div>
              <p className="text-[11px] text-muted-foreground pt-1 border-t border-border/15">Análise educacional da IA — nunca uma recomendação de compra.{explain.cached ? " (cache)" : ""}</p>
            </div>
          )}
        </div>
      )}
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
        <summary className="text-xs text-muted-foreground hover:text-muted-foreground cursor-pointer flex items-center gap-1 select-none">
          <Info className="w-3 h-3" />Como foi calculado
        </summary>
        <div className="mt-2 p-3 rounded-lg bg-obsidian/40 border border-border/20 space-y-1.5 text-xs text-muted-foreground font-mono">
          <p>Odds justas = 1 ÷ {num(marketProb, 2)} = {num((1 / marketProb), 2)}x</p>
          <p>b (ganho líquido) = {num((1 / marketProb), 2)} − 1 = {num((1 / marketProb - 1), 2)}</p>
          <p>EV = {num(yourProb, 2)} × {num((1 / marketProb - 1), 2)} − {num((1 - yourProb), 2)} = {num(ev, 3)}</p>
          <p>Kelly = (b×p − q) ÷ b = {num(kelly, 3)}</p>
        </div>
      </details>
    </div>
  );
}
