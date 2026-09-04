/**
 * Evolucao — "estamos melhorando?"
 *
 * ⚠️ Este bloco existe para IMPEDIR uma leitura errada, não para exibir uma curva
 * bonita. Com poucos meses de histórico, qualquer sobe-e-desce entre períodos cabe
 * dentro da margem — e ler "subiu de 77% para 80%" como progresso é o mesmo erro
 * que custou caro a este projeto: tratar a direção de um número como prova, sem
 * perguntar se ele se distingue de ruído.
 *
 * Por isso a frase do veredito vem ANTES da tabela, e ela é calculada comparando
 * os intervalos — não as porcentagens.
 */
import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";

interface Mes {
  mes: string; n: number;
  acerto: number | null; margemPp: number | null;
  baixo: number | null; alto: number | null;
  acertoMercado: number | null;
}
type Tendencia = "sem-dados" | "estavel" | "melhorando" | "piorando";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotulo = (mes: string) => {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1] ?? m}/${a.slice(2)}`;
};

const VEREDITO: Record<Tendencia, string> = {
  "sem-dados": "Ainda não temos meses suficientes para falar de tendência.",
  estavel: "Nossa taxa de acerto está estável: a variação entre os meses cabe dentro da margem de erro, então não dá para afirmar que melhoramos nem que pioramos.",
  melhorando: "Nossa taxa de acerto melhorou de forma que a margem de erro não explica.",
  piorando: "Nossa taxa de acerto caiu de forma que a margem de erro não explica — e deixamos isso à vista.",
};

export function Evolucao() {
  const [d, setD] = useState<{ available: boolean; meses?: Mes[]; tendencia?: Tendencia; minAmostra?: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch("/api/ai/evolution")
      .then((r) => r.json())
      .then((j) => { if (vivo) setD(j); })
      .catch(() => { if (vivo) setD({ available: false }); });
    return () => { vivo = false; };
  }, []);

  if (!d?.available || !d.meses?.length) return null;
  const comAmostra = d.meses.filter((m) => m.acerto !== null);
  if (comAmostra.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border/30 bg-secondary/5 p-5">
      <div className="flex items-center gap-2 mb-1.5">
        <TrendingUp className="w-4 h-4 text-gold shrink-0" />
        <h3 className="text-sm font-bold text-foreground">Estamos melhorando com o tempo?</h3>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed mb-4">
        {VEREDITO[d.tendencia ?? "sem-dados"]}
      </p>

      <div className="space-y-2">
        {comAmostra.map((m) => (
          <div key={m.mes} className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-muted-foreground w-14 shrink-0">{rotulo(m.mes)}</span>
            {/* A barra desenha o INTERVALO, não só a porcentagem: é a largura dele
                que mostra o quanto se pode confiar naquele mês. */}
            <div className="flex-1 h-5 rounded bg-secondary/40 relative overflow-hidden">
              <div
                className="absolute h-full bg-gold/25 border-x border-gold/50"
                style={{ left: `${m.baixo}%`, width: `${Math.max(1, (m.alto ?? 0) - (m.baixo ?? 0))}%` }}
              />
              <div className="absolute h-full w-px bg-gold" style={{ left: `${m.acerto}%` }} />
            </div>
            <span className="text-[11px] font-mono text-foreground w-24 text-right shrink-0">
              {m.acerto}% <span className="text-muted-foreground/60">±{m.margemPp}</span>
            </span>
            <span className="text-[11px] font-mono text-muted-foreground/70 w-10 text-right shrink-0">{m.n}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-muted-foreground/60 leading-relaxed mt-3">
        A faixa clara é a margem de erro do mês; o traço é a taxa de acerto. Quando as faixas de dois
        meses se sobrepõem, a diferença entre eles pode ser só sorte da amostra. Meses com menos de{" "}
        {d.minAmostra} casos ficam de fora.
      </p>
    </div>
  );
}
