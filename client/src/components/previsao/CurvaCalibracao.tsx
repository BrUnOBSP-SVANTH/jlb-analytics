/**
 * CurvaCalibracao — "quando dizemos 70%, acontece quanto?"
 *
 * A prova mais concreta que uma plataforma de previsão pode publicar, e a que
 * mais dispensa conhecimento técnico: a pessoa compara duas colunas e entende
 * sozinha se prometemos o que entregamos.
 *
 * Mostra as faixas ONDE ERRAMOS junto com as certas, de propósito. Um placar que
 * só exibe acerto não é placar, é propaganda — e o site inteiro se sustenta em
 * mostrar o erro antes que alguém o encontre.
 */
import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { Termo } from "@/components/Termo";

interface Faixa {
  faixa: string; n: number; prometido: number;
  aconteceu: number | null; margemPp: number | null;
  desvioPp: number | null; dentroDaMargem: boolean | null;
}
interface Resposta {
  available: boolean; curva?: Faixa[];
  faixasCalibradas?: number; faixasComAmostra?: number; total?: number;
}

export function CurvaCalibracao() {
  const [d, setD] = useState<Resposta | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/ai/calibration-curve")
      .then((r) => r.json())
      .then((j: Resposta) => { if (vivo) setD(j); })
      .catch(() => { if (vivo) setD({ available: false }); });
    return () => { vivo = false; };
  }, []);

  if (!d?.available || !d.curva?.length) return null;
  const comAmostra = d.curva.filter((f) => f.aconteceu !== null);
  if (comAmostra.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/30 bg-secondary/5 p-5">
      <div className="flex items-center gap-2 mb-1.5">
        <Target className="w-4 h-4 text-gold shrink-0" />
        <h3 className="text-sm font-bold text-foreground">Quando dizemos 70%, acontece quanto?</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        Esta é a nossa <Termo nome="calibracao">calibração</Termo>: se prometemos 70% e a coisa acontece
        perto de 70% das vezes, acertamos o tom. Cada faixa tem a própria margem, porque faixa com
        poucos casos merece menos confiança que faixa com muitos.{" "}
        <strong className="text-foreground">
          {d.faixasCalibradas} de {d.faixasComAmostra} faixas estão calibradas
        </strong>{" "}
        em {d.total} previsões resolvidas.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-b border-border/30">
              <th className="text-left font-medium py-2">Nós dissemos</th>
              <th className="text-right font-medium py-2">Casos</th>
              <th className="text-right font-medium py-2">Aconteceu</th>
              <th className="text-right font-medium py-2 hidden sm:table-cell">Margem</th>
              <th className="text-right font-medium py-2">Leitura</th>
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {comAmostra.map((f) => (
              <tr key={f.faixa} className="border-b border-border/15 last:border-0">
                <td className="py-2 text-foreground/90">{f.faixa}</td>
                <td className="py-2 text-right text-muted-foreground">{f.n}</td>
                <td className="py-2 text-right text-foreground font-semibold">{f.aconteceu}%</td>
                <td className="py-2 text-right text-muted-foreground/70 hidden sm:table-cell">±{f.margemPp}</td>
                <td className={`py-2 text-right font-sans text-[11px] ${f.dentroDaMargem ? "text-positive" : "text-gold"}`}>
                  {f.dentroDaMargem
                    ? "no alvo"
                    : (f.desvioPp ?? 0) > 0 ? "aconteceu mais" : "aconteceu menos"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-3">
        “No alvo” quer dizer que o que prometemos cabe dentro da margem do que aconteceu.
        As faixas fora do alvo ficam aqui à vista — mostrar onde erramos é o que dá valor ao resto.
      </p>
    </div>
  );
}
