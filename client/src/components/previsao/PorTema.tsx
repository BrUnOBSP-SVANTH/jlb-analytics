/**
 * PorTema — onde temos evidência, e quanta.
 *
 * A tela já tinha uma quebra por tema, mas calculada no cliente a partir das 50
 * resoluções mais recentes: com ~10 categorias, ~5 casos cada. Cinco casos não
 * sustentam uma porcentagem, e publicá-la como se sustentasse é o mesmo defeito
 * que corrigimos no selo de margem de erro.
 *
 * Aqui a conta vem do servidor sobre TODAS as resolvidas, e cada tema carrega a
 * própria margem — e-sports com 191 casos merece outra confiança que economia com
 * 25. Tema com amostra fina aparece assim mesmo, sem veredito: dizer "ainda não
 * sei" é informação, inventar porcentagem não é.
 */
import { useEffect, useState } from "react";
import { Layers } from "lucide-react";

interface Tema {
  tema: string; n: number;
  acerto: number | null; margemPp: number | null;
  acertoMercado: number | null;
  comparacao: "empate" | "melhor" | "pior" | null;
}

const NOMES: Record<string, string> = {
  esports: "E-sports", sports: "Esportes", tennis: "Tênis", crypto: "Cripto",
  politics: "Política", economy: "Economia", culture: "Cultura", science: "Ciência",
  climate: "Clima", other: "Outros",
};

const LEITURA: Record<string, { texto: string; cor: string }> = {
  empate: { texto: "empatamos", cor: "text-muted-foreground" },
  melhor: { texto: "melhor", cor: "text-positive" },
  pior: { texto: "pior", cor: "text-negative" },
};

export function PorTema() {
  const [d, setD] = useState<{ available: boolean; temas?: Tema[]; minAmostra?: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/ai/by-category")
      .then((r) => r.json())
      .then((j) => { if (vivo) setD(j); })
      .catch(() => { if (vivo) setD({ available: false }); });
    return () => { vivo = false; };
  }, []);

  if (!d?.available || !d.temas?.length) return null;
  const comVeredito = d.temas.filter((t) => t.acerto !== null);
  const semAmostra = d.temas.filter((t) => t.acerto === null);
  if (comVeredito.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/30 bg-secondary/5 p-5">
      <div className="flex items-center gap-2 mb-1.5">
        <Layers className="w-4 h-4 text-gold shrink-0" />
        <h3 className="text-sm font-bold text-foreground">Onde acertamos mais — e onde temos pouca prova</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        Nossa taxa de acerto por assunto, ao lado da do mercado. A margem diz quanto o número pode
        variar por sorte da amostra: quanto mais previsões no tema, mais estreita ela fica.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border/30">
              <th className="text-left font-medium py-2">Tema</th>
              <th className="text-right font-medium py-2">Casos</th>
              <th className="text-right font-medium py-2">Nós</th>
              <th className="text-right font-medium py-2">Mercado</th>
              <th className="text-right font-medium py-2">Leitura</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {comVeredito.map((t) => (
              <tr key={t.tema} className="border-b border-border/15 last:border-0">
                <td className="py-2 font-sans text-foreground/90">{NOMES[t.tema] ?? t.tema}</td>
                <td className="py-2 text-right text-muted-foreground">{t.n}</td>
                <td className="py-2 text-right text-foreground font-semibold">
                  {t.acerto}% <span className="text-muted-foreground/60 font-normal">±{t.margemPp}</span>
                </td>
                <td className="py-2 text-right text-muted-foreground">{t.acertoMercado}%</td>
                <td className={`py-2 text-right font-sans text-[11px] ${LEITURA[t.comparacao ?? "empate"].cor}`}>
                  {LEITURA[t.comparacao ?? "empate"].texto}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {semAmostra.length > 0 && (
        <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-3">
          Ainda sem prova suficiente (menos de {d.minAmostra} casos):{" "}
          {semAmostra.map((t) => `${NOMES[t.tema] ?? t.tema} (${t.n})`).join(", ")}. Preferimos dizer
          que não sabemos a publicar porcentagem que a amostra não sustenta.
        </p>
      )}
    </div>
  );
}
