/**
 * Portfolio — Portfólio Simulado JLB Analytics
 * Rastreia posições virtuais em mercados reais do Polymarket e Kalshi.
 * Sem integração financeira — caráter 100% educacional.
 *
 * Tipos/helpers e os componentes (modal, card, análise IA) vivem em
 * components/portfolio/* — esta página só orquestra estado e layout.
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import MercadosTabs from "@/components/MercadosTabs";
import { getAllMarkets } from "@/lib/marketsCache";
import { Plus, RefreshCw, Info, BarChart2, Download } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import {
  loadPositions, savePositions, calcPnl, exportToCSV, type PortfolioPosition,
} from "@/components/portfolio/shared";
import { AddPositionModal } from "@/components/portfolio/AddPositionModal";
import { PositionCard } from "@/components/portfolio/PositionCard";
import { PortfolioAnalysisPanel } from "@/components/portfolio/PortfolioAnalysisPanel";

export default function Portfolio() {
  useSEO("Portfólio Simulado", "Acompanhe posições simuladas em mercados preditivos com P&L e histórico.");
  const [positions, setPositions] = useState<PortfolioPosition[]>(loadPositions);
  const [showAdd, setShowAdd] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Busca probabilidades atuais dos mercados nas posições
  const refreshPrices = useCallback(async () => {
    if (positions.length === 0) return;
    setRefreshing(true);
    try {
      const { polymarket, kalshi } = await getAllMarkets();

      const polyMap = new Map<string, number>();
      const kalshiMap = new Map<string, number>();

      for (const m of polymarket as Record<string, unknown>[]) {
        try {
          const prices = m.outcomePrices;
          const arr = typeof prices === "string" ? JSON.parse(prices) as string[] : prices as string[];
          const prob = parseFloat(String(arr[0]));
          if (!isNaN(prob)) polyMap.set(String(m.id), prob);
        } catch { /* skip */ }
      }
      for (const m of kalshi as Record<string, unknown>[]) {
        kalshiMap.set(String(m.ticker), Number(m.yesProb));
      }

      setPositions((prev) => {
        const updated = prev.map((pos) => {
          const curProb = pos.source === "polymarket" ? polyMap.get(pos.marketId) : kalshiMap.get(pos.marketId);
          return curProb !== undefined ? { ...pos, currentProb: curProb } : pos;
        });
        savePositions(updated);
        return updated;
      });
      setLastUpdated(new Date());
    } catch { /* ignore */ } finally {
      setRefreshing(false);
    }
  }, [positions.length]);

  useEffect(() => { void refreshPrices(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAdd(data: Omit<PortfolioPosition, "id" | "entryDate" | "currentProb">) {
    const pos: PortfolioPosition = {
      ...data,
      id: crypto.randomUUID(),
      entryDate: new Date().toISOString(),
    };
    const updated = [...positions, pos];
    setPositions(updated);
    savePositions(updated);
    setShowAdd(false);
    toast.success("Posição adicionada ao portfólio simulado");
    void refreshPrices();
  }

  function handleDelete(id: string) {
    const updated = positions.filter((p) => p.id !== id);
    setPositions(updated);
    savePositions(updated);
    toast("Posição removida do portfólio");
  }

  // Summary stats
  const totalExposure = positions.reduce((s, p) => s + p.betSize, 0);
  const totalPnl = positions.reduce((s, p) => {
    const pnl = calcPnl(p);
    return pnl !== null ? s + pnl : s;
  }, 0);
  const pnlColor_ = totalPnl >= 0 ? "text-positive" : "text-negative";

  return (
    <div>
      <MercadosTabs />
      <PageHeader
        title="Portfólio Simulado"
        subtitle="Rastreie posições virtuais em mercados reais do Polymarket e Kalshi. Sem dinheiro real — puro aprendizado quantitativo."
        badge="Simulação"
      />

      <div className="container py-10 space-y-8">
        {/* Disclaimer */}
        <div className="flex items-start gap-3 p-4 rounded-xl border border-border/20 bg-secondary/5">
          <Info className="w-4 h-4 text-muted-foreground/50 shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Portfólio educacional:</strong> este simulador acompanha como suas estimativas de probabilidade performariam se fossem posições reais nos mercados. Nenhum dinheiro real é movimentado. O P&L é calculado com base na variação das probabilidades dos mercados.
          </p>
        </div>

        {/* Summary strip */}
        {positions.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="glass-card rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Posições</p>
              <p className="text-2xl font-mono font-bold text-foreground">{positions.length}</p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Exposição total</p>
              <p className="text-2xl font-mono font-bold text-foreground">${totalExposure.toLocaleString()}</p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">P&L simulado</p>
              <p className={`text-2xl font-mono font-bold ${pnlColor_}`}>
                {totalPnl >= 0 ? "+" : ""}${Math.abs(totalPnl).toFixed(2)}
              </p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Retorno total</p>
              <p className={`text-2xl font-mono font-bold ${pnlColor_}`}>
                {totalExposure > 0 ? `${totalPnl >= 0 ? "+" : ""}${((totalPnl / totalExposure) * 100).toFixed(1)}%` : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Header actions */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Nova posição
          </button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {lastUpdated && (
              <span>Atualizado às {lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
            )}
            <button
              onClick={() => exportToCSV(positions)}
              disabled={positions.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
            <button
              onClick={() => void refreshPrices()}
              disabled={refreshing || positions.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/30 hover:text-foreground hover:border-border/60 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Atualizar preços
            </button>
          </div>
        </div>

        {/* Empty state */}
        {positions.length === 0 && (
          <div className="text-center py-20 glass-card rounded-2xl">
            <BarChart2 className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Portfólio vazio</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Adicione sua primeira posição simulada em um mercado do Polymarket ou Kalshi.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> Adicionar primeira posição
            </button>
          </div>
        )}

        {/* Positions grid */}
        {positions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {positions.map((pos) => (
              <PositionCard key={pos.id} pos={pos} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {/* AI Analysis */}
        <PortfolioAnalysisPanel positions={positions} />

        {/* Learn more */}
        {positions.length > 0 && (
          <div className="text-center pt-4 border-t border-border/20">
            <p className="text-xs text-muted-foreground mb-3">
              Para entender os modelos por trás do P&L e do edge:
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/calculadoras">
                <span className="text-xs text-primary hover:underline">Calculadoras de EV e Kelly</span>
              </Link>
              <Link href="/previsao">
                <span className="text-xs text-primary hover:underline">Previsão guiada por IA</span>
              </Link>
              <Link href="/apostas">
                <span className="text-xs text-primary hover:underline">Ver mercados ao vivo</span>
              </Link>
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <AddPositionModal onAdd={handleAdd} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}
