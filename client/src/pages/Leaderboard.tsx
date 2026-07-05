/**
 * Leaderboard — JLB Analytics
 * Ranking público de calibração — estilo Metaculus.
 * Mostra os forecasters com melhor Brier Score que optaram por perfil público.
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import { supabase } from "@/lib/supabase";
import {
  Trophy, Medal, Target, User, TrendingUp,
  RefreshCw, AlertCircle, Star, Zap,
} from "lucide-react";
import ContaTabs from "@/components/ContaTabs";

interface LeaderEntry {
  id: string;
  username: string;
  display_name: string | null;
  avg_brier_score: number | null;
  predictions_count: number;
  resolved_count: number;
  skill_score: number;
  plan: "free" | "premium";
  created_at: string;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="w-5 h-5 text-gold" />;
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-300" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return (
    <span className="w-5 h-5 flex items-center justify-center text-xs font-mono font-bold text-muted-foreground">
      {rank}
    </span>
  );
}

function ScoreBadge({ bs }: { bs: number | null }) {
  if (bs === null) return <span className="text-xs text-muted-foreground/50">—</span>;
  const color = bs < 0.10 ? "text-positive" : bs < 0.15 ? "text-yellow-400" : bs < 0.20 ? "text-gold" : "text-muted-foreground";
  const label = bs < 0.10 ? "Elite" : bs < 0.15 ? "Calibrado" : bs < 0.20 ? "Intermediário" : "Iniciante";
  return (
    <div className="text-right">
      <p className={`text-sm font-mono font-bold ${color}`}>{bs.toFixed(3)}</p>
      <p className={`text-[9px] ${color} opacity-70`}>{label}</p>
    </div>
  );
}

function SkillBar({ ss }: { ss: number }) {
  const pct = Math.max(0, Math.min(100, ((ss + 1) / 2) * 100));
  const color = ss > 0.25 ? "bg-positive" : ss > 0 ? "bg-yellow-400" : "bg-muted-foreground/30";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-mono ${ss > 0 ? "text-positive" : "text-muted-foreground/50"}`}>
        {ss >= 0 ? "+" : ""}{(ss * 100).toFixed(0)}%
      </span>
    </div>
  );
}

export default function Leaderboard() {
  useSEO("Leaderboard de Calibração", "Ranking público dos forecasters mais precisos da plataforma, medido por Brier Score em previsões resolvidas.");
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "premium">("all");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from("leaderboard")
        .select("*")
        .order("avg_brier_score", { ascending: true, nullsFirst: false })
        .limit(50);
      if (filter === "premium") q = q.eq("plan", "premium");
      const { data, error: err } = await q;
      if (err) throw new Error(err.message);
      setEntries((data ?? []) as LeaderEntry[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar ranking");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const benchmarks = [
    { label: "Superforecasters GJP", bs: 0.10, color: "text-positive" },
    { label: "Média Polymarket", bs: 0.18, color: "text-gold" },
    { label: "Chute aleatório (50%)", bs: 0.25, color: "text-muted-foreground" },
  ];

  return (
    <div>
      <PageHeader
        title="Leaderboard"
        subtitle="Ranking público de calibração — os forecasters mais precisos da plataforma, por Brier Score."
        badge="Comunidade"
      />

      <div className="container py-10 space-y-8 max-w-4xl mx-auto">
        <ContaTabs />

        {/* Benchmarks */}
        <AnimatedSection>
          <div className="glass-card rounded-xl p-5">
            <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">
              Referências de Brier Score
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {benchmarks.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0">
                    <Target className={`w-4 h-4 ${b.color}`} />
                  </div>
                  <div>
                    <p className={`text-sm font-mono font-bold ${b.color}`}>{b.bs.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground/70">{b.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AnimatedSection>

        {/* Filtros + Atualizar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex rounded-lg overflow-hidden border border-border/30">
            {(["all", "premium"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                  filter === f
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "Todos" : "⭐ Premium"}
              </button>
            ))}
          </div>
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-negative/5 border border-negative/20">
            <AlertCircle className="w-4 h-4 text-negative shrink-0" />
            <div>
              <p className="text-sm text-foreground">Não foi possível carregar o ranking</p>
              <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Ranking */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 glass-card rounded-xl animate-pulse" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <AnimatedSection>
            <div className="glass-card rounded-xl p-12 text-center space-y-4">
              <Trophy className="w-12 h-12 text-muted-foreground/20 mx-auto" />
              <p className="text-foreground font-semibold">Nenhum forecaster no ranking ainda</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Para aparecer aqui, ative o perfil público em <strong>Configurações do Perfil</strong>
                e resolva pelo menos 1 previsão.
              </p>
              <Link href="/perfil">
                <span className="inline-flex items-center gap-2 mt-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                  <User className="w-4 h-4" /> Ir para o Perfil
                </span>
              </Link>
            </div>
          </AnimatedSection>
        ) : (
          <AnimatedSection>
            <div className="glass-card rounded-xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[28px_1fr_72px] sm:grid-cols-[40px_1fr_90px_80px_90px] gap-3 px-3 sm:px-5 py-3 border-b border-border/20 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                <span>#</span>
                <span>Forecaster</span>
                <span className="text-right">Brier Score</span>
                <span className="text-right hidden sm:block">Previsões</span>
                <span className="hidden sm:block">Skill Score</span>
              </div>

              {/* Rows */}
              {entries.map((entry, i) => (
                <div
                  key={entry.id}
                  className={`grid grid-cols-[28px_1fr_72px] sm:grid-cols-[40px_1fr_90px_80px_90px] gap-3 px-3 sm:px-5 py-3.5 items-center border-b border-border/10 hover:bg-secondary/10 transition-colors ${
                    i === 0 ? "bg-gold/3 border-b-gold/20" : ""
                  }`}
                >
                  {/* Rank */}
                  <div className="flex justify-center">
                    <RankBadge rank={i + 1} />
                  </div>

                  {/* User */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                      entry.plan === "premium" ? "bg-gold/15 text-gold" : "bg-primary/10 text-primary"
                    }`}>
                      {(entry.display_name ?? entry.username).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {entry.display_name ?? entry.username}
                        </p>
                        {entry.plan === "premium" && <Star className="w-3 h-3 text-gold shrink-0" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground/60">@{entry.username}</p>
                    </div>
                  </div>

                  {/* Brier Score */}
                  <ScoreBadge bs={entry.avg_brier_score} />

                  {/* Previsões */}
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-mono text-foreground">{entry.resolved_count}</p>
                    <p className="text-[10px] text-muted-foreground/60">resolvidas</p>
                  </div>

                  {/* Skill Score bar */}
                  <div className="hidden sm:block">
                    <SkillBar ss={entry.skill_score ?? 0} />
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground/40 text-center mt-3">
              Mín. 1 previsão resolvida · Atualizado em tempo real · Perfil público ativado
            </p>
          </AnimatedSection>
        )}

        {/* CTA */}
        <AnimatedSection>
          <div className="p-5 rounded-xl border border-primary/20 bg-primary/3 flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">Quer aparecer no ranking?</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ative o perfil público, faça previsões e resolva-as quando o mercado fechar.
                Seu Brier Score é calculado automaticamente.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href="/previsao">
                <span className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-secondary/50 border border-border/30 text-xs text-foreground hover:bg-secondary/70 transition-colors">
                  <Zap className="w-3.5 h-3.5" /> Fazer previsão
                </span>
              </Link>
              <Link href="/perfil">
                <span className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity">
                  <TrendingUp className="w-3.5 h-3.5" /> Ver meu perfil
                </span>
              </Link>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
}
