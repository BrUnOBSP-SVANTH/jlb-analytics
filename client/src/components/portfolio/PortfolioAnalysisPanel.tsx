/**
 * PortfolioAnalysisPanel — análise do portfólio simulado por IA (só com 2+ posições).
 * Extraído de pages/Portfolio.tsx. Comportamento idêntico.
 */
import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { maybeAuthGate } from "@/lib/upgrade";
import { calcPnl, type PortfolioPosition, type PortfolioAnalysisResult } from "@/components/portfolio/shared";

export function PortfolioAnalysisPanel({ positions }: { positions: PortfolioPosition[] }) {
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
      if (await maybeAuthGate(res)) return;   // 401 login ou 429 cota → modal assume
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
