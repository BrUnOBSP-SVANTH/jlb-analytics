/**
 * Duelos de Previsão — Fase 1 (pontos, sem dinheiro real). Ver DUELOS.md.
 * Dois jogadores selam previsões probabilísticas no MESMO baralho de mercados;
 * quando todas as pernas resolvem, o menor Brier vence e leva os pontos.
 */
import { useState, useEffect, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/contexts/AuthContext";
import { getMarkets } from "@/lib/marketsCache";
import { awardPoints } from "@/lib/userProgress";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Swords, LogIn, Plus, RefreshCw, Clock, Trophy, X,
  ChevronRight, Shield, Scale, Info,
} from "lucide-react";

// ── Tipos ──────────────────────────────────────────────────────────────────

interface DuelMarket { marketId: string; source: string; title: string; probAtCreate?: number }
interface DuelPred { marketId: string; prob: number }

interface OpenDuel { id: string; creatorName: string; stakePts: number; markets: DuelMarket[]; createdAt: string }

interface MyDuel {
  id: string; status: "open" | "active" | "resolved" | "cancelled";
  stakePts: number; creatorName: string; opponentName: string | null;
  markets: DuelMarket[]; createdAt: string; resolvedAt: string | null;
  isCreator: boolean; myPreds: DuelPred[] | null; theirPreds: DuelPred[] | null;
  creatorBrier: number | null; opponentBrier: number | null;
  resolvedLegs: number | null; winnerId: string | null; won: boolean;
}

interface PolyApiMarket { id: string; question: string; outcomePrices?: string; volume?: number }

type Tab = "lobby" | "meus" | "como";

// ── Helpers ────────────────────────────────────────────────────────────────

function parseProb(outcomePrices?: string): number {
  try {
    const p = parseFloat((JSON.parse(outcomePrices ?? "[]") as string[])[0]);
    return Number.isFinite(p) ? Math.round(p * 100) : 50;
  } catch { return 50; }
}

function timeAgo(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (h < 1) return "agora há pouco";
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

// ── Sliders de previsão para um baralho ────────────────────────────────────

function PredSliders({ markets, preds, onChange }: {
  markets: DuelMarket[];
  preds: Record<string, number>;
  onChange: (marketId: string, prob: number) => void;
}) {
  return (
    <div className="space-y-4">
      {markets.map((m) => (
        <div key={m.marketId}>
          <div className="flex justify-between items-start gap-3 mb-1.5">
            <p className="text-xs text-foreground leading-snug flex-1">{m.title}</p>
            <span className="text-sm font-mono font-bold text-gold w-11 text-right shrink-0">
              {preds[m.marketId] ?? 50}%
            </span>
          </div>
          <input
            type="range" min={1} max={99} value={preds[m.marketId] ?? 50}
            onChange={(e) => onChange(m.marketId, Number(e.target.value))}
            className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
            aria-label={`Sua probabilidade para: ${m.title}`}
          />
        </div>
      ))}
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────

export default function Duelos() {
  useSEO("Duelos de Previsão", "Desafie outros forecasters: previsões seladas no mesmo baralho de mercados, menor Brier vence. Fase beta por pontos — sem dinheiro real.");
  const { user, session } = useAuth();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("lobby");

  const [open, setOpen] = useState<OpenDuel[]>([]);
  const [mine, setMine] = useState<MyDuel[]>([]);
  const [loading, setLoading] = useState(false);

  // criação
  const [creating, setCreating] = useState(false);
  const [pickable, setPickable] = useState<DuelMarket[]>([]);
  const [picked, setPicked] = useState<DuelMarket[]>([]);
  const [preds, setPreds] = useState<Record<string, number>>({});
  const [stake, setStake] = useState(50);
  const [submitting, setSubmitting] = useState(false);

  // aceitar duelo
  const [joining, setJoining] = useState<OpenDuel | null>(null);
  const [joinPreds, setJoinPreds] = useState<Record<string, number>>({});

  const token = session?.access_token ?? "";
  const displayName = (user?.user_metadata?.name as string | undefined)
    ?? user?.email?.split("@")[0] ?? "Forecaster";
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [o, m] = await Promise.allSettled([
        fetch("/api/duels/open").then((r) => r.json() as Promise<{ duels: OpenDuel[] }>),
        token
          ? fetch("/api/duels/mine", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.ok ? r.json() as Promise<{ duels: MyDuel[] }> : { duels: [] })
          : Promise.resolve({ duels: [] as MyDuel[] }),
      ]);
      if (o.status === "fulfilled") setOpen(o.value.duels ?? []);
      if (m.status === "fulfilled") setMine(m.value.duels ?? []);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function openCreate() {
    setCreating(true);
    if (pickable.length === 0) {
      try {
        const raw = await getMarkets<PolyApiMarket>("polymarket");
        setPickable(raw.slice(0, 20).map((m) => ({
          marketId: `poly-${m.id}`, source: "polymarket",
          title: m.question, probAtCreate: parseProb(m.outcomePrices),
        })));
      } catch { toast.error("Não foi possível carregar os mercados agora."); }
    }
  }

  function togglePick(m: DuelMarket) {
    setPicked((prev) => {
      if (prev.some((p) => p.marketId === m.marketId)) return prev.filter((p) => p.marketId !== m.marketId);
      if (prev.length >= 5) { toast("Máximo de 5 mercados por duelo"); return prev; }
      setPreds((pp) => ({ ...pp, [m.marketId]: m.probAtCreate ?? 50 }));
      return [...prev, m];
    });
  }

  async function handleCreate() {
    if (picked.length < 2) { toast("Escolha pelo menos 2 mercados"); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/duels", {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({
          stakePts: stake, displayName,
          markets: picked,
          preds: picked.map((m) => ({ marketId: m.marketId, prob: preds[m.marketId] ?? 50 })),
        }),
      });
      const data = await res.json() as { duel?: unknown; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Falha ao criar duelo");
      toast.success("Duelo criado e previsões seladas!", { description: "Ele aparece no lobby até alguém aceitar." });
      setCreating(false); setPicked([]); setPreds({});
      setTab("meus");
      void loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar duelo");
    } finally { setSubmitting(false); }
  }

  async function handleJoin() {
    if (!joining) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/duels/${joining.id}/join`, {
        method: "POST", headers: authHeaders,
        body: JSON.stringify({
          displayName,
          preds: joining.markets.map((m) => ({ marketId: m.marketId, prob: joinPreds[m.marketId] ?? 50 })),
        }),
      });
      const data = await res.json() as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Falha ao entrar no duelo");
      toast.success("Duelo aceito — previsões seladas!", { description: "Quando os mercados resolverem, o menor Brier vence." });
      setJoining(null); setJoinPreds({});
      setTab("meus");
      void loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao entrar no duelo");
    } finally { setSubmitting(false); }
  }

  async function handleResolve(d: MyDuel) {
    try {
      const res = await fetch(`/api/duels/${d.id}/resolve`, { method: "POST", headers: authHeaders });
      const data = await res.json() as { pending?: boolean; resolvedLegs?: number; totalLegs?: number; duel?: MyDuel };
      if (data.pending) {
        toast(`Ainda em andamento: ${data.resolvedLegs}/${data.totalLegs} mercados resolvidos`, {
          description: "Uma perna resolve quando o mercado bate preço extremo (≥97% ou ≤3%).",
        });
      } else if (data.duel) {
        if (data.duel.won) {
          const r = awardPoints("duel_won", `Venceu duelo vs ${d.isCreator ? d.opponentName : d.creatorName}`, `duel_won_${d.id}`);
          toast.success(`Você venceu o duelo! ${r.earned > 0 ? `+${r.earned} pts` : ""}`);
        } else if (data.duel.winnerId === null) {
          toast("Empate técnico — Briers idênticos.");
        } else {
          toast("Duelo resolvido — desta vez o oponente calibrou melhor.");
        }
        void loadAll();
      }
    } catch { toast.error("Não foi possível verificar agora."); }
  }

  async function handleCancel(d: MyDuel) {
    try {
      const res = await fetch(`/api/duels/${d.id}/cancel`, { method: "POST", headers: authHeaders });
      if (!res.ok) throw new Error();
      toast("Duelo cancelado.");
      void loadAll();
    } catch { toast.error("Só é possível cancelar duelos abertos que você criou."); }
  }

  // ── Gate de login ────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div>
        <PageHeader title="Duelos de Previsão" subtitle="Desafie outros forecasters: mesmo baralho de mercados, previsões seladas, menor Brier vence. Beta por pontos — sem dinheiro real." badge="Beta" />
        <div className="container py-16 max-w-md mx-auto text-center">
          <div className="w-14 h-14 rounded-full bg-gold/10 border border-gold/25 flex items-center justify-center mx-auto mb-5">
            <Swords className="w-6 h-6 text-gold" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-display font-bold text-foreground mb-2">Entre para duelar</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            Seus duelos, previsões seladas e vitórias ficam na sua conta.
            Crie uma conta gratuita para desafiar outros forecasters.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <LogIn className="w-4 h-4" aria-hidden="true" /> Entrar / Criar conta
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "lobby", label: "Lobby" },
    { id: "meus", label: "Meus duelos" },
    { id: "como", label: "Como funciona" },
  ];

  return (
    <div>
      <PageHeader title="Duelos de Previsão" subtitle="Mesmo baralho de mercados, previsões seladas, menor Brier vence. Beta por pontos — sem dinheiro real." badge="Beta" />
      <div className="container py-10 space-y-8 max-w-5xl">

        <AnimatedSection>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2" role="tablist" aria-label="Seções de duelos">
              {tabs.map((t) => (
                <button key={t.id} role="tab" aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
                    tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary/30 text-muted-foreground hover:text-foreground"
                  }`}>
                  {t.label}{t.id === "meus" && mine.length > 0 ? ` (${mine.length})` : ""}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => void loadAll()} disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Atualizar
              </button>
              <button onClick={() => void openCreate()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity">
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Criar duelo
              </button>
            </div>
          </div>
        </AnimatedSection>

        {/* ── Criação ── */}
        {creating && (
          <AnimatedSection>
            <div className="glass-card rounded-xl p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                  <Swords className="w-4 h-4 text-gold" aria-hidden="true" /> Novo duelo
                </h3>
                <button onClick={() => setCreating(false)} aria-label="Fechar criação de duelo"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  1 · Baralho — escolha de 2 a 5 mercados ({picked.length}/5)
                </p>
                {pickable.length === 0 ? (
                  <div className="h-24 rounded-lg bg-secondary/20 animate-pulse" aria-busy="true" />
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                    {pickable.map((m) => {
                      const on = picked.some((p) => p.marketId === m.marketId);
                      return (
                        <button key={m.marketId} onClick={() => togglePick(m)}
                          className={`text-left p-2.5 rounded-lg border text-xs leading-snug transition-colors ${
                            on ? "border-gold/40 bg-gold/10 text-foreground" : "border-border/20 bg-secondary/10 text-muted-foreground hover:border-border/40"
                          }`}>
                          <span className="font-mono text-[10px] text-neon-blue mr-1.5">{m.probAtCreate}%</span>
                          {m.title}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {picked.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    2 · Suas probabilidades (seladas na criação)
                  </p>
                  <PredSliders markets={picked} preds={preds}
                    onChange={(id, p) => setPreds((pp) => ({ ...pp, [id]: p }))} />
                </div>
              )}

              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div>
                  <label htmlFor="duel-stake" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    3 · Pontos em jogo
                  </label>
                  <input id="duel-stake" type="number" min={10} max={500} step={10} value={stake}
                    onChange={(e) => setStake(Math.max(10, Math.min(500, Number(e.target.value) || 50)))}
                    className="w-28 bg-secondary/50 border border-border/50 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                </div>
                <button onClick={() => void handleCreate()} disabled={submitting || picked.length < 2}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40">
                  {submitting ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Shield className="w-4 h-4" aria-hidden="true" />}
                  Selar previsões e publicar
                </button>
              </div>
            </div>
          </AnimatedSection>
        )}

        {/* ── Aceitar duelo ── */}
        {joining && (
          <AnimatedSection>
            <div className="glass-card rounded-xl p-6 space-y-5 border border-neon-blue/20">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-semibold text-foreground">
                  Aceitar duelo de <span className="text-gold">{joining.creatorName}</span> · {joining.stakePts} pts
                </h3>
                <button onClick={() => setJoining(null)} aria-label="Fechar aceite de duelo"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                As previsões do desafiante estão seladas — você não as vê, e ele não vê as suas.
                Registre a sua probabilidade para cada mercado do baralho.
              </p>
              <PredSliders markets={joining.markets} preds={joinPreds}
                onChange={(id, p) => setJoinPreds((pp) => ({ ...pp, [id]: p }))} />
              <button onClick={() => void handleJoin()} disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40">
                {submitting ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Swords className="w-4 h-4" aria-hidden="true" />}
                Selar e duelar
              </button>
            </div>
          </AnimatedSection>
        )}

        {/* ── Lobby ── */}
        {tab === "lobby" && !joining && (
          <AnimatedSection>
            {open.length === 0 ? (
              <div className="text-center py-14 glass-card rounded-xl px-6">
                <Swords className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground/70 mb-1">Nenhum duelo aberto agora</p>
                <p className="text-xs text-muted-foreground mb-5">Seja o primeiro: crie um duelo e desafie a comunidade.</p>
                <button onClick={() => void openCreate()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity">
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Criar duelo
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {open.map((d) => (
                  <div key={d.id} className="glass-card card-lift rounded-xl p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{d.creatorName}</p>
                      <span className="text-xs font-mono font-bold text-gold">{d.stakePts} pts</span>
                    </div>
                    <ul className="space-y-1">
                      {d.markets.map((m) => (
                        <li key={m.marketId} className="text-xs text-muted-foreground leading-snug flex gap-1.5">
                          <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" aria-hidden="true" />
                          {m.title}
                        </li>
                      ))}
                    </ul>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden="true" /> {timeAgo(d.createdAt)}
                      </span>
                      <button
                        onClick={() => {
                          setJoining(d);
                          setJoinPreds(Object.fromEntries(d.markets.map((m) => [m.marketId, m.probAtCreate ?? 50])));
                          setCreating(false);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-neon-blue/15 border border-neon-blue/30 text-neon-blue text-xs font-semibold hover:bg-neon-blue/25 transition-colors">
                        <Swords className="w-3.5 h-3.5" aria-hidden="true" /> Aceitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AnimatedSection>
        )}

        {/* ── Meus duelos ── */}
        {tab === "meus" && (
          <AnimatedSection>
            {mine.length === 0 ? (
              <div className="text-center py-14 glass-card rounded-xl px-6">
                <Scale className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground/70 mb-1">Você ainda não duelou</p>
                <p className="text-xs text-muted-foreground">Crie um duelo ou aceite um desafio no lobby.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {mine.map((d) => {
                  const vsName = d.isCreator ? (d.opponentName ?? "aguardando oponente") : d.creatorName;
                  const myBrier = d.isCreator ? d.creatorBrier : d.opponentBrier;
                  const theirBrier = d.isCreator ? d.opponentBrier : d.creatorBrier;
                  return (
                    <div key={d.id} className="glass-card rounded-xl p-5">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">
                            vs <span className={d.status === "open" ? "text-muted-foreground italic" : "text-gold"}>{vsName}</span>
                            <span className="ml-2 text-xs font-mono text-muted-foreground">{d.stakePts} pts</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {d.markets.length} mercados · {timeAgo(d.createdAt)}
                            {d.status === "active" && d.resolvedLegs != null && ` · ${d.resolvedLegs}/${d.markets.length} resolvidos`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {d.status === "open" && (
                            <>
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary/40 text-muted-foreground">Aberto</span>
                              <button onClick={() => void handleCancel(d)}
                                className="text-[11px] text-muted-foreground hover:text-negative transition-colors">Cancelar</button>
                            </>
                          )}
                          {d.status === "active" && (
                            <button onClick={() => void handleResolve(d)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary/40 text-xs text-foreground hover:bg-secondary/60 transition-colors">
                              <RefreshCw className="w-3 h-3" aria-hidden="true" /> Verificar resolução
                            </button>
                          )}
                          {d.status === "resolved" && (
                            d.won
                              ? <span className="flex items-center gap-1 text-[11px] font-semibold text-positive"><Trophy className="w-3.5 h-3.5" aria-hidden="true" /> Vitória</span>
                              : d.winnerId === null
                                ? <span className="text-[11px] font-semibold text-muted-foreground">Empate</span>
                                : <span className="text-[11px] font-semibold text-negative">Derrota</span>
                          )}
                          {d.status === "cancelled" && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary/40 text-muted-foreground">Cancelado</span>
                          )}
                        </div>
                      </div>

                      {d.status === "resolved" && myBrier != null && theirBrier != null && (
                        <div className="mt-3 pt-3 border-t border-border/15 grid grid-cols-2 gap-3 text-center">
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Seu Brier</p>
                            <p className={`text-lg font-mono font-bold ${d.won ? "text-positive" : "text-foreground"}`}>{myBrier.toFixed(3)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Brier de {vsName}</p>
                            <p className="text-lg font-mono font-bold text-muted-foreground">{theirBrier.toFixed(3)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </AnimatedSection>
        )}

        {/* ── Como funciona ── */}
        {tab === "como" && (
          <AnimatedSection>
            <div className="glass-card rounded-xl p-6 space-y-4 max-w-2xl">
              <h3 className="font-display font-semibold text-foreground flex items-center gap-2">
                <Info className="w-4 h-4 text-neon-blue" aria-hidden="true" /> Como funciona o duelo
              </h3>
              <ol className="space-y-3 text-sm text-muted-foreground leading-relaxed list-decimal pl-5">
                <li><strong className="text-foreground">Mesmo baralho:</strong> o desafiante escolhe de 2 a 5 mercados reais (Polymarket) e registra a probabilidade que acredita para cada um.</li>
                <li><strong className="text-foreground">Previsões seladas:</strong> ninguém vê a previsão do outro antes de o duelo resolver — o servidor guarda as duas em sigilo.</li>
                <li><strong className="text-foreground">Resolução:</strong> cada mercado resolve quando bate preço extremo (≥97% = SIM, ≤3% = NÃO) — o mesmo critério do track record da nossa IA.</li>
                <li><strong className="text-foreground">Menor Brier vence:</strong> Brier = média de (sua probabilidade − resultado)². Dizer o que você realmente acredita é matematicamente a melhor estratégia — impossível blefar.</li>
                <li><strong className="text-foreground">Pontos:</strong> nesta fase beta, o vencedor ganha <span className="font-mono text-gold">+25 pts</span> no perfil. Os "pontos em jogo" são o placar do desafio — nenhum dinheiro real circula.</li>
              </ol>
              <p className="text-xs text-muted-foreground/80 leading-relaxed pt-2 border-t border-border/15">
                Caráter educacional: o duelo mede calibração, não sorte. Dica: mercados que fecham em breve resolvem mais rápido.
              </p>
            </div>
          </AnimatedSection>
        )}
      </div>
    </div>
  );
}
