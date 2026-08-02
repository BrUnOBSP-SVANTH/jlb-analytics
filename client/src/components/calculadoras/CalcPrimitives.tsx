/**
 * CalcPrimitives — blocos visuais compartilhados das calculadoras (wrapper, caixa
 * de resultado/formula/insight, intro educacional) + classes de input. Extraido
 * de pages/Calculadoras.tsx. Pre-requisito dos 4 calculadores.
 */
import { type LucideIcon, Info } from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";

export const inputClass =
  "w-full mt-1.5 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
export const labelClass = "text-xs text-muted-foreground uppercase tracking-wider";

// ─── Educational intro ──────────────────────────────────────────────────────

export function ToolIntro({ icon: Icon, tagline, description, example, accuracy }: {
  icon: LucideIcon;
  tagline: string;
  description: string;
  example: string;
  accuracy?: { label: string; value: string; color: string };
}) {
  return (
    <AnimatedSection>
      <div className="mb-6 flex gap-4 p-5 rounded-xl border border-primary/20 bg-primary/5">
        <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-1 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{tagline}</p>
            {accuracy && (
              <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${accuracy.color}`}>
                {accuracy.label}: {accuracy.value}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          <p className="text-xs text-primary/80 font-medium mt-2">Exemplo: {example}</p>
        </div>
      </div>
    </AnimatedSection>
  );
}

// ─── Shared sub-components ──────────────────────────────────────────────────

export function CalcCard({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <AnimatedSection>
      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <Icon className="w-5 h-5 text-neon-blue" aria-hidden="true" />
          <h3 className="font-display font-semibold text-foreground">{title}</h3>
        </div>
        {children}
      </div>
    </AnimatedSection>
  );
}

export function ResultBox({ label, value, color = "text-foreground", sub }: {
  label: string; value: string; color?: string; sub?: string;
}) {
  return (
    <div className="p-4 rounded-lg bg-obsidian/50 border border-border/20">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-mono font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>}
    </div>
  );
}

export function FormulaBox({ formula, legend }: { formula: string; legend?: string }) {
  return (
    <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Fórmula</p>
      <p className="font-mono text-sm text-gold">{formula}</p>
      {legend && <p className="text-xs text-muted-foreground mt-1">{legend}</p>}
    </div>
  );
}

export function InsightBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
      <div className="flex gap-2">
        <Info className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
