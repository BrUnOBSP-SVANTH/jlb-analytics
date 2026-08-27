/**
 * PositionCard — card de uma posição simulada (prob entrada/atual/Δ + P&L + excluir).
 * Extraído de pages/Portfolio.tsx. Comportamento idêntico.
 */
import { useState } from "react";
import { ExternalLink, Trash2 } from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";
import { calcPnl, pnlColor, fmt, type PortfolioPosition } from "@/components/portfolio/shared";

export function PositionCard({
  pos,
  onDelete,
}: {
  pos: PortfolioPosition;
  onDelete: (id: string) => void;
}) {
  const pnl = calcPnl(pos);
  const color = pnlColor(pnl);
  const entryPct = Math.round(pos.entryProb * 100);
  const curPct = pos.currentProb !== undefined ? Math.round(pos.currentProb * 100) : null;
  const delta = curPct !== null ? curPct - entryPct : null;
  const [showDelete, setShowDelete] = useState(false);

  return (
    <AnimatedSection>
      <div className="glass-card rounded-xl p-5 hover:border-primary/20 transition-colors">
        <div className="flex items-start gap-3 mb-3">
          <div className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            pos.position === "yes" ? "border-positive/30 bg-positive/10 text-positive" : "border-negative/30 bg-negative/10 text-negative"
          }`}>
            {pos.position === "yes" ? "SIM" : "NÃO"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 mb-1">{pos.title}</p>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className={`px-1.5 py-0.5 rounded-full border ${
                pos.source === "polymarket" ? "border-neon-blue/30 text-neon-blue" : "border-green-500/30 text-green-400"
              }`}>{pos.source === "polymarket" ? "Polymarket" : "Kalshi"}</span>
              <span>{new Date(pos.entryDate).toLocaleDateString("pt-BR")}</span>
            </div>
          </div>
          <a href={pos.externalUrl} target="_blank" rel="noopener noreferrer"
            className="text-muted-foreground/40 hover:text-primary transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Prob comparison */}
        <div className="grid grid-cols-3 gap-3 mb-3 text-center">
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Entrada</p>
            <p className="text-base font-mono font-bold text-foreground">{entryPct}%</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Atual</p>
            <p className={`text-base font-mono font-bold ${curPct !== null ? (delta !== null && delta > 0 ? "text-positive" : delta !== null && delta < 0 ? "text-negative" : "text-foreground") : "text-muted-foreground"}`}>
              {curPct !== null ? `${curPct}%` : "—"}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Δ Prob</p>
            <p className={`text-base font-mono font-bold ${delta !== null ? (delta > 0 ? "text-positive" : delta < 0 ? "text-negative" : "text-muted-foreground") : "text-muted-foreground"}`}>
              {delta !== null ? `${delta > 0 ? "+" : ""}${delta}pp` : "—"}
            </p>
          </div>
        </div>

        {/* P&L */}
        <div className="flex items-center justify-between text-xs pt-2 border-t border-border/20">
          <div className="flex items-center gap-3">
            <div>
              <p className="text-[9px] text-muted-foreground">Tamanho</p>
              <p className="font-mono text-foreground">${pos.betSize.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground">P&L simulado</p>
              <p className={`font-mono font-bold ${color}`}>
                {pnl !== null ? fmt(pnl) : "Carregando…"}
              </p>
            </div>
            {pnl !== null && (
              <div>
                <p className="text-[9px] text-muted-foreground">Retorno</p>
                <p className={`font-mono text-xs ${color}`}>
                  {pnl >= 0 ? "+" : ""}{((pnl / pos.betSize) * 100).toFixed(1)}%
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {showDelete ? (
              <>
                <button onClick={() => onDelete(pos.id)}
                  className="text-[10px] px-2 py-1 rounded bg-negative/15 border border-negative/30 text-negative hover:bg-negative/25 transition-colors">
                  Confirmar
                </button>
                <button onClick={() => setShowDelete(false)}
                  className="text-[10px] px-2 py-1 rounded border border-border/30 text-muted-foreground hover:text-foreground transition-colors">
                  Cancelar
                </button>
              </>
            ) : (
              <button onClick={() => setShowDelete(true)}
                className="p-1.5 rounded text-muted-foreground/40 hover:text-negative hover:bg-negative/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </AnimatedSection>
  );
}
