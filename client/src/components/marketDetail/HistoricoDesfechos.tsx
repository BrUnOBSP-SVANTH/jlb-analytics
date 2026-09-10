/**
 * HistoricoDesfechos — o gráfico de vários candidatos, um por linha.
 *
 * O QUE FALTAVA. Num mercado de múltiplos desfechos (eleição, campeonato) a tela
 * já listava as possibilidades com a probabilidade de cada uma: "Lula 38%,
 * Bolsonaro 44%". Mas número parado não conta a história — quem estava na frente
 * há dois meses, quando a virada aconteceu, se a vantagem está crescendo ou
 * encolhendo. É justamente o que se olha numa eleição, e o que o Polymarket
 * mostra na tela deles.
 *
 * Cada desfecho tem preço próprio na plataforma, então cada um tem sua própria
 * série histórica. O servidor passou a preservar o identificador de cada um
 * (antes só o do líder sobrevivia à junção dos mercados aninhados) e aqui as
 * séries são buscadas em paralelo e desenhadas juntas, na mesma escala.
 *
 * DECISÕES QUE VALEM REGISTRO:
 *
 * · NO MÁXIMO 5 LINHAS. Cada uma é uma ida à rede; e acima de cinco o gráfico
 *   vira emaranhado, que é pior que não ter gráfico. Os demais continuam na
 *   lista de desfechos, com o número.
 * · A ESCALA É COMUM E FIXA EM 0–100%. Esticar cada linha na sua própria faixa
 *   deixaria o desenho bonito e MENTIROSO: um candidato de 2% pareceria disputar
 *   de igual para igual com um de 45%.
 * · SEM SUAVIZAÇÃO, pela mesma razão do minigráfico dos cards: bezier entre
 *   pontos medidos inventa preços que nunca existiram.
 */
import { useEffect, useState } from "react";
import AnimatedSection from "@/components/AnimatedSection";
import { LineChart } from "lucide-react";
import { type MarketBasic } from "@/components/marketDetail/types";
import { Explain } from "@/components/marketDetail/Explain";

const MAX_LINHAS = 5;
const W = 720, H = 220, PAD_ESQ = 4, PAD_DIR = 128, PAD_V = 12;

/** Cores das linhas. Ordem = ranking, então a primeira é sempre a do líder. */
const CORES = [
  "var(--color-primary)",
  "var(--color-neon-blue)",
  "var(--color-positive)",
  "var(--color-warning)",
  "var(--color-negative)",
];

interface Serie {
  label: string;
  cor: string;
  pontos: { t: number; p: number }[];
  atual: number;
}

export function HistoricoDesfechos({ market }: { market: MarketBasic }) {
  const [series, setSeries] = useState<Serie[]>([]);
  const [carregando, setCarregando] = useState(true);

  const outcomes = market.parsedOutcomes;
  const tokens = market.outcomeTokens;

  useEffect(() => {
    if (!outcomes || outcomes.length <= 2 || !tokens) { setCarregando(false); return; }
    let vivo = true;

    const alvos = outcomes.slice(0, MAX_LINHAS)
      .map((o, i) => ({ o, token: tokens[i] }))
      .filter((x) => x.token);

    if (alvos.length === 0) { setCarregando(false); return; }

    Promise.all(alvos.map(({ o, token }, i) =>
      fetch(`/api/polymarket/clob-history?tokenId=${encodeURIComponent(token)}`)
        .then((r) => r.ok ? r.json() as Promise<{ history?: { t: number; p: number }[] }> : null)
        .then((d) => {
          const h = (d?.history ?? []).filter((x) => Number.isFinite(x.t) && Number.isFinite(x.p));
          if (h.length < 4) return null;
          return { label: o.label, cor: CORES[i % CORES.length], pontos: h, atual: o.prob } as Serie;
        })
        .catch(() => null),
    )).then((rs) => {
      if (!vivo) return;
      setSeries(rs.filter((r): r is Serie => r !== null));
      setCarregando(false);
    });

    return () => { vivo = false; };
  }, [outcomes, tokens]);

  if (!outcomes || outcomes.length <= 2) return null;
  if (carregando) {
    return (
      <AnimatedSection delay={0.08}>
        <div className="glass-card rounded-xl p-5">
          <div className="h-4 w-40 bg-secondary/40 rounded animate-pulse mb-4" />
          <div className="h-[220px] bg-secondary/20 rounded animate-pulse" />
        </div>
      </AnimatedSection>
    );
  }
  // Sem histórico não inventamos gráfico: a lista de desfechos abaixo já mostra
  // o número de agora, que é dado real.
  if (series.length === 0) return null;

  // Escala de tempo comum: da série que começa mais cedo até agora.
  const tMin = Math.min(...series.map((s) => s.pontos[0].t));
  const tMax = Math.max(...series.map((s) => s.pontos[s.pontos.length - 1].t));
  const spanT = tMax - tMin || 1;

  const emX = (t: number) => PAD_ESQ + ((t - tMin) / spanT) * (W - PAD_ESQ - PAD_DIR);
  // 0–100% fixo, sempre. Ver a nota sobre escala no topo do arquivo.
  const emY = (p: number) => PAD_V + (1 - p) * (H - PAD_V * 2);

  const dias = Math.max(1, Math.round(spanT / 86400));

  return (
    <AnimatedSection delay={0.08}>
      <div className="glass-card rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <LineChart className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-[var(--titulo)]">Como cada um chegou aqui</h2>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {series.length} desfechos · {dias} dias
          </span>
        </div>

        <Explain>
          Cada linha é um desfecho e mostra a chance que o mercado deu a ele ao longo do tempo.
          Todas na <strong className="text-foreground">mesma escala de 0% a 100%</strong> — é o que
          permite comparar: onde as linhas se cruzam, houve virada.
        </Explain>

        <div className="overflow-x-auto">
          {/* Altura AUTOMÁTICA, e não fixa. Com `height` travado e a proporção
              do viewBox diferente da do container, o SVG se encolhe e centraliza
              — foi o que apareceu no primeiro teste: o gráfico ocupando o miolo
              da tela com vazio dos dois lados. Deixando a largura mandar, ele
              preenche o espaço e a altura acompanha. */}
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[520px]" role="img"
            aria-label={`Histórico de ${series.length} desfechos ao longo de ${dias} dias`}>
            {/* Grade: a escala, sem a qual as linhas não significam nada. */}
            {[0, 0.25, 0.5, 0.75, 1].map((n) => (
              <g key={n}>
                <line x1={PAD_ESQ} y1={emY(n)} x2={W - PAD_DIR} y2={emY(n)}
                  stroke="var(--color-muted-foreground)" strokeOpacity={n === 0.5 ? 0.22 : 0.1}
                  strokeWidth={1} strokeDasharray={n === 0.5 ? "3 4" : undefined} />
                {/* Rótulo de eixo é DADO, não decoração (TRV-12). Estava em 9px
                    com opacidade 0,55 — a auditoria mediu 1,42:1, quase invisível
                    no tema escuro. Sem opacidade e em 11px ele passa a ser legível
                    com a mesma cor de texto secundário do resto do site. */}
                <text x={W - PAD_DIR + 6} y={emY(n) + 4} fontSize={11}
                  fill="var(--color-muted-foreground)">{n * 100}%</text>
              </g>
            ))}

            {series.map((s) => {
              const d = s.pontos
                .map((pt, i) => `${i === 0 ? "M" : "L"}${emX(pt.t).toFixed(1)},${emY(pt.p).toFixed(1)}`)
                .join(" ");
              const fim = s.pontos[s.pontos.length - 1];
              return (
                <g key={s.label}>
                  <path d={d} fill="none" stroke={s.cor} strokeWidth={1.9}
                    strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="spark-traco" />
                  <circle cx={emX(fim.t)} cy={emY(fim.p)} r={3} fill={s.cor} />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Legenda com o número de agora — a mesma leitura do gráfico, em texto,
            para quem prefere ler a olhar (e para quem usa leitor de tela). */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.cor }} />
              <span className="text-muted-foreground truncate max-w-[180px]" title={s.label}>{s.label}</span>
              <strong className="font-mono text-foreground tabular-nums">{Math.round(s.atual * 100)}%</strong>
            </span>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
}
