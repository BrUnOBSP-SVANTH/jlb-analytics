/**
 * Dashboard — JLB Analytics
 * Métricas comportamentais + Prediction Tracker com calibração real.
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  GraduationCap, BarChart3, TrendingUp, Brain, GitMerge,
  ArrowRight, Lock, Target, Activity, AlertCircle, LogIn,
  CheckCircle, Trophy, Trash2, Check, X as XIcon,
  BookmarkCheck, BarChart2, Sparkles, Bookmark, ExternalLink,
  Download, Filter, Bell, Share2, Copy,
} from "lucide-react";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
  Tooltip, ReferenceLine, LineChart, Line, CartesianGrid,
} from "recharts";
import {
  loadPredictions, resolvePrediction, deletePrediction,
  meanBrierScore, skillScore, calibrationBuckets,
  saveCalibrationSnapshot, loadCalibrationHistory,
  detectResolutions,
  type StoredPrediction, type CalibrationSnapshot, type ResolutionSuggestion,
} from "@/lib/predictions";
import { awardPoints } from "@/lib/userProgress";
import { loadWatchlist, removeFromWatchlist, cycleAlertThreshold, type WatchlistItem } from "@/lib/watchlist";
import { pullFromSupabase, pushToSupabase, syncOne, deleteOne } from "@/lib/predictionsSync";
import ContaTabs from "@/components/ContaTabs";
import { CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_TICK_STYLE } from "@/lib/data";

// ── Constants ──────────────────────────────────────────────────────────────

const LEVELS = [
  { n: 1, title: "Fundamentos",        href: "/nivel/1", icon: GraduationCap, color: "text-positive",   requires: 0   },
  { n: 2, title: "Leitura de Dados",   href: "/nivel/2", icon: BarChart3,     color: "text-primary",    requires: 0   },
  { n: 3, title: "Modelos Básicos",    href: "/nivel/3", icon: TrendingUp,    color: "text-yellow-500", requires: 0   },
  { n: 4, title: "Vieses e Psicologia", href: "/nivel/4", icon: Brain,        color: "text-purple-400", requires: 50  },
  { n: 5, title: "Análise Integrada",  href: "/nivel/5", icon: GitMerge,      color: "text-neon-blue",  requires: 100 },
];

const MATURITY_LABELS = [
  "Iniciante — decisões majoritariamente intuitivas",
  "Em desenvolvimento — começa a estruturar análise",
  "Intermediário — usa modelos, calibração a melhorar",
  "Avançado — processo consistente, vieses mapeados",
  "Expert — calibração estável, referência metodológica",
];

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = "text-foreground" }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function GuestView() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Auth card */}
      <div className="glass-card rounded-2xl border border-primary/30 p-8 text-center space-y-4 max-w-sm mx-auto shadow-2xl">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <LogIn className="w-6 h-6 text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Entre para ver seu progresso</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Brier Score, Skill Score, calibração e histórico de previsões ficam salvos na sua conta.
        </p>
        <div className="flex flex-col gap-2.5 pt-1">
          <Link href="/login">
            <span className="flex items-center justify-center gap-2 w-full px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
              <LogIn className="w-4 h-4" aria-hidden="true" /> Entrar / Criar conta
            </span>
          </Link>
          <Link href="/apostas">
            <span className="flex items-center justify-center gap-2 w-full px-6 py-2.5 rounded-lg border border-border/50 text-foreground text-sm hover:bg-secondary/30 transition-colors">
              Explorar Mercados <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </span>
          </Link>
        </div>
      </div>

      {/* Preview of what the dashboard looks like */}
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground/50 text-center uppercase tracking-wider">Prévia do dashboard</p>
        <div className="blur-[3px] pointer-events-none select-none opacity-50 space-y-4" aria-hidden="true">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Brier Score",   value: "0.143", sub: "abaixo da média",   color: "text-yellow-500" },
              { label: "Skill Score",   value: "+0.21", sub: "melhor que ref.",    color: "text-positive" },
              { label: "Resolvidas",    value: "27",    sub: "de 34 registradas",  color: "text-foreground" },
              { label: "Edge médio",    value: "+4.2pp", sub: "vs. mercado",       color: "text-positive" },
            ].map((s) => (
              <div key={s.label} className="glass-card rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>
          <div className="glass-card rounded-xl p-5 h-52">
            <div className="text-xs font-semibold text-muted-foreground mb-3">Curva de Calibração</div>
            <div className="h-36 flex items-end gap-1 px-2">
              {[30,45,48,52,58,65,72,78,84,91].map((h, i) => (
                <div key={i} className="flex-1 bg-neon-blue/20 rounded-t" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card rounded-xl p-5 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground">Últimas previsões</div>
              {["Eleição presidencial 2026 → 65%", "Selic abaixo de 10% em Q3 → 48%", "Copa do Mundo Brasil → 22%"].map((p) => (
                <div key={p} className="flex items-center gap-2 text-xs text-muted-foreground/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-neon-blue/50" />
                  {p}
                </div>
              ))}
            </div>
            <div className="glass-card rounded-xl p-5 space-y-3">
              <div className="text-xs font-semibold text-muted-foreground">Análise comportamental</div>
              {["Overconfidence: +8% (moderado)", "Falácia do jogador: baixo risco", "Aversão à perda: λ=2.4 (calibrado)"].map((b) => (
                <div key={b} className="flex items-center gap-2 text-xs text-muted-foreground/70">
                  <div className="w-1.5 h-1.5 rounded-full bg-gold/50" />
                  {b}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Calibration Chart ──────────────────────────────────────────────────────

function CalibrationChart({ predictions }: { predictions: StoredPrediction[] }) {
  const buckets = calibrationBuckets(predictions);

  if (buckets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-center gap-2">
        <BarChart2 className="w-8 h-8 text-muted-foreground/30" aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          Resolva pelo menos 5 previsões para ver a curva de calibração.
        </p>
      </div>
    );
  }

  // Build scatter data: each resolved prediction as a dot
  const scatterData = predictions
    .filter((p) => p.resolved && p.outcome !== null)
    .map((p) => ({
      x: p.userProb,
      y: p.outcome ? 100 : 0,
    }));

  // Perfect calibration reference line points
  const perfectLine = [{ x: 0, y: 0 }, { x: 100, y: 100 }];

  return (
    <div>
      <div className="flex items-center gap-4 mb-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-6 h-0.5 bg-gold/60 inline-block" />
          Calibração perfeita
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-neon-blue inline-block" />
          Suas previsões
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart>
          <XAxis
            type="number" dataKey="x" domain={[0, 100]}
            tickFormatter={(v) => `${v}%`} tick={CHART_TICK_STYLE}
            axisLine={false} tickLine={false}
            label={{ value: "Prob. estimada", position: "insideBottom", offset: -2, fill: CHART_COLORS.muted, fontSize: 11 }}
          />
          <YAxis
            type="number" dataKey="y" domain={[-10, 110]}
            tickFormatter={(v) => `${v}%`} tick={CHART_TICK_STYLE}
            axisLine={false} tickLine={false}
            label={{ value: "Resultado real", angle: -90, position: "insideLeft", fill: CHART_COLORS.muted, fontSize: 11 }}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [`${v}%`, name === "x" ? "Estimada" : "Real"]}
          />
          {/* Perfect calibration diagonal */}
          <ReferenceLine
            segment={perfectLine as [{ x: number; y: number }, { x: number; y: number }]}
            stroke={CHART_COLORS.primary}
            strokeDasharray="4 4"
            strokeOpacity={0.6}
          />
          <Scatter data={scatterData} fill={CHART_COLORS.quaternary} opacity={0.8} r={4} />
        </ScatterChart>
      </ResponsiveContainer>
      <p className="text-xs text-muted-foreground mt-2 text-center">
        Pontos próximos à linha dourada = boa calibração.
        Acima = subestimou. Abaixo = superestimou.
      </p>
    </div>
  );
}

// ── Prediction Log ─────────────────────────────────────────────────────────

function PredictionRow({
  pred,
  onResolve,
  onDelete,
}: {
  pred: StoredPrediction;
  onResolve: (id: string, outcome: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const edgePp = pred.userProb - pred.marketProb;
  const edgeColor = edgePp > 3 ? "text-positive" : edgePp < -3 ? "text-negative" : "text-muted-foreground";
  const savedDate = new Date(pred.savedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  function handleShare() {
    const text = `Previsão JLB Analytics\n📊 ${pred.question}\n🎯 Minha estimativa: ${pred.userProb}% | Mercado: ${pred.marketProb.toFixed(1)}% | Edge: ${edgePp >= 0 ? "+" : ""}${edgePp.toFixed(1)}pp\n${window.location.origin}/previsao`;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {/* ignore permission errors */});
  }

  return (
    <div className={`p-3 rounded-xl border transition-colors ${
      pred.resolved
        ? pred.outcome
          ? "border-positive/20 bg-positive/3"
          : "border-negative/20 bg-negative/3"
        : "border-border/30 bg-secondary/10"
    }`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          {pred.resolved ? (
            pred.outcome
              ? <CheckCircle className="w-4 h-4 text-positive" />
              : <XIcon className="w-4 h-4 text-negative" />
          ) : (
            <Target className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">{pred.question}</p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">{savedDate}</span>
            <span className="text-[10px] font-mono">
              Você: <span className="text-gold font-semibold">{pred.userProb}%</span>
            </span>
            <span className="text-[10px] font-mono">
              Mercado: <span className="text-muted-foreground">{pred.marketProb.toFixed(1)}%</span>
            </span>
            <span className={`text-[10px] font-mono font-semibold ${edgeColor}`}>
              Edge: {edgePp >= 0 ? "+" : ""}{edgePp.toFixed(1)}pp
            </span>
            {pred.resolved && pred.brierScore !== null && (
              <span className="text-[10px] font-mono">
                BS: <span className={pred.brierScore < 0.1 ? "text-positive" : pred.brierScore < 0.25 ? "text-yellow-500" : "text-negative"}>
                  {pred.brierScore.toFixed(3)}
                </span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!pred.resolved && (
            <>
              <button
                onClick={() => onResolve(pred.id, true)}
                title="Resolveu: SIM"
                aria-label="Marcar previsão como SIM (correta)"
                className="p-1 rounded-md text-positive/60 hover:text-positive hover:bg-positive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-positive"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                onClick={() => onResolve(pred.id, false)}
                title="Resolveu: NÃO"
                aria-label="Marcar previsão como NÃO (incorreta)"
                className="p-1 rounded-md text-negative/60 hover:text-negative hover:bg-negative/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative"
              >
                <XIcon className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </>
          )}
          <button
            onClick={handleShare}
            title="Compartilhar previsão (copia link)"
            aria-label="Compartilhar previsão"
            className={`p-1 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border ${
              copied ? "text-positive" : "text-muted-foreground/40 hover:text-neon-blue hover:bg-neon-blue/10"
            }`}
          >
            {copied ? <Copy className="w-3.5 h-3.5" aria-hidden="true" /> : <Share2 className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
          <button
            onClick={() => onDelete(pred.id)}
            title="Remover previsão"
            aria-label="Remover previsão"
            className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-secondary/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function categorizeQuestion(question: string): string {
  const q = question.toLowerCase();
  if (/bitcoin|crypto|btc|eth|defi|blockchain|token|solana|bnb/.test(q)) return "Cripto";
  if (/election|elect|trump|biden|senate|president|vote|congress|politic|governo|eleicao|presidente|candidat/.test(q)) return "Política";
  if (/soccer|football|nba|nfl|tennis|sport|goal|match|game|team|player|futebol|gol|campeonato|copa|mundial/.test(q)) return "Esportes";
  if (/inflation|gdp|economy|fed|rate|dollar|selic|ipca|pib|cambio|juros|banco|fiscal/.test(q)) return "Economia";
  if (/ai|tech|software|startup|openai|gpu|chip|acquisition|ipo|meta|apple|google/.test(q)) return "Tech";
  if (/oil|petrol|energy|gas|solar|climate|enso|temperatura|chuva|seca/.test(q)) return "Energia/Clima";
  return "Outros";
}

function getCalibrationStreak(preds: StoredPrediction[]): number {
  const resolvedSorted = preds
    .filter((p) => p.resolved && p.brierScore !== null)
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  let streak = 0;
  for (const p of resolvedSorted) {
    if ((p.brierScore ?? 1) < 0.15) streak++;
    else break;
  }
  return streak;
}

function UserVsMarket({ preds }: { preds: StoredPrediction[] }) {
  const resolved = preds.filter((p) => p.resolved && p.outcome !== null);
  if (resolved.length < 3) return null;

  const beatsMarket = resolved.filter((p) => {
    const outcome = p.outcome ? 1 : 0;
    const userErr = Math.pow(outcome - p.userProb / 100, 2);
    const mktErr  = Math.pow(outcome - p.marketProb / 100, 2);
    return userErr < mktErr;
  }).length;

  const beatPct = Math.round((beatsMarket / resolved.length) * 100);
  const avgEdgePp = parseFloat(
    (resolved.reduce((s, p) => s + (p.userProb - p.marketProb), 0) / resolved.length).toFixed(1)
  );
  const streak = getCalibrationStreak(preds);

  // Percentil estimado baseado na distribuição de Brier Scores de forecasters amadores/profissionais
  // Ref: Tetlock & Gardner "Superforecasting"; baseline naive = 0.25, mediana amadores = 0.18, top decil = 0.09
  const avgBrier = resolved.reduce((s, p) => s + (p.brierScore ?? 0.25), 0) / resolved.length;
  const calibPercentile = avgBrier <= 0.07 ? 95
    : avgBrier <= 0.09 ? 90
    : avgBrier <= 0.11 ? 80
    : avgBrier <= 0.13 ? 70
    : avgBrier <= 0.16 ? 60
    : avgBrier <= 0.18 ? 50
    : avgBrier <= 0.20 ? 40
    : avgBrier <= 0.22 ? 30
    : avgBrier <= 0.24 ? 20
    : 10;
  const calibLabel = calibPercentile >= 80 ? "Superforecaster" : calibPercentile >= 60 ? "Acima da média" : calibPercentile >= 40 ? "Na média" : "Abaixo da média";

  // Calibração por domínio
  const domainMap = new Map<string, { bs: number; count: number }>();
  resolved.forEach((p) => {
    const cat = categorizeQuestion(p.question);
    const prev = domainMap.get(cat) ?? { bs: 0, count: 0 };
    domainMap.set(cat, { bs: prev.bs + (p.brierScore ?? 0), count: prev.count + 1 });
  });
  const domains = Array.from(domainMap.entries())
    .map(([cat, { bs, count }]) => ({ cat, bs: bs / count, count }))
    .sort((a, b) => a.bs - b.bs);

  return (
    <div className="space-y-4 border-t border-border/20 pt-4">
      {/* User vs Market */}
      <div>
        <p className="text-xs font-medium text-foreground mb-3 flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5 text-gold" />
          Desempenho vs Mercado
        </p>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 rounded-lg bg-secondary/30 text-center">
            <p className={`text-xl font-bold font-mono ${beatPct >= 50 ? "text-positive" : "text-negative"}`}>{beatPct}%</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">bateu o mercado</p>
            <p className="text-[9px] text-muted-foreground/50">{beatsMarket}/{resolved.length} previsões</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30 text-center">
            <p className={`text-xl font-bold font-mono ${avgEdgePp > 0 ? "text-positive" : avgEdgePp < 0 ? "text-negative" : "text-foreground"}`}>
              {avgEdgePp >= 0 ? "+" : ""}{avgEdgePp}pp
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">edge médio</p>
            <p className="text-[9px] text-muted-foreground/50">sua prob − mercado</p>
          </div>
          <div className="p-3 rounded-lg bg-secondary/30 text-center">
            <p className={`text-xl font-bold font-mono ${streak >= 3 ? "text-positive" : streak >= 1 ? "text-yellow-500" : "text-muted-foreground"}`}>
              {streak}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">sequência</p>
            <p className="text-[9px] text-muted-foreground/50">BS {"<"} 0.15 seguidos</p>
          </div>
        </div>
        {/* Percentil estimado */}
        {resolved.length >= 5 && (
          <div className={`mt-2 flex items-center gap-2.5 p-2.5 rounded-lg border ${calibPercentile >= 70 ? "bg-positive/5 border-positive/20" : calibPercentile >= 40 ? "bg-gold/5 border-gold/20" : "bg-secondary/20 border-border/20"}`}>
            <div className="text-center shrink-0 w-10">
              <p className={`text-lg font-bold font-mono leading-none ${calibPercentile >= 70 ? "text-positive" : calibPercentile >= 40 ? "text-gold" : "text-muted-foreground"}`}>
                {calibPercentile}%
              </p>
              <p className="text-[8px] text-muted-foreground/60 leading-none mt-0.5">top</p>
            </div>
            <div>
              <p className={`text-[11px] font-semibold ${calibPercentile >= 70 ? "text-positive" : calibPercentile >= 40 ? "text-gold" : "text-foreground"}`}>{calibLabel}</p>
              <p className="text-[10px] text-muted-foreground">Brier médio: {avgBrier.toFixed(3)} · percentil estimado vs. forecasters globais</p>
            </div>
          </div>
        )}
        {beatPct >= 60 && (
          <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-positive/5 border border-positive/20">
            <Trophy className="w-3 h-3 text-positive shrink-0" />
            <p className="text-[10px] text-positive">Você está batendo o mercado consistentemente. Skill Score acima da média.</p>
          </div>
        )}
      </div>

      {/* Calibração por domínio */}
      {domains.length >= 2 && (
        <div>
          <p className="text-xs font-medium text-foreground mb-2 flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 text-primary" />
            Calibração por domínio
          </p>
          <div className="space-y-1.5">
            {domains.map(({ cat, bs, count }) => {
              const stars = bs < 0.08 ? 5 : bs < 0.12 ? 4 : bs < 0.16 ? 3 : bs < 0.22 ? 2 : 1;
              const color = bs < 0.1 ? "text-positive" : bs < 0.2 ? "text-yellow-500" : "text-negative";
              const barW = Math.max(4, Math.min(100, (1 - bs / 0.5) * 100));
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-[11px] text-muted-foreground w-24 shrink-0">{cat}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-secondary/40 overflow-hidden">
                    <div className={`h-full rounded-full ${bs < 0.1 ? "bg-positive" : bs < 0.2 ? "bg-yellow-500" : "bg-negative"}`}
                      style={{ width: `${barW}%` }} />
                  </div>
                  <span className={`text-[11px] font-mono font-bold ${color} w-12 text-right`}>{bs.toFixed(3)}</span>
                  <span className="text-[9px] text-gold">{"★".repeat(stars)}</span>
                  <span className="text-[9px] text-muted-foreground/50">({count})</span>
                </div>
              );
            })}
          </div>
          <p className="text-[9px] text-muted-foreground/50 mt-1.5">Brier Score por categoria — menor = melhor calibração</p>
        </div>
      )}
    </div>
  );
}

// ── Watchlist Section ──────────────────────────────────────────────────────

function WatchlistSection() {
  const [items, setItems] = useState<WatchlistItem[]>(() => loadWatchlist());

  function handleRemove(id: string) {
    removeFromWatchlist(id);
    setItems(loadWatchlist());
  }

  function handleCycleThreshold(id: string) {
    cycleAlertThreshold(id);
    setItems(loadWatchlist());
  }

  if (items.length === 0) return null;

  const SOURCE_COLOR: Record<string, string> = {
    polymarket: "text-neon-blue border-neon-blue/30 bg-neon-blue/5",
    kalshi: "text-green-400 border-green-500/30 bg-green-500/5",
    reddit: "text-orange-400 border-orange-500/30 bg-orange-500/5",
  };
  const SOURCE_LABEL: Record<string, string> = { polymarket: "Polymarket", kalshi: "Kalshi", reddit: "Reddit" };

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-gold" />
          Watchlist ({items.length})
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
            <Bell className="w-3 h-3" />clique no sino para ajustar alerta
          </span>
          <Link href="/apostas">
            <span className="text-xs text-gold hover:underline flex items-center gap-1">
              Adicionar <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        </div>
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const savedProb  = item.yesProb      !== undefined ? item.yesProb * 100      : null;
          const liveProb   = item.lastKnownProb !== undefined ? item.lastKnownProb * 100 : null;
          const displayPct = liveProb ?? savedProb;
          const probColor  = displayPct === null ? "text-muted-foreground"
            : displayPct >= 70 ? "text-positive" : displayPct <= 30 ? "text-negative" : "text-gold";
          const delta = (liveProb !== null && savedProb !== null) ? liveProb - savedProb : null;
          const threshold = item.alertThreshold ?? 5;

          return (
            <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-secondary/10">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground leading-snug line-clamp-1">{item.title}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SOURCE_COLOR[item.source] ?? ""}`}>
                    {SOURCE_LABEL[item.source] ?? item.source}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(item.savedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </span>
                  {delta !== null && Math.abs(delta) >= 0.5 && (
                    <span className={`text-[10px] font-mono font-semibold ${delta > 0 ? "text-positive" : "text-negative"}`}>
                      {delta > 0 ? "+" : ""}{delta.toFixed(1)}pp desde salvo
                    </span>
                  )}
                </div>
              </div>

              {displayPct !== null && (
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-mono font-bold ${probColor}`}>{displayPct.toFixed(1)}%</p>
                  <p className="text-[9px] text-muted-foreground">{liveProb !== null ? "ao vivo" : "salvo"}</p>
                </div>
              )}

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleCycleThreshold(item.id)}
                  title={`Alerta: ≥${threshold}pp — clique para alterar`}
                  className="flex items-center gap-0.5 px-1.5 py-1 rounded-md text-[9px] font-mono border border-border/30 text-muted-foreground/60 hover:text-gold hover:border-gold/30 transition-colors"
                >
                  <Bell className="w-3 h-3" aria-hidden="true" />
                  {threshold}pp
                </button>
                <a href={item.externalUrl} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-md text-muted-foreground/50 hover:text-primary transition-colors"
                  title="Abrir mercado" aria-label={`Abrir mercado: ${item.title}`}>
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
                <button
                  onClick={() => handleRemove(item.id)}
                  title="Remover da watchlist" aria-label={`Remover: ${item.title}`}
                  className="p-1.5 rounded-md text-muted-foreground/40 hover:text-negative transition-colors">
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type PredFilter = "all" | "pending" | "resolved";

function PredictionTracker({ userId }: { userId?: string }) {
  const [preds, setPreds] = useState<StoredPrediction[]>(() => loadPredictions());
  const [showAll, setShowAll] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [filter, setFilter] = useState<PredFilter>("all");
  const [resolutions, setResolutions] = useState<ResolutionSuggestion[]>([]);
  const [dismissedRes, setDismissedRes] = useState<Set<string>>(new Set());

  // Pull from Supabase on mount (when logged in), then push local-only entries
  useEffect(() => {
    if (!userId) return;
    setSyncing(true);
    pullFromSupabase(userId).then(async (ok) => {
      if (ok) {
        setPreds(loadPredictions());
        setSyncedAt(new Date());
        // Also push any local entries the server doesn't know about
        await pushToSupabase(userId);
      }
      setSyncing(false);
    });
  }, [userId]);

  // Auto-resolution detection: cruza previsões pendentes com mercados ao vivo
  useEffect(() => {
    const pendingReal = preds.filter((p) => !p.resolved);
    if (pendingReal.length === 0) { setResolutions([]); return; }
    let cancelled = false;
    void detectResolutions(pendingReal).then((sugg) => {
      if (!cancelled) setResolutions(sugg);
    });
    return () => { cancelled = true; };
  }, [preds]);

  function reload() { setPreds(loadPredictions()); }

  function handleExportCSV() {
    const header = ["id", "question", "marketProb", "userProb", "savedAt", "resolved", "outcome", "brierScore"].join(",");
    const rows = preds.map((p) =>
      [
        p.id,
        `"${p.question.replace(/"/g, '""')}"`,
        p.marketProb,
        p.userProb,
        p.savedAt,
        p.resolved,
        p.outcome === null ? "" : p.outcome,
        p.brierScore === null ? "" : p.brierScore,
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `previsoes_jlb_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleResolve(id: string, outcome: boolean) {
    const resolved = resolvePrediction(id, outcome);
    if (resolved) {
      awardPoints("prediction_resolved", `Previsão resolvida: ${resolved.question.slice(0, 50)}`);
      saveCalibrationSnapshot(); // persist daily snapshot for trend chart
      if (userId) void syncOne(resolved, userId);
    }
    reload();
  }

  function handleDelete(id: string) {
    deletePrediction(id);
    if (userId) void deleteOne(id, userId);
    reload();
  }

  const bs = meanBrierScore(preds);
  const ss = skillScore(preds);
  const resolved = preds.filter((p) => p.resolved);
  const pending = preds.filter((p) => !p.resolved);

  // Streak: consecutive resolved predictions that beat the market (userBS < marketBS)
  const streak = (() => {
    const sorted = [...resolved]
      .filter((p) => p.outcome !== null && p.brierScore !== null)
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    let count = 0;
    for (const p of sorted) {
      const marketBS = Math.pow((p.outcome ? 1 : 0) - p.marketProb / 100, 2);
      if ((p.brierScore ?? 1) < marketBS) count++;
      else break;
    }
    return count;
  })();

  // Apply filter
  const filteredPreds = filter === "pending" ? pending : filter === "resolved" ? resolved : preds;
  const visible = showAll ? filteredPreds : filteredPreds.slice(0, 6);

  return (
    <div className="glass-card rounded-xl p-6 space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <BookmarkCheck className="w-4 h-4 text-gold" />
          Portfólio de Previsões
          {streak >= 2 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-500/15 border border-orange-500/30 text-[10px] font-bold text-orange-400">
              🔥 {streak}x streak
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          {userId && (
            <span className={`flex items-center gap-1 text-[10px] ${syncing ? "text-primary/60 animate-pulse" : syncedAt ? "text-positive/70" : "text-muted-foreground/50"}`}>
              {syncing ? "Sincronizando…" : syncedAt ? `☁ ${syncedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : "☁ sem sync"}
            </span>
          )}
          {preds.length > 0 && (
            <button
              onClick={handleExportCSV}
              title="Exportar CSV"
              aria-label="Exportar previsões como CSV"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md border border-border/30 hover:border-border/50"
            >
              <Download className="w-3 h-3" aria-hidden="true" />CSV
            </button>
          )}
          <Link href="/noticias">
            <span className="text-xs text-gold hover:underline flex items-center gap-1">
              Adicionar <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </span>
          </Link>
        </div>
      </div>

      {/* Filter tabs */}
      {preds.length > 0 && (
        <div className="flex items-center gap-1">
          <Filter className="w-3 h-3 text-muted-foreground/50 mr-1" aria-hidden="true" />
          {(["all", "pending", "resolved"] as PredFilter[]).map((f) => {
            const count = f === "all" ? preds.length : f === "pending" ? pending.length : resolved.length;
            const label = f === "all" ? "Todas" : f === "pending" ? "Pendentes" : "Resolvidas";
            return (
              <button
                key={f}
                onClick={() => { setFilter(f); setShowAll(false); }}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                  filter === f
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/30"
                }`}
              >
                {label} <span className="ml-1 opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Sugestões de resolução automática */}
      {(() => {
        const active = resolutions.filter((r) => !dismissedRes.has(r.prediction.id));
        if (active.length === 0) return null;
        return (
          <div className="rounded-xl border border-neon-blue/25 bg-neon-blue/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-neon-blue" />
              <p className="text-sm font-semibold text-foreground">
                {active.length === 1 ? "1 previsão pronta para resolver" : `${active.length} previsões prontas para resolver`}
              </p>
              <span className="ml-auto text-[10px] text-muted-foreground/60">detectado nos mercados ao vivo</span>
            </div>
            <div className="space-y-2">
              {active.slice(0, 4).map((r) => (
                <div key={r.prediction.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/20 border border-border/15">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{r.prediction.question}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Mercado agora em <span className="font-mono font-semibold text-foreground">{Math.round(r.currentProb)}%</span> ·
                      sugestão: <span className={r.suggestedOutcome ? "text-positive font-semibold" : "text-negative font-semibold"}>
                        {r.suggestedOutcome ? "SIM" : "NÃO"}
                      </span>
                      {r.confidence === "alta" && <span className="ml-1 text-positive/70">✓ alta confiança</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => { handleResolve(r.prediction.id, r.suggestedOutcome); setDismissedRes((s) => new Set(s).add(r.prediction.id)); }}
                      className="px-2.5 py-1 rounded-lg bg-neon-blue/15 border border-neon-blue/30 text-[11px] font-semibold text-neon-blue hover:bg-neon-blue/25 transition-colors"
                    >
                      Resolver {r.suggestedOutcome ? "SIM" : "NÃO"}
                    </button>
                    <button
                      onClick={() => setDismissedRes((s) => new Set(s).add(r.prediction.id))}
                      title="Ignorar sugestão"
                      className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    >
                      <XIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/50">
              Confirme apenas se você concorda com o resultado. A resolução atualiza seu Brier Score e ranking.
            </p>
          </div>
        );
      })()}

      {preds.length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <Target className="w-10 h-10 mx-auto text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhuma previsão registrada ainda.</p>
          <Link href="/noticias">
            <span className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline">
              Ir para Mercados Ativos <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center p-2 rounded-lg bg-secondary/30">
              <p className="text-[10px] text-muted-foreground">Total</p>
              <p className="font-mono text-sm font-bold text-foreground">{preds.length}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-secondary/30">
              <p className="text-[10px] text-muted-foreground">Resolvidas</p>
              <p className="font-mono text-sm font-bold text-foreground">{resolved.length}</p>
            </div>
            <div className="text-center p-2 rounded-lg bg-secondary/30">
              <p className="text-[10px] text-muted-foreground">Brier</p>
              <p className={`font-mono text-sm font-bold ${
                bs === null ? "text-muted-foreground" : bs < 0.1 ? "text-positive" : bs < 0.25 ? "text-yellow-500" : "text-negative"
              }`}>
                {bs === null ? "—" : fmt(bs, 3)}
              </p>
            </div>
            <div className="text-center p-2 rounded-lg bg-secondary/30">
              <p className="text-[10px] text-muted-foreground">Skill</p>
              <p className={`font-mono text-sm font-bold ${
                ss === null ? "text-muted-foreground" : ss > 0.2 ? "text-positive" : ss > 0 ? "text-yellow-500" : "text-negative"
              }`}>
                {ss === null ? "—" : (ss >= 0 ? "+" : "") + fmt(ss, 2)}
              </p>
            </div>
          </div>

          {/* Calibration chart */}
          {resolved.length >= 3 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-foreground">Curva de Calibração</p>
                {resolved.length < 20 && (
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {resolved.length}/20 para estabilidade estatística
                  </span>
                )}
              </div>
              <CalibrationChart predictions={preds} />
              {resolved.length < 20 && (
                <p className="text-[10px] text-muted-foreground/60 mt-1 text-center italic">
                  Com {resolved.length} resolução{resolved.length > 1 ? "ões" : ""}, a curva ainda é ruidosa — {20 - resolved.length} previsões restantes para calibração confiável.
                </p>
              )}
            </div>
          )}

          {/* User vs Market + domain calibration */}
          <UserVsMarket preds={preds} />

          {/* Filtered prediction list */}
          {filteredPreds.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              {filter === "pending" ? "Nenhuma previsão pendente." : "Nenhuma previsão resolvida ainda."}
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((p) => (
                <PredictionRow key={p.id} pred={p} onResolve={handleResolve} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {filteredPreds.length > 6 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 border-t border-border/20"
            >
              {showAll ? "Mostrar menos" : `Ver todas (${filteredPreds.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Calibration Trend Chart ────────────────────────────────────────────────

function CalibrationTrend({ history }: { history: CalibrationSnapshot[] }) {
  if (history.length < 2) return null;

  const data = history.map((s) => ({
    date: s.date.slice(5), // MM-DD
    brier: s.meanBrier !== null ? parseFloat(s.meanBrier.toFixed(3)) : null,
    skill: s.skillScore !== null ? parseFloat((s.skillScore * 100).toFixed(1)) : null,
    resolved: s.resolvedCount,
  }));

  const latest = history[history.length - 1];
  const first = history[0];
  const brierDelta = latest.meanBrier !== null && first.meanBrier !== null
    ? (latest.meanBrier - first.meanBrier)
    : null;
  const improving = brierDelta !== null && brierDelta < 0;

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-neon-blue" />
          Evolução da Calibração
        </h3>
        {brierDelta !== null && (
          <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full ${
            improving ? "text-positive bg-positive/10" : "text-negative bg-negative/10"
          }`}>
            {improving ? "▼" : "▲"} {Math.abs(brierDelta).toFixed(3)} Brier
          </span>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-neon-blue inline-block rounded" />
          Brier Score (menor = melhor)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-gold inline-block rounded" style={{ borderStyle: "dashed" }} />
          Baseline (0.25)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date" tick={CHART_TICK_STYLE}
            axisLine={false} tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[0, 0.4]} tick={CHART_TICK_STYLE}
            axisLine={false} tickLine={false}
            tickFormatter={(v) => v.toFixed(2)}
          />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [
              name === "brier" ? v.toFixed(3) : `${v}%`,
              name === "brier" ? "Brier Score" : "Skill Score",
            ]}
          />
          <ReferenceLine y={0.25} stroke={CHART_COLORS.primary} strokeDasharray="4 4" strokeOpacity={0.5} />
          <Line
            type="monotone" dataKey="brier"
            stroke={CHART_COLORS.quaternary} strokeWidth={2}
            dot={{ r: 3, fill: CHART_COLORS.quaternary }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-muted-foreground/60 text-center">
        Snapshot salvo automaticamente cada vez que você resolve uma previsão.
        {improving ? " Você está melhorando a calibração." : " Continue resolvendo para ver a tendência."}
      </p>
    </div>
  );
}

// ── Level Map ──────────────────────────────────────────────────────────────

function LevelMap({ userPoints }: { userPoints: number }) {
  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-primary" />
          Mapa de Progressão
        </h3>
        <span className="text-xs text-gold font-bold">{userPoints} pts</span>
      </div>
      <div className="space-y-2">
        {LEVELS.map((level) => {
          const Icon = level.icon;
          const unlocked = userPoints >= level.requires;
          return (
            <Link key={level.n} href={unlocked ? level.href : "/perfil"}>
              <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer
                ${unlocked ? "border-primary/20 bg-primary/5 hover:border-primary/40" : "border-border/20 bg-secondary/5 opacity-60"}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${unlocked ? "bg-primary/10" : "bg-secondary/30"}`}>
                  {unlocked
                    ? <Icon className={`w-4 h-4 ${level.color}`} />
                    : <Lock className="w-4 h-4 text-muted-foreground" />
                  }
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Nível {level.n}</span>
                    {!unlocked && level.requires > 0 && (
                      <span className="text-xs text-gold font-medium">{level.requires} pts</span>
                    )}
                    {unlocked && level.requires > 0 && (
                      <span className="text-xs text-positive font-medium">Desbloqueado</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground">{level.title}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Behavioral Metrics ─────────────────────────────────────────────────────

function BehavioralMetrics({ userLevel }: { userLevel: number }) {
  // Calcula métricas reais a partir das previsões resolvidas
  const allPreds = loadPredictions();
  const resolved = allPreds.filter((p) => p.resolved && p.outcome !== null);

  // Brier Skill Score real: 1 − BS / 0.25 (0.25 = BS de um chutador aleatório)
  const bs = meanBrierScore(allPreds);
  const brierSkill = bs !== null ? parseFloat((1 - bs / 0.25).toFixed(3)) : null;

  // Overconfidence: média(prob_estimada − resultado_real*100) sobre previsões resolvidas
  const overconfidence = resolved.length >= 3
    ? parseFloat((resolved.reduce((sum, p) => sum + (p.userProb - (p.outcome ? 100 : 0)), 0) / resolved.length / 100).toFixed(3))
    : null;

  // Sessions: número total de previsões (proxy de engajamento)
  const sessions = allPreds.length;

  // Loss aversion: referência teórica de Kahneman — não deriva de dados sem histórico monetário
  const lossAversion = 2.25;

  const maturityScore = (() => {
    let s = 0;
    if (brierSkill !== null) {
      if (brierSkill > 0.25) s += 2; else if (brierSkill > 0) s += 1;
    }
    if (overconfidence !== null) {
      if (Math.abs(overconfidence) < 0.05) s += 2; else if (Math.abs(overconfidence) < 0.15) s += 1;
    }
    if (sessions >= 50) s += 1;
    if (resolved.length >= 20) s += 1;
    return Math.min(s, 6);
  })();

  const stage = maturityScore <= 1 ? 0 : maturityScore <= 2 ? 1 : maturityScore <= 3 ? 2 : maturityScore <= 4 ? 3 : 4;

  if (userLevel < 4) {
    return (
      <div className="glass-card rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          Métricas Comportamentais
        </h3>
        <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
          <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-foreground font-medium">Disponível no Nível 4</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Brier Score, Overconfidence Index e Loss Aversion desbloqueiam com o Nível 4.
            </p>
          </div>
        </div>
        <Link href="/nivel/4">
          <span className="inline-flex items-center gap-2 text-xs text-primary hover:underline">
            Ir para Nível 4 <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-6 space-y-5">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <Brain className="w-4 h-4 text-purple-400" />
        Métricas Comportamentais
      </h3>
      <div className="p-4 rounded-xl border border-primary/20 bg-primary/5">
        <div className="flex items-center gap-4">
          <div className="text-center shrink-0">
            <div className="text-3xl font-bold font-mono text-primary">{stage}/4</div>
            <div className="text-xs text-muted-foreground">Estágio</div>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">{MATURITY_LABELS[stage]}</p>
            <div className="mt-2 w-full bg-border/30 rounded-full h-1.5">
              <div className="h-1.5 rounded-full bg-primary transition-all" style={{ width: `${(maturityScore / 6) * 100}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{maturityScore}/6 pontos</p>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-secondary/30 border border-border/30">
          <p className="text-xs text-muted-foreground">Brier Skill Score</p>
          {brierSkill === null ? (
            <p className="text-xl font-bold font-mono mt-0.5 text-muted-foreground">—</p>
          ) : (
            <p className={`text-xl font-bold font-mono mt-0.5 ${brierSkill > 0.15 ? "text-positive" : brierSkill > 0 ? "text-yellow-500" : "text-negative"}`}>
              {brierSkill >= 0 ? "+" : ""}{brierSkill.toFixed(3)}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {brierSkill === null ? `resolva previsões (${resolved.length} resolvidas)` : brierSkill > 0 ? "melhor que baseline" : "abaixo do baseline"}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30 border border-border/30">
          <p className="text-xs text-muted-foreground">Overconfidence</p>
          {overconfidence === null ? (
            <p className="text-xl font-bold font-mono mt-0.5 text-muted-foreground">—</p>
          ) : (
            <p className={`text-xl font-bold font-mono mt-0.5 ${Math.abs(overconfidence) < 0.05 ? "text-positive" : Math.abs(overconfidence) < 0.15 ? "text-yellow-500" : "text-negative"}`}>
              {overconfidence >= 0 ? "+" : ""}{(overconfidence * 100).toFixed(1)}%
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {overconfidence === null ? "min. 3 previsões resolvidas" : Math.abs(overconfidence) < 0.05 ? "bem calibrado" : overconfidence > 0 ? "tende a superestimar" : "tende a subestimar"}
          </p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30 border border-border/30">
          <p className="text-xs text-muted-foreground">Loss Aversion (λ)</p>
          <p className="text-xl font-bold font-mono mt-0.5 text-foreground">{lossAversion.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">ref. Kahneman — sem dados monetários</p>
        </div>
        <div className="p-3 rounded-lg bg-secondary/30 border border-border/30">
          <p className="text-xs text-muted-foreground">Previsões registradas</p>
          <p className="text-xl font-bold font-mono mt-0.5 text-foreground">{sessions}</p>
          <p className="text-xs text-muted-foreground">mín. 30 para estabilidade</p>
        </div>
      </div>
      <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
        <AlertCircle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Métricas calculadas a partir das suas previsões reais registradas.
          Mínimo de 20 previsões resolvidas para resultados estatisticamente estáveis.
          {overconfidence === null && resolved.length < 3 && " Comece registrando previsões em Mercados Ativos."}
        </p>
      </div>
    </div>
  );
}

// ── Quick Actions ──────────────────────────────────────────────────────────

function QuickActions({ userLevel }: { userLevel: number }) {
  const nextLevel = Math.min(userLevel + 1, 5);
  const nextLevelData = LEVELS[nextLevel - 1];
  const NextIcon = nextLevelData.icon;

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <Activity className="w-4 h-4 text-primary" />
        Próximas Ações
      </h3>
      <div className="space-y-2">
        {userLevel < 5 ? (
          <Link href={nextLevelData.href}>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer">
              <NextIcon className={`w-4 h-4 ${nextLevelData.color}`} />
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">Avançar para Nível {nextLevel}</p>
                <p className="text-xs text-muted-foreground">{nextLevelData.title}</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-positive/30 bg-positive/5">
            <Trophy className="w-4 h-4 text-positive" />
            <div>
              <p className="text-sm font-medium text-foreground">Todos os níveis concluídos</p>
              <p className="text-xs text-muted-foreground">Continue praticando para melhorar a calibração.</p>
            </div>
          </div>
        )}
        <Link href="/noticias">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-secondary/10 hover:bg-secondary/20 transition-colors cursor-pointer">
            <Target className="w-4 h-4 text-gold" />
            <div className="flex-1">
              <p className="text-sm text-foreground">Registrar nova previsão</p>
              <p className="text-xs text-muted-foreground">Mercados Polymarket em aberto</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </Link>
        <Link href="/simulador">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-border/30 bg-secondary/10 hover:bg-secondary/20 transition-colors cursor-pointer">
            <GitMerge className="w-4 h-4 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm text-foreground">Simulador de calibração</p>
              <p className="text-xs text-muted-foreground">Brier Score no longo prazo</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </Link>
        <Link href="/previsao">
          <div className="flex items-center gap-3 p-3 rounded-lg border border-neon-blue/20 bg-neon-blue/5 hover:bg-neon-blue/10 transition-colors cursor-pointer">
            <Sparkles className="w-4 h-4 text-neon-blue" />
            <div className="flex-1">
              <p className="text-sm text-foreground">Previsão Guiada por IA</p>
              <p className="text-xs text-muted-foreground">20 modelos econométricos automáticos</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </Link>
      </div>
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-8 w-40 bg-secondary/50 rounded-lg" />
          <div className="h-4 w-56 bg-secondary/30 rounded" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass-card rounded-xl p-4 space-y-2">
            <div className="h-3 w-16 bg-secondary/40 rounded" />
            <div className="h-8 w-20 bg-secondary/50 rounded" />
            <div className="h-3 w-24 bg-secondary/30 rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-card rounded-xl p-6 h-64 bg-secondary/10" />
        <div className="glass-card rounded-xl p-6 h-64 bg-secondary/10" />
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) return <DashboardSkeleton />;
  if (!user) return <GuestView />;

  const preds = loadPredictions();
  const ss = skillScore(preds);
  const bs = meanBrierScore(preds);

  // Points from userProgress
  let userPoints = 0;
  try {
    const raw = localStorage.getItem("jlb_progress_v1");
    if (raw) userPoints = (JSON.parse(raw) as { totalPoints?: number }).totalPoints ?? 0;
  } catch { /* ignore */ }

  return (
    <div>
    <ContaTabs />
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold font-display text-foreground">Dashboard</h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium border bg-gold/10 text-gold border-gold/30">
              {userPoints} pts
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        {preds.length > 0 && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{preds.length} previsão{preds.length > 1 ? "ões" : ""} registrada{preds.length > 1 ? "s" : ""}</p>
          </div>
        )}
      </div>

      {/* Portfolio stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-neon-blue/10 flex items-center justify-center">
              <BarChart2 className="w-3.5 h-3.5 text-neon-blue" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground">Brier Score</p>
          </div>
          <p className={`text-2xl font-bold font-mono ${
            bs === null ? "text-muted-foreground" : bs < 0.1 ? "text-positive" : bs < 0.25 ? "text-yellow-500" : "text-negative"
          }`}>
            {bs === null ? "—" : bs.toFixed(3)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {bs === null ? "Resolva previsões" : bs < 0.25 ? "Melhor que baseline" : "A melhorar"}
          </p>
        </div>

        <div className="glass-card rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-positive/10 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-positive" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground">Skill Score</p>
          </div>
          <p className={`text-2xl font-bold font-mono ${
            ss === null ? "text-muted-foreground" : ss > 0.2 ? "text-positive" : ss > 0 ? "text-yellow-500" : "text-negative"
          }`}>
            {ss === null ? "—" : (ss >= 0 ? "+" : "") + ss.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {ss === null ? "Resolva previsões" : ss > 0.2 ? "Excelente" : ss > 0 ? "Acima da baseline" : "Abaixo da baseline"}
          </p>
        </div>

        <div className="glass-card rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <CheckCircle className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground">Resolvidas</p>
          </div>
          <p className="text-2xl font-bold font-mono text-foreground">
            {preds.filter((p) => p.resolved).length}
            <span className="text-sm font-normal text-muted-foreground">/{preds.length}</span>
          </p>
          <p className="text-[10px] text-muted-foreground">
            {preds.filter((p) => !p.resolved).length} pendentes
          </p>
        </div>

        <div className="glass-card rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gold/10 flex items-center justify-center">
              <Trophy className="w-3.5 h-3.5 text-gold" aria-hidden="true" />
            </div>
            <p className="text-xs text-muted-foreground">Pontos</p>
          </div>
          <p className="text-2xl font-bold font-mono text-gold">{userPoints}</p>
          <p className="text-[10px] text-muted-foreground">
            {userPoints >= 100 ? "Nível 5 desbloqueado" : userPoints >= 50 ? "Nível 4 desbloqueado" : `${50 - Math.min(userPoints, 50)} pts p/ Nível 4`}
          </p>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <LevelMap userPoints={userPoints} />
        <div className="space-y-6">
          <QuickActions userLevel={userPoints >= 100 ? 5 : userPoints >= 50 ? 4 : 3} />
          <BehavioralMetrics userLevel={userPoints >= 100 ? 5 : userPoints >= 50 ? 4 : 3} />
        </div>
      </div>

      {/* Calibration trend — full width, only appears after 2+ snapshots */}
      <CalibrationTrend history={loadCalibrationHistory()} />

      {/* Watchlist — full width, hidden when empty */}
      <WatchlistSection />

      {/* Prediction tracker — full width */}
      <PredictionTracker userId={user.id} />

      {/* Footer note */}
      <div className="flex items-start gap-2 p-4 rounded-xl border border-border/30 bg-secondary/5">
        <AlertCircle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          As previsões são armazenadas localmente neste browser. A migração para Supabase
          (003_predictions.sql) está pronta para sincronização entre dispositivos.
          Métricas comportamentais (Brier, Overconfidence) serão calculadas automaticamente
          conforme você usa as calculadoras dos níveis.
        </p>
      </div>
    </div>
    </div>
  );
}
