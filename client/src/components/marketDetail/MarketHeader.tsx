/**
 * MarketHeader — cabeçalho da tela de detalhe (fonte, categoria, link externo,
 * título e nota de boas-vindas). Extraído de pages/MarketDetail.tsx. Só lê `market`.
 */
import AnimatedSection from "@/components/AnimatedSection";
import { ExternalLink } from "lucide-react";
import { type MarketBasic } from "@/components/marketDetail/types";

export function MarketHeader({ market }: { market: MarketBasic }) {
  return (
    <AnimatedSection delay={0.05}>
      <div className="glass-card rounded-xl p-6 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider">
            {market.source}
          </span>
          {market.category && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-secondary/30 text-muted-foreground border border-border/20 uppercase tracking-wider">
              {market.category}
            </span>
          )}
          <a
            href={market.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Ver no {market.source === "kalshi" ? "Kalshi" : "Polymarket"}
          </a>
        </div>
        <h1 className="text-2xl font-bold text-[var(--titulo)] leading-snug">{market.title}</h1>
        <p className="text-xs text-muted-foreground/70 leading-relaxed">
          Esta tela reúne tudo sobre este mercado — o preço atual, o histórico, o consenso das fontes e as ferramentas
          para você decidir com lógica, não no achismo. Abaixo, cada seção explica o que mostra e como usar.
        </p>
      </div>
    </AnimatedSection>
  );
}
