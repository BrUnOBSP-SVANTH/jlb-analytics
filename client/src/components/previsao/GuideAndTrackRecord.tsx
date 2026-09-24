/**
 * Guia do protocolo Superforecaster + Track Record da IA (Previsão Guiada).
 * Extraídos de pages/Previsao.tsx. Comportamento idêntico.
 */
import { useState, useEffect } from "react";
import AnimatedSection from "@/components/AnimatedSection";
import { BarChart2, CheckCircle, Scale, ChevronDown } from "lucide-react";
import { pct, num } from "@shared/formato";
import { BRIER_SUPERFORECASTER, FONTE_SUPERFORECASTER } from "@shared/referencias";
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
          {/* PRV-07: em cinza de texto secundário, sem sublinhado e sem
              affordance, "Ver protocolo" lia-se como rótulo desabilitado — a
              auditoria não percebeu que era clicável. O que é interativo tem que
              parecer interativo. */}
          <span className="text-xs font-medium text-gold shrink-0 inline-flex items-center gap-1">
            {open ? "Fechar" : "Ver protocolo"}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </span>
        </button>

        {open && (
          <div className="px-5 pb-5 space-y-3 border-t border-border/20">
            <p className="text-xs text-muted-foreground mt-4">
              Superforecasters do {FONTE_SUPERFORECASTER} sustentam Brier Score em torno de{" "}
              <strong className="text-foreground">{num(BRIER_SUPERFORECASTER, 2)}</strong> — melhor que
              analistas de inteligência com acesso a material sigiloso. A nossa IA aplica esse mesmo
              protocolo em cada análise.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {SF_STEPS.map((s) => (
                <div key={s.step} className={`p-4 rounded-xl border ${s.border} ${s.bg} space-y-2`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{s.icon}</span>
                    <span className={`text-[11px] font-mono font-bold ${s.color}`}>ETAPA {s.step}</span>
                  </div>
                  <p className={`text-xs font-semibold ${s.color}`}>{s.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{s.desc}</p>
                  <div className="p-2 rounded-lg bg-secondary/30 mt-1">
                    <p className="text-[11px] text-muted-foreground italic leading-relaxed">{s.example}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground text-center pt-2">
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

/** Quanto uma parte representa do todo, em 0–100. `null` sem todo: sem
 *  denominador não se publica porcentagem. */
function fatia(parte: number | null | undefined, todo: number | null | undefined): number | null {
  if (parte == null || !todo) return null;
  return Math.round((parte / todo) * 100);
}

interface TrackRecordData {
  available: boolean;
  resolvedCount: number;
  totalCount: number;
  aiBrier: number | null;
  marketBrier: number | null;
  beatMarketPct: number | null;
  /** A divisão COMPLETA contra o preço: quantos comparáveis, quantos empatados
   *  e quantos perdidos. Sem os três, "melhor em 14%" insinua "pior em 86%". */
  beatMarketCount?: number | null;
  comparableCount?: number | null;
  tiedMarketCount?: number | null;
  lostMarketCount?: number | null;
  avgAbsEdge: number | null;
  skillVsMarket: number | null;
  hitRate: number | null;          // taxa de acerto direcional da IA (migration 018)
  marketHitRate: number | null;    // idem para o mercado (baseline)
  directionalCount: number;
  settledCount: number;            // quantas resolvidas pelo resultado oficial
  edgeRate: number | null;         // acerto QUANDO divergimos do preço
  edgeCount: number;
  minAmostra: number;              // a régua de amostra do site inteiro
  openCount: number;
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
  // roda). O corte é a régua única do site (MIN_AMOSTRA, servida pelo endpoint):
  // abaixo disso o Brier é ruído estatístico, não evidência. Tê-la escrita à mão
  // aqui foi como o site acabou com quatro mínimos diferentes na mesma tela.
  const minimo = data.minAmostra ?? 20;
  if (data.resolvedCount < minimo) {
    return (
      <AnimatedSection>
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-gold shrink-0" />
            <p className="text-sm font-semibold text-foreground">Track record da IA — em construção</p>
            <span className="ml-auto text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-gold/25 bg-gold/10 text-gold/90">honesto</span>
          </div>
          <div className="flex items-end gap-5">
            <div className="shrink-0">
              <p className="numeric-hero text-5xl text-foreground leading-none">{data.totalCount}</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">previsões<br />sendo acompanhadas</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed flex-1">
              Cada previsão da IA é registrada com data e <span className="text-foreground">fair value</span>, e
              comparada ao mercado <span className="text-foreground">quando ele resolve</span> — sem cherry-picking.
              O <span className="text-foreground">Brier Score</span> (calibração real, IA vs. mercado) aparece aqui
              quando houver {minimo}+ previsões resolvidas ({data.resolvedCount}/{minimo}) — antes disso é ruído, não evidência.
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
          <span className="ml-auto text-[11px] text-muted-foreground">
            {data.resolvedCount} resolvidas{data.settledCount > 0 ? ` · ${data.settledCount} pelo resultado oficial` : ""}
          </span>
        </div>

        {/* Destaque: taxa de acerto do site vs. mercado (o número intuitivo) */}
        {data.hitRate !== null && (
          <div className="flex items-end gap-5 mb-4 pb-4 border-b border-border/15">
            <div className="shrink-0">
              <p className="numeric-hero text-5xl text-positive leading-none">{data.hitRate}%</p>
              <p className="text-[11px] text-muted-foreground mt-1.5">taxa de acerto<br />da nossa IA</p>
            </div>
            <p className="flex-1 text-xs text-muted-foreground leading-relaxed">
              Em {data.directionalCount} previsões com lado definido, a IA acertou a direção
              (SIM/NÃO) <span className="text-foreground font-semibold">{data.hitRate}%</span> das vezes.
              {data.marketHitRate !== null && (
                <> O mercado, no mesmo conjunto, acertou <span className="text-foreground font-semibold">{data.marketHitRate}%</span>
                {" — "}{data.hitRate === data.marketHitRate
                  ? "empatamos com o consenso."
                  : hitBeatsMarket ? "superamos o consenso." : "ainda atrás do consenso, e mostramos isso mesmo assim."}</>
              )}
            </p>
          </div>
        )}

        {/* Calibração fina (rigor: Brier Score) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-gold">{num(data.aiBrier, 3)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Brier da IA</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-muted-foreground">{num(data.marketBrier, 3)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Brier do mercado</p>
          </div>
          {/* O rótulo era "Bateu o mercado" — as MESMAS palavras que a tela de
              análise usa para outra medida (acerto ao divergir). Na auditoria os
              dois números apareciam como 12% e 43% na mesma página, e a leitura
              natural é que um dos dois é maquiagem. Agora cada um diz o que mede. */}
          {/* ⚠️ "14% melhor calibrada que o mercado" se lia como "14% MELHOR"
              — e, pior, sugeria que nos outros 86% a IA perdeu. Boa parte é
              EMPATE exato (Auditoria 21/09, IAC-02). Os três números juntos
              respondem a pergunta; um sozinho insinua outra. */}
          <div className="text-center">
            <p className={`text-2xl font-mono font-bold ${beatMarket ? "text-positive" : "text-muted-foreground"}`}>
              {pct(data.beatMarketPct)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Dos mercados, ficamos<br />melhor que o preço</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-foreground">{num(data.avgAbsEdge, 1)} pp</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Distância média<br />do preço</p>
          </div>
        </div>
        {/* A divisão COMPLETA contra o preço. Sem ela, "melhor em 14%" deixa o
            leitor preencher os 86% com "pior" — e a maior parte é empate. */}
        {data.comparableCount != null && data.tiedMarketCount != null && data.lostMarketCount != null && (
          <p className="text-xs text-muted-foreground mt-3 text-center leading-relaxed">
            Nos {num(data.comparableCount)} mercados comparáveis: ficamos{" "}
            <strong className="text-foreground">melhor em {pct(fatia(data.beatMarketCount, data.comparableCount))}</strong>,{" "}
            <strong className="text-foreground">empatamos em {pct(fatia(data.tiedMarketCount, data.comparableCount))}</strong> e{" "}
            <strong className="text-foreground">ficamos pior em {pct(fatia(data.lostMarketCount, data.comparableCount))}</strong>.
            {" "}Empate quer dizer que a IA publicou exatamente o preço do mercado — o que acontece com frequência,
            porque ela parte dele.
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-3 text-center leading-relaxed">
          Taxa de acerto = direção certa (SIM/NÃO), sobre as {num(data.directionalCount)} previsões com lado.
          Brier = calibração fina (menor é melhor), sobre as {num(data.resolvedCount)} resoluções.
          {/* ⚠️ Aqui se afirmava "todos os números desta página dividem pelas
              mesmas N resoluções" — e era falso justamente para a taxa de
              acerto, que divide pelas com lado. Num site que ensina a conferir
              denominador, a página errava o próprio. */}
          {" "}São denominadores diferentes de propósito: 50% exato não erra nem acerta direção.
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
  aiSided: boolean; marketSided: boolean;  // false = previu ~50% (sem lado definido)
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

  // Só conta como acerto/erro as previsões com LADO definido (≠ 50%); as "sem
  // lado" ficam fora do denominador, alinhado à taxa direcional da view.
  const sided = items.filter((i) => i.aiSided);
  const hits = sided.filter((i) => i.aiHit).length;

  return (
    <AnimatedSection>
      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-1">
          <Scale className="w-4 h-4 text-neon-blue shrink-0" />
          <p className="text-sm font-semibold text-foreground">Comparador: o que dissemos × o que aconteceu</p>
          <span className="ml-auto text-[11px] text-muted-foreground">{hits}/{sided.length} acertos recentes</span>
        </div>
        <p className="text-[11px] text-muted-foreground mb-4">
          Cada previsão da IA confrontada com o resultado que a plataforma liquidou de verdade.
        </p>
        <div className="space-y-2">
          {items.map((it) => {
            // Sem lado (≈50%) = a IA não opinou → marcador neutro, nunca "erro".
            const badge = !it.aiSided
              ? { cls: "bg-secondary/40 text-muted-foreground", mark: "–" }
              : it.aiHit
                ? { cls: "bg-positive/15 text-positive", mark: "✓" }
                : { cls: "bg-negative/15 text-negative", mark: "✗" };
            return (
            <div key={`${it.source}-${it.marketId}`} className="flex items-center gap-3 p-3 rounded-lg border border-border/15 bg-secondary/10">
              <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${badge.cls}`}>
                {badge.mark}
              </span>
              <div className="flex-1 min-w-0">
                {/* `data-fonte="externa"`: este texto é o título do mercado
                    COMO A PLATAFORMA PUBLICA — "WTI Crude Oil… 67.5". Ele tem
                    ponto decimal porque é em inglês, e reformatá-lo seria
                    adulterar a citação. O detector de número fora do padrão
                    (pnpm varredura) pula o que está marcado assim: a regra vale
                    para os NOSSOS números, não para os que citamos. */}
                <p className="text-xs text-foreground truncate" data-fonte="externa">{it.title}</p>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 mt-1 text-[11px] text-muted-foreground">
                  <span>IA: <span className="text-foreground font-semibold">{it.aiProb}%</span> SIM</span>
                  <span className="text-muted-foreground">·</span>
                  <span>Mercado: {it.marketProb}%</span>
                  <span className="text-muted-foreground">·</span>
                  <span>Real: <span className={it.outcome ? "text-positive font-semibold" : "text-negative font-semibold"}>{it.outcome ? "SIM" : "NÃO"}</span></span>
                </div>
              </div>
              {/* PRV-06: o selo aparecia em TODAS as linhas, e um selo que
                  nunca falta não distingue nada — vira ruído com cara de
                  informação. A metodologia da própria página diz que o padrão é
                  o resultado oficial; então marcamos só a EXCEÇÃO. */}
              <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${it.official ? "hidden" : "border-warning/30 bg-warning/10 text-warning"}`}>
                {it.official ? "" : "inferido"}
              </span>
            </div>
            );
          })}
        </div>
      </div>
    </AnimatedSection>
  );
}
