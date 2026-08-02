/**
 * ComparePanel — barra fixa de comparacao de 2 mercados. Extraido de pages/Apostas.tsx.
 */
import { toast } from "sonner";
import { Scale, Link2, X as CloseX } from "lucide-react";
import { type TrendingItem, CATEGORY_LABELS, formatVolume } from "@/lib/trending";
import { SourceBadge } from "@/components/apostas/cards";

export function ComparePanel({ items, onClear }: { items: TrendingItem[]; onClear: () => void }) {
  const [a, b] = items;

  function insight(): string {
    if (!a || !b) return "";
    const parts: string[] = [];
    if (a.normalizedCategory === b.normalizedCategory && a.normalizedCategory !== "other")
      parts.push(`Ambos são mercados de ${CATEGORY_LABELS[a.normalizedCategory].toLowerCase()}`);
    const volA = a.volume ?? 0;
    const volB = b.volume ?? 0;
    if (volA > 0 && volB > 0) {
      const ratio = Math.max(volA, volB) / Math.min(volA, volB);
      if (ratio >= 2)
        parts.push(`${volA > volB ? a.source === "polymarket" ? "Polymarket" : "Kalshi" : b.source === "polymarket" ? "Polymarket" : "Kalshi"} tem ${ratio.toFixed(0)}× mais volume`);
    }
    const probA = a.yesProb ?? 0.5;
    const probB = b.yesProb ?? 0.5;
    const bothAbove = probA > 0.6 && probB > 0.6;
    const bothBelow = probA < 0.4 && probB < 0.4;
    if (bothAbove) parts.push("Ambos têm consenso de probabilidade alta (>60%)");
    if (bothBelow) parts.push("Ambos têm baixa probabilidade (<40%) — possíveis contrárias");
    if (a.source !== b.source)
      parts.push(`Fontes diferentes: compare a liquidez antes de entrar nos dois`);
    return parts.length > 0 ? parts.join(" · ") : "Mercados de naturezas distintas — correlação baixa esperada.";
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/40 bg-background/95 backdrop-blur-xl shadow-2xl">
      <div className="container py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-neon-blue" aria-hidden="true" />
            <span className="text-sm font-semibold text-foreground">Comparação de Mercados</span>
            {items.length < 2 && (
              <span className="text-xs text-muted-foreground">— selecione um segundo mercado</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                  toast("Link copiado!", { description: "Cole em qualquer lugar para compartilhar a comparação." });
                });
              }}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md border border-border/30"
            >
              <Link2 className="w-3 h-3" />
              Copiar link
            </button>
            <button onClick={onClear} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors" aria-label="Fechar comparação">
              <CloseX className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((item, idx) => {
            const pct = item.yesProb !== undefined ? parseFloat((item.yesProb * 100).toFixed(1)) : null;
            const pctColor = pct === null ? "text-muted-foreground" : pct >= 70 ? "text-positive" : pct <= 30 ? "text-negative" : "text-gold";
            return (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/30 bg-secondary/10">
                <div className="w-6 h-6 rounded-full bg-neon-blue/15 flex items-center justify-center shrink-0 text-xs font-bold text-neon-blue">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{item.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <SourceBadge source={item.source} subreddit={item.subreddit} />
                    {item.volume !== undefined && (
                      <span className="text-[10px] text-muted-foreground">{formatVolume(item.volume)}</span>
                    )}
                  </div>
                </div>
                {pct !== null && (
                  <div className="shrink-0 text-right">
                    <p className={`text-xl font-bold font-mono ${pctColor}`}>{pct}%</p>
                    <p className="text-[9px] text-muted-foreground">SIM</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Placeholder for second slot */}
          {items.length < 2 && (
            <div className="flex items-center justify-center p-3 rounded-xl border border-dashed border-border/30 text-muted-foreground/40">
              <p className="text-xs">Clique em <Scale className="w-3 h-3 inline mx-0.5" /> num segundo mercado</p>
            </div>
          )}
        </div>

        {items.length === 2 && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-neon-blue/5 border border-neon-blue/15">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              <span className="text-neon-blue font-semibold">Análise: </span>{insight()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
