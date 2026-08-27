/**
 * Tipos e helpers puros do Portfólio Simulado — extraídos de pages/Portfolio.tsx
 * para reduzir o arquivo. Sem JSX, sem estado: fáceis de reusar e testar.
 */

export interface PortfolioPosition {
  id: string;
  marketId: string;
  title: string;
  source: "polymarket" | "kalshi";
  externalUrl: string;
  position: "yes" | "no";
  entryProb: number;   // 0–1
  betSize: number;     // USD simulado
  entryDate: string;   // ISO string
  currentProb?: number;
}

export interface MarketOption {
  id: string;
  title: string;
  yesProb: number;
  externalUrl: string;
  source: "polymarket" | "kalshi";
}

export interface PortfolioAnalysisResult {
  analysis: string;
  risks: string[];
  suggestions: string[];
  cached: boolean;
}

const STORAGE_KEY = "jlb_portfolio_v1";

export function loadPositions(): PortfolioPosition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PortfolioPosition[]) : [];
  } catch { return []; }
}

export function savePositions(positions: PortfolioPosition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

// ── P&L helpers ───────────────────────────────────────────────────────────────

export function calcPnl(pos: PortfolioPosition): number | null {
  if (pos.currentProb === undefined) return null;
  if (pos.position === "yes") {
    return pos.betSize * (pos.currentProb - pos.entryProb) / pos.entryProb;
  } else {
    const entryNo = 1 - pos.entryProb;
    const curNo   = 1 - pos.currentProb;
    return pos.betSize * (curNo - entryNo) / entryNo;
  }
}

export function pnlColor(pnl: number | null) {
  if (pnl === null) return "text-muted-foreground";
  return pnl > 0 ? "text-positive" : pnl < 0 ? "text-negative" : "text-muted-foreground";
}

export function fmt(v: number) {
  return v >= 0 ? `+$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`;
}

// ── CSV Export ────────────────────────────────────────────────────────────────

export function exportToCSV(positions: PortfolioPosition[]) {
  const header = "Mercado,Fonte,Posição,Prob Entrada (%),Prob Atual (%),Tamanho (USD),P&L (USD),Data Entrada";
  const rows = positions.map(pos => {
    const pnl = calcPnl(pos);
    return [
      `"${pos.title.replace(/"/g, '""')}"`,
      pos.source,
      pos.position.toUpperCase(),
      (pos.entryProb * 100).toFixed(1),
      pos.currentProb !== undefined ? (pos.currentProb * 100).toFixed(1) : "N/A",
      pos.betSize.toFixed(2),
      pnl !== null ? pnl.toFixed(2) : "N/A",
      new Date(pos.entryDate).toLocaleDateString("pt-BR"),
    ].join(",");
  });
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `portfolio-jlb-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
