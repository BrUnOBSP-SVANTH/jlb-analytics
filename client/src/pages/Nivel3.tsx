/**
 * Nível 3 — Modelos Básicos (Premium)
 * Regra de Taylor, Poisson, Elo, GARCH, ENSO, Pesquisas Eleitorais.
 *
 * Objetivo: o usuário entende o que um modelo está fazendo e por que
 * diverge do mercado — sem precisar saber derivar as equações.
 */

import { useState, useEffect } from "react";
import { TrendingUp, Zap, Cloud, BarChart2, Info, AlertCircle, Swords } from "lucide-react";
import { useModelCall } from "@/hooks/useModels";
import { awardPoints } from "@/lib/userProgress";
import { useSEO } from "@/hooks/useSEO";
import LevelNav from "@/components/LevelNav";
import PageHeader from "@/components/PageHeader";

interface TaylorResult { selic_observed: number; taylor_implied: number; divergence_pp: number; signal: string; explanation: string; }
interface PoissonResult { p_home_win: number; p_draw: number; p_away_win: number; lambda_home: number; lambda_away: number; top_scores: { score: string; probability: number }[]; explanation: string; }
interface EloResult { p_a_wins: number; p_b_wins: number; rating_a: number; rating_b: number; signal: string; explanation: string; }
interface GarchResult { vol_daily_pct: number; vol_annual_pct: number; signal: string; warning: string; explanation: string; model: string; }
interface EnsoResult { phase: string; oni: number; signal: string; regional_impacts_brazil: string[]; explanation: string; }


function ExplanationBox({ text }: { text: string }) {
  return (
    <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20">
      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
    </div>
  );
}

function WarnBox({ text }: { text: string }) {
  return (
    <div className="mt-2 flex items-start gap-2 p-3 rounded-lg bg-warning/5 border border-warning/30">
      <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
      <p className="text-xs text-warning leading-relaxed">{text}</p>
    </div>
  );
}

// ─── Regra de Taylor ──────────────────────────────────────────────────────────
function TaylorCalculator() {
  const [selic, setSelic] = useState("10.5");
  const [ipca, setIpca] = useState("4.8");
  const [gap, setGap] = useState("-1.2");
  const { data, loading, error, run } = useModelCall<TaylorResult>("/api/level3/taylor-rule");

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm text-foreground">Regra de Taylor — Economia</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Benchmark clássico para política monetária. Compara a Selic real com o nível implícito pelo modelo
        e sinaliza desvios que historicamente precedem revisão de expectativas.
      </p>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Selic atual (% a.a.)", val: selic, set: setSelic },
          { label: "IPCA 12 meses (%)", val: ipca, set: setIpca },
          { label: "Hiato do produto (%)", val: gap, set: setGap },
        ].map(({ label, val, set }) => (
          <div key={label}>
            <label className="block text-xs text-muted-foreground mb-1">{label}</label>
            <input type="number" value={val} onChange={(e) => set(e.target.value)} step="0.1"
              className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        ))}
      </div>
      <button onClick={async () => {
          const r = await run({ selic_observed: parseFloat(selic), ipca_12m: parseFloat(ipca), output_gap_pct: parseFloat(gap) });
          if (r.data) awardPoints("calculator_used", "Calculou Regra de Taylor (Nível 3)");
        }}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Calculando..." : "Calcular"}
      </button>
      {data && (
        <div className="grid grid-cols-3 gap-4 text-center">
          <div><div className="text-xs text-muted-foreground">Selic real</div><div className="text-lg font-bold text-foreground">{data.selic_observed}%</div></div>
          <div><div className="text-xs text-muted-foreground">Taylor implícito</div><div className="text-lg font-bold text-primary">{data.taylor_implied.toFixed(2)}%</div></div>
          <div>
            <div className="text-xs text-muted-foreground">Desvio</div>
            <div className={`text-lg font-bold ${data.divergence_pp > 0 ? "text-negative" : "text-positive"}`}>
              {data.divergence_pp > 0 ? "+" : ""}{data.divergence_pp.toFixed(2)} pp
            </div>
          </div>
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <div className="text-xs text-negative p-2">{error}</div>}
    </div>
  );
}

// ─── Poisson ──────────────────────────────────────────────────────────────────
function PoissonCalculator() {
  const [hAtk, setHAtk] = useState("1.3");
  const [hDef, setHDef] = useState("0.85");
  const [aAtk, setAAtk] = useState("1.1");
  const [aDef, setADef] = useState("0.95");
  const { data, loading, error, run } = useModelCall<PoissonResult>("/api/level3/poisson");

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm text-foreground">Poisson Duplo + Dixon-Coles — Futebol</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Força de ataque/defesa relativa ao average da liga (1.0 = média). Valores acima de 1 = acima da média.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Casa — Ataque", val: hAtk, set: setHAtk },
          { label: "Casa — Defesa", val: hDef, set: setHDef },
          { label: "Visitante — Ataque", val: aAtk, set: setAAtk },
          { label: "Visitante — Defesa", val: aDef, set: setADef },
        ].map(({ label, val, set }) => (
          <div key={label}>
            <label className="block text-xs text-muted-foreground mb-1">{label}</label>
            <input type="number" value={val} onChange={(e) => set(e.target.value)} step="0.05" min="0.1"
              className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        ))}
      </div>
      <button onClick={async () => {
          const r = await run({ home_attack: parseFloat(hAtk), home_defense: parseFloat(hDef), away_attack: parseFloat(aAtk), away_defense: parseFloat(aDef) });
          if (r.data) awardPoints("calculator_used", "Simulou partida com Poisson (Nível 3)");
        }}
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Calculando..." : "Simular partida"}
      </button>
      {data && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-positive/10">
              <div className="text-xs text-muted-foreground">Casa</div>
              <div className="text-lg font-bold text-positive">{(data.p_home_win * 100).toFixed(1)}%</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/20">
              <div className="text-xs text-muted-foreground">Empate</div>
              <div className="text-lg font-bold text-foreground">{(data.p_draw * 100).toFixed(1)}%</div>
            </div>
            <div className="p-2 rounded-lg bg-negative/10">
              <div className="text-xs text-muted-foreground">Visitante</div>
              <div className="text-lg font-bold text-negative">{(data.p_away_win * 100).toFixed(1)}%</div>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Top placares</div>
            <div className="flex flex-wrap gap-2">
              {data.top_scores.map((s) => (
                <span key={s.score} className="px-2 py-1 rounded bg-secondary/50 text-xs">
                  {s.score} <strong>{(s.probability * 100).toFixed(1)}%</strong>
                </span>
              ))}
            </div>
          </div>
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <div className="text-xs text-negative p-2">{error}</div>}
    </div>
  );
}

// ─── GARCH ───────────────────────────────────────────────────────────────────
function GarchCalculator() {
  const [returnsText, setReturnsText] = useState(
    "0.02,-0.03,0.01,0.05,-0.02,-0.04,0.03,0.01,-0.01,0.06,-0.03,0.02,0.01,-0.02,0.04,0.01,-0.05,0.03,-0.02,0.01,0.03,-0.01,0.02,-0.03,0.05,-0.01,0.02,-0.04,0.01,0.03"
  );
  const { data, loading, error, run } = useModelCall<GarchResult>("/api/level3/garch");

  const parseReturns = (s: string) =>
    s.split(",").map((v) => parseFloat(v.trim())).filter((v) => !isNaN(v));

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-warning" />
        <h3 className="font-semibold text-sm text-foreground">GARCH — Volatilidade</h3>
      </div>
      <WarnBox text="GARCH prevê TAMANHO da variação, não direção. Não use para timing de entrada ou saída. Use para dimensionar risco." />
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Retornos diários (separados por vírgula)</label>
        <textarea value={returnsText} onChange={(e) => setReturnsText(e.target.value)} rows={3}
          className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
      </div>
      <button onClick={async () => {
          const r = await run({ returns: parseReturns(returnsText) });
          if (r.data) awardPoints("calculator_used", "Estimou volatilidade com GARCH (Nível 3)");
        }} disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Calculando..." : "Estimar volatilidade"}
      </button>
      {data && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div><div className="text-xs text-muted-foreground">Vol. diária</div><div className="text-xl font-bold text-foreground">{data.vol_daily_pct.toFixed(2)}%</div></div>
            <div><div className="text-xs text-muted-foreground">Vol. anual</div><div className="text-xl font-bold text-foreground">{data.vol_annual_pct.toFixed(1)}%</div></div>
          </div>
          <WarnBox text={data.warning} />
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <div className="text-xs text-negative p-2">{error}</div>}
    </div>
  );
}

// ─── ENSO ────────────────────────────────────────────────────────────────────
function EnsoCalculator() {
  const [oni, setOni] = useState("0.7");
  const { data, loading, error, run } = useModelCall<EnsoResult>("/api/level3/enso");

  const phaseColor: Record<string, string> = {
    "El Niño": "text-negative",
    "La Niña": "text-primary",
    "Neutro": "text-muted-foreground",
  };

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Cloud className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm text-foreground">ENSO — Fase El Niño / La Niña</h3>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Índice ONI (Oceanic Niño Index)</label>
        <input type="range" min="-3" max="3" step="0.1" value={oni}
          onChange={(e) => setOni(e.target.value)} className="w-full accent-primary" />
        <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
          <span>−3 (La Niña forte)</span>
          <span className="font-medium text-foreground">{parseFloat(oni).toFixed(1)}</span>
          <span>+3 (El Niño forte)</span>
        </div>
      </div>
      <button onClick={() => run({ oni_index: parseFloat(oni) })} disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Analisando..." : "Classificar fase"}
      </button>
      {data && (
        <div className="space-y-3">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">Fase ENSO</div>
            <div className={`text-2xl font-bold ${phaseColor[data.phase] ?? "text-foreground"}`}>{data.phase}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Impactos regionais no Brasil</div>
            <ul className="space-y-1">
              {(data.regional_impacts_brazil ?? []).map((impact, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-primary mt-0.5">•</span>{impact}
                </li>
              ))}
            </ul>
          </div>
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <div className="text-xs text-negative p-2">{error}</div>}
    </div>
  );
}

// ─── Elo Rating ──────────────────────────────────────────────────────────────
// Faltava a calculadora que a Trilha prometia ("Elo Rating"); o endpoint
// /level3/elo e a interface já existiam — só a UI não tinha sido feita.
function EloCalculator() {
  const [ratingA, setRatingA] = useState("1600");
  const [ratingB, setRatingB] = useState("1500");
  const [homeAdv, setHomeAdv] = useState(true);
  const { data, loading, error, run } = useModelCall<EloResult>("/api/level3/elo");
  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Swords className="w-4 h-4 text-primary" />
        <h3 className="font-semibold text-sm text-foreground">Elo Rating — Probabilidade de vitória</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Rating A (mandante)</label>
          <input type="number" value={ratingA} onChange={(e) => setRatingA(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Rating B (visitante)</label>
          <input type="number" value={ratingB} onChange={(e) => setRatingB(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
        <input type="checkbox" checked={homeAdv} onChange={(e) => setHomeAdv(e.target.checked)} className="accent-primary" />
        Aplicar vantagem de casa ao time A
      </label>
      <button onClick={() => run({ rating_a: parseFloat(ratingA), rating_b: parseFloat(ratingB), home_advantage: homeAdv })} disabled={loading}
        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50">
        {loading ? "Calculando..." : "Calcular probabilidade"}
      </button>
      {data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="p-3 rounded-lg bg-secondary/30">
              <div className="text-xs text-muted-foreground">P(A vence)</div>
              <div className={`text-2xl font-bold ${data.p_a_wins >= 0.5 ? "text-primary" : "text-muted-foreground"}`}>{(data.p_a_wins * 100).toFixed(1)}%</div>
            </div>
            <div className="p-3 rounded-lg bg-secondary/30">
              <div className="text-xs text-muted-foreground">P(B vence)</div>
              <div className={`text-2xl font-bold ${data.p_b_wins > 0.5 ? "text-primary" : "text-muted-foreground"}`}>{(data.p_b_wins * 100).toFixed(1)}%</div>
            </div>
          </div>
          <ExplanationBox text={data.explanation} />
        </div>
      )}
      {error && <div className="text-xs text-negative p-2">{error}</div>}
    </div>
  );
}

export default function Nivel3() {
  useSEO("Nível 3 — Modelos Básicos", "Poisson, regressão e Elo: os primeiros modelos quantitativos para previsões.");
  useEffect(() => {
    awardPoints("level_visited", "Visitou o Nível 3 — Modelos Básicos", "level_visited_3");
  }, []);

  return (
    <div>
      <PageHeader
        badge="Nível 3"
        title="Modelos Básicos"
        subtitle="Os modelos que o sistema usa por baixo dos panos — agora acessíveis para você calcular, questionar e entender o que cada variável significa."
      />
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <TaylorCalculator />
        <PoissonCalculator />
        <GarchCalculator />
        <EnsoCalculator />
        <EloCalculator />
      </div>

      <LevelNav current={3} />
    </div>
    </div>
  );
}
