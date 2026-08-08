/**
 * Painéis de progresso do usuário (Dashboard) — extraídos de pages/Dashboard.tsx.
 * LevelMap (mapa de níveis), BehavioralMetrics (Brier/overconfidence/maturidade)
 * e QuickActions (próximas ações). Comportamento idêntico.
 */
import { Link } from "wouter";
import { MODEL_COUNT } from "@/lib/brand";
import {
  GraduationCap, BarChart3, TrendingUp, Brain, GitMerge, Lock,
  ArrowRight, AlertCircle, Activity, Trophy, Target, Sparkles,
} from "lucide-react";
import { loadPredictions, meanBrierScore } from "@/lib/predictions";

const LEVELS = [
  { n: 1, title: "Fundamentos",        href: "/nivel/1", icon: GraduationCap, color: "text-positive",   requires: 0   },
  { n: 2, title: "Leitura de Dados",   href: "/nivel/2", icon: BarChart3,     color: "text-primary",    requires: 0   },
  { n: 3, title: "Modelos Básicos",    href: "/nivel/3", icon: TrendingUp,    color: "text-level3", requires: 0   },
  { n: 4, title: "Vieses e Psicologia", href: "/nivel/4", icon: Brain,        color: "text-level4", requires: 50  },
  { n: 5, title: "Análise Integrada",  href: "/nivel/5", icon: GitMerge,      color: "text-neon-blue",  requires: 100 },
];

const MATURITY_LABELS = [
  "Iniciante — decisões majoritariamente intuitivas",
  "Em desenvolvimento — começa a estruturar análise",
  "Intermediário — usa modelos, calibração a melhorar",
  "Avançado — processo consistente, vieses mapeados",
  "Expert — calibração estável, referência metodológica",
];

export function LevelMap({ userPoints }: { userPoints: number }) {
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

export function BehavioralMetrics({ userLevel }: { userLevel: number }) {
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
            <p className={`text-xl font-bold font-mono mt-0.5 ${brierSkill > 0.15 ? "text-positive" : brierSkill > 0 ? "text-warning" : "text-negative"}`}>
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
            <p className={`text-xl font-bold font-mono mt-0.5 ${Math.abs(overconfidence) < 0.05 ? "text-positive" : Math.abs(overconfidence) < 0.15 ? "text-warning" : "text-negative"}`}>
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
      <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/5 border border-warning/20">
        <AlertCircle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
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

export function QuickActions({ userLevel }: { userLevel: number }) {
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
              <p className="text-xs text-muted-foreground">{MODEL_COUNT} modelos econométricos automáticos</p>
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </Link>
      </div>
    </div>
  );
}
