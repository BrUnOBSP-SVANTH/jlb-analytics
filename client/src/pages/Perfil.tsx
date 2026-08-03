/**
 * Perfil — JLB Analytics
 *
 * Página de usuário: pontos, progresso nos níveis, histórico de previsões,
 * feed de atividades. Inspirado em Metaculus / Manifold Markets.
 */

import { useState, useEffect } from "react";
import { Link } from "wouter";
import PageHeader from "@/components/PageHeader";
import ContaTabs from "@/components/ContaTabs";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/contexts/AuthContext";
import { loadProgress, UNLOCK_THRESHOLDS, type ActivityType } from "@/lib/userProgress";
import { loadPredictions, meanBrierScore, skillScore } from "@/lib/predictions";
import { pullFromSupabase } from "@/lib/predictionsSync";
import {
  LogIn, Star, Trophy, Target, CheckCircle, X as XIcon,
  Zap, Calculator, Brain, BarChart2, TrendingUp, ArrowRight,
  Calendar, Clock, BookOpen, Lock,
} from "lucide-react";
import { BadgesSection, type BadgeContext } from "@/components/perfil/badges";
import { PremiumUpgrade } from "@/components/perfil/PremiumUpgrade";
import { EmailPreferences } from "@/components/perfil/EmailPreferences";
import { ProfilePublicSettings } from "@/components/perfil/ProfilePublicSettings";

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(email: string): string {
  return email.slice(0, 2).toUpperCase();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const ACTIVITY_META: Record<ActivityType, { label: string; icon: typeof Zap; color: string }> = {
  prediction_made:     { label: "Previsão registrada",    icon: Target,      color: "text-neon-blue" },
  prediction_resolved: { label: "Previsão resolvida",     icon: CheckCircle, color: "text-positive" },
  calculator_used:     { label: "Calculadora usada",      icon: Calculator,  color: "text-gold" },
  market_analyzed:     { label: "Mercado analisado com IA", icon: Brain,     color: "text-purple-400" },
  level_visited:       { label: "Nível visitado",         icon: BookOpen,    color: "text-primary" },
  first_login:         { label: "Primeiro acesso",        icon: Star,        color: "text-gold" },
  duel_won:            { label: "Duelo vencido",          icon: Star,        color: "text-positive" },
};

const LEVELS = [
  { n: 1, title: "Fundamentos",        href: "/nivel/1", requires: 0   },
  { n: 2, title: "Leitura de Dados",   href: "/nivel/2", requires: 0   },
  { n: 3, title: "Modelos Básicos",    href: "/nivel/3", requires: 0   },
  { n: 4, title: "Vieses e Psicologia", href: "/nivel/4", requires: 50 },
  { n: 5, title: "Análise Integrada",  href: "/nivel/5", requires: 100 },
];


// ── Sub-components ─────────────────────────────────────────────────────────────

function GuestPrompt() {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center space-y-6">
      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
        <LogIn className="w-6 h-6 text-primary" />
      </div>
      <h2 className="text-xl font-bold text-foreground">Entre para ver seu perfil</h2>
      <p className="text-sm text-muted-foreground leading-relaxed">
        Seu histórico de previsões, pontos acumulados e progresso nos níveis ficam
        salvos aqui. Crie uma conta gratuita para não perder o avanço.
      </p>
      <Link href="/login">
        <span className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
          <LogIn className="w-4 h-4" /> Entrar / Criar conta
        </span>
      </Link>
    </div>
  );
}

function PointsBar({ points, target }: { points: number; target: number }) {
  const pct = Math.min(100, Math.round((points / target) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{points} pts</span>
        <span>{target} pts</span>
      </div>
      <div className="h-2 rounded-full bg-secondary/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-neon-blue transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function Perfil() {
  useSEO("Meu Perfil", "Seu progresso, calibração, conquistas e preferências na JLB Analytics.");
  const { user } = useAuth();
  const userId = user?.id;
  const [progress, setProgress] = useState(() => loadProgress());
  const [predictions, setPredictions] = useState(() => loadPredictions());

  // Puxa do Supabase no mount (logado) — sem isso, num dispositivo novo o Perfil
  // aparecia vazio mesmo com histórico na nuvem (o Dashboard já fazia isso).
  useEffect(() => {
    if (!userId) return;
    void pullFromSupabase(userId).then((ok) => {
      if (ok) { setPredictions(loadPredictions()); setProgress(loadProgress()); }
    });
  }, [userId]);

  if (!user) return <GuestPrompt />;

  // Stats from predictions
  const resolved = predictions.filter((p) => p.resolved && p.outcome !== null);
  const correct  = resolved.filter((p) => p.outcome === true).length;
  const accuracy = resolved.length > 0 ? Math.round((correct / resolved.length) * 100) : null;
  const avgBrier = resolved.length > 0
    ? (resolved.reduce((s, p) => s + (p.brierScore ?? 0), 0) / resolved.length).toFixed(3)
    : null;

  // Points towards next unlock
  const nextUnlock = [4, 5].find((lvl) => progress.totalPoints < (UNLOCK_THRESHOLDS[lvl] ?? 0));
  const nextThreshold = nextUnlock ? UNLOCK_THRESHOLDS[nextUnlock] : null;

  // Joined date from Supabase user metadata
  const joinedAt = user.created_at ? fmtDate(user.created_at) : "—";

  // Badge context
  const bs = meanBrierScore(predictions);
  const ss = skillScore(predictions);
  const badgeCtx: BadgeContext = {
    predictions,
    resolved,
    progress,
    bs,
    ss,
    createdAt: user.created_at,
  };

  return (
    <div>
      <ContaTabs />
      <PageHeader
        title="Meu Perfil"
        subtitle="Seu progresso, histórico de previsões e conquistas na plataforma."
        badge="Perfil"
      />

      <div className="container py-10 space-y-8">

        {/* ── Avatar + Identity ── */}
        <AnimatedSection>
          <div className="glass-card rounded-2xl p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-2xl font-bold text-primary font-mono">
                {initials(user.email ?? "JL")}
              </span>
            </div>
            <div className="flex-1 text-center sm:text-left space-y-1">
              <p className="text-lg font-bold text-foreground">{user.email}</p>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 justify-center sm:justify-start">
                <Calendar className="w-3.5 h-3.5" />
                Membro desde {joinedAt}
              </p>
              <div className="flex flex-wrap gap-3 justify-center sm:justify-start mt-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gold/10 border border-gold/20">
                  <Star className="w-3.5 h-3.5 text-gold" />
                  <span className="text-sm font-bold text-gold">{progress.totalPoints} pontos</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20">
                  <Target className="w-3.5 h-3.5 text-primary" />
                  <span className="text-sm font-medium text-primary">{predictions.length} previsões</span>
                </div>
                {accuracy !== null && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-positive/10 border border-positive/20">
                    <TrendingUp className="w-3.5 h-3.5 text-positive" />
                    <span className="text-sm font-medium text-positive">{accuracy}% acerto</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </AnimatedSection>

        {/* ── Plano Premium ── */}
        <PremiumUpgrade userId={user.id} userEmail={user.email ?? ""} />

        {/* ── Points + Unlock Progress ── */}
        {nextThreshold && (
          <AnimatedSection>
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-gold" />
                <h2 className="font-semibold text-foreground">Progresso de Desbloqueio</h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Acumule pontos usando calculadoras, fazendo previsões e explorando os níveis.
                Sem pagamento — só prática.
              </p>
              <PointsBar points={progress.totalPoints} target={nextThreshold} />
              <p className="text-xs text-muted-foreground text-center">
                Faltam <span className="font-bold text-foreground">{nextThreshold - progress.totalPoints} pontos</span> para
                desbloquear o <span className="font-bold text-primary">Nível {nextUnlock}</span>
              </p>
            </div>
          </AnimatedSection>
        )}

        {/* ── Level Map ── */}
        <AnimatedSection>
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground">Mapa de Progresso</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {LEVELS.map((lvl) => {
                const unlocked = progress.totalPoints >= lvl.requires;
                const visited = progress.oneTimeDone.includes(`level_visited_${lvl.n}`);
                return (
                  <Link key={lvl.n} href={unlocked ? lvl.href : "#"}>
                    <div className={`p-4 rounded-xl border text-center transition-colors ${
                      unlocked
                        ? visited
                          ? "border-positive/30 bg-positive/5 hover:border-positive/50"
                          : "border-primary/20 bg-primary/5 hover:border-primary/40"
                        : "border-border/20 bg-secondary/10 opacity-60 cursor-not-allowed"
                    }`}>
                      <div className="flex items-center justify-center mb-2">
                        {unlocked
                          ? visited
                            ? <CheckCircle className="w-5 h-5 text-positive" />
                            : <ArrowRight className="w-5 h-5 text-primary" />
                          : <Lock className="w-5 h-5 text-muted-foreground" />
                        }
                      </div>
                      <p className="text-xs font-semibold text-foreground">Nível {lvl.n}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{lvl.title}</p>
                      {!unlocked && (
                        <p className="text-[10px] text-gold mt-1">{lvl.requires} pts</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </AnimatedSection>

        {/* ── Stats ── */}
        <AnimatedSection>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="glass-card rounded-xl p-4 text-center">
              <Target className="w-5 h-5 text-primary mx-auto mb-2" />
              <p className="text-2xl font-bold font-mono text-foreground">{predictions.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Previsões feitas</p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <CheckCircle className="w-5 h-5 text-positive mx-auto mb-2" />
              <p className="text-2xl font-bold font-mono text-foreground">{resolved.length}</p>
              <p className="text-xs text-muted-foreground mt-1">Resolvidas</p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <TrendingUp className="w-5 h-5 text-gold mx-auto mb-2" />
              <p className="text-2xl font-bold font-mono text-foreground">
                {accuracy !== null ? `${accuracy}%` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Taxa de acerto</p>
            </div>
            <div className="glass-card rounded-xl p-4 text-center">
              <BarChart2 className="w-5 h-5 text-neon-blue mx-auto mb-2" />
              <p className="text-2xl font-bold font-mono text-foreground">
                {avgBrier ?? "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">Brier Score médio</p>
            </div>
          </div>
        </AnimatedSection>

        {/* ── Badges ── */}
        <AnimatedSection>
          <BadgesSection ctx={badgeCtx} />
        </AnimatedSection>

        {/* ── Prediction History ── */}
        <AnimatedSection>
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                <h2 className="font-semibold text-foreground">Histórico de Previsões</h2>
              </div>
              <Link href="/dashboard">
                <span className="text-xs text-primary hover:underline flex items-center gap-1">
                  Ver no Dashboard <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            </div>

            {predictions.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Target className="w-8 h-8 mx-auto text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Nenhuma previsão ainda.</p>
                <Link href="/apostas">
                  <span className="text-xs text-primary hover:underline">
                    Registre sua primeira previsão em Apostas →
                  </span>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {predictions.slice(0, 10).map((pred) => (
                  <div key={pred.id} className={`p-3 rounded-xl border ${
                    pred.resolved
                      ? pred.outcome
                        ? "border-positive/20 bg-positive/[0.03]"
                        : "border-negative/20 bg-negative/[0.03]"
                      : "border-border/20 bg-secondary/10"
                  }`}>
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">
                        {pred.resolved
                          ? pred.outcome
                            ? <CheckCircle className="w-4 h-4 text-positive" />
                            : <XIcon className="w-4 h-4 text-negative" />
                          : <Clock className="w-4 h-4 text-muted-foreground" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground leading-snug line-clamp-2">
                          {pred.question}
                        </p>
                        <div className="flex flex-wrap gap-3 mt-1.5 text-[10px] text-muted-foreground">
                          <span>Mercado: {pred.marketProb}%</span>
                          <span>Você: {pred.userProb}%</span>
                          {pred.brierScore !== null && (
                            <span>Brier: {pred.brierScore.toFixed(3)}</span>
                          )}
                          <span>{fmtDate(pred.savedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {predictions.length > 10 && (
                  <p className="text-xs text-center text-muted-foreground pt-2">
                    +{predictions.length - 10} mais no{" "}
                    <Link href="/dashboard">
                      <span className="text-primary hover:underline">Dashboard</span>
                    </Link>
                  </p>
                )}
              </div>
            )}
          </div>
        </AnimatedSection>

        {/* ── Activity Feed ── */}
        <AnimatedSection>
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-gold" />
              <h2 className="font-semibold text-foreground">Atividade Recente</h2>
              <span className="ml-auto text-xs text-muted-foreground">
                {progress.totalPoints} pts acumulados
              </span>
            </div>

            {progress.activities.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <Zap className="w-8 h-8 mx-auto text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma atividade ainda. Use calculadoras, faça previsões e explore os níveis para ganhar pontos.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {progress.activities.slice(0, 20).map((act) => {
                  const meta = ACTIVITY_META[act.type];
                  const Icon = meta.icon;
                  return (
                    <div key={act.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/10 border border-border/10">
                      <div className="w-7 h-7 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0">
                        <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{act.label}</p>
                        <p className="text-[10px] text-muted-foreground">{fmtRelative(act.timestamp)}</p>
                      </div>
                      <span className="text-xs font-bold text-gold shrink-0">+{act.points}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </AnimatedSection>

        {/* ── How to earn points ── */}
        <AnimatedSection>
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-gold" />
              <h2 className="font-semibold text-foreground">Como ganhar pontos</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { icon: Target,      label: "Registrar uma previsão",      pts: "+5",  limit: "máx 3/dia" },
                { icon: CheckCircle, label: "Resolver uma previsão",        pts: "+5",  limit: "máx 3/dia" },
                { icon: Calculator,  label: "Usar uma calculadora",         pts: "+2",  limit: "máx 5/dia" },
                { icon: Brain,       label: "Analisar mercado com IA",      pts: "+3",  limit: "máx 3/dia" },
                { icon: BookOpen,    label: "Visitar um novo nível",        pts: "+10", limit: "uma vez/nível" },
                { icon: Star,        label: "Primeiro acesso à plataforma", pts: "+10", limit: "uma vez" },
              ].map(({ icon: Icon, label, pts, limit }) => (
                <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/10 border border-border/10">
                  <Icon className="w-4 h-4 text-gold shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{limit}</p>
                  </div>
                  <span className="text-sm font-bold text-gold">{pts}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-xs text-muted-foreground text-center">
                <span className="font-semibold text-primary">50 pts</span> desbloqueiam o Nível 4 ·{" "}
                <span className="font-semibold text-primary">100 pts</span> desbloqueiam o Nível 5
              </p>
            </div>
          </div>
        </AnimatedSection>

        {/* ── Perfil Público (Leaderboard) ── */}
        <ProfilePublicSettings userId={user.id} />

        {/* ── Notificações por email ── */}
        <EmailPreferences userId={user.id} />

      </div>
    </div>
  );
}

// ── Email Preferences ──────────────────────────────────────────────────────────

