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
import { buscarJson } from "@/lib/api";
import { num } from "@shared/formato";

interface ProviderRow {
  provider: string;
  resolvedCount: number;
  aiBrier: number | null;
  marketBrier: number | null;
  hitRate: number | null;
  skillVsMarket: number | null;
  settledCount: number;
  amostraSuficiente: boolean;
}

/**
 * O nome que o usuário lê vem primeiro; o técnico fica entre parênteses (TRK-07).
 *
 * A auditoria apontou que "Gemini (fallback)" é vocabulário de engenharia vazando
 * para a interface — quem visita não sabe o que é fallback, e o rótulo não diz o
 * que importa (que aquele é o modelo de contingência). Tirar o nome técnico
 * também não serve: ele é o que torna a tabela auditável, que é a tese da página.
 * Então: função primeiro, marca depois.
 */
const LABEL: Record<string, string> = {
  anthropic: "Modelo principal (Claude)",
  gemini: "Contingência (Gemini)",
  groq: "Terceira opção (Groq)",
  desconhecido: "Antes do registro por modelo",
};

export function ProviderBreakdown() {
  const [rows, setRows] = useState<ProviderRow[] | null>(null);
  // A régua de amostra vem do servidor: é a mesma de todo o site (MIN_AMOSTRA).
  // Ter uma constante local aqui foi como o site acabou com quatro mínimos
  // diferentes na mesma tela.
  const [minimo, setMinimo] = useState(20);

  useEffect(() => {
    let alive = true;
    buscarJson<{ byProvider?: ProviderRow[]; minAmostra?: number }>("/api/ai/track-record")
      .then((d) => {
        if (!alive || !d?.byProvider) return;
        setRows(d.byProvider);
        if (d.minAmostra) setMinimo(d.minAmostra);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-display font-semibold text-[var(--titulo)] mb-1">De qual modelo veio cada número</h2>
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
              const thin = !r.amostraSuficiente;
              const beats = r.skillVsMarket !== null && r.skillVsMarket > 0;
              return (
                <tr key={r.provider} className="border-b border-border/10 last:border-0">
                  <td className="py-2 pr-2 text-foreground">
                    {LABEL[r.provider] ?? r.provider}
                    {/* Separador de verdade: sem o espaço a linha saía como
                        "Groq (3º nível)amostra pequena" ao ser lida como texto. */}
                    {thin && <> <span className="text-xs text-muted-foreground">· amostra pequena</span></>}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-foreground/80 tabular-nums">{r.resolvedCount}</td>
                  <td className="py-2 px-2 text-right font-mono text-foreground/80 tabular-nums">
                    {r.hitRate !== null ? `${r.hitRate}%` : "—"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono text-foreground/80 tabular-nums">
                    {r.aiBrier !== null ? r.aiBrier.toFixed(3) : "—"}
                  </td>
                  <td className={`py-2 pl-2 text-right font-mono tabular-nums ${
                    thin ? "text-muted-foreground" : beats ? "text-positive" : "text-negative"
                  }`}>
                    {r.skillVsMarket !== null
                      ? `${r.skillVsMarket > 0 ? "+" : ""}${num((r.skillVsMarket * 100), 1)}%`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* A contradição que a auditoria apontou (TRK-05): se TODOS os provedores
          aparecem piores que o mercado nesta tabela, a manchete não pode dizer
          "empatamos ou superamos" sem explicar que são medidas diferentes. */}
      {rows.every((r) => r.skillVsMarket !== null && r.skillVsMarket <= 0) && (
        <p className="text-xs text-muted-foreground leading-relaxed mt-3 rounded-lg border border-border/25 bg-secondary/15 p-2.5">
          Repare que aqui <strong className="text-foreground/80">nenhum modelo bate o mercado na
          calibração</strong> — e a manchete da página fala em empate. Não é contradição: a manchete
          mede se acertamos o <em>lado</em>, e esta tabela mede o quanto a probabilidade chegou perto
          do resultado. Acertar o lado é fácil; chegar perto do número é o teste difícil, e nele ainda
          perdemos. Preferimos deixar as duas leituras à vista.
        </p>
      )}

      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        <strong className="text-foreground/80">vs mercado</strong> = quanto o Brier do provedor é melhor
        (+) ou pior (−) que o do próprio mercado no mesmo conjunto. Abaixo de {minimo} resolvidas
        tratamos como ruído, não evidência. As fatias saem da mesma leitura da manchete
        (1 previsão por mercado), então elas somam exatamente o total.
      </p>
    </section>
  );
}
