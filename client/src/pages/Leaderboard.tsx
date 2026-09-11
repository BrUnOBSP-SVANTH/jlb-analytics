/**
 * Leaderboard — JLB Analytics
 * Ranking público de calibração — estilo Metaculus.
 * Mostra os forecasters com melhor Brier Score que optaram por perfil público.
 */
import { useState, useEffect } from "react";
import { BRIER_SUPERFORECASTER, BRIER_DO_CHUTE, FONTE_SUPERFORECASTER } from "@shared/referencias";
import { num } from "@shared/formato";
import { buscarJson } from "@/lib/api";
import { Link } from "wouter";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import { supabase } from "@/lib/supabase";
import {
  Trophy, Medal, Target, User, TrendingUp,
  RefreshCw, AlertCircle, Star, Zap, Swords,
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
  if (rank === 2) return <Medal className="w-5 h-5 text-foreground/80" />;
  if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
  return (
    <span className="w-5 h-5 flex items-center justify-center text-xs font-mono font-bold text-muted-foreground">
      {rank}
    </span>
  );
}

function ScoreBadge({ bs }: { bs: number | null }) {
  if (bs === null) return <span className="text-xs text-muted-foreground">—</span>;
  const color = bs < 0.10 ? "text-positive" : bs < 0.15 ? "text-warning" : bs < 0.20 ? "text-gold" : "text-muted-foreground";
  const label = bs < 0.10 ? "Elite" : bs < 0.15 ? "Calibrado" : bs < 0.20 ? "Intermediário" : "Iniciante";
  return (
    <div className="text-right">
      <p className={`text-sm font-mono font-bold ${color}`}>{num(bs, 3)}</p>
      <p className={`text-[11px] ${color} opacity-70`}>{label}</p>
    </div>
  );
}

function SkillBar({ ss }: { ss: number }) {
  const pct = Math.max(0, Math.min(100, ((ss + 1) / 2) * 100));
  const color = ss > 0.25 ? "bg-positive" : ss > 0 ? "bg-warning" : "bg-muted-foreground/30";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[11px] font-mono ${ss > 0 ? "text-positive" : "text-muted-foreground"}`}>
        {ss >= 0 ? "+" : ""}{num((ss * 100), 0)}%
      </span>
    </div>
  );
}

interface DuelRank {
  id: string; name: string; wins: number; losses: number; ties: number;
  duels: number; avgBrier: number; winRate: number; isIA: boolean;
}

/** Ranking de duelistas — só aparece quando há duelos resolvidos. */
function DuelRanking() {
  const [rows, setRows] = useState<DuelRank[]>([]);

  useEffect(() => {
    fetch("/api/duels/ranking")
      .then((r) => r.ok ? r.json() as Promise<{ ranking: DuelRank[] }> : null)
      .then((d) => { if (d) setRows(d.ranking ?? []); })
      .catch(() => {});
  }, []);

  if (rows.length === 0) return null;

  return (
    <AnimatedSection>
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-3 border-b border-border/20">
          <p className="text-xs font-semibold text-foreground flex items-center gap-2">
            <Swords className="w-3.5 h-3.5 text-gold" aria-hidden="true" /> Ranking de duelistas
          </p>
          <Link href="/duelos">
            <span className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Duelar →</span>
          </Link>
        </div>
        <div className="grid grid-cols-[28px_1fr_64px_80px] gap-3 px-3 sm:px-5 py-2 border-b border-border/10 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          <span>#</span><span>Duelista</span><span className="text-right">Brier</span><span className="text-right">V-D-E</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.id} className={`grid grid-cols-[28px_1fr_64px_80px] gap-3 px-3 sm:px-5 py-3 items-center border-b border-border/10 last:border-0 ${i === 0 ? "bg-gold/3" : ""}`}>
            <span className="text-xs font-mono text-muted-foreground text-center">{i + 1}</span>
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{r.name}</p>
              {r.isIA && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-neon-blue/10 text-neon-blue border border-neon-blue/20 shrink-0">IA</span>}
            </div>
            <span className={`text-xs font-mono font-bold text-right ${r.avgBrier < 0.18 ? "text-positive" : r.avgBrier < 0.25 ? "text-gold" : "text-muted-foreground"}`}>
              {num(r.avgBrier, 3)}
            </span>
            <span className="text-xs font-mono text-right text-muted-foreground">
              <span className="text-positive">{r.wins}</span>-{r.losses}-{r.ties}
            </span>
          </div>
        ))}
        <p className="text-[11px] text-muted-foreground text-center py-2.5">
          Ordenado por calibração média nos duelos resolvidos — vitórias desempatam.
        </p>
      </div>
    </AnimatedSection>
  );
}

export default function Leaderboard() {
  useSEO("Leaderboard de Calibração", "Ranking público dos forecasters mais precisos da plataforma, medido por Brier Score em previsões resolvidas.");
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "premium">("all");
  /**
   * As réguas contra as quais o usuário compete (LDR-03).
   *
   * Duas vêm MEDIDAS do nosso próprio track record; duas são constantes de
   * `shared/referencias.ts`, com fonte. Nenhuma é inventada — se o track record
   * ainda não responder, a linha aparece com travessão em vez de número.
   */
  const [regua, setRegua] = useState<{ aiBrier: number | null; marketBrier: number | null }>({
    aiBrier: null, marketBrier: null,
  });

  useEffect(() => {
    void buscarJson<{ aiBrier: number | null; marketBrier: number | null }>("/api/ai/track-record")
      .then((d) => setRegua({ aiBrier: d.aiBrier ?? null, marketBrier: d.marketBrier ?? null }))
      .catch(() => {});
  }, []);

  const REFERENCIAS = [
    { nome: "Superforecasters do Good Judgment Project", nota: FONTE_SUPERFORECASTER, brier: BRIER_SUPERFORECASTER },
    { nome: "O mercado (Polymarket e Kalshi)", nota: "medido nas mesmas perguntas que a nossa IA respondeu", brier: regua.marketBrier },
    { nome: "A IA da JLB", nota: "o nosso próprio número, publicado no Track Record", brier: regua.aiBrier },
    { nome: "Responder 50% em tudo", nota: "o piso: é o que se consegue sem saber nada", brier: BRIER_DO_CHUTE },
  ];

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

  /**
   * A faixa de referência do topo. Achado que a auditoria NÃO viu, e que este
   * trabalho encontrou ao conferir a tela: "Média Polymarket 0.18" era um número
   * ESCRITO À MÃO, ao lado de outros dois que vinham de constante. Não medimos
   * 0,18 em lugar nenhum — e um número inventado numa tela de ranking, num site
   * cuja tese é não inventar números, é o pior lugar possível para ele estar.
   *
   * Agora: o do mercado é o MEDIDO no nosso track record (some quando não há
   * medição), e os outros dois vêm de `shared/referencias.ts`, com fonte.
   */
  const benchmarks = [
    { label: "Superforecasters do GJP", bs: BRIER_SUPERFORECASTER, color: "text-positive" },
    { label: "O mercado, medido por nós", bs: regua.marketBrier, color: "text-gold" },
    { label: "Responder 50% em tudo", bs: BRIER_DO_CHUTE, color: "text-muted-foreground" },
  ].filter((b) => b.bs != null);

  return (
    <div>
      {/* LDR-04: as abas ficavam DEPOIS do cabeçalho aqui e ANTES nas outras
          duas telas da mesma família (Dashboard e Perfil) — quem alterna entre
          elas vê a barra pular de lugar. A ordem agora é a mesma das três, e a
          mesma da família de Mercados. */}
      <ContaTabs />
      <PageHeader
      compacto
        title="Leaderboard"
        subtitle="Ranking público de calibração — os forecasters mais precisos da plataforma, por Brier Score."
        badge="Comunidade"
      />

      <div className="container py-10 space-y-8 max-w-4xl mx-auto">

        {/* Benchmarks */}
        <AnimatedSection>
          <div className="glass-card rounded-xl p-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Referências de Brier Score
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {benchmarks.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-secondary/30 flex items-center justify-center shrink-0">
                    <Target className={`w-4 h-4 ${b.color}`} />
                  </div>
                  <div>
                    <p className={`text-sm font-mono font-bold ${b.color}`}>{num(b.bs!, 2)}</p>
                    <p className="text-[11px] text-muted-foreground">{b.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AnimatedSection>

        <DuelRanking />

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
              {/* O erro cru do JavaScript ("TypeError: Failed to fetch") não diz
                  nada ao usuário e ainda parece defeito nosso mesmo quando é a
                  conexão dele. A mensagem técnica fica no title, para quem for
                  reportar. */}
              <p className="text-sm text-foreground">Não foi possível carregar o ranking agora</p>
              <p className="text-xs text-muted-foreground mt-0.5" title={error ?? undefined}>
                Verifique sua conexão e tente de novo em instantes.
              </p>
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
            {/* LDR-03: partida a frio. Um ranking vazio não convence ninguém a
                entrar — e não dá para saber se um Brier de 0,18 é bom.
                O artefato sugere "semear com linhas de referência", e é
                exatamente o que isto faz: RÉGUAS, todas reais e todas
                declaradas como réguas. Nenhum usuário fictício entra aqui: um
                ranking com gente inventada seria a coisa mais destrutiva que
                este site poderia fazer com a própria tese. */}
            <div className="glass-card rounded-xl p-6 sm:p-8 space-y-5">
              <div className="text-center space-y-2">
                <Trophy className="w-10 h-10 text-muted-foreground/40 mx-auto" aria-hidden="true" />
                <p className="text-foreground font-semibold">O ranking ainda não tem ninguém</p>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  Enquanto isso, aqui está contra o que você vai competir. Estes números são reais e
                  medidos — não são concorrentes, são a régua.
                </p>
              </div>

              <div className="space-y-2">
                {REFERENCIAS.map((r) => (
                  <div key={r.nome} className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-border/50">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground w-20 shrink-0">régua</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground">{r.nome}</p>
                      <p className="text-xs text-muted-foreground">{r.nota}</p>
                    </div>
                    <span className="font-mono font-bold text-foreground tabular-nums shrink-0">
                      {r.brier != null ? num(r.brier, 3) : "—"}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-xs text-muted-foreground text-center leading-relaxed">
                Para entrar no ranking: ative o perfil público em Configurações do Perfil e resolva
                pelo menos uma previsão. Menor é melhor — o Brier mede a distância entre o que você
                disse e o que aconteceu.
              </p>
              <div className="text-center">
                <Link href="/perfil"
                  className="alvo-toque inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">
                  <User className="w-4 h-4" aria-hidden="true" /> Ir para o Perfil
                </Link>
              </div>
            </div>
          </AnimatedSection>
        ) : (
          <AnimatedSection>
            <div className="glass-card rounded-xl overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-[28px_1fr_72px] sm:grid-cols-[40px_1fr_90px_80px_90px] gap-3 px-3 sm:px-5 py-3 border-b border-border/20 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
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
                      <p className="text-[11px] text-muted-foreground">@{entry.username}</p>
                    </div>
                  </div>

                  {/* Brier Score */}
                  <ScoreBadge bs={entry.avg_brier_score} />

                  {/* Previsões */}
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-mono text-foreground">{entry.resolved_count}</p>
                    <p className="text-[11px] text-muted-foreground">resolvidas</p>
                  </div>

                  {/* Skill Score bar */}
                  <div className="hidden sm:block">
                    <SkillBar ss={entry.skill_score ?? 0} />
                  </div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground text-center mt-3">
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
