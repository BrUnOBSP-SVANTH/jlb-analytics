/**
 * Briefing — JLB Analytics
 * Briefing diário gerado por IA: análise macro + top mercados + dica de calibração
 */

import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Newspaper, RefreshCw, TrendingUp, AlertTriangle,
  ArrowRight, Target, Clock, Loader2, Zap, BarChart2,
  Eye, Trophy, CheckCircle, BookmarkPlus,
} from "lucide-react";
import { loadPredictions, addPrediction, type StoredPrediction } from "@/lib/predictions";
import { awardPoints } from "@/lib/userProgress";
import AnaliseTabs from "@/components/AnaliseTabs";

// ─── Types ─────────────────────────────────────────────────────────────────

interface MarketHighlight {
  market: string;
  prob: number;
  insight: string;
}

interface BriefingData {
  headline: string;
  summary: string;
  topTheme: string;
  macroNote: string;
  marketHighlights: MarketHighlight[];
  watchToday: string;
  calibrationTip: string;
  riskAlert: string | null;
  topMarkets: { source: string; title: string; prob: number }[];
  generatedAt: string;
  cached?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function isPredictionExpiringSoon(p: StoredPrediction): boolean {
  // Considera "expirando em breve" previsões criadas há mais de 20 dias sem resolução
  const age = Date.now() - new Date(p.savedAt).getTime();
  return age > 20 * 24 * 60 * 60 * 1000 && !p.resolved;
}

function probColor(prob: number): string {
  if (prob >= 70) return "text-positive";
  if (prob >= 40) return "text-yellow-500";
  return "text-negative";
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function BriefingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-secondary/40 rounded-lg w-3/4" />
      <div className="h-4 bg-secondary/30 rounded w-full" />
      <div className="h-4 bg-secondary/30 rounded w-5/6" />
      <div className="grid grid-cols-2 gap-3 mt-6">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-20 bg-secondary/30 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

// ─── Quick Predict ──────────────────────────────────────────────────────────

function QuickPredict({ market, marketProb }: { market: string; marketProb: number }) {
  const [open, setOpen] = useState(false);
  const [userProb, setUserProb] = useState(marketProb);
  const [saved, setSaved] = useState(false);

  function handleSave() {
    addPrediction({
      marketId: `briefing-${encodeURIComponent(market).slice(0, 40)}-${Date.now()}`,
      question: market,
      marketProb,
      userProb,
    });
    awardPoints("prediction_made", `Previsão do briefing: ${market.slice(0, 50)}`);
    setSaved(true);
    setTimeout(() => { setSaved(false); setOpen(false); }, 1800);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-gold transition-colors"
      >
        <BookmarkPlus className="w-3 h-3" />
        Registrar minha estimativa
      </button>
    );
  }

  const edge = userProb - marketProb;
  const edgeColor = edge > 3 ? "text-positive" : edge < -3 ? "text-negative" : "text-muted-foreground";

  return (
    <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/15 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold text-foreground uppercase tracking-wide">Minha estimativa</p>
        <span className={`text-xs font-mono font-bold ${edgeColor}`}>
          Edge: {edge >= 0 ? "+" : ""}{edge.toFixed(0)}pp
        </span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>Prob. SIM</span>
          <span className="font-mono font-bold text-foreground">{userProb}%</span>
        </div>
        <input
          type="range" min={1} max={99} value={userProb}
          onChange={(e) => setUserProb(parseInt(e.target.value, 10))}
          className="w-full h-1.5 rounded-full accent-primary cursor-pointer"
        />
        <div className="flex justify-between text-[9px] text-muted-foreground/50">
          <span>Mercado: {marketProb}%</span>
          <span>Arraste para ajustar</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {saved ? (
          <span className="flex items-center gap-1.5 text-xs text-positive font-medium">
            <CheckCircle className="w-3.5 h-3.5" /> Registrado!
          </span>
        ) : (
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Salvar previsão
          </button>
        )}
        <button
          onClick={() => setOpen(false)}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Market Highlight Card ──────────────────────────────────────────────────

function HighlightCard({ m }: { m: MarketHighlight }) {
  return (
    <div className="p-4 rounded-xl border border-border/30 bg-secondary/10 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 flex-1">{m.market}</p>
        <span className={`text-xl font-bold font-mono shrink-0 ${probColor(m.prob)}`}>{m.prob}%</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{m.insight}</p>
      <div className="w-full h-1 bg-secondary/40 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${m.prob >= 70 ? "bg-positive" : m.prob >= 40 ? "bg-yellow-500" : "bg-negative"}`}
          style={{ width: `${m.prob}%` }}
        />
      </div>
      <QuickPredict market={m.market} marketProb={m.prob} />
    </div>
  );
}

// ─── Expiring Predictions ───────────────────────────────────────────────────

function ExpiringPredictions({ preds }: { preds: StoredPrediction[] }) {
  const expiring = preds.filter(isPredictionExpiringSoon);
  if (expiring.length === 0) return null;

  return (
    <div className="glass-card rounded-xl p-6 space-y-4">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <Clock className="w-4 h-4 text-yellow-500" />
        Previsões Aguardando Resolução
        <span className="ml-auto px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-500 text-xs font-medium">{expiring.length}</span>
      </h3>
      <p className="text-xs text-muted-foreground">
        Estas previsões foram feitas há mais de 20 dias. Verifique se já podem ser resolvidas.
      </p>
      <div className="space-y-2">
        {expiring.slice(0, 5).map((p) => {
          const age = Math.floor((Date.now() - new Date(p.savedAt).getTime()) / (24 * 60 * 60 * 1000));
          return (
            <div key={p.id} className="flex items-start gap-3 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
              <Target className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground line-clamp-2">{p.question}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] text-muted-foreground">{age} dias atrás</span>
                  <span className="text-[10px] font-mono text-gold">{p.userProb}% SIM</span>
                  <span className="text-[10px] text-muted-foreground">Mercado: {p.marketProb.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Link href="/dashboard">
        <span className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline">
          Resolver previsões <ArrowRight className="w-3 h-3" />
        </span>
      </Link>
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

const SESSION_KEY = "jlb_briefing_session";

export default function Briefing() {
  const [briefing, setBriefing] = useState<BriefingData | null>(() => {
    // Restaura do sessionStorage para evitar refetch ao navegar
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as BriefingData & { _cachedAt: number };
      // Válido por 4 horas na sessão
      if (Date.now() - (parsed._cachedAt ?? 0) < 4 * 3_600_000) return parsed;
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(briefing === null);
  const [error, setError] = useState<string | null>(null);
  const [preds] = useState<StoredPrediction[]>(() => loadPredictions());

  async function fetchBriefing(force = false) {
    setLoading(true);
    setError(null);
    try {
      const url = force ? "/api/ai/daily-briefing?force=1" : "/api/ai/daily-briefing";
      const res = await fetch(url);
      if (res.status === 404) throw new Error("ENDPOINT_NOT_FOUND");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as BriefingData;
      setBriefing(data);
      // Persiste na sessão com timestamp
      try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...data, _cachedAt: Date.now() })); } catch { /* ignore quota */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (!briefing) void fetchBriefing(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const generatedDate = briefing?.generatedAt
    ? new Date(briefing.generatedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div>
    <AnaliseTabs />
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold font-display text-foreground">Briefing Diário</h1>
            {briefing?.topTheme && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-neon-blue/10 text-neon-blue border border-neon-blue/20">
                {briefing.topTheme}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Newspaper className="w-3.5 h-3.5" />
            Análise gerada por IA com dados de mercados preditivos e macro
            {generatedDate && (
              <span className="text-[11px] text-muted-foreground/60">· {generatedDate}</span>
            )}
          </p>
        </div>
        <button
          onClick={() => void fetchBriefing(true)}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border/40 text-xs text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="glass-card rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <Loader2 className="w-5 h-5 text-neon-blue animate-spin" />
            <p className="text-sm text-muted-foreground">Gerando briefing com dados de mercado em tempo real...</p>
          </div>
          <BriefingSkeleton />
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="glass-card rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-lg bg-negative/5 border border-negative/20">
            <AlertTriangle className="w-5 h-5 text-negative shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Não foi possível carregar o briefing</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {error === "ENDPOINT_NOT_FOUND"
                  ? "Servidor precisa ser reiniciado para ativar este endpoint."
                  : error}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {error === "ENDPOINT_NOT_FOUND"
              ? "Pare e reinicie o servidor: pnpm dev:server (ou pnpm dev:all). O endpoint /api/ai/daily-briefing foi adicionado na sessão atual."
              : "Verifique se ANTHROPIC_API_KEY está configurada no .env e tente novamente."}
          </p>
          <button
            onClick={() => void fetchBriefing()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
          </button>
        </div>
      )}

      {/* Briefing Content */}
      {!loading && briefing && !error && (
        <>
          {/* Headline Card */}
          <div className="glass-card rounded-xl p-6 space-y-4 border-l-2 border-neon-blue">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-neon-blue/10 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5 text-neon-blue" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-foreground leading-snug">{briefing.headline}</h2>
                {briefing.cached && (
                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/60">
                    <Clock className="w-3 h-3" /> Cache — atualizado hoje
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{briefing.summary}</p>

            {/* Risk Alert */}
            {briefing.riskAlert && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-500">{briefing.riskAlert}</p>
              </div>
            )}
          </div>

          {/* Macro + Watch + Tip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <TrendingUp className="w-3.5 h-3.5 text-primary" /> Macro
              </div>
              <p className="text-sm text-foreground leading-relaxed">{briefing.macroNote}</p>
            </div>
            <div className="glass-card rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Eye className="w-3.5 h-3.5 text-gold" /> Fique de Olho
              </div>
              <p className="text-sm text-foreground leading-relaxed">{briefing.watchToday}</p>
            </div>
            <div className="glass-card rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Trophy className="w-3.5 h-3.5 text-positive" /> Dica do Dia
              </div>
              <p className="text-sm text-foreground leading-relaxed">{briefing.calibrationTip}</p>
            </div>
          </div>

          {/* Market Highlights */}
          {briefing.marketHighlights?.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-neon-blue" />
                Destaques dos Mercados Preditivos
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {briefing.marketHighlights.map((m, i) => (
                  <HighlightCard key={i} m={m} />
                ))}
              </div>
            </div>
          )}

          {/* All top markets table */}
          {briefing.topMarkets?.length > 0 && (
            <div className="glass-card rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-gold" />
                Maiores Mercados por Volume
              </h3>
              <div className="space-y-1">
                {briefing.topMarkets.map((m, i) => (
                  <div key={i} className="border-b border-border/10 last:border-0 pb-2 last:pb-0">
                    <div className="flex items-center gap-3 py-1.5">
                      <span className="text-[10px] font-mono text-muted-foreground/60 w-4 shrink-0">{i + 1}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                        m.source === "Polymarket" ? "bg-neon-blue/10 text-neon-blue" : "bg-purple-400/10 text-purple-400"
                      }`}>{m.source}</span>
                      <p className="text-xs text-foreground flex-1 line-clamp-1">{m.title}</p>
                      <span className={`text-sm font-bold font-mono shrink-0 ${probColor(m.prob)}`}>{m.prob}%</span>
                    </div>
                    <div className="pl-7">
                      <QuickPredict market={m.title} marketProb={m.prob} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Link href="/noticias">
                  <span className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline">
                    Ver todos os mercados <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
                <Link href="/apostas">
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Tendências de Apostas <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>
            </div>
          )}

          {/* Expiring predictions */}
          <ExpiringPredictions preds={preds} />

          {/* CTA to record prediction */}
          <div className="glass-card rounded-xl p-6 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-gold/10 flex items-center justify-center shrink-0">
              <Target className="w-5 h-5 text-gold" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">Use o briefing para fazer previsões</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Registre suas estimativas de probabilidade para acompanhar sua calibração ao longo do tempo.
              </p>
            </div>
            <Link href="/noticias">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gold/10 border border-gold/20 text-gold text-xs font-medium hover:bg-gold/20 transition-colors">
                Registrar <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
        </>
      )}
    </div>
    </div>
  );
}
