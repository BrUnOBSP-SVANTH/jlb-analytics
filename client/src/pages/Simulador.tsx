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
import { TrendingUp, Activity, Target, type LucideIcon } from "lucide-react";
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

  const { chartData, finalPnL, evTheory, winRate } = useMemo(() => {
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

            <div>
              <label className={labelClass} htmlFor="ev-prob">Probabilidade real de ganho (%)</label>
              <input id="ev-prob" type="number" min={1} max={99} step={0.5} value={prob}
                onChange={(e) => setProb(Math.min(99, Math.max(1, parseFloat(e.target.value) || 1)))}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ev-odd">Odd decimal oferecida</label>
              <input id="ev-odd" type="number" min={1.01} step={0.01} value={odd}
                onChange={(e) => setOdd(Math.max(1.01, parseFloat(e.target.value) || 1.01))}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ev-stake">Stake por aposta (R$)</label>
              <input id="ev-stake" type="number" min={1} step={10} value={stake}
                onChange={(e) => setStake(sanitizePositiveNumber(Number(e.target.value), 1))}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="ev-nbets">Número de apostas: {nBets}</label>
              <input id="ev-nbets" type="range" min={50} max={1000} step={50} value={nBets}
                onChange={(e) => setNBets(Number(e.target.value))}
                className="w-full mt-1.5 accent-primary" />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>50</span><span>1000</span>
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="ev-seed">Semente aleatória</label>
              <input id="ev-seed" type="number" min={1} step={1} value={seed}
                onChange={(e) => setSeed(Math.max(1, parseInt(e.target.value) || 1))}
                className={inputClass} />
              <p className="text-[10px] text-muted-foreground mt-1">Mude para ver diferentes trajetórias</p>
            </div>

            <div className={`p-3 rounded-lg border ${isPositive ? "bg-positive/10 border-positive/20" : "bg-negative/10 border-negative/20"}`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">EV por aposta</p>
              <p className={`text-lg font-mono font-bold ${isPositive ? "text-positive" : "text-negative"}`}>
                {isPositive ? "+" : ""}R$ {evPerBet.toFixed(2)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Prob. implícita da odd: {(100 / odd).toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="glass-card rounded-xl p-4">
                <p className="text-xs text-muted-foreground">P&L realizado</p>
                <p className={`text-xl font-mono font-bold mt-1 ${finalPnL >= 0 ? "text-positive" : "text-negative"}`}>
                  {finalPnL >= 0 ? "+" : ""}R$ {finalPnL.toFixed(0)}
                </p>
              </div>
              <div className="glass-card rounded-xl p-4">
                <p className="text-xs text-muted-foreground">EV teórico</p>
                <p className={`text-xl font-mono font-bold mt-1 ${evTheory >= 0 ? "text-gold" : "text-negative"}`}>
                  {evTheory >= 0 ? "+" : ""}R$ {evTheory.toFixed(0)}
                </p>
              </div>
              <div className="glass-card rounded-xl p-4">
                <p className="text-xs text-muted-foreground">Win rate</p>
                <p className="text-xl font-mono font-bold text-neon-blue mt-1">
                  {(winRate * 100).toFixed(1)}%
                  <span className="text-xs text-muted-foreground ml-1">/ {prob}%</span>
                </p>
              </div>
            </div>

            <div className="glass-card rounded-xl p-5">
              <h4 className="text-sm font-display font-semibold text-foreground mb-3">
                Trajetória real vs. EV esperado
              </h4>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <XAxis dataKey="n" axisLine={false} tickLine={false} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }} label={{ value: "apostas", position: "insideBottomRight", offset: -8, style: { fontSize: 10, fill: "#888" } }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }}
                    tickFormatter={(v: number) => `R$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, name: string) => [`R$ ${v.toFixed(0)}`, name]} />
                  <Legend />
                  <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                  <Line type="monotone" dataKey="EV_esperado" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={false} strokeDasharray="5 3" />
                  <Line type="monotone" dataKey="PnL" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
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

  return (
    <div className="space-y-6">
      <AnimatedSection>
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-2 glass-card rounded-xl p-6 space-y-4">
            <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-5 h-5 text-neon-blue" aria-hidden="true" />
              Parâmetros
            </h3>

            <div>
              <label className={labelClass} htmlFor="k-prob">Probabilidade real de ganho (%)</label>
              <input id="k-prob" type="number" min={1} max={99} step={0.5} value={prob}
                onChange={(e) => setProb(Math.min(99, Math.max(1, parseFloat(e.target.value) || 1)))}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="k-odd">Odd decimal</label>
              <input id="k-odd" type="number" min={1.01} step={0.01} value={odd}
                onChange={(e) => setOdd(Math.max(1.01, parseFloat(e.target.value) || 1.01))}
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass} htmlFor="k-nbets">Apostas: {nBets}</label>
              <input id="k-nbets" type="range" min={50} max={500} step={25} value={nBets}
                onChange={(e) => setNBets(Number(e.target.value))}
                className="w-full mt-1.5 accent-primary" />
            </div>
            <div>
              <label className={labelClass} htmlFor="k-seed">Semente</label>
              <input id="k-seed" type="number" min={1} value={seed}
                onChange={(e) => setSeed(Math.max(1, parseInt(e.target.value) || 1))}
                className={inputClass} />
            </div>

            <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20 space-y-2">
              {[
                ["Kelly completo", `${(kelly * 100).toFixed(1)}% do bankroll`],
                ["½ Kelly", `${(halfKelly * 100).toFixed(1)}% do bankroll`],
                ["Overbet (2× Kelly)", `${Math.min(kelly * 2, 0.99 * 100).toFixed(1)}% do bankroll`],
              ].map(([l, v]) => (
                <div key={l as string} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{l}</span>
                  <span className="font-mono text-foreground">{v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3 space-y-4">
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
                  <XAxis dataKey="n" axisLine={false} tickLine={false} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }}
                    tickFormatter={(v: number) => `R$${v.toFixed(0)}`} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, name: string) => [`R$ ${v.toFixed(2)}`, name]} />
                  <Legend />
                  <Area type="monotone" dataKey="Kelly" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#kg1)" dot={false} />
                  <Area type="monotone" dataKey="½ Kelly" stroke={CHART_COLORS.tertiary} strokeWidth={2} fill="url(#kg2)" dot={false} />
                  <Line type="monotone" dataKey="Overbet" stroke="#ef4444" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
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
    if (finalBS < 0.20) return { label: "Mediano", color: "text-yellow-500" };
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

            <div>
              <label className={labelClass} htmlFor="cal-npreds">Número de previsões: {nPreds}</label>
              <input id="cal-npreds" type="range" min={20} max={500} step={20} value={nPreds}
                onChange={(e) => setNPreds(Number(e.target.value))}
                className="w-full mt-1.5 accent-primary" />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>20</span><span>500</span>
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="cal-bias">
                Viés do forecaster: {bias > 0 ? `+${bias}% (overconfidence)` : bias < 0 ? `${bias}% (underconfidence)` : "0% (calibrado)"}
              </label>
              <input id="cal-bias" type="range" min={-30} max={30} step={5} value={bias}
                onChange={(e) => setBias(Number(e.target.value))}
                className="w-full mt-1.5 accent-primary" />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>−30% (under)</span><span>+30% (over)</span>
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="cal-seed">Semente</label>
              <input id="cal-seed" type="number" min={1} value={seed}
                onChange={(e) => setSeed(Math.max(1, parseInt(e.target.value) || 1))}
                className={inputClass} />
            </div>

            <div className="p-3 rounded-lg bg-obsidian/50 border border-border/20 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Brier Score final</span>
                <span className={`font-mono font-bold ${bsClass.color}`}>{finalBS.toFixed(4)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Skill Score</span>
                <span className={`font-mono font-bold ${finalSS > 0 ? "text-positive" : "text-negative"}`}>
                  {(finalSS * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Classificação</span>
                <span className={`font-medium ${bsClass.color}`}>{bsClass.label}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-4">
            <div className="glass-card rounded-xl p-5">
              <h4 className="text-sm font-display font-semibold text-foreground mb-3">
                Brier Score acumulado (convergência com mais previsões)
              </h4>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData}>
                  <XAxis dataKey="n" axisLine={false} tickLine={false} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ ...CHART_TICK_STYLE, fontSize: 11 }} domain={[0, 0.35]} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number, name: string) => [v.toFixed(4), name]} />
                  <Legend />
                  <ReferenceLine y={0.25} stroke="#888" strokeDasharray="3 3" label={{ value: "BS=0.25 (aleatório)", position: "right", style: { fontSize: 9, fill: "#888" } }} />
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
                    stroke="#555"
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
  useSEO("Simulador de Apostas", "Simule estratégias de longo prazo: bankroll, stake, variância e risco de ruína na prática.");
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

      <div className="container py-12">
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
              tagline="Por que 5 apostas não provam nada — mas 500 provam tudo."
              description="O EV positivo não garante ganhar toda aposta, garante ganhar no agregado. Este simulador mostra como a trajetória real de P&L converge para o EV teórico com mais apostas — a Lei dos Grandes Números em ação. Você vai ver por que variância de curto prazo engana e por que disciplina no longo prazo é a vantagem real."
              insight="Como identificar se uma sequência de perdas é má sorte ou sinal de EV negativo real."
            />
            <EVSimulator />
          </>
        )}
        {tab === "kelly" && (
          <>
            <SimIntro
              icon={Activity}
              tagline="Veja na prática por que apostar demais destrói o bankroll — mesmo com edge positivo."
              description="O Critério de Kelly é matematicamente ótimo, mas desviar dele tem consequências assimétricas: apostar menos (½ Kelly) cresce mais devagar porém com muito menos volatilidade. Apostar acima do Kelly (overbet) parece agressivo mas tende à ruína. Este simulador compara as três estratégias na mesma sequência de resultados."
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
