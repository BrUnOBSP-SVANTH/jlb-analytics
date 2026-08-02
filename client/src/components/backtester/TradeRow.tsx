/**
 * TradeRow — linha da tabela de trades do backtest. Extraido de pages/Backtester.tsx.
 */
import { pct, dateFromTs } from "@/components/backtester/helpers";
import { EXIT_REASON_LABEL, type Trade } from "@/lib/backtester";

export function TradeRow({ trade, index }: { trade: Trade; index: number }) {
  const isWin = trade.pnl > 0;
  return (
    <tr className="border-b border-border/10 hover:bg-secondary/10 transition-colors">
      <td className="p-2 text-xs text-muted-foreground font-mono">#{index + 1}</td>
      <td className="p-2 text-xs font-mono text-foreground">{dateFromTs(trade.entryTime)}</td>
      <td className="p-2 text-xs font-mono text-foreground">{dateFromTs(trade.exitTime)}</td>
      <td className="p-2 text-xs font-mono text-gold">{(trade.entryPrice * 100).toFixed(1)}¢</td>
      <td className="p-2 text-xs font-mono text-foreground">{(trade.exitPrice * 100).toFixed(1)}¢</td>
      <td className={`p-2 text-xs font-mono font-semibold ${isWin ? "text-positive" : "text-negative"}`}>
        {pct(trade.pnlPct)}
      </td>
      <td className="p-2 text-xs text-muted-foreground">{EXIT_REASON_LABEL[trade.exitReason]}</td>
    </tr>
  );
}
