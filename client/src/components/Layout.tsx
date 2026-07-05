/**
 * Layout — JLB Analytics
 * Redesigned: Kalshi/Polymarket-inspired navigation with flat top bar,
 * mega-menu panels (click-based), and a secondary quick-strip.
 * Identity preserved: obsidian bg, gold/neon-blue accents, glass-card.
 */
import { ReactNode, useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3, Calculator, LayoutDashboard, Menu, X,
  LineChart, GitCompare, Activity, Sun, Moon,
  LogIn, LogOut, User, GraduationCap, Newspaper, Star, Brain,
  Zap, BookOpen, ChevronRight, Flame, Briefcase,
  Bell, BellRing, Sigma, Map, Search,
} from "lucide-react";
import CommandPalette from "./CommandPalette";
import { toast } from "sonner";
import { loadProgress } from "@/lib/userProgress";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketAlerts } from "@/hooks/useMarketAlerts";
import { prefetchRoute } from "@/lib/prefetch";
import { track } from "@/lib/analytics";
// ── Nav structure ────────────────────────────────────────────────────────────

interface NavChild {
  label: string;
  href: string;
  icon: React.ElementType;
  desc: string;
  badge?: string;
}

interface NavGroup {
  id: string;
  label: string;
  children: NavChild[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "mercados",
    label: "Mercados",
    children: [
      { label: "Apostas Ao Vivo",      href: "/apostas",  icon: Flame,     desc: "Reddit + Polymarket + Kalshi — sinais em tempo real", badge: "AO VIVO" },
      { label: "Análise de Mercados",  href: "/noticias", icon: Newspaper, desc: "Polymarket · Kalshi · Artigos · cruzamento IA + notícias" },
    ],
  },
  {
    id: "aprender",
    label: "Aprender",
    children: [
      { label: "Trilha Completa",             href: "/educacao", icon: Map,          desc: "Visão geral do currículo — 5 níveis de fundamentos a integrado" },
      { label: "Nível 1 — Fundamentos",       href: "/nivel/1",  icon: GraduationCap, desc: "EV, Margem da Casa, Bayes — aberto" },
      { label: "Nível 2 — Leitura de Dados",  href: "/nivel/2",  icon: BarChart3,     desc: "Z-score, IC, Correlação — aberto" },
      { label: "Nível 3 — Modelos Básicos",   href: "/nivel/3",  icon: LineChart,     desc: "Taylor, Poisson, GARCH, ENSO — aberto" },
      { label: "Nível 4 — Vieses",            href: "/nivel/4",  icon: Brain,         desc: "Prospect Theory, Overconfidence — 50 pts", badge: "50 pts" },
      { label: "Nível 5 — Análise Integrada", href: "/nivel/5",  icon: GitCompare,    desc: "Divergência modelo vs. mercado — 100 pts", badge: "100 pts" },
    ],
  },
  {
    id: "analise",
    label: "Análise IA",
    children: [
      { label: "Previsão Guiada", href: "/previsao", icon: Brain, desc: "IA detecta seu nível e escolhe o modelo certo — todos os domínios", badge: "IA" },
      { label: "Briefing IA",     href: "/briefing", icon: Zap,   desc: "Análise matinal com dados ao vivo de mercado", badge: "IA" },
      { label: "Cerebro",         href: "/cerebro",  icon: Brain, desc: "Base de conhecimento proprietária — alimenta toda a IA do site", badge: "NOVO" },
    ],
  },
  {
    id: "ferramentas",
    label: "Ferramentas",
    children: [
      { label: "Backtester",      href: "/backtester",   icon: Activity,   desc: "Teste estratégias contra dados históricos reais do Polymarket" },
      { label: "Simulador EV",    href: "/simulador",    icon: Sigma,      desc: "Monte Carlo · Kelly Criterion · Calibração interativa" },
      { label: "Calculadoras",    href: "/calculadoras", icon: Calculator, desc: "EV, Overround, Brier Score, Kelly e Correlação" },
      { label: "Portfólio",       href: "/portfolio",    icon: Briefcase,  desc: "Rastreie posições virtuais em mercados reais", badge: "NOVO" },
    ],
  },
  {
    id: "conta",
    label: "Minha Conta",
    children: [
      { label: "Dashboard",   href: "/dashboard",   icon: LayoutDashboard, desc: "Brier Score, calibração e tracker de previsões pessoais" },
      { label: "Perfil",      href: "/perfil",      icon: User,            desc: "Pontos, nível, histórico e conquistas" },
      { label: "Leaderboard", href: "/leaderboard", icon: Star,            desc: "Ranking público dos forecasters mais calibrados", badge: "NOVO" },
      { label: "Sobre",       href: "/sobre",       icon: BookOpen,        desc: "Metodologia, filosofia e missão da plataforma" },
    ],
  },
];

// Quick-access strip — apenas destinos de alta frequência (não espelha o mega-menu).
// As ferramentas (Backtester, Simulador, Calculadoras, Portfólio) ficam no menu Ferramentas.
const QUICK_LINKS = [
  { label: "Apostas Ao Vivo", href: "/apostas"    },
  { label: "Análise",         href: "/noticias"   },
  { label: "Previsão IA",     href: "/previsao"   },
  { label: "Cerebro",         href: "/cerebro"    },
  { label: "Dashboard",       href: "/dashboard"  },
  { label: "Leaderboard",     href: "/leaderboard"},
];

// ── Theme toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
      aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
    >
      {theme === "dark"
        ? <Sun className="w-4 h-4" aria-hidden="true" />
        : <Moon className="w-4 h-4" aria-hidden="true" />
      }
    </button>
  );
}

// ── User menu ────────────────────────────────────────────────────────────────

interface AiCredits { used: number; limit: number | null; plan: string }

function UserMenu() {
  const { user, session, signOut } = useAuth();
  const [, navigate] = useLocation();
  const [points, setPoints] = useState(() => loadProgress().totalPoints);
  const [credits, setCredits] = useState<AiCredits | null>(null);

  useEffect(() => {
    function onPoints(e: Event) {
      const { earned, label } = (e as CustomEvent<{ earned: number; label: string }>).detail;
      setPoints(loadProgress().totalPoints);
      if (earned > 0) toast.success(`+${earned} pts`, { description: label, duration: 3000, position: "bottom-right" });
    }
    window.addEventListener("jlb:points", onPoints);
    return () => window.removeEventListener("jlb:points", onPoints);
  }, []);

  // Busca créditos de IA quando usuário está logado
  useEffect(() => {
    if (!user || !session?.access_token) return;
    fetch("/api/ai/credits", {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((r) => r.ok ? r.json() as Promise<AiCredits> : null)
      .then((data) => { if (data) setCredits(data); })
      .catch(() => {});
  }, [user, session?.access_token]);

  if (!user) {
    return (
      <button
        onClick={() => navigate("/login")}
        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
      >
        <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
        Entrar
      </button>
    );
  }

  const creditUsed = credits?.used ?? 0;
  const creditLimit = credits?.limit ?? 30;
  const isPremium = credits?.plan === "premium";
  const creditPct = isPremium ? 100 : Math.min(100, (creditUsed / creditLimit) * 100);
  const creditColor = creditPct >= 90 ? "bg-negative" : creditPct >= 70 ? "bg-yellow-400" : "bg-positive";

  return (
    <div className="flex items-center gap-1.5">
      {/* AI credits pill — só para usuários logados */}
      {credits && (
        <Link href="/perfil">
          <span
            title={isPremium ? "Plano Premium — análises ilimitadas" : `${creditUsed}/${creditLimit} análises de IA este mês`}
            className="hidden sm:flex flex-col items-end px-2.5 py-1 rounded-lg bg-secondary/30 border border-border/30 hover:bg-secondary/50 transition-colors cursor-pointer"
          >
            <span className="text-[9px] text-muted-foreground/60 leading-none mb-1">
              {isPremium ? "Premium ∞" : `IA ${creditUsed}/${creditLimit}`}
            </span>
            {!isPremium && (
              <div className="w-14 h-1 rounded-full bg-secondary/60 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${creditColor}`} style={{ width: `${creditPct}%` }} />
              </div>
            )}
          </span>
        </Link>
      )}
      <Link href="/perfil">
        <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gold/10 border border-gold/20 text-[11px] font-bold text-gold hover:bg-gold/20 transition-colors cursor-pointer">
          <Star className="w-3 h-3" aria-hidden="true" />
          {points}
        </span>
      </Link>
      <Link href="/perfil">
        <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center cursor-pointer hover:bg-primary/25 transition-colors">
          <User className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
        </div>
      </Link>
      <button
        onClick={signOut}
        className="p-1.5 rounded-md text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/30 transition-colors"
        title="Sair"
        aria-label="Sair da conta"
      >
        <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

// ── Alert bell ────────────────────────────────────────────────────────────────

function AlertBell() {
  const { alerts, unreadCount, markAllRead } = useMarketAlerts();
  const [open, setOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function handleOpen() {
    setOpen(v => !v);
    if (!open) markAllRead();
  }

  function formatDelta(delta: number) {
    const abs = Math.abs(delta * 100).toFixed(1);
    return delta > 0 ? `+${abs}pp ↑` : `-${abs}pp ↓`;
  }

  function timeAgo(iso: string) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}min atrás`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h atrás`;
    return `${Math.floor(hrs / 24)}d atrás`;
  }

  return (
    <div className="relative" ref={bellRef}>
      <button
        onClick={handleOpen}
        className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
        aria-label="Alertas de mercado"
      >
        {unreadCount > 0
          ? <BellRing className="w-4 h-4 text-gold" aria-hidden="true" />
          : <Bell className="w-4 h-4" aria-hidden="true" />
        }
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-negative flex items-center justify-center text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-popover/98 backdrop-blur-xl border border-border/40 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
            <span className="text-sm font-semibold text-foreground">Alertas de Mercado</span>
            <span className="text-[10px] text-muted-foreground/60">≥ 3pp de variação</span>
          </div>

          {alerts.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Bell className="w-6 h-6 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/60">Nenhum alerta ainda.</p>
              <p className="text-[10px] text-muted-foreground/40 mt-1">Monitorando mercados em tempo real...</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {alerts.slice(0, 8).map((alert, i) => {
                const isUp = alert.delta > 0;
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/10 hover:bg-secondary/10 transition-colors">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                      alert.source === "kalshi"
                        ? "border-green-500/30 bg-green-500/10 text-green-400"
                        : "border-neon-blue/30 bg-neon-blue/10 text-neon-blue"
                    }`}>{alert.source === "kalshi" ? "Kalshi" : "Poly"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-foreground/80 truncate">{alert.title.slice(0, 50)}{alert.title.length > 50 ? "…" : ""}</p>
                      <p className="text-[10px] text-muted-foreground/50">{timeAgo(alert.receivedAt)}</p>
                    </div>
                    <span className={`text-xs font-mono font-bold shrink-0 ${isUp ? "text-positive" : "text-negative"}`}>
                      {formatDelta(alert.delta)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Mega menu panel ───────────────────────────────────────────────────────────

function MegaMenu({ group, onClose }: { group: NavGroup; onClose: () => void }) {
  const cols = group.children.length <= 3 ? 1 : 2;
  return (
    <div
      className={`absolute top-full left-0 mt-1 bg-popover/98 backdrop-blur-xl border border-border/40 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 ${
        cols === 2 ? "w-[480px]" : "w-[280px]"
      }`}
    >
      <div className={`p-2 grid gap-0.5 ${cols === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {group.children.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} onClick={onClose} onMouseEnter={() => prefetchRoute(item.href)}>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/40 transition-colors group cursor-pointer">
                <div className="w-8 h-8 rounded-lg bg-secondary/30 group-hover:bg-primary/10 flex items-center justify-center shrink-0 transition-colors">
                  <Icon className="w-4 h-4 text-neon-blue group-hover:text-primary transition-colors" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground leading-tight">{item.label}</p>
                    {item.badge && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/20 leading-none">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 truncate">{item.desc}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-muted-foreground transition-colors shrink-0" aria-hidden="true" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────

function Navbar() {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close mega menu on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Close on route change
  useEffect(() => {
    setActiveMenu(null);
    setMobileOpen(false);
  }, [location]);

  return (
    <>
      {/* ── Main nav bar ── */}
      <nav className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/30">
        <div className="container flex items-center justify-between h-14" ref={menuRef}>

          {/* Logo — monograma de assinatura (linha ascendente + ponto, igual ao favicon) */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="w-7 h-7 rounded-lg bg-gold/12 border border-gold/25 flex items-center justify-center overflow-hidden transition-colors group-hover:border-gold/40">
              <svg viewBox="0 0 32 32" className="w-full h-full text-gold" aria-hidden="true">
                <path d="M6.5 21.5 L12.5 14 L17.5 18 L25 8.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="25" cy="8.5" r="2.2" fill="currentColor" />
              </svg>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-display font-bold tracking-tight text-foreground">JLB</span>
              <span className="text-[9px] font-mono font-medium text-gold/80 tracking-[0.25em] uppercase">Analytics</span>
            </div>
          </Link>

          {/* Desktop nav groups */}
          <div className="hidden lg:flex items-center gap-0.5 ml-6 flex-1">
            {NAV_GROUPS.map((group) => {
              const isActive = group.children.some((c) => location === c.href || location.startsWith(c.href + "/"));
              const isOpen = activeMenu === group.id;
              return (
                <div key={group.id} className="relative">
                  <button
                    onClick={() => setActiveMenu(isOpen ? null : group.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                      isActive || isOpen
                        ? "text-foreground bg-secondary/40"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/20"
                    }`}
                  >
                    {group.label}
                    <span className={`transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                      style={{ display: "inline-block" }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                        <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                      </svg>
                    </span>
                  </button>
                  {isOpen && <MegaMenu group={group} onClose={() => setActiveMenu(null)} />}
                </div>
              );
            })}
          </div>

          {/* Right actions */}
          <div className="hidden lg:flex items-center gap-1.5">
            <Link href="/apostas">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-positive/30 text-positive bg-positive/5 hover:bg-positive/10 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" aria-hidden="true" />
                Mercados
              </span>
            </Link>
            {/* Cmd+K trigger */}
            <button
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }))}
              className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border/30 text-[11px] text-muted-foreground/60 hover:text-muted-foreground hover:border-border/50 transition-colors"
              aria-label="Busca global"
            >
              <Search className="w-3 h-3" />
              <span>Buscar</span>
              <kbd className="text-[9px] border border-border/20 rounded px-1 bg-secondary/20">⌘K</kbd>
            </button>
            <AlertBell />
            <div className="w-px h-5 bg-border/40 mx-0.5" />
            <ThemeToggle />
            <UserMenu />
          </div>

          {/* Mobile toggle */}
          <div className="flex lg:hidden items-center gap-1.5">
            <UserMenu />
            <ThemeToggle />
            <AlertBell />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            >
              {mobileOpen
                ? <X className="w-5 h-5" aria-hidden="true" />
                : <Menu className="w-5 h-5" aria-hidden="true" />
              }
            </button>
          </div>
        </div>

        {/* ── Quick strip (desktop only) ── */}
        <div className="hidden lg:block border-t border-border/20 bg-background/70">
          <div className="container flex items-center gap-1 h-8 overflow-x-auto scrollbar-none">
            {QUICK_LINKS.map((l) => (
              <Link key={l.href} href={l.href} onMouseEnter={() => prefetchRoute(l.href)}>
                <span className={`shrink-0 text-[11px] font-medium px-3 py-1 rounded-md transition-colors whitespace-nowrap ${
                  location === l.href
                    ? "text-gold bg-gold/10"
                    : "text-muted-foreground/70 hover:text-foreground hover:bg-secondary/30"
                }`}>
                  {l.label}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Mobile menu ── */}
        {mobileOpen && (
            <div
              className="lg:hidden overflow-hidden border-t border-border/30 bg-popover/98 backdrop-blur-xl animate-in slide-in-from-top-2 fade-in duration-200"
            >
              <div className="container py-3 space-y-0.5">
                {/* Quick link buttons */}
                <div className="flex flex-wrap gap-1.5 pb-3 border-b border-border/20 mb-2">
                  {QUICK_LINKS.slice(0, 5).map((l) => (
                    <Link key={l.href} href={l.href} onClick={() => setMobileOpen(false)}>
                      <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                        location === l.href
                          ? "border-gold/40 bg-gold/10 text-gold"
                          : "border-border/30 text-muted-foreground hover:text-foreground"
                      }`}>
                        {l.label}
                      </span>
                    </Link>
                  ))}
                </div>

                {/* Nav groups */}
                {NAV_GROUPS.map((group) => (
                  <div key={group.id}>
                    <button
                      onClick={() => setMobileSection(mobileSection === group.id ? null : group.id)}
                      className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/20 transition-colors"
                    >
                      {group.label}
                      <span className={`transition-transform duration-150 ${mobileSection === group.id ? "rotate-180" : ""}`}
                        style={{ display: "inline-block" }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
                          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                        </svg>
                      </span>
                    </button>
                      {mobileSection === group.id && (
                        <div
                          className="overflow-hidden ml-2 animate-in fade-in slide-in-from-top-1 duration-200"
                        >
                          {group.children.map((child) => {
                            const Icon = child.icon;
                            return (
                              <Link key={child.href} href={child.href} onClick={() => setMobileOpen(false)}>
                                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                                  location === child.href
                                    ? "text-gold bg-gold/10"
                                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/20"
                                }`}>
                                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                                  <span className="text-sm">{child.label}</span>
                                  {child.badge && (
                                    <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/20">
                                      {child.badge}
                                    </span>
                                  )}
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </div>
          )}
      </nav>

    </>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-border/30 bg-card/30 mt-auto">
      <div className="container py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-md bg-gold/12 border border-gold/25 flex items-center justify-center overflow-hidden">
                <svg viewBox="0 0 32 32" className="w-full h-full text-gold" aria-hidden="true">
                  <path d="M6.5 21.5 L12.5 14 L17.5 18 L25 8.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="25" cy="8.5" r="2.2" fill="currentColor" />
                </svg>
              </div>
              <span className="text-sm font-display font-bold text-foreground">JLB Analytics</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Educação quantitativa para mercados preditivos.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-3">Aprender</h4>
            <div className="space-y-1.5">
              {[
                { label: "Trilha Completa",         href: "/educacao" },
                { label: "Nível 1 — Fundamentos",   href: "/nivel/1" },
                { label: "Nível 2 — Dados",         href: "/nivel/2" },
                { label: "Nível 3 — Modelos",       href: "/nivel/3" },
                { label: "Nível 4 — Psicologia",    href: "/nivel/4" },
                { label: "Nível 5 — Integrado",     href: "/nivel/5" },
              ].map((l) => (
                <Link key={l.href} href={l.href}>
                  <span className="block text-sm text-muted-foreground hover:text-foreground transition-colors">{l.label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-3">Mercados & Dados</h4>
            <div className="space-y-1.5">
              {[
                { label: "Apostas Ao Vivo", href: "/apostas"  },
                { label: "Análise de Mercados", href: "/noticias" },
                { label: "Briefing IA",     href: "/briefing" },
              ].map((l) => (
                <Link key={l.href} href={l.href}>
                  <span className="block text-sm text-muted-foreground hover:text-foreground transition-colors">{l.label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider mb-3">Ferramentas</h4>
            <div className="space-y-1.5">
              {[
                { label: "Previsão IA",   href: "/previsao"    },
                { label: "Cerebro",       href: "/cerebro"     },
                { label: "Backtester",    href: "/backtester"  },
                { label: "Simulador EV",  href: "/simulador"   },
                { label: "Calculadoras",  href: "/calculadoras"},
                { label: "Dashboard",     href: "/dashboard"   },
                { label: "Sobre",         href: "/sobre"       },
              ].map((l) => (
                <Link key={l.href} href={l.href}>
                  <span className="block text-sm text-muted-foreground hover:text-foreground transition-colors">{l.label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border/30 pt-6 space-y-2">
          <p className="text-xs text-muted-foreground/60 text-center leading-relaxed">
            Caráter educacional — não constitui recomendação de investimento ou aposta.
            Dados de mercado via APIs públicas e podem apresentar atraso.
          </p>
          <div className="flex items-center justify-center gap-4 text-xs">
            <Link href="/termos"><span className="text-muted-foreground/60 hover:text-foreground transition-colors">Termos de Uso</span></Link>
            <span className="text-border/40">·</span>
            <Link href="/privacidade"><span className="text-muted-foreground/60 hover:text-foreground transition-colors">Política de Privacidade</span></Link>
            <span className="text-border/40">·</span>
            <Link href="/sobre"><span className="text-muted-foreground/60 hover:text-foreground transition-colors">Sobre</span></Link>
          </div>
          <p className="text-xs text-muted-foreground/40 text-center">
            &copy; {new Date().getFullYear()} JLB Analytics. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}

// ── Layout root ───────────────────────────────────────────────────────────────

export default function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  // page_view a cada mudança de rota (SPA não dispara navegação do browser)
  useEffect(() => { track("page_view"); }, [location]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Skip-link (WCAG 2.4.1): visível só ao receber foco via teclado */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Pular para o conteúdo
      </a>
      <CommandPalette />
      <Navbar />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
      <Footer />
    </div>
  );
}
