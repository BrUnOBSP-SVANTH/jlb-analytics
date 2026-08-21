/**
 * AccuracyAnalysis — a FERRAMENTA de análise pro usuário: onde a IA tem (ou NÃO tem)
 * vantagem, por tema. Computa no cliente, a partir de /api/ai/resolved, as métricas
 * HONESTAS que a view ainda não expõe:
 *   • dedup por MERCADO (o mesmo mercado previsto vários dias conta 1×);
 *   • acerto vs MERCADO (edge real — divergir do mercado PAGOU?), não "vs 50";
 *   • skill de Brier (a IA bate o mercado na calibração?).
 * Gate de amostra pequena — nunca vira alegação com pouco dado (mostra a direção).
 */
import { useState, useEffect } from "react";
import AnimatedSection from "@/components/AnimatedSection";
import { TrendingUp, TrendingDown, Minus, Info, BarChart3 } from "lucide-react";

interface ResolvedItem {
  marketId: string; source: string; title: string; category: string | null;
  aiProb: number; marketProb: number; outcome: boolean; official: boolean;
}

const CAT_PT: Record<string, string> = {
  politics: "Política", crypto: "Cripto", bitcoin: "Bitcoin", ethereum: "Ethereum",
  sports: "Esportes", esports: "E-sports", nfl: "NFL", nba: "NBA", economy: "Economia",
  finance: "Finanças", science: "Ciência", climate: "Clima", tech: "Tecnologia",
  ai: "IA", iran: "Geopolítica", culture: "Cultura", movies: "Cinema", oil: "Commodities",
  trump: "Política EUA", other: "Outros",
};
function label(cat: string | null): string {
  const k = (cat ?? "other").toLowerCase().trim();
  return CAT_PT[k] ?? (cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : "Outros");
}
const brier = (prob: number, outcome: boolean) => Math.pow(prob / 100 - (outcome ? 1 : 0), 2);

export function AccuracyAnalysis() {
  const [items, setItems] = useState<ResolvedItem[] | null>(null);
  const [error, setError] = useState(false);
  const [officialOnly, setOfficialOnly] = useState(false);

  useEffect(() => {
    fetch("/api/ai/resolved?limit=50")
      .then((r) => (r.ok ? r.json() as Promise<{ available: boolean; items: ResolvedItem[] }> : Promise.reject(new Error("resolved"))))
      .then((d) => setItems(d.available ? d.items : []))
      .catch(() => setError(true));
  }, []);

  if (error) return null;
  if (!items) return <div className="panel p-6"><div className="h-40 rounded-xl bg-muted/20 animate-pulse" /></div>;

  // dedup por mercado (1ª ocorrência = mais recente, pois o endpoint ordena por resolved_at desc)
  const seen = new Set<string>();
  const dedup = items.filter((it) => (seen.has(it.marketId) ? false : (seen.add(it.marketId), true)));
  const pool = officialOnly ? dedup.filter((it) => it.official) : dedup;
  const N = pool.length;
  if (dedup.length === 0) return null;

  let edgeHits = 0, edgeN = 0, aiB = 0, mB = 0;
  const byCat = new Map<string, { n: number; official: number; edgeHits: number; edgeN: number; aiB: number; mB: number }>();
  for (const it of pool) {
    const a = brier(it.aiProb, it.outcome), m = brier(it.marketProb, it.outcome);
    aiB += a; mB += m;
    const diverged = it.aiProb !== it.marketProb;
    const won = (it.aiProb > it.marketProb) === it.outcome;
    if (diverged) { edgeN++; if (won) edgeHits++; }
    const c = label(it.category);
    const g = byCat.get(c) ?? { n: 0, official: 0, edgeHits: 0, edgeN: 0, aiB: 0, mB: 0 };
    g.n++; if (it.official) g.official++; g.aiB += a; g.mB += m;
    if (diverged) { g.edgeN++; if (won) g.edgeHits++; }
    byCat.set(c, g);
  }
  const officialCount = pool.filter((it) => it.official).length;
  const edgeRate = edgeN ? Math.round((edgeHits / edgeN) * 100) : null;
  const skill = N > 0 && mB > 0 ? 1 - (aiB / N) / (mB / N) : null; // >0 = IA melhor que o mercado
  const small = N < 20;
  const cats = Array.from(byCat.entries()).sort((a, b) => b[1].n - a[1].n);

  const SkillBadge = ({ value }: { value: number | null }) => {
    if (value === null) return <span className="text-muted-foreground">—</span>;
    const good = value > 0;
    const Icon = Math.abs(value) < 0.001 ? Minus : good ? TrendingUp : TrendingDown;
    return (
      <span className={`inline-flex items-center gap-1 font-semibold ${good ? "text-positive" : "text-negative"}`}>
        <Icon className="w-3.5 h-3.5" />{good ? "+" : ""}{(value * 100).toFixed(0)}%
      </span>
    );
  };

  return (
    <AnimatedSection>
      <div className="panel p-6 space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-neon-blue shrink-0" />
            <p className="text-sm font-semibold text-foreground">Análise de acurácia — onde confiar (ou não) na IA</p>
          </div>
          <button
            onClick={() => setOfficialOnly((v) => !v)}
            className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${officialOnly ? "border-positive/40 text-positive bg-positive/5" : "border-border/40 text-muted-foreground hover:text-foreground"}`}
          >
            {officialOnly ? "✓ só resultado oficial" : "só resultado oficial"}
          </button>
        </div>

        {small && (
          <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-secondary/20 border border-border/20 rounded-lg p-2.5">
            <Info className="w-3.5 h-3.5 text-neon-blue shrink-0 mt-0.5" />
            <span>Amostra pequena ({N} mercado{N === 1 ? "" : "s"}{officialCount ? `, ${officialCount} oficial${officialCount === 1 ? "" : "is"}` : ""}). Isto mostra a <strong className="text-foreground/80">direção</strong>, não um veredito — a prova amadurece conforme mais mercados liquidam pelo oficial.</span>
          </div>
        )}

        {/* Stat tiles honestos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-border/20 bg-secondary/10 p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Mercados</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{N}</p>
            <p className="text-[10px] text-muted-foreground">{officialCount} oficial · {N - officialCount} inferido</p>
          </div>
          <div className="rounded-xl border border-border/20 bg-secondary/10 p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Acerto vs mercado</p>
            <p className="text-2xl font-bold text-foreground tabular-nums">{edgeRate !== null ? `${edgeRate}%` : "—"}</p>
            <p className="text-[10px] text-muted-foreground">divergir do mercado pagou? ({edgeN} casos)</p>
          </div>
          <div className="rounded-xl border border-border/20 bg-secondary/10 p-4">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Skill vs mercado</p>
            <p className="text-2xl font-bold tabular-nums"><SkillBadge value={skill} /></p>
            <p className="text-[10px] text-muted-foreground">calibração (Brier) melhor que o mercado?</p>
          </div>
        </div>

        {/* Por tema */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Por tema</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground/70 text-left">
                  <th className="py-1.5 pr-2 font-medium">Tema</th>
                  <th className="py-1.5 px-2 font-medium text-right">Mercados</th>
                  <th className="py-1.5 px-2 font-medium text-right">Acerto vs mercado</th>
                  <th className="py-1.5 pl-2 font-medium text-right">Skill</th>
                </tr>
              </thead>
              <tbody>
                {cats.map(([cat, g]) => {
                  const er = g.edgeN ? Math.round((g.edgeHits / g.edgeN) * 100) : null;
                  const sk = g.n > 0 && g.mB > 0 ? 1 - (g.aiB / g.n) / (g.mB / g.n) : null;
                  return (
                    <tr key={cat} className="border-t border-border/10">
                      <td className="py-1.5 pr-2 text-foreground">{cat}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{g.n}{g.official ? <span className="text-positive/70"> · {g.official} of.</span> : null}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-foreground">{er !== null ? `${er}%` : "—"}</td>
                      <td className="py-1.5 pl-2 text-right tabular-nums"><SkillBadge value={sk} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
          <strong className="text-foreground/70">Acerto vs mercado</strong> = das vezes em que a IA discordou do preço, quantas ela acertou o lado (o edge de verdade — mais honesto que "acertou vs 50%").{" "}
          <strong className="text-foreground/70">Skill</strong> = quanto o Brier da IA é melhor (+) ou pior (−) que o do mercado. Cada mercado conta uma vez; nada de cherry-picking.
        </p>
      </div>
    </AnimatedSection>
  );
}
