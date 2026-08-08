/**
 * Home — JLB Analytics
 * Front page: live markets hero, how it works, level progression, social proof.
 */

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { getMarkets, getAllMarkets } from "@/lib/marketsCache";
import { useSEO } from "@/hooks/useSEO";
import { MODEL_COUNT } from "@/lib/brand";
import { track } from "@/lib/analytics";
import { Link } from "wouter";
import {
  TrendingUp, Brain, BarChart3, GitMerge, GraduationCap,
  ArrowRight, Zap, Target, CheckCircle, AlertTriangle, X,
  Newspaper, ChevronDown, ChevronUp,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface MacroRates { selic?: number; ipca?: number; usdBrl?: number }
interface PlatformStats { articles: number; markets: number; predictions: number }

interface DailyBriefing {
  headline: string;
  summary: string;
  topTheme: string;
  macroNote: string;
  marketHighlights: { market: string; prob: number | null; insight: string }[];
  watchToday: string;
  calibrationTip: string;
  riskAlert: string | null;
  generatedAt?: string;
  cached?: boolean;
}

interface LiveMarket {
  id: string;       // id cru do Polymarket → rota /apostas/poly-<id>
  question: string;
  yesProb: number;  // 0–1
  volume: number;
  source: "Polymarket";
}

interface PolyApiMarket {
  id?: string;
  question?: string;
  eventTitle?: string;
  outcomePrices?: string;
  volume?: number;
  volume24hr?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function parseYesProb(outcomePrices?: string): number {
  if (!outcomePrices) return 0.5;
  try {
    const prices = (JSON.parse(outcomePrices) as string[]).map(parseFloat);
    const p = prices[0] ?? 0.5;
    return p > 1 ? p / 100 : Math.max(0.01, Math.min(0.99, p));
  } catch {
    return 0.5;
  }
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function MarketCardSkeleton() {
  return (
    <div className="animate-pulse flex-shrink-0 w-[200px] p-4 rounded-xl border border-border/20 bg-secondary/10 space-y-3">
      <div className="h-2.5 bg-secondary/40 rounded w-3/4" />
      <div className="h-2 bg-secondary/30 rounded w-full" />
      <div className="h-2 bg-secondary/30 rounded w-5/6" />
      <div className="h-7 bg-secondary/40 rounded w-1/3 mt-2" />
      <div className="h-1 bg-secondary/30 rounded-full w-full" />
    </div>
  );
}

// ── Live Market Card ───────────────────────────────────────────────────────

function LiveMarketCard({ market }: { market: LiveMarket }) {
  const pct = Math.round(market.yesProb * 100);
  const probColor = pct >= 70 ? "text-positive" : pct >= 40 ? "text-warning" : "text-negative";
  const barColor = pct >= 70 ? "bg-positive" : pct >= 40 ? "bg-warning" : "bg-negative";

  const inner = (
    <div className="w-[200px] h-full p-4 rounded-xl border border-border/30 bg-secondary/10 group-hover:border-primary/40 transition-colors space-y-2">
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neon-blue/10 text-neon-blue">
          Polymarket
        </span>
      </div>
      <p className="text-xs font-medium text-foreground leading-snug line-clamp-3 group-hover:text-gold transition-colors">
        {market.question}
      </p>
      <div className="flex items-end justify-between pt-1">
        <span className={`text-2xl font-bold font-mono ${probColor}`}>{pct}%</span>
        {market.volume > 0 && (
          <span className="text-[10px] text-muted-foreground">
            ${(market.volume / 1_000).toFixed(0)}k
          </span>
        )}
      </div>
      <div className="w-full h-1 bg-secondary/30 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );

  // Com id → abre a tela dedicada /apostas/poly-<id>, igual às abas Apostas e Notícias.
  return market.id ? (
    <Link href={`/apostas/poly-${market.id}`} className="flex-shrink-0 group rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
      {inner}
    </Link>
  ) : (
    <div className="flex-shrink-0">{inner}</div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────

const LEVELS = [
  { n: 1, title: "Fundamentos",       href: "/nivel/1", icon: GraduationCap, color: "text-positive",   border: "border-positive/20",    bg: "bg-positive/5",    badge: "Grátis" },
  { n: 2, title: "Leitura de Dados",  href: "/nivel/2", icon: BarChart3,     color: "text-primary",    border: "border-primary/20",     bg: "bg-primary/5",     badge: "Grátis" },
  { n: 3, title: "Modelos Básicos",   href: "/nivel/3", icon: TrendingUp,    color: "text-yellow-500", border: "border-yellow-500/20",  bg: "bg-yellow-500/5",  badge: "Grátis" },
  { n: 4, title: "Vieses",            href: "/nivel/4", icon: Brain,         color: "text-purple-400", border: "border-purple-400/20",  bg: "bg-purple-400/5",  badge: "50 pts" },
  { n: 5, title: "Integrado",         href: "/nivel/5", icon: GitMerge,      color: "text-neon-blue",  border: "border-neon-blue/20",   bg: "bg-neon-blue/5",   badge: "100 pts" },
];

const HOW_IT_WORKS = [
  {
    icon: Target,
    color: "text-neon-blue",
    bg: "bg-neon-blue/10",
    step: "01",
    title: "Veja o Mercado",
    desc: "Acompanhe ao vivo as apostas mais movimentadas do mundo no Polymarket e Kalshi — probabilidades atualizadas em tempo real, sem precisar criar conta.",
  },
  {
    icon: Brain,
    color: "text-gold",
    bg: "bg-gold/10",
    step: "02",
    title: "Calcule o Valor",
    desc: "Ferramentas simples mostram se uma aposta vale a pena antes de você colocar dinheiro. Em segundos você vê se as probabilidades estão a seu favor.",
  },
  {
    icon: CheckCircle,
    color: "text-positive",
    bg: "bg-positive/10",
    step: "03",
    title: "Melhore Prevendo",
    desc: "Registre suas previsões e descubra se você acerta mais do que o mercado. Com o tempo, você aprende a identificar onde estão as melhores oportunidades.",
  },
];

const SOCIAL_PROOF = [
  { value: "70%",    label: "dos endereços no Polymarket têm perdas históricas",   source: "CryptoSlate 2025" },
  { value: "0.04%",  label: "das contas capturaram 70%+ dos lucros totais",         source: "CryptoSlate 2025" },
  { value: "R$30bi", label: "fluxo mensal para apostas no Brasil",                  source: "BCB 2025" },
];

// ── Main ───────────────────────────────────────────────────────────────────

const ONBOARDING_KEY = "jlb_onboarding_v1";

export default function Home() {
  useSEO("Preveja melhor, aposte com lógica", "Plataforma de educação quantitativa para mercados preditivos. Polymarket e Kalshi ao vivo, IA com método Superforecaster, calibração e modelos econométricos.");
  const [markets, setMarkets] = useState<LiveMarket[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(true);
  const [showBanner, setShowBanner] = useState(() => {
    try { return !localStorage.getItem(ONBOARDING_KEY); } catch { return false; }
  });
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null);
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const [macro, setMacro] = useState<MacroRates>({});
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const statsRef = useRef(false);

  function dismissBanner() {
    try { localStorage.setItem(ONBOARDING_KEY, "1"); } catch { /* ignore */ }
    setShowBanner(false);
  }

  useEffect(() => {
    if (statsRef.current) return;
    statsRef.current = true;
    async function loadStats() {
      try {
        const [artRes, mkts, trackRes] = await Promise.allSettled([
          supabase.from("cerebro_articles").select("id", { count: "exact", head: true }).eq("status", "active"),
          getAllMarkets(),  // cache compartilhado — conta real, sem fetch redundante
          // predictions tem RLS por usuário (count anônimo = 0) — o track record da IA é público via API
          fetch("/api/ai/track-record").then((r) => r.ok ? r.json() as Promise<{ totalCount?: number }> : null),
        ]);
        const articles = artRes.status === "fulfilled" ? (artRes.value.count ?? 0) : 0;
        const marketCount = mkts.status === "fulfilled" ? (mkts.value.polymarket.length + mkts.value.kalshi.length) : 0;
        const predictions = trackRes.status === "fulfilled" ? (trackRes.value?.totalCount ?? 0) : 0;
        setStats({ articles, markets: marketCount, predictions });
      } catch { /* non-critical */ }
    }
    void loadStats();
  }, []);

  useEffect(() => {
    fetch("/api/rates")
      .then((r) => r.ok ? r.json() as Promise<{ selic?: number; ipca?: number; usdBrl?: number }> : null)
      .then((d) => { if (d) setMacro({ selic: d.selic ?? undefined, ipca: d.ipca ?? undefined, usdBrl: d.usdBrl ?? undefined }); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/ai/daily-briefing")
      .then((r) => r.ok ? r.json() as Promise<DailyBriefing> : null)
      .then((data) => { if (data?.headline) setBriefing(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const raw = await getMarkets<PolyApiMarket>("polymarket");
        if (cancelled) return;
        const items: LiveMarket[] = raw.slice(0, 8).map((m) => ({
          id: m.id ?? "",
          question: (m.eventTitle && m.eventTitle.length > 10 && m.eventTitle !== m.question)
            ? m.eventTitle
            : (m.question ?? "Mercado preditivo"),
          yesProb: parseYesProb(m.outcomePrices),
          volume: m.volume ?? m.volume24hr ?? 0,
          source: "Polymarket",
        }));
        setMarkets(items);
      } catch {
        // silently fallback — empty state shown
      } finally {
        if (!cancelled) setMarketsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden py-20 md:py-28 px-4">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-neon-blue/5 pointer-events-none" aria-hidden="true" />
        <div className="absolute -top-32 -right-32 w-80 h-80 bg-primary/3 rounded-full blur-3xl pointer-events-none" aria-hidden="true" />

        <div className="max-w-5xl mx-auto relative">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neon-blue/10 border border-neon-blue/20 text-xs text-neon-blue font-medium mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-blue animate-pulse" aria-hidden="true" />
              Polymarket · Kalshi · Reddit — ao vivo
            </div>
            <h1 className="text-4xl md:text-6xl font-display font-bold text-foreground leading-tight mb-5">
              Preveja melhor.{" "}
              <span className="text-primary">Aposte com lógica.</span>
              <br className="hidden sm:block" />
              {" "}Ganhe mais.
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
              Veja ao vivo o que o mundo está apostando no Polymarket e Kalshi.
              Aprenda a calcular suas chances reais antes de colocar dinheiro — sem chute, sem achismo.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/apostas" onClick={() => track("cta_click", { id: "home_hero_mercados" })}>
                <span className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
                  Explorar Mercados ao Vivo <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </span>
              </Link>
              <Link href="/nivel/1" onClick={() => track("cta_click", { id: "home_hero_nivel1" })}>
                <span className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-border/50 text-foreground hover:bg-secondary/30 transition-colors font-medium">
                  Começar grátis — Nível 1
                </span>
              </Link>
            </div>
          </div>

          {/* Stat strip — macro ao vivo + plataforma */}
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {macro.selic != null && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground/50 uppercase">Selic</span>
                  <strong className="text-foreground font-mono">{macro.selic.toFixed(2)}%</strong>
                </span>
                <span className="hidden sm:inline text-border/60">·</span>
              </>
            )}
            {macro.ipca != null && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground/50 uppercase">IPCA</span>
                  <strong className="text-foreground font-mono">{macro.ipca.toFixed(2)}%</strong>
                </span>
                <span className="hidden sm:inline text-border/60">·</span>
              </>
            )}
            {macro.usdBrl != null && (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-muted-foreground/50 uppercase">USD/BRL</span>
                  <strong className="text-foreground font-mono">R${macro.usdBrl.toFixed(2)}</strong>
                </span>
                <span className="hidden sm:inline text-border/60">·</span>
              </>
            )}
            <span><strong className="text-foreground">5 fontes</strong> monitoradas ao vivo</span>
            <span className="hidden sm:inline text-border/60">·</span>
            <span><strong className="text-foreground">Grátis</strong> para começar</span>
          </div>
        </div>
      </section>

      {/* ── Onboarding Banner ── */}
      {showBanner && (
        <section className="px-4 py-3 bg-neon-blue/5 border-y border-neon-blue/20" aria-label="Bem-vindo">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-neon-blue/15 flex items-center justify-center shrink-0">
                <GraduationCap className="w-4 h-4 text-neon-blue" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Novo por aqui?</p>
                <p className="text-xs text-muted-foreground">O Nível 1 é gratuito e ensina a calcular chances reais em menos de 10 minutos.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/nivel/1" onClick={() => track("cta_click", { id: "home_banner_nivel1" })}>
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-neon-blue/15 border border-neon-blue/30 text-neon-blue text-xs font-semibold hover:bg-neon-blue/25 transition-colors">
                  Começar pelo Nível 1 <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              </Link>
              <button
                onClick={dismissBanner}
                aria-label="Fechar"
                className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/30 transition-colors">
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Live Markets Strip ── */}
      <section className="py-8 px-4 border-y border-border/20 bg-secondary/5" aria-label="Mercados em destaque">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" aria-hidden="true" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Mercados em destaque
              </span>
            </div>
            <Link href="/apostas">
              <span className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver todos <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </span>
            </Link>
          </div>
          {/* Região rolável precisa ser alcançável por teclado (axe: scrollable-region-focusable) */}
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none" tabIndex={0} role="region" aria-label="Mercados em destaque — rolagem horizontal">
            {marketsLoading
              ? Array.from({ length: 5 }).map((_, i) => <MarketCardSkeleton key={i} />)
              : markets.length > 0
                ? markets.map((m, i) => <LiveMarketCard key={i} market={m} />)
                : (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-6">
                    <Zap className="w-3.5 h-3.5" aria-hidden="true" />
                    Mercados ao vivo indisponíveis no momento
                  </div>
                )
            }
          </div>
        </div>
      </section>

      {/* ── Daily Briefing ── */}
      {briefing && (
        <section className="px-4 py-5 border-b border-border/20" aria-label="Briefing diário">
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => setBriefingExpanded((v) => !v)}
              className="w-full flex items-center justify-between gap-3 group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
                  <Newspaper className="w-3.5 h-3.5 text-gold" aria-hidden="true" />
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gold mb-0.5">
                    Briefing do Dia{briefing.cached ? "" : " — gerado agora"}
                  </p>
                  <p className="text-sm font-medium text-foreground truncate">{briefing.headline}</p>
                </div>
              </div>
              <div className="shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors">
                {briefingExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {briefingExpanded && (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground leading-relaxed">{briefing.summary}</p>

                {briefing.macroNote && (
                  <div className="px-3 py-2 rounded-lg bg-secondary/20 border border-border/20">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Macro</p>
                    <p className="text-xs text-foreground">{briefing.macroNote}</p>
                  </div>
                )}

                {briefing.marketHighlights?.length > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Destaques</p>
                    <div className="space-y-2">
                      {briefing.marketHighlights.map((h, i) => (
                        <div key={i} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-secondary/10 border border-border/15">
                          {typeof h.prob === "number" && Number.isFinite(h.prob) && (
                            <span className="text-xs font-bold font-mono text-primary shrink-0 mt-0.5">{h.prob}%</span>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{h.market}</p>
                            <p className="text-[11px] text-muted-foreground">{h.insight}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {briefing.watchToday && (
                    <div className="p-3 rounded-lg bg-neon-blue/5 border border-neon-blue/15">
                      <p className="text-[10px] font-semibold text-neon-blue uppercase tracking-wider mb-1">Fique de olho</p>
                      <p className="text-xs text-foreground">{briefing.watchToday}</p>
                    </div>
                  )}
                  {briefing.calibrationTip && (
                    <div className="p-3 rounded-lg bg-positive/5 border border-positive/15">
                      <p className="text-[10px] font-semibold text-positive uppercase tracking-wider mb-1">Dica de calibração</p>
                      <p className="text-xs text-foreground">{briefing.calibrationTip}</p>
                    </div>
                  )}
                </div>

                {briefing.riskAlert && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-negative/5 border border-negative/15">
                    <AlertTriangle className="w-3.5 h-3.5 text-negative shrink-0 mt-0.5" aria-hidden="true" />
                    <p className="text-xs text-foreground">{briefing.riskAlert}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── How it works ── */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">Como funciona</h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">
              Três passos simples para apostar com mais inteligência — mesmo sem experiência prévia.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.step} className="relative p-6 rounded-2xl border border-border/30 bg-secondary/5 text-center">
                  {/* Numeral decorativo (marca d'água) — fora da árvore de acessibilidade */}
                  <span aria-hidden="true" className="absolute -top-3 left-5 text-[10px] font-bold font-mono text-muted-foreground/70 tracking-widest">
                    {item.step}
                  </span>
                  <div className={`w-12 h-12 rounded-2xl ${item.bg} flex items-center justify-center mx-auto mb-4`}>
                    <Icon className={`w-6 h-6 ${item.color}`} aria-hidden="true" />
                  </div>
                  <h3 className="font-bold text-foreground mb-2">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Level Progression ── */}
      <section className="py-16 px-4 bg-secondary/5 border-t border-border/20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">5 Níveis de Conhecimento</h2>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Do básico ao avançado, no seu ritmo.
              Níveis 1–3 são gratuitos. Níveis 4–5 desbloqueiam conforme você usa.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {LEVELS.map((level) => {
              const Icon = level.icon;
              return (
                <Link key={level.n} href={level.href} onClick={() => track("cta_click", { id: "home_nivel_card", nivel: level.n })}>
                  <div className={`p-4 rounded-xl border ${level.border} ${level.bg} hover:opacity-80 transition-opacity cursor-pointer text-center`}>
                    <div className="w-9 h-9 rounded-lg bg-background/60 flex items-center justify-center mx-auto mb-3">
                      <Icon className={`w-4 h-4 ${level.color}`} aria-hidden="true" />
                    </div>
                    <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">Nível {level.n}</p>
                    <p className="text-xs font-bold text-foreground leading-snug">{level.title}</p>
                    <span className={`inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full ${
                      level.badge === "Grátis" ? "bg-positive/10 text-positive" : "bg-gold/10 text-gold"
                    }`}>
                      {level.badge}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="text-center mt-8">
            <Link href="/nivel/1" onClick={() => track("cta_click", { id: "home_trilha_nivel1" })}>
              <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-positive/30 text-positive text-sm font-medium hover:bg-positive/5 transition-colors">
                Começar pelo Nível 1 <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── AI Prediction Feature ── */}
      <section className="py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="relative overflow-hidden rounded-2xl border border-neon-blue/30 bg-gradient-to-br from-neon-blue/5 via-primary/5 to-transparent p-8 md:p-10">
            <div className="absolute top-0 right-0 w-64 h-64 bg-neon-blue/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" aria-hidden="true" />
            <div className="relative flex flex-col md:flex-row items-start md:items-center gap-6">
              <div className="w-14 h-14 rounded-2xl bg-neon-blue/10 border border-neon-blue/20 flex items-center justify-center shrink-0">
                <Zap className="w-7 h-7 text-neon-blue" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-neon-blue">Método Superforecaster</span>
                  <span className="w-1 h-1 rounded-full bg-muted-foreground/30" aria-hidden="true" />
                  <span className="text-xs text-muted-foreground">{MODEL_COUNT} modelos econométricos</span>
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2">Previsão Guiada por IA</h2>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
                  A mesma metodologia dos Superforecasters do Good Judgment Project: base rate histórico,
                  decomposição de Fermi, ajuste de visão interna e calibração. A IA escolhe o modelo certo,
                  cruza notícias reais e mostra todo o raciocínio passo a passo.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {["Base Rate", "Fermi", "Taylor", "GARCH", "Elo", "Bayes", "+11"].map((m) => (
                    <span key={m} className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-secondary/50 text-muted-foreground border border-border/30">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
              <Link href="/previsao" className="shrink-0">
                <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neon-blue/10 border border-neon-blue/30 text-neon-blue text-sm font-medium hover:bg-neon-blue/20 transition-colors whitespace-nowrap">
                  Experimentar <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Social Proof ── */}
      <section className="py-12 px-4 border-t border-border/20 bg-secondary/5">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-xs text-muted-foreground uppercase tracking-wider mb-8">
            Por que apostar sem cálculo é perder dinheiro — números reais
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {SOCIAL_PROOF.map((stat) => (
              <div key={stat.value} className="p-6 rounded-xl border border-border/20 text-center">
                <div className="text-3xl font-bold text-negative font-mono mb-2">{stat.value}</div>
                <p className="text-xs text-muted-foreground leading-snug">{stat.label}</p>
                <p className="text-[10px] text-muted-foreground/50 mt-1">{stat.source}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 p-5 rounded-xl border border-border/20 bg-secondary/5 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              A JLB Analytics <strong className="text-foreground">não recomenda posições, apostas ou investimentos</strong>.
              Somos uma plataforma de educação quantitativa — o objetivo é que você faça os cálculos certos antes de qualquer decisão.
            </p>
          </div>
        </div>
      </section>

      {/* ── Plataforma ao vivo ── */}
      {stats && (stats.articles > 0 || stats.markets > 0) && (
        <section className="py-10 px-4 border-t border-border/20">
          <div className="max-w-5xl mx-auto">
            <p className="text-center text-xs text-muted-foreground uppercase tracking-wider mb-6 flex items-center justify-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />
              Plataforma em tempo real
            </p>
            {/* Grade editorial: divisórias hairline (gap-px sobre bg-border), números-herói
                em serif, cor contida a um marcador por métrica. */}
            {(() => {
              const tiles = [
                stats.articles > 0 && {
                  value: <>{stats.articles.toLocaleString("pt-BR")}</>,
                  dot: "bg-gold", label: "artigos no Cerebro", sub: "atualizado diariamente",
                },
                stats.markets > 0 && {
                  value: <>{stats.markets}<span className="text-2xl text-muted-foreground/60">+</span></>,
                  dot: "bg-neon-blue", label: "mercados monitorados", sub: "Polymarket + Kalshi",
                },
                stats.predictions > 0 && {
                  value: <>{stats.predictions.toLocaleString("pt-BR")}</>,
                  dot: "bg-positive", label: "previsões da IA acompanhadas", sub: "track record público",
                },
              ].filter((t): t is Exclude<typeof t, false> => Boolean(t));
              const cols = tiles.length === 3 ? "grid-cols-3" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-1";
              return (
                <div className={`grid ${cols} gap-px rounded-2xl overflow-hidden border border-border/50 bg-border/50`}>
                  {tiles.map((t) => (
                    <div key={t.label} className="bg-card p-6 text-center">
                      <p className="numeric-hero text-4xl md:text-5xl text-foreground leading-none">{t.value}</p>
                      <p className="text-xs text-muted-foreground mt-3 flex items-center justify-center gap-1.5">
                        <span className={`w-1 h-1 rounded-full ${t.dot}`} aria-hidden="true" />{t.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">{t.sub}</p>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </section>
      )}

      {/* ── Final CTA ── */}
      <section className="py-20 px-4">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
            Faça sua primeira previsão hoje
          </h2>
          <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
            O Nível 1 é gratuito e leva menos de 10 minutos.
            Você começa a aprender se está acertando ou errando com a primeira previsão registrada.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/nivel/1" onClick={() => track("cta_click", { id: "home_final_nivel1" })}>
              <span className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity">
                Ir para o Nível 1 <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </span>
            </Link>
            <Link href="/dashboard" onClick={() => track("cta_click", { id: "home_final_dashboard" })}>
              <span className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl border border-border/40 text-foreground hover:bg-secondary/30 transition-colors font-medium text-sm">
                Ver Dashboard
              </span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
