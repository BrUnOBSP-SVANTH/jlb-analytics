/**
 * Guia do protocolo Superforecaster + Track Record da IA (Previsão Guiada).
 * Extraídos de pages/Previsao.tsx. Comportamento idêntico.
 */
import { useState, useEffect } from "react";
import AnimatedSection from "@/components/AnimatedSection";
import { BarChart2, CheckCircle, Scale } from "lucide-react";
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
  hitRate: number | null;          // taxa de acerto direcional da IA (migration 018)
  marketHitRate: number | null;    // idem para o mercado (baseline)
  directionalCount: number;
  settledCount: number;            // quantas resolvidas pelo resultado oficial
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
  const hitBeatsMarket = data.hitRate !== null && data.marketHitRate !== null && data.hitRate >= data.marketHitRate;
  return (
    <AnimatedSection>
      <div className="glass-card rounded-xl p-5 border border-positive/20 bg-positive/3">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="w-4 h-4 text-positive" />
          <p className="text-sm font-semibold text-foreground">Track Record verificado da nossa IA</p>
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            {data.resolvedCount} resolvidas{data.settledCount > 0 ? ` · ${data.settledCount} pelo resultado oficial` : ""}
          </span>
        </div>

        {/* Destaque: taxa de acerto do site vs. mercado (o número intuitivo) */}
        {data.hitRate !== null && (
          <div className="flex items-end gap-5 mb-4 pb-4 border-b border-border/15">
            <div className="shrink-0">
              <p className="numeric-hero text-5xl text-positive leading-none">{data.hitRate}%</p>
              <p className="text-[10px] text-muted-foreground mt-1.5">taxa de acerto<br />da nossa IA</p>
            </div>
            <p className="flex-1 text-xs text-muted-foreground leading-relaxed">
              Em {data.directionalCount} previsões com lado definido, a IA acertou a direção
              (SIM/NÃO) <span className="text-foreground font-semibold">{data.hitRate}%</span> das vezes.
              {data.marketHitRate !== null && (
                <> O mercado, no mesmo conjunto, acertou <span className="text-foreground font-semibold">{data.marketHitRate}%</span>
                {" — "}{hitBeatsMarket ? "empatamos ou superamos o consenso." : "ainda atrás do consenso, e mostramos isso mesmo assim."}</>
              )}
            </p>
          </div>
        )}

        {/* Calibração fina (rigor: Brier Score) */}
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
          Taxa de acerto = direção certa (SIM/NÃO). Brier = calibração fina (menor = melhor).
          Tudo comparado ao resultado real da plataforma quando o mercado resolve — sem cherry-picking.
        </p>
      </div>
    </AnimatedSection>
  );
}

// ── Comparador: nossa previsão × mercado × resultado real ──────────────────────
// A tela que o usuário pediu: cada previsão da IA confrontada, caso a caso, com o
// que a plataforma liquidou de verdade. Badge "oficial" vs "inferido" deixa claro
// de onde veio o resultado — transparência total.

interface ResolvedItem {
  marketId: string; source: string; title: string; category: string | null;
  aiProb: number; marketProb: number; outcome: boolean;
  aiHit: boolean; marketHit: boolean; official: boolean; resolvedAt: string | null;
}

export function ResultComparator({ limit = 8 }: { limit?: number }) {
  const [items, setItems] = useState<ResolvedItem[] | null>(null);

  useEffect(() => {
    fetch(`/api/ai/resolved?limit=${limit}`)
      .then((r) => r.ok ? r.json() as Promise<{ available: boolean; items: ResolvedItem[] }> : null)
      .then((d) => { if (d?.available) setItems(d.items); })
      .catch(() => {});
  }, [limit]);

  if (!items || items.length === 0) return null;

  const hits = items.filter((i) => i.aiHit).length;

  return (
    <AnimatedSection>
      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-1">
          <Scale className="w-4 h-4 text-neon-blue shrink-0" />
          <p className="text-sm font-semibold text-foreground">Comparador: o que dissemos × o que aconteceu</p>
          <span className="ml-auto text-[10px] text-muted-foreground/60">{hits}/{items.length} acertos recentes</span>
        </div>
        <p className="text-[11px] text-muted-foreground mb-4">
          Cada previsão da IA confrontada com o resultado que a plataforma liquidou de verdade.
        </p>
        <div className="space-y-2">
          {items.map((it) => (
            <div key={`${it.source}-${it.marketId}`} className="flex items-center gap-3 p-3 rounded-lg border border-border/15 bg-secondary/10">
              <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${it.aiHit ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"}`}>
                {it.aiHit ? "✓" : "✗"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{it.title}</p>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[10px] text-muted-foreground">
                  <span>IA: <span className="text-foreground font-semibold">{it.aiProb}%</span> SIM</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>Mercado: {it.marketProb}%</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>Real: <span className={it.outcome ? "text-positive font-semibold" : "text-negative font-semibold"}>{it.outcome ? "SIM" : "NÃO"}</span></span>
                </div>
              </div>
              <span className={`shrink-0 text-[8px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${it.official ? "border-positive/25 bg-positive/10 text-positive/90" : "border-border/25 bg-secondary/20 text-muted-foreground/70"}`}>
                {it.official ? "oficial" : "inferido"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
}
