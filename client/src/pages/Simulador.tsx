/**
 * Simulador — JLB Analytics
 * Simulações de longo prazo para mercados preditivos:
 * EV acumulado (lei dos grandes números), crescimento de bankroll com Kelly,
 * e calibração de forecaster ao longo do tempo.
 */
import { useState, useMemo } from "react";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import {
  CHART_COLORS,
  CHART_TOOLTIP_STYLE,
  CHART_TICK_STYLE,
  formatAxisBRL,
  sanitizePositiveNumber,
} from "@/lib/data";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  AreaChart,
  Area,
} from "recharts";
import { TrendingUp, Activity, Target, Dice5, type LucideIcon } from "lucide-react";
import LaboratorioTabs from "@/components/LaboratorioTabs";
import { useSEO } from "@/hooks/useSEO";

const inputClass =
  "w-full mt-1.5 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
const labelClass = "text-xs text-muted-foreground uppercase tracking-wider";

type Tab = "ev" | "kelly" | "calibracao";

// ─── Educational intro ─────────────────────────────────────────────────────

function SimIntro({ icon: Icon, tagline, description, insight }: {
  icon: LucideIcon;
  tagline: string;
  description: string;
  insight: string;
}) {
  return (
    <AnimatedSection>
      <div className="mb-6 flex gap-4 p-5 rounded-xl border border-primary/20 bg-primary/5">
        <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{tagline}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
          <p className="text-xs text-primary/80 font-medium mt-2">O que você vai aprender: {insight}</p>
        </div>
      </div>
    </AnimatedSection>
  );
}

// ─── Controles reutilizáveis: slider rotulado + botão de sortear ──────────
function Slider({ id, label, value, min, max, step, onChange, format, hint }: {
  id: string; label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format?: (v: number) => string; hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className={labelClass} htmlFor={id}>{label}</label>
        <span className="text-sm font-mono font-bold text-foreground tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input
        id={id} type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-2 accent-primary cursor-pointer"
      />
      {hint && <p className="text-[11px] text-muted-foreground/80 mt-1 leading-snug">{hint}</p>}
    </div>
  );
}

/** Número de resultado em DESTAQUE — o herói da simulação (grande, com explicação). */
function ResultStat({ label, value, tone = "neutral", hint, big }: {
  label: string; value: string; tone?: "positive" | "negative" | "gold" | "blue" | "neutral"; hint?: string; big?: boolean;
}) {
  const color = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative"
    : tone === "gold" ? "text-gold" : tone === "blue" ? "text-neon-blue" : "text-foreground";
  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className={`${big ? "text-4xl" : "text-2xl"} font-mono font-bold tabular-nums leading-none ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}

function Reroll({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-primary/30 bg-primary/5 text-sm font-medium text-primary hover:bg-primary/10 active:scale-[0.99] transition-all"
    >
      <Dice5 className="w-4 h-4" aria-hidden="true" /> Sortear nova amostra
    </button>
  );
}
const rollSeed = () => Math.floor(Math.random() * 100000) + 1;

// ─── Seeded PRNG (LCG) — determinístico para o mesmo seed ─────────────────
function makePRNG(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// ─── 1. Simulador de EV Acumulado ─────────────────────────────────────────

function EVSimulator() {
  const [prob, setProb] = useState(55);
  const [odd, setOdd] = useState(1.9);
  const [nBets, setNBets] = useState(200);
  const [stake, setStake] = useState(100);
  const [seed, setSeed] = useState(42);

  const { chartData, finalPnL, winRate } = useMemo(() => {
    const rand = makePRNG(seed);
    const p = prob / 100;
    const b = odd - 1; // lucro líquido por unidade apostada em caso de ganho
    const evPerBet = p * b * stake - (1 - p) * stake;
    let pnl = 0;
    let wins = 0;
    const data: { n: number; PnL: number; EV_esperado: number }[] = [];

    for (let i = 1; i <= nBets; i++) {
      const win = rand() < p;
      pnl += win ? b * stake : -stake;
      if (win) wins++;
      if (i % Math.max(1, Math.floor(nBets / 100)) === 0 || i === nBets) {
        data.push({
          n: i,
          PnL: parseFloat(pnl.toFixed(2)),
          EV_esperado: parseFloat((evPerBet * i).toFixed(2)),
        });
      }
    }
    return {
      chartData: data,
      finalPnL: pnl,
      evTheory: evPerBet * nBets,
      winRate: wins / nBets,
    };
  }, [prob, odd, nBets, stake, seed]);

  const evPerBet = ((prob / 100) * (odd - 1) - (1 - prob / 100)) * stake;
  const isPositive = evPerBet > 0;

  return (
    <div className="space-y-6">
      <AnimatedSection>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2 glass-card rounded-xl p-6 space-y-4">
            <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-neon-blue" aria-hidden="true" />
              Parâmetros
            </h3>

            <Slider id="ev-prob" label="Sua chance real de ganhar" value={prob} min={1} max={99} step={0.5} onChange={setProb} format={(v) => `${v}%`}
              hint="A chance que VOCÊ acredita ser a real — não a que a casa oferece." />
            <Slider id="ev-odd" label="Odd decimal oferecida" value={odd} min={1.1} max={5} step={0.05} onChange={setOdd} format={(v) => v.toFixed(2)}
              hint={`Quanto o mercado paga: odd 2.0 dobra a posição. Ela embute ${(100 / odd).toFixed(0)}% de chance.`} />
            <div>
              <label className={labelClass} htmlFor="ev-stake">Valor por posição (R$)</label>
              <input id="ev-stake" type="number" min={1} step={10} value={stake}
                onChange={(e) => setStake(sanitizePositiveNumber(Number(e.target.value), 1))}
                className={inputClass} />
              <p className="text-[11px] text-muted-foreground/80 mt-1 leading-snug">Quanto você põe em cada rodada.</p>
            </div>
            <Slider id="ev-nbets" label="Número de rodadas" value={nBets} min={50} max={1000} step={50} onChange={setNBets}
              hint="Quantas vezes você repete a mesma posição. Quanto mais, mais a sorte some." />
            <Reroll onClick={() => setSeed(rollSeed())} />
          </div>

          <div className="lg:col-span-3 space-y-4">
            {/* Resultado em DESTAQUE — o herói da simulação */}
            <div className={`rounded-xl p-4 border ${isPositive ? "border-positive/30 bg-positive/[0.04]" : "border-negative/30 bg-negative/[0.04]"}`}>
              <p className={`text-sm font-bold mb-3 ${isPositive ? "text-positive" : "text-negative"}`}>
                {isPositive ? "✓ Posição de valor — o EV está a seu favor" : "✗ Cilada — o EV está contra você"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ResultStat big label="EV por posição" value={`${isPositive ? "+" : ""}R$ ${evPerBet.toFixed(2)}`} tone={isPositive ? "positive" : "negative"} hint="quanto você ganha (ou perde) EM MÉDIA por posição, no longo prazo" />
                <ResultStat label={`P&L após ${nBets}`} value={`${finalPnL >= 0 ? "+" : ""}R$ ${finalPnL.toFixed(0)}`} tone={finalPnL >= 0 ? "positive" : "negative"} hint="o que deu NESTA amostra (toque 🎲 pra outra)" />
                <ResultStat label="Você ganhou" value={`${(winRate * 100).toFixed(0)}%`} tone="blue" hint={`das ${nBets} rodadas — você previu ${prob}%`} />
              </div>
            </div>

            <div className="glass-card rounded-xl p-5">
              <h4 className="text-sm font-display font-semibold text-foreground mb-3">
                Trajetória real vs. EV esperado
              </h4>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ right: 12, bottom: 4 }}>
                  <XAxis dataKey="n" axisLine={false} tickLine={false} minTickGap={32} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }} label={{ value: "rodadas", position: "insideBottomRight", offset: -4, style: { fontSize: 10, fill: CHART_COLORS.muted } }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }}
                    tickFormatter={formatAxisBRL} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, name: string) => [`R$ ${v.toFixed(0)}`, name]} />
                  <Legend />
                  <ReferenceLine y={0} stroke={CHART_COLORS.muted} strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="EV_esperado" name="EV esperado" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  <Line type="monotone" dataKey="PnL" name="P&L real" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                A linha pontilhada é o EV teórico acumulado. A linha sólida é a trajetória real de uma amostra.
                No longo prazo, as duas convergem — isso é a Lei dos Grandes Números.
              </p>
            </div>
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}

// ─── 2. Simulador de Kelly ─────────────────────────────────────────────────

function KellySimulator() {
  const [prob, setProb] = useState(55);
  const [odd, setOdd] = useState(1.9);
  const [nBets, setNBets] = useState(150);
  const [seed, setSeed] = useState(7);

  const { chartData } = useMemo(() => {
    const rand = makePRNG(seed);
    const p = prob / 100;
    const b = odd - 1;
    const kelly = Math.max(0, (b * p - (1 - p)) / b);
    const halfKelly = kelly / 2;
    const overbet = Math.min(kelly * 2, 0.99);

    let bkFull = 1000;
    let bkHalf = 1000;
    let bkOver = 1000;

    const data: { n: number; Kelly: number; "½ Kelly": number; Overbet: number }[] = [
      { n: 0, Kelly: 1000, "½ Kelly": 1000, Overbet: 1000 },
    ];

    for (let i = 1; i <= nBets; i++) {
      const win = rand() < p;
      bkFull *= win ? 1 + kelly * b : 1 - kelly;
      bkHalf *= win ? 1 + halfKelly * b : 1 - halfKelly;
      bkOver *= win ? 1 + overbet * b : 1 - overbet;

      bkFull = Math.max(0.01, bkFull);
      bkHalf = Math.max(0.01, bkHalf);
      bkOver = Math.max(0.01, bkOver);

      if (i % Math.max(1, Math.floor(nBets / 80)) === 0 || i === nBets) {
        data.push({
          n: i,
          Kelly: parseFloat(bkFull.toFixed(2)),
          "½ Kelly": parseFloat(bkHalf.toFixed(2)),
          Overbet: parseFloat(bkOver.toFixed(2)),
        });
      }
    }

    return { chartData: data, kelly, halfKelly, overbet };
  }, [prob, odd, nBets, seed]);

  const b = odd - 1;
  const p = prob / 100;
  const kelly = Math.max(0, (b * p - (1 - p)) / b);
  const halfKelly = kelly / 2;
  const last = chartData[chartData.length - 1];

  return (
    <div className="space-y-6">
      <AnimatedSection>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2 glass-card rounded-xl p-6 space-y-4">
            <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-5 h-5 text-neon-blue" aria-hidden="true" />
              Parâmetros
            </h3>

            <Slider id="k-prob" label="Sua chance real de ganhar" value={prob} min={1} max={99} step={0.5} onChange={setProb} format={(v) => `${v}%`}
              hint="Sua estimativa honesta de acertar." />
            <Slider id="k-odd" label="Odd decimal" value={odd} min={1.1} max={5} step={0.05} onChange={setOdd} format={(v) => v.toFixed(2)}
              hint="O retorno pago. Junto com a chance, define o tamanho ideal da posição." />
            <Slider id="k-nbets" label="Número de rodadas" value={nBets} min={50} max={500} step={25} onChange={setNBets}
              hint="Quantas rodadas na sequência." />
            <Reroll onClick={() => setSeed(rollSeed())} />

            <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20 space-y-2">
              {[
                ["Kelly completo", `${(kelly * 100).toFixed(1)}% do bankroll`],
                ["½ Kelly", `${(halfKelly * 100).toFixed(1)}% do bankroll`],
                ["Overbet (2× Kelly)", `${(Math.min(kelly * 2, 0.99) * 100).toFixed(1)}% do bankroll`],
              ].map(([l, v]) => (
                <div key={l as string} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{l}</span>
                  <span className="font-mono text-foreground">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3 space-y-4">
            {/* Recomendação + banca final em DESTAQUE */}
            <div className="rounded-xl p-4 border border-neon-blue/25 bg-neon-blue/[0.04]">
              <p className="text-sm font-bold text-neon-blue mb-3">
                {kelly > 0
                  ? `A matemática diz: aposte ${(halfKelly * 100).toFixed(1)}% do bankroll por vez (½ Kelly — o equilíbrio seguro).`
                  : "Sem vantagem aqui (Kelly = 0) — a matemática manda NÃO entrar."}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ResultStat big label="½ Kelly (seguro)" value={`R$ ${last["½ Kelly"].toFixed(0)}`} tone="positive" hint="banca final operando com disciplina" />
                <ResultStat label="Kelly completo" value={`R$ ${last.Kelly.toFixed(0)}`} tone="gold" hint="ótimo na teoria, porém mais volátil" />
                <ResultStat label="Overbet (2× Kelly)" value={`R$ ${last.Overbet.toFixed(0)}`} tone="negative" hint="apostou demais → tende à ruína" />
              </div>
              <p className="text-[11px] text-muted-foreground/70 mt-2">Todas começaram em R$ 1.000 · toque 🎲 pra outra sequência.</p>
            </div>

            <div className="glass-card rounded-xl p-5">
              <h4 className="text-sm font-display font-semibold text-foreground mb-3">
                Bankroll ao longo do tempo — Kelly vs. ½ Kelly vs. Overbet
              </h4>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="kg1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="kg2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS.tertiary} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={CHART_COLORS.tertiary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="n" axisLine={false} tickLine={false} minTickGap={32} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }}
                    tickFormatter={formatAxisBRL} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, name: string) => [`R$ ${v.toFixed(2)}`, name]} />
                  <Legend />
                  <Area type="monotone" dataKey="Kelly" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#kg1)" dot={false} />
                  <Area type="monotone" dataKey="½ Kelly" stroke={CHART_COLORS.tertiary} strokeWidth={2} fill="url(#kg2)" dot={false} />
                  <Line type="monotone" dataKey="Overbet" stroke={CHART_COLORS.negative} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                Overbet (acima do Kelly) pode produzir ganhos altos no curto prazo,
                mas tende à ruína no longo prazo. ½ Kelly equilibra crescimento e variância.
              </p>
            </div>
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}

// ─── 3. Simulador de Calibração ────────────────────────────────────────────

function CalibracaoSimulator() {
  const [nPreds, setNPreds] = useState(100);
  const [bias, setBias] = useState(0); // viés: positivo = overconfidence, negativo = underconfidence
  const [seed, setSeed] = useState(13);

  const { chartData, finalBS, finalSS, decilData } = useMemo(() => {
    const rand = makePRNG(seed);

    // Gera previsões com viés calibrado
    const preds: { prob: number; outcome: number }[] = [];
    for (let i = 0; i < nPreds; i++) {
      const trueProbBase = 0.1 + rand() * 0.8; // distribuição uniforme de eventos reais
      // Forecaster com viés: se bias>0, ele infla as probabilidades
      const forecastProb = Math.min(0.99, Math.max(0.01, trueProbBase + bias / 100 + (rand() - 0.5) * 0.1));
      const outcome = rand() < trueProbBase ? 1 : 0;
      preds.push({ prob: forecastProb, outcome });
    }

    // Calcula Brier Score acumulado
    const bsData: { n: number; BS_acumulado: number; Referencia: number }[] = [];
    let bsSum = 0;
    for (let i = 0; i < preds.length; i++) {
      bsSum += Math.pow(preds[i].prob - preds[i].outcome, 2);
      if ((i + 1) % Math.max(1, Math.floor(nPreds / 50)) === 0 || i === preds.length - 1) {
        bsData.push({
          n: i + 1,
          BS_acumulado: parseFloat((bsSum / (i + 1)).toFixed(4)),
          Referencia: 0.25,
        });
      }
    }

    const finalBS = bsSum / nPreds;
    const finalSS = 1 - finalBS / 0.25;

    // Dados por decil de confiança
    const decis: Record<number, { sum: number; count: number; wins: number }> = {};
    for (let d = 1; d <= 10; d++) decis[d] = { sum: 0, count: 0, wins: 0 };
    for (const { prob, outcome } of preds) {
      const d = Math.min(10, Math.ceil(prob * 10));
      decis[d].sum += prob;
      decis[d].count++;
      decis[d].wins += outcome;
    }

    const decilPoints = Object.entries(decis)
      .filter(([, v]) => v.count > 0)
      .map(([d, v]) => ({
        decil: `${(parseInt(d) - 1) * 10}–${parseInt(d) * 10}%`,
        previsto: parseFloat((v.sum / v.count * 100).toFixed(1)),
        realizado: parseFloat((v.wins / v.count * 100).toFixed(1)),
      }));

    return { chartData: bsData, finalBS, finalSS, decilData: decilPoints };
  }, [nPreds, bias, seed]);

  const bsClass = (() => {
    if (finalBS < 0.10) return { label: "Muito bom", color: "text-positive" };
    if (finalBS < 0.15) return { label: "Bom", color: "text-primary" };
    if (finalBS < 0.20) return { label: "Mediano", color: "text-warning" };
    if (finalBS < 0.25) return { label: "Fraco", color: "text-orange-500" };
    return { label: "Pior que aleatório", color: "text-negative" };
  })();

  return (
    <div className="space-y-6">
      <AnimatedSection>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2 glass-card rounded-xl p-6 space-y-4">
            <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
              <Target className="w-5 h-5 text-neon-blue" aria-hidden="true" />
              Parâmetros
            </h3>

            <Slider id="cal-npreds" label="Número de previsões" value={nPreds} min={20} max={500} step={20} onChange={setNPreds}
              hint="Quantas previsões o forecaster faz. Mais previsões = nota mais confiável." />
            <Slider
              id="cal-bias" label="Viés do forecaster" value={bias} min={-30} max={30} step={5} onChange={setBias}
              format={(v) => (v > 0 ? `+${v}% superconfiante` : v < 0 ? `${v}% cauteloso` : "0% calibrado")}
              hint="Arraste para simular alguém superconfiante (+) ou cauteloso demais (−) e veja a nota piorar."
            />
            <Reroll onClick={() => setSeed(rollSeed())} />
          </div>

          <div className="lg:col-span-3 space-y-4">
            {/* Nota do forecaster em DESTAQUE */}
            <div className={`rounded-xl p-4 border ${finalBS < 0.15 ? "border-positive/30 bg-positive/[0.04]" : finalBS < 0.25 ? "border-gold/30 bg-gold/[0.04]" : "border-negative/30 bg-negative/[0.04]"}`}>
              <p className={`text-sm font-bold mb-3 ${bsClass.color}`}>Nota do forecaster: {bsClass.label}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ResultStat big label="Brier Score" value={finalBS.toFixed(3)} tone={finalBS < 0.15 ? "positive" : finalBS < 0.25 ? "gold" : "negative"} hint="erro médio da calibração — MENOR é melhor (0 = perfeito, 0,25 = igual a chutar)" />
                <ResultStat label="Skill Score" value={`${(finalSS * 100).toFixed(0)}%`} tone={finalSS > 0 ? "positive" : "negative"} hint="o quanto você é melhor que chutar 50%. Acima de 0 já é habilidade real" />
              </div>
            </div>

            <div className="glass-card rounded-xl p-5">
              <h4 className="text-sm font-display font-semibold text-foreground mb-3">
                Brier Score acumulado (convergência com mais previsões)
              </h4>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <XAxis dataKey="n" axisLine={false} tickLine={false} minTickGap={32} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }} domain={[0, 0.35]} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, name: string) => [v.toFixed(4), name]} />
                  <Legend />
                  <ReferenceLine y={0.25} stroke={CHART_COLORS.muted} strokeDasharray="3 3" label={{ value: "BS=0.25 (aleatório)", position: "right", style: { fontSize: 9, fill: CHART_COLORS.muted } }} />
                  <Line type="monotone" dataKey="BS_acumulado" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} name="Brier Score" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="glass-card rounded-xl p-5">
              <h4 className="text-sm font-display font-semibold text-foreground mb-3">
                Calibração por decil — previsto vs. realizado
              </h4>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={decilData}>
                  <XAxis dataKey="decil" axisLine={false} tickLine={false} tick={{ ...CHART_TICK_STYLE, fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]} />
                  <Legend />
                  <ReferenceLine
                    segment={[{ x: "0–10%", y: 5 }, { x: "90–100%", y: 95 }]}
                    stroke={CHART_COLORS.muted}
                    strokeDasharray="4 2"
                  />
                  <Line type="monotone" dataKey="previsto" stroke={CHART_COLORS.secondary} strokeWidth={2} dot name="Previsto" />
                  <Line type="monotone" dataKey="realizado" stroke={CHART_COLORS.primary} strokeWidth={2} dot name="Realizado" />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Forecaster bem calibrado: linha previsto ≈ linha realizado. Overconfidence desvia para cima.
              </p>
            </div>
          </div>
        </div>
      </AnimatedSection>
    </div>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function Simulador() {
  useSEO("Simulador de Mercados", "Simule estratégias de longo prazo: bankroll, tamanho de posição, variância e risco de ruína na prática.");
  const [tab, setTab] = useState<Tab>("ev");

  const tabs: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
    { id: "ev",          label: "EV Acumulado",      icon: TrendingUp },
    { id: "kelly",       label: "Bankroll (Kelly)",   icon: Activity   },
    { id: "calibracao",  label: "Calibração",         icon: Target     },
  ];

  return (
    <div>
      <LaboratorioTabs />
      <PageHeader
        title="Simulador de Longo Prazo"
        subtitle="Visualize a Lei dos Grandes Números, o impacto do Kelly e a convergência do Brier Score."
        badge="Simulador"
      />

      <div className="container py-10">
        <AnimatedSection>
          <div className="flex gap-2 mb-8 overflow-x-auto pb-2" role="tablist" aria-label="Tipo de simulação">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="w-4 h-4" aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>
        </AnimatedSection>

        {tab === "ev" && (
          <>
            <SimIntro
              icon={TrendingUp}
              tagline="Por que 5 rodadas não provam nada — mas 500 provam tudo."
              description="O EV positivo não garante acertar toda rodada, garante ganhar no agregado. Este simulador mostra como a trajetória real de P&L converge para o EV teórico com mais rodadas — a Lei dos Grandes Números em ação. Você vai ver por que variância de curto prazo engana e por que disciplina no longo prazo é a vantagem real."
              insight="Como identificar se uma sequência de perdas é má sorte ou sinal de EV negativo real."
            />
            <EVSimulator />
          </>
        )}
        {tab === "kelly" && (
          <>
            <SimIntro
              icon={Activity}
              tagline="Veja na prática por que arriscar demais destrói o bankroll — mesmo com edge positivo."
              description="O Critério de Kelly é matematicamente ótimo, mas desviar dele tem consequências assimétricas: arriscar menos (½ Kelly) cresce mais devagar porém com muito menos volatilidade. Arriscar acima do Kelly (overbet) parece agressivo mas tende à ruína. Este simulador compara as três estratégias na mesma sequência de resultados."
              insight="A diferença visual entre crescimento geométrico saudável e a curva em forma de montanha-russa do overbet."
            />
            <KellySimulator />
          </>
        )}
        {tab === "calibracao" && (
          <>
            <SimIntro
              icon={Target}
              tagline="Descubra se você tem overconfidence — o viés mais caro nos mercados preditivos."
              description="Overconfidence é quando você diz '80% de chance' mas isso acontece só 60% das vezes. Este simulador gera previsões com viés controlado e mostra como o Brier Score acumulado e o gráfico de calibração por decil revelam isso. Forecasters calibrados ganham mais porque as odds refletem a realidade deles melhor que o mercado."
              insight="Como o gráfico 'previsto vs. realizado' por faixa expõe viés sistemático que você não perceberia contando acertos."
            />
            <CalibracaoSimulator />
          </>
        )}
      </div>
    </div>
  );
}
