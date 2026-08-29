/**
 * ProviderBreakdown — de QUAL modelo veio o número que publicamos.
 *
 * A manchete ("nossa IA acerta X%") é a soma de provedores diferentes. Hoje ela
 * é, na prática, quase toda do FALLBACK (Gemini), porque a Anthropic está sem
 * crédito — e um 3º nível (Groq) entrou na cadeia. Somar três níveis de qualidade
 * num número só, sem o visitante poder separar, seria o oposto do que este site
 * defende. Aqui cada provedor aparece com a própria amostra.
 */
import { useEffect, useState } from "react";
import { Layers } from "lucide-react";

interface ProviderRow {
  provider: string;
  resolvedCount: number;
  aiBrier: number | null;
  marketBrier: number | null;
  hitRate: number | null;
  skillVsMarket: number | null;
  settledCount: number;
}

const LABEL: Record<string, string> = {
  anthropic: "Claude (Anthropic)",
  gemini: "Gemini (fallback)",
  groq: "Groq (3º nível)",
  desconhecido: "Sem registro (legado)",
};

/** Amostra mínima para o número de um provedor significar algo — mesmo critério do site. */
const STABLE_N = 20;

export function ProviderBreakdown() {
  const [rows, setRows] = useState<ProviderRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/ai/track-record")
      .then((r) => r.ok ? r.json() as Promise<{ byProvider?: ProviderRow[] }> : null)
      .then((d) => { if (alive && d?.byProvider) setRows(d.byProvider); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 mb-1.5">
        <Layers className="w-4 h-4 text-neon-blue shrink-0" />
        <p className="text-sm font-semibold text-foreground">De qual modelo veio cada número</p>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        Nossa IA usa uma cadeia de provedores: quando um falha (crédito, cota, instabilidade), o
        seguinte responde. Como os modelos têm qualidades diferentes, mostramos a fatia de cada um
        em vez de esconder tudo numa média.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30 text-muted-foreground">
              <th className="text-left py-1.5 pr-2 font-medium">Provedor</th>
              <th className="text-right py-1.5 px-2 font-medium">Resolvidas</th>
              <th className="text-right py-1.5 px-2 font-medium">Acerto</th>
              <th className="text-right py-1.5 px-2 font-medium">Brier</th>
              <th className="text-right py-1.5 pl-2 font-medium">vs mercado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const thin = r.resolvedCount < STABLE_N;
              const beats = r.skillVsMarket !== null && r.skillVsMarket > 0;
              return (
                <tr key={r.provider} className="border-b border-border/10 last:border-0">
                  <td className="py-2 pr-2 text-foreground">
                    {LABEL[r.provider] ?? r.provider}
                    {thin && (
                      <span className="ml-1.5 text-[10px] text-muted-foreground/60">amostra pequena</span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-foreground/80 tabular-nums">{r.resolvedCount}</td>
                  <td className="py-2 px-2 text-right font-mono text-foreground/80 tabular-nums">
                    {r.hitRate !== null ? `${r.hitRate}%` : "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-foreground/80 tabular-nums">
                    {r.aiBrier !== null ? r.aiBrier.toFixed(3) : "—"}
                  </td>
                  <td className={`py-2 pl-2 text-right font-mono tabular-nums ${
                    thin ? "text-muted-foreground/60" : beats ? "text-positive" : "text-negative"
                  }`}>
                    {r.skillVsMarket !== null
                      ? `${r.skillVsMarket > 0 ? "+" : ""}${(r.skillVsMarket * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted-foreground/60 mt-3 leading-relaxed">
        <strong className="text-foreground/70">vs mercado</strong> = quanto o Brier do provedor é melhor
        (+) ou pior (−) que o do próprio mercado no mesmo conjunto. Abaixo de {STABLE_N} resolvidas
        tratamos como ruído, não evidência. As fatias usam a mesma regra de contagem da manchete
        (1 previsão por mercado), então elas somam exatamente o total.
      </p>
    </div>
  );
}
