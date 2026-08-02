/**
 * MetricCard — cartao de metrica do resultado do backtest. Extraido de pages/Backtester.tsx.
 */
import { Info } from "lucide-react";

export function MetricCard({
  label, value, sub, color = "text-foreground", tooltip,
}: {
  label: string; value: string; sub?: string; color?: string; tooltip?: string;
}) {
  return (
    <div className="glass-card rounded-xl p-4 group relative">
      <p className="text-xs text-muted-foreground flex items-center gap-1">
        {label}
        {tooltip && <Info className="w-3 h-3 opacity-40" />}
      </p>
      <p className={`text-xl font-bold font-mono mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      {tooltip && (
        <div className="absolute left-0 bottom-full mb-1 z-10 w-48 p-2 rounded-lg bg-popover border border-border/30 text-[10px] text-muted-foreground leading-relaxed hidden group-hover:block shadow-lg">
          {tooltip}
        </div>
      )}
    </div>
  );
}
