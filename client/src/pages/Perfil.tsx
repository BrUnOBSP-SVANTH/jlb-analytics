/**
 * Perfil — JLB Analytics
 *
 * Página de usuário: pontos, progresso nos níveis, histórico de previsões,
 * feed de atividades. Inspirado em Metaculus / Manifold Markets.
 */

import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import PageHeader from "@/components/PageHeader";
import ContaTabs from "@/components/ContaTabs";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/contexts/AuthContext";
import { loadProgress, UNLOCK_THRESHOLDS, type ActivityType } from "@/lib/userProgress";
import { loadPredictions, meanBrierScore, skillScore } from "@/lib/predictions";
import {
  LogIn, Star, Trophy, Target, CheckCircle, X as XIcon,
  Zap, Calculator, Brain, BarChart2, TrendingUp, ArrowRight,
  Calendar, Clock, BookOpen, Lock, Shield, Award, Flame,
  Layers, Eye, Sigma, Globe, Save,
} from "lucide-react";

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
};

const LEVELS = [
  { n: 1, title: "Fundamentos",        href: "/nivel/1", requires: 0   },
  { n: 2, title: "Leitura de Dados",   href: "/nivel/2", requires: 0   },
  { n: 3, title: "Modelos Básicos",    href: "/nivel/3", requires: 0   },
  { n: 4, title: "Vieses e Psicologia", href: "/nivel/4", requires: 50 },
  { n: 5, title: "Análise Integrada",  href: "/nivel/5", requires: 100 },
];

// ── Badges ────────────────────────────────────────────────────────────────────

interface BadgeDef {
  id: string;
  name: string;
  desc: string;
  icon: typeof Trophy;
  color: string;
  bg: string;
  check: (ctx: BadgeContext) => { earned: boolean; earnedAt?: string };
  progress?: (ctx: BadgeContext) => { current: number; target: number };
}

interface BadgeContext {
  predictions: ReturnType<typeof loadPredictions>;
  resolved: ReturnType<typeof loadPredictions>;
  progress: ReturnType<typeof loadProgress>;
  bs: number | null;
  ss: number | null;
  createdAt?: string;
}

const BADGE_DEFS: BadgeDef[] = [
  {
    id: "first_prediction",
    name: "Primeira Previsão",
    desc: "Registrou sua primeira previsão",
    icon: Target,
    color: "text-neon-blue",
    bg: "bg-neon-blue/10",
    check: ({ predictions }) => ({ earned: predictions.length >= 1, earnedAt: predictions[0]?.savedAt }),
    progress: ({ predictions }) => ({ current: Math.min(1, predictions.length), target: 1 }),
  },
  {
    id: "calibrated",
    name: "Calibrado",
    desc: "Brier Score < 0.15 em 5+ previsões resolvidas",
    icon: Sigma,
    color: "text-positive",
    bg: "bg-positive/10",
    check: ({ bs, resolved }) => ({ earned: resolved.length >= 5 && bs !== null && bs < 0.15 }),
    progress: ({ resolved }) => ({ current: Math.min(5, resolved.length), target: 5 }),
  },
  {
    id: "shark",
    name: "Shark",
    desc: "Bateu o mercado em 60%+ das previsões (mín. 10)",
    icon: TrendingUp,
    color: "text-gold",
    bg: "bg-gold/10",
    check: ({ resolved }) => {
      if (resolved.length < 10) return { earned: false };
      const beats = resolved.filter((p) => {
        const outcome = p.outcome ? 1 : 0;
        return Math.pow(outcome - p.userProb / 100, 2) < Math.pow(outcome - p.marketProb / 100, 2);
      }).length;
      return { earned: beats / resolved.length >= 0.6 };
    },
    progress: ({ resolved }) => ({ current: Math.min(10, resolved.length), target: 10 }),
  },
  {
    id: "marathoner",
    name: "Maratonista",
    desc: "30+ previsões registradas",
    icon: Flame,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    check: ({ predictions }) => ({ earned: predictions.length >= 30 }),
    progress: ({ predictions }) => ({ current: Math.min(30, predictions.length), target: 30 }),
  },
  {
    id: "expert",
    name: "Expert",
    desc: "Skill Score > 0.3",
    icon: Award,
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    check: ({ ss }) => ({ earned: ss !== null && ss > 0.3 }),
  },
  {
    id: "early_adopter",
    name: "Early Adopter",
    desc: "Conta criada antes de junho de 2026",
    icon: Star,
    color: "text-yellow-400",
    bg: "bg-yellow-400/10",
    check: ({ createdAt }) => ({
      earned: createdAt !== undefined && new Date(createdAt) < new Date("2026-06-01"),
    }),
  },
  {
    id: "streak_3",
    name: "Streak ×3",
    desc: "3 previsões seguidas com Brier Score < 0.15",
    icon: Zap,
    color: "text-neon-blue",
    bg: "bg-neon-blue/10",
    check: ({ resolved }) => {
      const sorted = [...resolved]
        .filter((p) => p.brierScore !== null)
        .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
      let streak = 0;
      for (const p of sorted) {
        if ((p.brierScore ?? 1) < 0.15) streak++;
        else break;
      }
      return { earned: streak >= 3 };
    },
  },
  {
    id: "streak_5",
    name: "Streak ×5",
    desc: "5 previsões seguidas com Brier Score < 0.15",
    icon: Flame,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    check: ({ resolved }) => {
      const sorted = [...resolved]
        .filter((p) => p.brierScore !== null)
        .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
      let streak = 0;
      for (const p of sorted) {
        if ((p.brierScore ?? 1) < 0.15) streak++;
        else break;
      }
      return { earned: streak >= 5 };
    },
  },
  {
    id: "streak_10",
    name: "Streak ×10",
    desc: "10 previsões seguidas com Brier Score < 0.15",
    icon: Flame,
    color: "text-positive",
    bg: "bg-positive/10",
    check: ({ resolved }) => {
      const sorted = [...resolved]
        .filter((p) => p.brierScore !== null)
        .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
      let streak = 0;
      for (const p of sorted) {
        if ((p.brierScore ?? 1) < 0.15) streak++;
        else break;
      }
      return { earned: streak >= 10 };
    },
  },
  {
    id: "diversified",
    name: "Diversificado",
    desc: "Previsões em 3+ domínios diferentes",
    icon: Layers,
    color: "text-primary",
    bg: "bg-primary/10",
    check: ({ predictions }) => {
      const cats = new Set(predictions.map((p) => {
        const q = p.question.toLowerCase();
        if (/bitcoin|crypto|btc|eth|token/.test(q)) return "cripto";
        if (/election|trump|president|governo|eleicao/.test(q)) return "politica";
        if (/soccer|football|nba|sport|futebol|gol/.test(q)) return "esportes";
        if (/inflation|gdp|economy|fed|selic|juros/.test(q)) return "economia";
        if (/ai|tech|software|openai/.test(q)) return "tech";
        return "outros";
      }));
      return { earned: cats.size >= 3 };
    },
  },
  {
    id: "first_level",
    name: "Primeiro Nível",
    desc: "Visitou o Nível 1",
    icon: BookOpen,
    color: "text-positive",
    bg: "bg-positive/10",
    check: ({ progress }) => ({
      earned: progress.oneTimeDone.includes("level_visited_1"),
    }),
  },
  {
    id: "master_levels",
    name: "Mestre dos Níveis",
    desc: "Acumulou 100+ pontos",
    icon: Trophy,
    color: "text-gold",
    bg: "bg-gold/10",
    check: ({ progress }) => ({ earned: progress.totalPoints >= 100 }),
  },
  {
    id: "analyst",
    name: "Analista",
    desc: "Analisou 5+ mercados com IA",
    icon: Brain,
    color: "text-purple-400",
    bg: "bg-purple-400/10",
    check: ({ progress }) => ({
      earned: progress.activities.filter((a) => a.type === "market_analyzed").length >= 5,
    }),
  },
  {
    id: "calculator_pro",
    name: "Calculadora Pro",
    desc: "Usou calculadoras 10+ vezes",
    icon: Calculator,
    color: "text-neon-blue",
    bg: "bg-neon-blue/10",
    check: ({ progress }) => ({
      earned: progress.activities.filter((a) => a.type === "calculator_used").length >= 10,
    }),
  },
  {
    id: "watcher",
    name: "Observador",
    desc: "Resolveu 10+ previsões",
    icon: Eye,
    color: "text-primary",
    bg: "bg-primary/10",
    check: ({ resolved }) => ({ earned: resolved.length >= 10 }),
  },
];

function BadgesSection({ ctx }: { ctx: BadgeContext }) {
  const results = BADGE_DEFS.map((def) => {
    const check = def.check(ctx);
    const prog = def.progress ? def.progress(ctx) : null;
    return { def, earned: check.earned, earnedAt: check.earnedAt, prog };
  });

  const earned = results.filter((r) => r.earned);
  const locked = results.filter((r) => !r.earned);

  // Badge mais próximo de ser desbloqueado
  const nextUp = locked
    .filter((r) => r.prog)
    .sort((a, b) => (b.prog!.current / b.prog!.target) - (a.prog!.current / a.prog!.target))[0];

  return (
    <div className="glass-card rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-gold" aria-hidden="true" />
        <h2 className="font-semibold text-foreground">Conquistas</h2>
        <span className="ml-auto text-xs font-mono text-muted-foreground">
          {earned.length}/{results.length}
        </span>
      </div>

      {/* Próximo badge em destaque */}
      {nextUp && !nextUp.earned && nextUp.prog && (
        <div className={`p-4 rounded-xl border border-gold/30 bg-gold/5 space-y-2`}>
          <p className="text-[10px] font-semibold text-gold uppercase tracking-wider">Próxima conquista</p>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${nextUp.def.bg} flex items-center justify-center shrink-0`}>
              {(() => { const Icon = nextUp.def.icon; return <Icon className={`w-5 h-5 ${nextUp.def.color}`} />; })()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">{nextUp.def.name}</p>
              <p className="text-xs text-muted-foreground">{nextUp.def.desc}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold rounded-full transition-all"
                    style={{ width: `${Math.round((nextUp.prog.current / nextUp.prog.target) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-gold shrink-0">
                  {nextUp.prog.current}/{nextUp.prog.target}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {earned.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">
            Conquistadas ({earned.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {earned.map(({ def, earnedAt }) => {
              const Icon = def.icon;
              return (
                <div
                  key={def.id}
                  className={`p-3 rounded-xl border border-border/30 ${def.bg} text-center space-y-1.5`}
                  title={`${def.name}: ${def.desc}`}
                >
                  <div className={`w-9 h-9 rounded-xl ${def.bg} flex items-center justify-center mx-auto`}>
                    <Icon className={`w-4 h-4 ${def.color}`} aria-hidden="true" />
                  </div>
                  <p className={`text-xs font-bold ${def.color} leading-tight`}>{def.name}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">{def.desc}</p>
                  {earnedAt && (
                    <p className="text-[9px] text-muted-foreground/50">
                      {new Date(earnedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {locked.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">
            Bloqueadas ({locked.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {locked.map(({ def, prog }) => {
              const Icon = def.icon;
              const pct = prog ? Math.round((prog.current / prog.target) * 100) : 0;
              return (
                <div
                  key={def.id}
                  className="p-3 rounded-xl border border-border/20 bg-secondary/5 text-center space-y-1.5"
                  title={`Bloqueado: ${def.desc}`}
                >
                  <div className="w-9 h-9 rounded-xl bg-secondary/30 flex items-center justify-center mx-auto">
                    <Icon className="w-4 h-4 text-muted-foreground/50" aria-hidden="true" />
                  </div>
                  <p className="text-xs font-bold text-muted-foreground/70 leading-tight">{def.name}</p>
                  <p className="text-[10px] text-muted-foreground/50 leading-snug">{def.desc}</p>
                  {prog && prog.target > 0 && (
                    <div className="space-y-0.5">
                      <div className="h-1 bg-secondary/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/40 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-[9px] text-muted-foreground/40 font-mono">
                        {prog.current}/{prog.target}
                      </p>
                    </div>
                  )}
                  {!prog && <Lock className="w-3 h-3 text-muted-foreground/30 mx-auto" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {earned.length === 0 && !nextUp && (
        <div className="text-center py-6 space-y-2">
          <Shield className="w-8 h-8 mx-auto text-muted-foreground/30" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Nenhuma conquista ainda.</p>
          <p className="text-xs text-muted-foreground/60">Faça previsões e explore os níveis para desbloquear.</p>
        </div>
      )}
    </div>
  );
}

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

// ── Premium / Stripe ────────────────────────────────────────────────────────

function PremiumUpgrade({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [plan, setPlan] = useState<"free" | "premium" | null>(null);
  const [loading, setLoading] = useState(false);
  // Nome canônico é VITE_STRIPE_PREMIUM_PRICE_ID (.env / .env.example); mantém
  // fallback ao nome antigo por segurança.
  const priceId = (import.meta.env.VITE_STRIPE_PREMIUM_PRICE_ID
    ?? import.meta.env.VITE_STRIPE_PRICE_ID) as string | undefined;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success")) toast.success("Bem-vindo ao Premium! 🎉", { description: "Análises ilimitadas e níveis avançados liberados." });
    if (params.get("cancelled")) toast("Checkout cancelado — sem cobrança.");
    void supabase.from("profiles").select("plan").eq("id", userId).maybeSingle()
      .then(({ data }) => setPlan((data?.plan as "free" | "premium") ?? "free"));
  }, [userId]);

  async function handleUpgrade() {
    if (!priceId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, userId, userEmail }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) { window.location.href = data.url; return; }
      toast.error(data.error ?? "Não foi possível iniciar o checkout.");
    } catch { toast.error("Erro ao conectar com o pagamento."); }
    setLoading(false);
  }

  if (plan === "premium") {
    return (
      <AnimatedSection>
        <div className="glass-card rounded-2xl p-5 border border-gold/30 bg-gold/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 text-gold" />
          </div>
          <div>
            <p className="text-sm font-bold text-gold">Plano Premium ativo</p>
            <p className="text-xs text-muted-foreground">Análises de IA ilimitadas e apoio ao projeto. Obrigado! 🙏</p>
          </div>
        </div>
      </AnimatedSection>
    );
  }

  const benefits = [
    "Análises de IA ilimitadas (sem a cota mensal de 30)",
    "Previsão Guiada + Briefing por IA sem limite",
    "Histórico de previsões sincronizado na nuvem",
    "Apoio ao projeto + prioridade em novos recursos",
  ];

  return (
    <AnimatedSection>
      <div className="glass-card rounded-2xl p-6 border border-gold/20 bg-gradient-to-br from-gold/5 to-transparent space-y-4">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-gold" />
          <h2 className="font-semibold text-foreground">JLB Premium</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {benefits.map((b) => (
            <div key={b} className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle className="w-3.5 h-3.5 text-gold shrink-0 mt-0.5" /> {b}
            </div>
          ))}
        </div>
        {priceId ? (
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-gold text-on-accent text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading ? <span className="w-4 h-4 border-2 border-on-accent border-t-transparent rounded-full animate-spin" /> : <Star className="w-4 h-4" />}
            Assinar Premium
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground/60">
            Checkout em configuração. Defina <code className="font-mono">VITE_STRIPE_PREMIUM_PRICE_ID</code> e <code className="font-mono">STRIPE_SECRET_KEY</code> para ativar.
          </p>
        )}
      </div>
    </AnimatedSection>
  );
}

export default function Perfil() {
  useSEO("Meu Perfil", "Seu progresso, calibração, conquistas e preferências na JLB Analytics.");
  const { user } = useAuth();
  const progress = useMemo(() => loadProgress(), []);
  const predictions = useMemo(() => loadPredictions(), []);

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

      <div className="container py-12 space-y-10">

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

interface DigestPreview {
  trackRecord: { resolvedCount: number; beatMarketPct: number | null } | null;
  topDivergences: Array<{ title: string; currentProb: number; aiFairValue: number; edge: number }>;
  closingSoon: Array<{ title: string; daysLeft: number }>;
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? "bg-positive" : "bg-secondary/60"}`}
    >
      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

function EmailPreferences({ userId }: { userId: string }) {
  const [weekly, setWeekly] = useState(false);
  const [resolution, setResolution] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [preview, setPreview] = useState<DigestPreview | null>(null);

  useEffect(() => {
    void supabase.from("profiles").select("email_weekly_digest, email_resolution_alert").eq("id", userId).maybeSingle()
      .then(({ data }) => {
        if (data) { setWeekly(data.email_weekly_digest ?? false); setResolution(data.email_resolution_alert ?? false); }
        setLoaded(true);
      });
    fetch("/api/ai/weekly-digest")
      .then((r) => r.ok ? r.json() as Promise<DigestPreview> : null)
      .then((d) => { if (d) setPreview(d); })
      .catch(() => {});
  }, [userId]);

  async function handleSave() {
    setSaving(true); setSaved(false);
    try {
      await supabase.from("profiles").update({
        email_weekly_digest: weekly,
        email_resolution_alert: resolution,
        updated_at: new Date().toISOString(),
      }).eq("id", userId);
      setSaved(true);
    } catch { /* silent */ } finally { setSaving(false); }
  }

  if (!loaded) return null;

  return (
    <AnimatedSection>
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-gold" />
          <h2 className="font-semibold text-foreground">Notificações por email</h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/30 bg-secondary/10">
            <div>
              <p className="text-sm font-medium text-foreground">Resumo semanal</p>
              <p className="text-xs text-muted-foreground mt-0.5">Track record da IA, onde a JLB discorda do mercado e mercados encerrando.</p>
            </div>
            <Toggle on={weekly} label="Resumo semanal por email" onClick={() => setWeekly((v) => !v)} />
          </div>
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/30 bg-secondary/10">
            <div>
              <p className="text-sm font-medium text-foreground">Alertas de resolução</p>
              <p className="text-xs text-muted-foreground mt-0.5">Aviso quando uma previsão sua estiver pronta para resolver.</p>
            </div>
            <Toggle on={resolution} label="Alertas de resolução por email" onClick={() => setResolution((v) => !v)} />
          </div>
        </div>

        {/* Preview do que será enviado — valor imediato, mesmo sem email configurado */}
        {preview && (preview.topDivergences.length > 0 || (preview.trackRecord?.resolvedCount ?? 0) > 0) && (
          <div className="p-4 rounded-xl border border-gold/15 bg-gold/3 space-y-2">
            <p className="text-[10px] font-semibold text-gold uppercase tracking-wider">Prévia do resumo desta semana</p>
            {preview.trackRecord && preview.trackRecord.resolvedCount >= 5 && (
              <p className="text-xs text-muted-foreground">📊 A IA bateu o mercado em <span className="text-positive font-semibold">{preview.trackRecord.beatMarketPct}%</span> das {preview.trackRecord.resolvedCount} previsões resolvidas.</p>
            )}
            {preview.topDivergences.slice(0, 3).map((d, i) => (
              <p key={i} className="text-xs text-muted-foreground truncate">
                🎯 {d.title.slice(0, 50)} — <span className={d.edge > 0 ? "text-positive" : "text-negative"}>{d.edge > 0 ? "+" : ""}{d.edge}pp</span>
              </p>
            ))}
            {preview.topDivergences.length === 0 && (
              <p className="text-xs text-muted-foreground/60">As divergências aparecem aqui conforme a IA analisa mercados.</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
            Salvar preferências
          </button>
          {saved && <p className="text-xs text-positive">✓ Salvo!</p>}
        </div>
        <p className="text-[10px] text-muted-foreground/50">
          O envio de emails requer um provedor configurado (Resend). Até lá, a prévia acima mostra o conteúdo no app.
        </p>
      </div>
    </AnimatedSection>
  );
}

// ── Profile Public Settings ────────────────────────────────────────────────────

function ProfilePublicSettings({ userId }: { userId: string }) {
  const [username, setUsername]         = useState("");
  const [displayName, setDisplayName]   = useState("");
  const [bio, setBio]                   = useState("");
  const [isPublic, setIsPublic]         = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [loaded, setLoaded]             = useState(false);

  useEffect(() => {
    void supabase.from("profiles").select("username, display_name, bio, public_profile").eq("id", userId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUsername(data.username ?? "");
          setDisplayName(data.display_name ?? "");
          setBio(data.bio ?? "");
          setIsPublic(data.public_profile ?? false);
        }
        setLoaded(true);
      });
  }, [userId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updates: Record<string, unknown> = {
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        public_profile: isPublic,
        updated_at: new Date().toISOString(),
      };
      if (username.trim()) {
        if (!/^[a-z0-9_]{3,20}$/.test(username.trim())) {
          throw new Error("Username deve ter 3-20 caracteres (letras minúsculas, números e _)");
        }
        updates.username = username.trim();
      }
      const { error: err } = await supabase.from("profiles").update(updates).eq("id", userId);
      if (err) throw new Error(err.message.includes("duplicate") ? "Este username já está em uso" : err.message);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return null;

  return (
    <AnimatedSection>
      <div className="glass-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-neon-blue" />
          <h2 className="font-semibold text-foreground">Perfil Público · Leaderboard</h2>
        </div>

        <p className="text-xs text-muted-foreground">
          Ative o perfil público para aparecer no{" "}
          <Link href="/leaderboard"><span className="text-gold hover:underline cursor-pointer">Leaderboard de Calibração</span></Link>
          {" "}e permitir que outros vejam seu track record. O email nunca é exibido.
        </p>

        {/* Toggle público */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-border/30 bg-secondary/10">
          <div>
            <p className="text-sm font-semibold text-foreground">Perfil público</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isPublic ? "Visível no leaderboard e para outros usuários" : "Privado — apenas você vê"}
            </p>
          </div>
          <button
            onClick={() => setIsPublic((v) => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors ${isPublic ? "bg-positive" : "bg-secondary/60"}`}
          >
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${isPublic ? "left-6" : "left-1"}`} />
          </button>
        </div>

        {/* Campos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Username público</label>
            <div className="flex items-center mt-1.5">
              <span className="px-2.5 py-2 bg-secondary/30 border border-r-0 border-border/40 rounded-l-lg text-xs text-muted-foreground">@</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="meu_username"
                maxLength={20}
                className="flex-1 px-3 py-2 bg-secondary/30 border border-border/40 rounded-r-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <p className="text-[10px] text-muted-foreground/50 mt-1">3-20 chars, minúsculas, números e _</p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Nome de exibição</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como quer ser chamado"
              maxLength={40}
              className="w-full mt-1.5 px-3 py-2 bg-secondary/30 border border-border/40 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Bio (opcional)</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Breve descrição sobre você e seus interesses em forecasting…"
            maxLength={200}
            rows={2}
            className="w-full mt-1.5 px-3 py-2 bg-secondary/30 border border-border/40 rounded-lg text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
          <p className="text-[10px] text-muted-foreground/50 mt-0.5">{bio.length}/200</p>
        </div>

        {error && <p className="text-xs text-negative">{error}</p>}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar configurações
          </button>
          {saved && <p className="text-xs text-positive">✓ Salvo com sucesso!</p>}
          <Link href="/leaderboard" className="ml-auto">
            <span className="text-xs text-gold hover:underline">Ver leaderboard →</span>
          </Link>
        </div>
      </div>
    </AnimatedSection>
  );
}
