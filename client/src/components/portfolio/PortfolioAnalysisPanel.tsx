/**
 * PortfolioAnalysisPanel — a IA olha a carteira de apostas ABERTAS e aponta risco
 * e concentração (só com 2+ apostas, abaixo disso não há carteira a analisar).
 *
 * Recebe as apostas da banca, mas envia ao servidor o MESMO formato de sempre —
 * a rota /api/ai/portfolio-analysis não muda por causa de uma mudança de tela.
 */
import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { maybeAuthGate } from "@/lib/upgrade";
import type { ApostaBanca } from "@/lib/banca";
import { valorDeMercado } from "@shared/banca";
import { apiFetch } from "@/lib/api";

interface PortfolioAnalysisResult {
  analysis: string;
  risks: string[];
  suggestions: string[];
  cached: boolean;
}

export function PortfolioAnalysisPanel({ apostas }: { apostas: ApostaBanca[] }) {
  const [result, setResult] = useState<PortfolioAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (apostas.length < 2) return null;

  async function handleAnalyze() {
    if (result) { setResult(null); return; }
    setLoading(true);
    setError(null);
    try {
      const payload = apostas.map((a) => ({
        title: a.pergunta,
        source: a.fonte,
        position: a.lado === "sim" ? "yes" : "no",
        entryProb: a.precoEntrada,
        currentProb: a.precoAtual,
        betSize: a.valor,
        // Lucro no papel: o que a aposta vale hoje menos o que ela custou.
        pnl: a.precoAtual === undefined ? null : valorDeMercado(a) - a.valor,
      }));
      const res = await apiFetch("/api/ai/portfolio-analysis", {
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
          <h3 className="text-sm font-semibold text-foreground">A IA olha sua carteira</h3>
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
            : <><Sparkles className="w-3 h-3" /> Analisar minha carteira</>
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
