/**
 * Portfolio — Portfólio Simulado JLB Analytics
 * Rastreia posições virtuais em mercados reais do Polymarket e Kalshi.
 * Sem integração financeira — caráter 100% educacional.
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import MercadosTabs from "@/components/MercadosTabs";
import { getAllMarkets } from "@/lib/marketsCache";
import {
  Plus, Trash2, ExternalLink,
  RefreshCw, Info, BarChart2, Download, Sparkles,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PortfolioPosition {
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

interface MarketOption {
  id: string;
  title: string;
  yesProb: number;
  externalUrl: string;
  source: "polymarket" | "kalshi";
}

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "jlb_portfolio_v1";

function loadPositions(): PortfolioPosition[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PortfolioPosition[]) : [];
  } catch { return []; }
}

function savePositions(positions: PortfolioPosition[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
}

// ── P&L helpers ───────────────────────────────────────────────────────────────

function calcPnl(pos: PortfolioPosition): number | null {
  if (pos.currentProb === undefined) return null;
  if (pos.position === "yes") {
    return pos.betSize * (pos.currentProb - pos.entryProb) / pos.entryProb;
  } else {
    const entryNo = 1 - pos.entryProb;
    const curNo   = 1 - pos.currentProb;
    return pos.betSize * (curNo - entryNo) / entryNo;
  }
}

function pnlColor(pnl: number | null) {
  if (pnl === null) return "text-muted-foreground";
  return pnl > 0 ? "text-positive" : pnl < 0 ? "text-negative" : "text-muted-foreground";
}

function fmt(v: number) {
  return v >= 0 ? `+$${v.toFixed(2)}` : `-$${Math.abs(v).toFixed(2)}`;
}

// ── Add Position Modal ────────────────────────────────────────────────────────

function AddPositionModal({
  onAdd,
  onClose,
}: {
  onAdd: (pos: Omit<PortfolioPosition, "id" | "entryDate" | "currentProb">) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<"polymarket" | "kalshi">("polymarket");
  const [markets, setMarkets] = useState<MarketOption[]>([]);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MarketOption | null>(null);
  const [position, setPosition] = useState<"yes" | "no">("yes");
  const [entryProbPct, setEntryProbPct] = useState(50);
  const [betSize, setBetSize] = useState(100);

  useEffect(() => {
    setLoadingMarkets(true);
    setSelected(null);
    setSearch("");
    const url = source === "polymarket"
      ? "/api/polymarket/markets?limit=80"
      : "/api/kalshi/markets?limit=60";
    fetch(url)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        const raw = source === "polymarket"
          ? (data.markets as Record<string, unknown>[])
          : (data.markets as Record<string, unknown>[]);
        const opts: MarketOption[] = raw
          .filter((m) => {
            const prob = source === "polymarket"
              ? parseFloat(String(Array.isArray(m.outcomePrices)
                ? m.outcomePrices[0]
                : (JSON.parse(String(m.outcomePrices ?? "[]")))[0] ?? 0.5))
              : Number(m.yesProb);
            return !isNaN(prob) && prob > 0 && prob < 1;
          })
          .map((m) => {
            const prob = source === "polymarket"
              ? parseFloat(String(Array.isArray(m.outcomePrices)
                ? m.outcomePrices[0]
                : (JSON.parse(String(m.outcomePrices ?? "[]")))[0] ?? 0.5))
              : Number(m.yesProb);
            const title = String(m.question ?? m.title ?? "");
            const id = String(source === "polymarket" ? m.id : m.ticker);
            const slug = String(source === "polymarket" ? (m.eventSlug ?? m.slug ?? id) : "");
            const eventTicker = String(source === "kalshi" ? m.eventTicker ?? "" : "");
            const seriesTicker = String(source === "kalshi" ? m.seriesTicker ?? "" : "");
            const url = source === "polymarket"
              ? `https://polymarket.com/event/${slug}`
              : `https://kalshi.com/markets/${seriesTicker}/${eventTicker}`;
            return { id, title, yesProb: prob, externalUrl: url, source };
          })
          .filter((o) => o.title.length > 3);
        setMarkets(opts);
        setLoadingMarkets(false);
      })
      .catch(() => setLoadingMarkets(false));
  }, [source]);

  const filtered = markets.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 20);

  function handleSelect(m: MarketOption) {
    setSelected(m);
    setEntryProbPct(Math.round(m.yesProb * 100));
  }

  function handleAdd() {
    if (!selected) return;
    onAdd({
      marketId: selected.id,
      title: selected.title,
      source: selected.source,
      externalUrl: selected.externalUrl,
      position,
      entryProb: entryProbPct / 100,
      betSize,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <AnimatedSection>
        <div className="w-full max-w-lg glass-card rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> Nova posição simulada
            </h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors text-sm" aria-label="Fechar">✕</button>
          </div>

          {/* Source */}
          <div className="flex gap-2">
            {(["polymarket", "kalshi"] as const).map((s) => (
              <button key={s} onClick={() => setSource(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  source === s ? "bg-foreground text-background border-foreground" : "border-border/40 text-muted-foreground hover:text-foreground"
                }`}>
                {s === "polymarket" ? "Polymarket" : "Kalshi"}
              </button>
            ))}
          </div>

          {/* Market search */}
          {loadingMarkets ? (
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Carregando mercados...
            </div>
          ) : (
            <div className="space-y-2">
              <input
                type="text" placeholder="Buscar mercado..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-xs bg-secondary/30 border border-border/30 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
              {selected ? (
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-foreground">
                  <p className="font-medium line-clamp-2">{selected.title}</p>
                  <p className="text-muted-foreground mt-0.5">Prob. mercado: {Math.round(selected.yesProb * 100)}%</p>
                  <button onClick={() => setSelected(null)} className="text-muted-foreground/60 hover:text-muted-foreground mt-1 text-[10px]">
                    Trocar mercado
                  </button>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {filtered.map((m) => (
                    <button key={m.id} onClick={() => handleSelect(m)}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-secondary/40 transition-colors text-xs text-foreground line-clamp-1">
                      <span className="text-muted-foreground font-mono mr-2">{Math.round(m.yesProb * 100)}%</span>
                      {m.title}
                    </button>
                  ))}
                  {filtered.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">Nenhum resultado.</p>}
                </div>
              )}
            </div>
          )}

          {selected && (
            <>
              {/* Direction */}
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Direção da posição</p>
                <div className="flex gap-2">
                  {(["yes", "no"] as const).map((d) => (
                    <button key={d} onClick={() => setPosition(d)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        position === d
                          ? d === "yes" ? "bg-positive/15 border-positive/40 text-positive" : "bg-negative/15 border-negative/40 text-negative"
                          : "border-border/30 text-muted-foreground hover:text-foreground"
                      }`}>
                      {d === "yes" ? "SIM ▲" : "NÃO ▼"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Entry prob */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Probabilidade de entrada (sua estimativa)</span>
                  <span className="font-mono font-bold text-foreground">{entryProbPct}%</span>
                </div>
                <input type="range" min={1} max={99} value={entryProbPct}
                  onChange={(e) => setEntryProbPct(Number(e.target.value))}
                  className="w-full h-1.5 accent-primary" />
                <p className="text-[10px] text-muted-foreground">Mercado: {Math.round(selected.yesProb * 100)}% · Edge implícito: {entryProbPct - Math.round(selected.yesProb * 100) > 0 ? "+" : ""}{entryProbPct - Math.round(selected.yesProb * 100)}pp</p>
              </div>

              {/* Bet size */}
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Valor simulado (USD)</span>
                  <span className="font-mono font-bold text-foreground">${betSize}</span>
                </div>
                <input type="range" min={10} max={10000} step={10} value={betSize}
                  onChange={(e) => setBetSize(Number(e.target.value))}
                  className="w-full h-1.5 accent-primary" />
                <div className="flex gap-2">
                  {[50, 100, 500, 1000].map((v) => (
                    <button key={v} onClick={() => setBetSize(v)}
                      className="px-2 py-0.5 rounded text-[10px] border border-border/30 text-muted-foreground hover:text-foreground transition-colors">
                      ${v}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={handleAdd}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                Adicionar posição
              </button>
            </>
          )}
        </div>
      </AnimatedSection>
    </div>
  );
}

// ── Position Card ─────────────────────────────────────────────────────────────

function PositionCard({
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

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportToCSV(positions: PortfolioPosition[]) {
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

// ── Portfolio Analysis Panel ──────────────────────────────────────────────────

interface PortfolioAnalysisResult {
  analysis: string;
  risks: string[];
  suggestions: string[];
  cached: boolean;
}

function PortfolioAnalysisPanel({ positions }: { positions: PortfolioPosition[] }) {
  const [result, setResult] = useState<PortfolioAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (positions.length < 2) return null;

  async function handleAnalyze() {
    if (result) { setResult(null); return; }
    setLoading(true);
    setError(null);
    try {
      const payload = positions.map(p => ({
        title: p.title,
        source: p.source,
        position: p.position,
        entryProb: p.entryProb,
        currentProb: p.currentProb,
        betSize: p.betSize,
        pnl: calcPnl(p),
      }));
      const res = await fetch("/api/ai/portfolio-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions: payload }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as PortfolioAnalysisResult;
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro na análise");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-foreground">Análise de Portfólio com IA</h3>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/15 border border-purple-500/30 text-purple-300 hover:bg-purple-500/25 transition-colors disabled:opacity-40"
        >
          {loading
            ? <><RefreshCw className="w-3 h-3 animate-spin" /> Analisando...</>
            : result
            ? "Ocultar análise"
            : <><Sparkles className="w-3 h-3" /> Analisar portfólio</>
          }
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-negative/10 border border-negative/20 text-xs text-negative">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/15">
            <p className="text-xs text-muted-foreground leading-relaxed">{result.analysis}</p>
            {result.cached && <span className="text-[10px] text-muted-foreground/40">(cache)</span>}
          </div>
          {result.risks.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-negative/80 uppercase tracking-wider mb-2">Riscos identificados</p>
              <ul className="space-y-1">
                {result.risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-negative shrink-0 mt-0.5">▸</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.suggestions.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-positive/80 uppercase tracking-wider mb-2">Sugestões</p>
              <ul className="space-y-1">
                {result.suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="text-positive shrink-0 mt-0.5">▸</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

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

      <div className="container py-8 space-y-6">
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
