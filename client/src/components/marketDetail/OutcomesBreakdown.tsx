/**
 * OutcomesBreakdown — desfechos possíveis de mercados multi-resultado (negRisk):
 * mostra TODAS as possibilidades com a probabilidade real, como no Polymarket.
 * Extraído de pages/MarketDetail.tsx. Só renderiza quando há >2 desfechos.
 */
import AnimatedSection from "@/components/AnimatedSection";
import { BarChart2 } from "lucide-react";
import { type MarketBasic } from "@/components/marketDetail/types";
import { Explain } from "@/components/marketDetail/Explain";

export function OutcomesBreakdown({ market }: { market: MarketBasic }) {
  const outcomes = market.parsedOutcomes;
  if (!outcomes || outcomes.length <= 2) return null;
  return (
    <AnimatedSection delay={0.09}>
      <div className="glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-neon-blue" />
          <h2 className="text-sm font-semibold text-[var(--titulo)]">Desfechos possíveis</h2>
          <span className="ml-auto text-[10px] text-muted-foreground/60">{outcomes.length} opções · fonte: {market.source}</span>
        </div>
        <Explain>
          Este mercado tem <strong className="text-foreground">mais de dois desfechos</strong>. Cada linha é uma
          possibilidade e a probabilidade real que o mercado dá a ela (somam ~100%). É o retrato honesto do que
          está sendo precificado — não só o "SIM/NÃO" do desfecho líder.
        </Explain>
        <div className="space-y-2">
          {outcomes.map((o) => {
            const pct = Math.round(o.prob * 100);
            const barColor = pct >= 40 ? "bg-positive" : pct >= 15 ? "bg-gold" : "bg-neon-blue/60";
            const txtColor = pct >= 40 ? "text-positive" : pct >= 15 ? "text-gold" : "text-muted-foreground";
            return (
              <div key={o.label} className="flex items-center gap-3">
                <span className="text-xs text-foreground w-40 sm:w-56 shrink-0 truncate" title={o.label}>{o.label}</span>
                <div className="flex-1 h-2 bg-secondary/40 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${Math.max(1, pct)}%` }} />
                </div>
                <span className={`text-sm font-mono font-bold w-11 text-right shrink-0 ${txtColor}`}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </AnimatedSection>
  );
}
