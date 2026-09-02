/**
 * DivergencesSection — onde a JLB discorda do mercado (edges). Escreve o edge store
 * (publishEdges) que os cards leem. Extraido de pages/Apostas.tsx.
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Scale } from "lucide-react";
import AnimatedSection from "@/components/AnimatedSection";
import { publishEdges, type Divergence } from "@/components/mercados/edgeStore";

export function DivergencesSection() {
  const [divs, setDivs] = useState<Divergence[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/ai/divergences")
      .then((r) => r.ok ? r.json() as Promise<{ divergences: Divergence[] }> : null)
      .then((d) => { if (d?.divergences) { setDivs(d.divergences); publishEdges(d.divergences); } })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || divs.length === 0) return null;

  return (
    <AnimatedSection>
      <div className="mb-5 rounded-xl border border-gold/25 bg-gold/3 overflow-hidden">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gold/5 transition-colors text-left"
        >
          <Scale className="w-4 h-4 text-gold shrink-0" />
          <span className="text-sm font-semibold text-foreground">Onde a JLB discorda do mercado</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold/15 border border-gold/30 text-gold">{divs.length}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{collapsed ? "mostrar" : "ocultar"}</span>
        </button>
        {!collapsed && (
          <div className="px-4 pb-4 space-y-2">
            <p className="text-[11px] text-muted-foreground mb-1">
              Mercados onde nosso fair value de IA mais difere do preço atual. Edge = nossa estimativa − preço de mercado.
              {" "}O preço é <strong>ao vivo</strong> e a estimativa é da data indicada: parte da diferença pode ser
              o mercado tendo se movido depois, não discordância nossa.
            </p>
            {divs.map((d) => {
              const slug = d.marketId.replace(/^(poly-|kalshi-)/, "");
              const href = d.source === "kalshi" ? `/apostas/kalshi-${slug}` : `/apostas/poly-${slug}`;
              return (
                <Link key={d.marketId} href={href}>
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/20 border border-border/15 hover:border-gold/30 transition-colors cursor-pointer">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{d.title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Mercado <span className="font-mono text-foreground">{d.currentProb}%</span> ·
                        JLB <span className="font-mono text-gold">{d.aiFairValue}%</span>
                        <span className="ml-1">({d.source === "kalshi" ? "Kalshi" : "Polymarket"})</span>
                        {d.forecastAgeDays !== undefined && (
                          <span className="ml-1 text-muted-foreground/70">
                            · estimativa de {d.forecastAgeDays === 0 ? "hoje" : `${d.forecastAgeDays}d atrás`}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className={`text-center px-2.5 py-1 rounded-lg shrink-0 ${d.edge > 0 ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>
                      <p className="text-[9px] uppercase">Edge</p>
                      <p className="text-sm font-mono font-bold">{d.edge > 0 ? "+" : ""}{d.edge}pp</p>
                    </div>
                  </div>
                </Link>
              );
            })}
            <p className="text-[10px] text-muted-foreground/50 pt-1">
              Edge alto não é lucro garantido — o mercado pode ter informação que o modelo não tem. Sempre verifique a análise completa.
            </p>
          </div>
        )}
      </div>
    </AnimatedSection>
  );
}
