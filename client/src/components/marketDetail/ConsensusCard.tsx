/**
 * ConsensusCard — consenso JLB (mercado + IA + comunidade via agregacao logit).
 * Extraido de pages/MarketDetail.tsx.
 */
import { GitMerge } from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";
import { computeConsensus, marketWeight, aiWeight, communityWeight, type ConsensusSignal } from "@/lib/consensus";
import { type MarketBasic, type CommunityForecast, type AiResult } from "@/components/marketDetail/types";
import { Explain } from "@/components/marketDetail/Explain";

// ── Consensus Card ──────────────────────────────────────────────────────────────
// Unifica os 3 sinais (mercado + IA + comunidade) num número calibrado via
// agregação logit extremizada ponderada por skill (Good Judgment Project).

export function ConsensusCard({ market, community, ai, trackRecord }: {
  market: MarketBasic;
  community: CommunityForecast | null;
  ai: AiResult | null;
  trackRecord: { skillVsMarket: number | null; resolvedCount: number } | null;
}) {
  const marketPct = Math.round(market.yesProb * 100);

  const signals: ConsensusSignal[] = [];
  const mw = marketWeight(market.liquidity);
  signals.push({ name: "Mercado", prob: marketPct, weight: mw.weight, note: mw.note });

  if (ai?.fairValue != null) {
    const aw = aiWeight({ skillVsMarket: trackRecord?.skillVsMarket, resolvedCount: trackRecord?.resolvedCount, confidence: ai.confidence });
    signals.push({ name: "IA JLB", prob: ai.fairValue, weight: aw.weight, note: aw.note });
  }
  if (community && community.n_forecasters >= 1) {
    const cw = communityWeight(community.n_forecasters);
    if (cw.weight > 0) signals.push({ name: "Comunidade", prob: Number(community.median_prob), weight: cw.weight, note: cw.note });
  }

  const result = computeConsensus(signals);
  if (!result) return null;

  // Fonte única (só o mercado): o "consenso" É o próprio preço do mercado, que já é o
  // herói no topo da tela. Em vez de clonar um segundo número grande competindo com o
  // herói, mostra um convite compacto pra enriquecer o consenso com a IA/comunidade.
  if (result.nSources === 1) {
    return (
      <AnimatedSection delay={0.12}>
        <div className="glass-card rounded-xl p-5 border border-gold/20 bg-gold/3 flex items-start gap-3">
          <GitMerge className="w-4 h-4 text-gold shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Consenso JLB</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Só o mercado pesa por enquanto. Rode a <span className="text-gold font-medium">Análise por IA</span> abaixo
              para somar o sinal da IA (e a comunidade) e calibrar um consenso próprio, com a divergência vs. o mercado.
            </p>
          </div>
        </div>
      </AnimatedSection>
    );
  }

  const diff = result.consensus - marketPct;
  const diffColor = Math.abs(diff) < 3 ? "text-muted-foreground" : diff > 0 ? "text-positive" : "text-negative";
  const agreePct = Math.round(result.agreement * 100);
  const agreeLabel = agreePct >= 75 ? "forte" : agreePct >= 45 ? "moderada" : "baixa";
  const agreeColor = agreePct >= 75 ? "text-positive" : agreePct >= 45 ? "text-gold" : "text-negative";

  return (
    <AnimatedSection delay={0.12}>
      <div className="glass-card rounded-xl p-5 border border-gold/25 bg-gold/3">
        <div className="flex items-center gap-2 mb-4">
          <GitMerge className="w-4 h-4 text-gold" />
          <h2 className="text-sm font-semibold text-foreground">Consenso JLB</h2>
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gold/15 border border-gold/30 text-gold">{result.nSources} {result.nSources === 1 ? "fonte" : "fontes"}</span>
          <span className="ml-auto text-[10px] text-muted-foreground/60">agregação logit extremizada</span>
        </div>

        <div className="mb-4">
          <Explain>
            Aqui juntamos três opiniões — o <strong className="text-foreground">mercado</strong>, a <strong className="text-foreground">IA do JLB</strong>{" "}
            e a <strong className="text-foreground">comunidade</strong> — num único número calibrado (cada fonte pesa conforme a confiabilidade dela).
            Quando o consenso difere bastante do mercado, pode haver uma oportunidade — ou um erro de preço — a investigar. A barra de{" "}
            <strong className="text-foreground">concordância</strong> mostra o quanto as fontes concordam entre si: quanto mais forte, mais sólido o número.
          </Explain>
        </div>

        {/* Número principal + intervalo */}
        <div className="flex items-end gap-4 flex-wrap mb-4">
          <div>
            <p className="text-[10px] text-muted-foreground/60 uppercase">Estimativa de consenso</p>
            <p className="text-4xl font-mono font-bold text-gold leading-none">{result.consensus}%</p>
            <p className="text-[10px] text-muted-foreground mt-1">IC 80%: {result.low}%–{result.high}%</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground/60 uppercase">vs Mercado</p>
            <p className={`text-xl font-mono font-bold ${diffColor}`}>{diff >= 0 ? "+" : ""}{diff}pp</p>
          </div>
          <div className="flex-1 min-w-[120px]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground/60 uppercase">Concordância</span>
              <span className={`text-[10px] font-semibold ${agreeColor}`}>{agreeLabel}</span>
            </div>
            <div className="h-1.5 bg-secondary/40 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${agreePct >= 75 ? "bg-positive" : agreePct >= 45 ? "bg-gold" : "bg-negative"}`} style={{ width: `${agreePct}%` }} />
            </div>
          </div>
        </div>

        {/* Breakdown das fontes */}
        <div className="space-y-1.5 border-t border-border/15 pt-3">
          {result.sources.map((s) => (
            <div key={s.name} className="flex items-center gap-3">
              <span className="text-xs text-foreground w-24 shrink-0">{s.name}</span>
              <span className="text-xs font-mono text-foreground w-10 text-right">{s.prob}%</span>
              <div className="flex-1 h-1 bg-secondary/30 rounded-full overflow-hidden">
                <div className="h-full bg-gold/50 rounded-full" style={{ width: `${s.weight * 100}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground/60 w-16 text-right">peso {Math.round(s.weight * 100)}%</span>
              {s.note && <span className="hidden sm:block text-[10px] text-muted-foreground/50 w-32 truncate">{s.note}</span>}
            </div>
          ))}
        </div>

        {!ai?.fairValue && (
          <p className="text-[10px] text-muted-foreground/60 mt-3">
            💡 Rode a <span className="text-gold">Análise por IA</span> abaixo para incluir o sinal da IA e refinar o consenso.
          </p>
        )}
        <p className="text-[10px] text-muted-foreground/40 mt-2">
          Método Good Judgment Project (Satopää et al. 2014). Pesos por liquidez, track record da IA e tamanho da amostra. Não é recomendação de posição.
        </p>
      </div>
    </AnimatedSection>
  );
}
