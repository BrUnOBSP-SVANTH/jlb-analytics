/**
 * OutcomesBreakdown — desfechos possíveis de mercados multi-resultado (negRisk):
 * mostra TODAS as possibilidades com a probabilidade real, como no Polymarket.
 * Extraído de pages/MarketDetail.tsx. Só renderiza quando há >2 desfechos.
 */
import AnimatedSection from "@/components/AnimatedSection";
import { BarChart2 } from "lucide-react";
import { type MarketBasic } from "@/components/marketDetail/types";
import { Explain } from "@/components/marketDetail/Explain";
import { Termo } from "@/components/Termo";
import { pct } from "@shared/formato";

export function OutcomesBreakdown({ market }: { market: MarketBasic }) {
  const outcomes = market.parsedOutcomes;
  if (!outcomes || outcomes.length <= 2) return null;

  /**
   * DET-05: a tela afirmava "somam ~100%" e a decisão do Fed somava 102%.
   *
   * Normalizar as barras para fechar em 100 seria o conserto errado: mudaria os
   * preços que o mercado realmente pratica, e este site existe para não fazer
   * isso. O certo é mostrar a soma de verdade e dizer o que ela significa —
   * que, por sinal, é exatamente o conceito que a tela de Calculadoras ensina:
   *
   *   soma > 100%  → overround, a margem embutida pela plataforma;
   *   soma < 100%  → há desfechos fora da lista (a bolsa mostra só os maiores).
   */
  const soma = Math.round(outcomes.reduce((t, o) => t + o.prob * 100, 0));
  const fechaEmCem = soma >= 99 && soma <= 101;
  return (
    <AnimatedSection delay={0.09}>
      <div className="glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-neon-blue" />
          <h2 className="text-sm font-semibold text-[var(--titulo)]">Desfechos possíveis</h2>
          <span className="ml-auto text-[11px] text-muted-foreground">{outcomes.length} opções · fonte: {market.source}</span>
        </div>
        <Explain>
          Este mercado tem <strong className="text-foreground">mais de dois desfechos</strong>. Cada linha é uma
          possibilidade e a probabilidade que o mercado dá a ela. É o retrato do que está sendo precificado —
          não só o SIM/NÃO do desfecho líder.{" "}
          {fechaEmCem ? (
            <>As linhas somam <strong className="text-foreground">{pct(soma)}</strong>, como se espera.</>
          ) : soma > 101 ? (
            <>
              Repare que elas somam <strong className="text-foreground">{pct(soma)}</strong>, e não 100%. A
              diferença é o <Termo nome="overround">overround</Termo> — a margem que a plataforma embute no
              preço. Quanto maior, mais caro sai apostar em qualquer lado.
            </>
          ) : (
            <>
              Elas somam <strong className="text-foreground">{pct(soma)}</strong>: os{" "}
              <strong className="text-foreground">{pct(100 - soma)}</strong> que faltam estão em desfechos que a
              plataforma não lista individualmente, por serem pouco prováveis.
            </>
          )}
        </Explain>
        <div className="space-y-2">
          {outcomes.map((o) => {
            const valor = Math.round(o.prob * 100);
            const barColor = valor >= 40 ? "bg-positive" : valor >= 15 ? "bg-gold" : "bg-neon-blue/60";
            const txtColor = valor >= 40 ? "text-positive" : valor >= 15 ? "text-gold" : "text-muted-foreground";
            return (
              <div key={o.label} className="flex items-center gap-3">
                <span className="text-xs text-foreground w-40 sm:w-56 shrink-0 truncate" title={o.label}>{o.label}</span>
                <div className="flex-1 h-2 bg-secondary/40 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${Math.max(1, valor)}%` }} />
                </div>
                <span className={`text-sm font-mono font-bold w-11 text-right shrink-0 ${txtColor}`}>{pct(valor)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </AnimatedSection>
  );
}
