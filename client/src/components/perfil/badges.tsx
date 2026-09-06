/**
 * BadgesSection — conquistas/gamificacao do Perfil (14 badges + proximo em destaque).
 * Extraido de pages/Perfil.tsx. BadgeContext e montado pela pagina e passado por prop.
 */
import { loadPredictions } from "@/lib/predictions";
import { loadProgress } from "@/lib/userProgress";
import {
  Trophy, Target, Sigma, TrendingUp, Flame, Award, Star, Zap,
  Layers, BookOpen, Brain, Calculator, Eye, Lock, Shield,
} from "lucide-react";

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

export interface BadgeContext {
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

export function BadgesSection({ ctx }: { ctx: BadgeContext }) {
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
        <h2 className="font-semibold text-[var(--titulo)]">Conquistas</h2>
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
