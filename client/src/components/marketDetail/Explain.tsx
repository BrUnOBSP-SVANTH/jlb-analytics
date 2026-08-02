/**
 * Explain — nota educacional de secao (o que e + como ajuda a decidir).
 * Extraido de pages/MarketDetail.tsx.
 */
import { type ReactNode } from "react";
import { Info } from "lucide-react";

// ── Explain: nota educacional de seção ───────────────────────────────────────
// "O que é este tópico + como ele te ajuda a decidir." Sempre visível e leve —
// a plataforma é de educação, então explicar cada número é parte do produto.
export function Explain({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-neon-blue/[0.04] border border-neon-blue/15 px-3 py-2">
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-neon-blue/70" aria-hidden="true" />
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
