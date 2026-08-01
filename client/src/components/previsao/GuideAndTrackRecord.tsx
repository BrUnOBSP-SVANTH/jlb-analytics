/**
 * Guia do protocolo Superforecaster + Track Record da IA (Previsão Guiada).
 * Extraídos de pages/Previsao.tsx. Comportamento idêntico.
 */
import { useState, useEffect } from "react";
import AnimatedSection from "@/components/AnimatedSection";
import { BarChart2, CheckCircle } from "lucide-react";
import { SF_STEPS } from "@/components/previsao/ResultCards";

export function SuperforecasterGuide() {
  const [open, setOpen] = useState(false);

  return (
    <AnimatedSection>
      <div className={`glass-card rounded-xl border transition-colors ${open ? "border-neon-blue/30" : "border-border/20"}`}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-secondary/10 transition-colors"
        >
          <span className="text-lg">🎯</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Como Superforecasters chegam a previsões precisas</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              O protocolo de 4 etapas do Good Judgment Project (Philip Tetlock) — base da nossa IA
            </p>
          </div>
          <span className="text-xs text-muted-foreground/60 shrink-0">
            {open ? "Fechar" : "Ver protocolo"}
          </span>
        </button>

        {open && (
          <div className="px-5 pb-5 space-y-3 border-t border-border/20">
            <p className="text-xs text-muted-foreground mt-4">
              Superforecasters do GJP têm Brier Score médio de <strong className="text-foreground">0.10</strong> —
              superando inteligência da CIA e modelos de banco de investimento.
              A nossa IA aplica exatamente este protocolo em cada análise.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {SF_STEPS.map((s) => (
                <div key={s.step} className={`p-4 rounded-xl border ${s.border} ${s.bg} space-y-2`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{s.icon}</span>
                    <span className={`text-[10px] font-mono font-bold ${s.color}`}>ETAPA {s.step}</span>
                  </div>
                  <p className={`text-xs font-semibold ${s.color}`}>{s.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{s.desc}</p>
                  <div className="p-2 rounded-lg bg-secondary/30 mt-1">
                    <p className="text-[10px] text-muted-foreground/70 italic leading-relaxed">{s.example}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center pt-2">
              Referência: Tetlock & Gardner (2015) "Superforecasting: The Art and Science of Prediction" ·
              Good Judgment Project · Kahneman & Tversky (1979)
            </p>
          </div>
        )}
      </div>
    </AnimatedSection>
  );
}

// ── AI Track Record ───────────────────────────────────────────────────────────

interface TrackRecordData {
  available: boolean;
  resolvedCount: number;
  totalCount: number;
  aiBrier: number | null;
  marketBrier: number | null;
  beatMarketPct: number | null;
  avgAbsEdge: number | null;
  skillVsMarket: number | null;
}

export function AiTrackRecord() {
  const [data, setData] = useState<TrackRecordData | null>(null);

  useEffect(() => {
    fetch("/api/ai/track-record")
      .then((r) => r.ok ? r.json() as Promise<TrackRecordData> : null)
      .then((d) => { if (d?.available) setData(d); })
      .catch(() => {});
  }, []);

  if (!data) return null;

  // Histórico ainda em construção — estado honesto e substantivo (a máquina já
  // roda). Corte em 20 resolvidas: abaixo disso o Brier é ruído estatístico,
  // não evidência — exibir números com n pequeno mina a credibilidade.
  if (data.resolvedCount < 20) {
    return (
      <AnimatedSection>
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-gold shrink-0" />
            <p className="text-sm font-semibold text-foreground">Track record da IA — em construção</p>
            <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-gold/25 bg-gold/10 text-gold/90">honesto</span>
          </div>
          <div className="flex items-end gap-5">
            <div className="shrink-0">
              <p className="numeric-hero text-5xl text-foreground leading-none">{data.totalCount}</p>
              <p className="text-[10px] text-muted-foreground mt-1.5">previsões<br />sendo acompanhadas</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed flex-1">
              Cada previsão da IA é registrada com data e <span className="text-foreground">fair value</span>, e
              comparada ao mercado <span className="text-foreground">quando ele resolve</span> — sem cherry-picking.
              O <span className="text-foreground">Brier Score</span> (calibração real, IA vs. mercado) aparece aqui
              quando houver 20+ previsões resolvidas ({data.resolvedCount}/20) — antes disso é ruído, não evidência.
            </p>
          </div>
        </div>
      </AnimatedSection>
    );
  }

  const beatMarket = data.skillVsMarket !== null && data.skillVsMarket > 0;
  return (
    <AnimatedSection>
      <div className="glass-card rounded-xl p-5 border border-positive/20 bg-positive/3">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-4 h-4 text-positive" />
          <p className="text-sm font-semibold text-foreground">Track Record verificado da nossa IA</p>
          <span className="ml-auto text-[10px] text-muted-foreground/60">{data.resolvedCount} previsões resolvidas</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-gold">{data.aiBrier?.toFixed(3)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Brier da IA</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-muted-foreground">{data.marketBrier?.toFixed(3)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Brier do mercado</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-mono font-bold ${beatMarket ? "text-positive" : "text-muted-foreground"}`}>
              {data.beatMarketPct}%
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Bateu o mercado</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-foreground">±{data.avgAbsEdge}pp</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Edge médio</p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-3 text-center">
          {beatMarket
            ? `A IA da JLB está mais calibrada que o mercado (Brier menor = melhor) em previsões já resolvidas.`
            : `Comparação honesta: Brier menor = mais calibrado. Atualizado conforme mercados resolvem.`}
        </p>
      </div>
    </AnimatedSection>
  );
}
