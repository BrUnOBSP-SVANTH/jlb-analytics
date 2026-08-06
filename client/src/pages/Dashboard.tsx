/**
 * Dashboard — JLB Analytics
 * Métricas comportamentais + Prediction Tracker com calibração real.
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  TrendingUp, ArrowRight, Target, AlertCircle, LogIn,
  CheckCircle, Trophy, X as XIcon,
  BookmarkCheck, BarChart2, Download, Filter, Bell,
} from "lucide-react";
import { CalibrationChart, CalibrationTrend } from "@/components/dashboard/CalibrationCharts";
import { LevelMap, BehavioralMetrics, QuickActions } from "@/components/dashboard/ProgressPanels";
import { PredictionRow, UserVsMarket } from "@/components/dashboard/PredictionLog";
import {
  loadPredictions, resolvePrediction, deletePrediction,
  meanBrierScore, skillScore,
  saveCalibrationSnapshot, loadCalibrationHistory,
  detectResolutions,
  type StoredPrediction, type ResolutionSuggestion,
} from "@/lib/predictions";
import { awardPoints } from "@/lib/userProgress";
import { pullFromSupabase, pushToSupabase, syncOne, deleteOne } from "@/lib/predictionsSync";
import ContaTabs from "@/components/ContaTabs";
import SignupNudge from "@/components/SignupNudge";
import WatchlistSection from "@/components/dashboard/WatchlistSection";
import { useSEO } from "@/hooks/useSEO";

// ── Constants ──────────────────────────────────────────────────────────────


// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(v: number, decimals = 2): string {
  return v.toFixed(decimals);
}

// ── Sub-components ─────────────────────────────────────────────────────────

function GuestView() {
  // Convidado que JÁ registrou previsões locais: mostra os dados REAIS dele
  // (o PredictionTracker roda em localStorage, sem conta) + convite de cadastro,
  // em vez da prévia borrada/falsa. Fecha o beco: ele vê o que fez e é convidado.
  const guestPreds = loadPredictions();
  if (guestPreds.length > 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <SignupNudge count={guestPreds.length} context="dashboard_guest" />
        <PredictionTracker />
      </div>
    );
  }

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
                  Com {resolved.length} {resolved.length > 1 ? "resoluções" : "resolução"}, a curva ainda é ruidosa — {20 - resolved.length} previsões restantes para calibração confiável.
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
  useSEO("Meu Dashboard", "Suas previsões, calibração vs. mercado, Brier Score e evolução como forecaster.");
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
            <p className="text-xs text-muted-foreground">{preds.length} {preds.length > 1 ? "previsões registradas" : "previsão registrada"}</p>
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
          Suas previsões ficam salvas neste navegador e sincronizadas com a sua conta
          quando você está logado — acessíveis de qualquer dispositivo. O Brier Score e o
          Skill Score são recalculados automaticamente cada vez que você resolve uma previsão.
        </p>
      </div>
    </div>
    </div>
  );
}




