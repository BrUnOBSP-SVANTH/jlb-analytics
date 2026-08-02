/**
 * Paineis de configuracao das estrategias (Mean Reversion, Panic Fade, RSI) +
 * o Slider compartilhado (privado ao modulo). Extraido de pages/Backtester.tsx.
 */
import { type MeanReversionConfig, type PanicFadeConfig, type RsiReversionConfig } from "@/lib/backtester";

function Slider({
  label, value, min, max, step, onChange, format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const display = format ? format(value) : String(value);
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <label className="text-xs text-muted-foreground">{label}</label>
        <span className="font-mono text-xs text-gold font-semibold">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-gold"
      />
    </div>
  );
}

// ── Config panels ──────────────────────────────────────────────────────────

export function MeanReversionPanel({
  cfg, onChange,
}: { cfg: MeanReversionConfig; onChange: (c: MeanReversionConfig) => void }) {
  return (
    <div className="space-y-4">
      <Slider label="Janela (candles)" value={cfg.window} min={5} max={50} step={1}
        onChange={(v) => onChange({ ...cfg, window: v })} />
      <Slider label="Limiar de entrada" value={cfg.entryThreshold} min={0.01} max={0.15} step={0.005}
        onChange={(v) => onChange({ ...cfg, entryThreshold: v })}
        format={(v) => `${(v * 100).toFixed(1)}pp`} />
      <Slider label="Take Profit" value={cfg.takeProfit} min={0.01} max={0.20} step={0.005}
        onChange={(v) => onChange({ ...cfg, takeProfit: v })}
        format={(v) => `${(v * 100).toFixed(1)}pp`} />
      <Slider label="Stop Loss" value={cfg.stopLoss} min={0.01} max={0.15} step={0.005}
        onChange={(v) => onChange({ ...cfg, stopLoss: v })}
        format={(v) => `${(v * 100).toFixed(1)}pp`} />
      <div className="p-3 rounded-lg bg-secondary/20 border border-border/20">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Lógica:</strong> calcula a média móvel dos últimos N candles. Compra quando
          preço ≤ média − limiar. Vende no TP, SL ou fim dos dados.
        </p>
      </div>
    </div>
  );
}

export function PanicFadePanel({
  cfg, onChange,
}: { cfg: PanicFadeConfig; onChange: (c: PanicFadeConfig) => void }) {
  return (
    <div className="space-y-4">
      <Slider label="Janela de queda (candles)" value={cfg.dropWindow} min={5} max={50} step={1}
        onChange={(v) => onChange({ ...cfg, dropWindow: v })} />
      <Slider label="Queda mínima" value={cfg.minDrop} min={0.03} max={0.25} step={0.01}
        onChange={(v) => onChange({ ...cfg, minDrop: v })}
        format={(v) => `${(v * 100).toFixed(0)}pp`} />
      <Slider label="Preço de pânico (máx)" value={cfg.panicPrice} min={0.05} max={0.60} step={0.01}
        onChange={(v) => onChange({ ...cfg, panicPrice: v })}
        format={(v) => `${(v * 100).toFixed(0)}%`} />
      <Slider label="Saída por recuperação" value={cfg.reboundExit} min={0.20} max={0.80} step={0.01}
        onChange={(v) => onChange({ ...cfg, reboundExit: v })}
        format={(v) => `${(v * 100).toFixed(0)}%`} />
      <Slider label="Timeout (candles)" value={cfg.maxHoldingPeriods} min={5} max={100} step={1}
        onChange={(v) => onChange({ ...cfg, maxHoldingPeriods: v })} />
      <div className="p-3 rounded-lg bg-secondary/20 border border-border/20">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Lógica:</strong> identifica capitulações: compra quando preço ≤ panicPrice
          E drop ≥ minDrop vs. pico recente. Sai no rebound, timeout ou TP/SL.
        </p>
      </div>
    </div>
  );
}

export function RsiReversionPanel({
  cfg, onChange,
}: { cfg: RsiReversionConfig; onChange: (c: RsiReversionConfig) => void }) {
  return (
    <div className="space-y-4">
      <Slider label="Período RSI" value={cfg.period} min={5} max={30} step={1}
        onChange={(v) => onChange({ ...cfg, period: v })} />
      <Slider label="Sobrevendido (compra)" value={cfg.oversold} min={10} max={45} step={1}
        onChange={(v) => onChange({ ...cfg, oversold: v })}
        format={(v) => `RSI < ${v}`} />
      <Slider label="Saída RSI" value={cfg.exitRsi} min={40} max={80} step={1}
        onChange={(v) => onChange({ ...cfg, exitRsi: v })}
        format={(v) => `RSI > ${v}`} />
      <Slider label="Take Profit" value={cfg.takeProfit} min={0.01} max={0.20} step={0.005}
        onChange={(v) => onChange({ ...cfg, takeProfit: v })}
        format={(v) => `${(v * 100).toFixed(1)}pp`} />
      <Slider label="Stop Loss" value={cfg.stopLoss} min={0.01} max={0.15} step={0.005}
        onChange={(v) => onChange({ ...cfg, stopLoss: v })}
        format={(v) => `${(v * 100).toFixed(1)}pp`} />
      <div className="p-3 rounded-lg bg-secondary/20 border border-border/20">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <strong className="text-foreground">Lógica:</strong> RSI mede momentum. Compra na zona sobrevendida (RSI baixo),
          vende quando RSI recupera. Adaptado de estratégia da NautilusTrader.
        </p>
      </div>
    </div>
  );
}
