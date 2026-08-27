/**
 * AddPositionModal — modal de nova posição simulada (busca de mercado + direção +
 * prob + tamanho). Extraído de pages/Portfolio.tsx. Comportamento idêntico.
 */
import { useState, useEffect } from "react";
import { Plus, RefreshCw } from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";
import type { PortfolioPosition, MarketOption } from "@/components/portfolio/shared";

export function AddPositionModal({
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
            const eventTicker = String(source === "kalshi" ? m.eventTicker ?? "" : "");
            const seriesTicker = String(source === "kalshi" ? m.seriesTicker ?? "" : "");
            // Prefere a URL canônica do servidor; senão, Poly SÓ com eventSlug (nunca
            // market.slug/id → 404); Kalshi {series}/{event}. Sem eventSlug → home.
            const url = m.externalUrl ? String(m.externalUrl)
              : source === "polymarket"
                ? (m.eventSlug ? `https://polymarket.com/pt/event/${m.eventSlug}` : "https://polymarket.com/pt")
                : `https://kalshi.com/markets/${seriesTicker.toLowerCase()}/${eventTicker.toLowerCase()}`;
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
