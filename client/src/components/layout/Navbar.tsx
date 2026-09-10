/**
 * Navbar — cabeçalho, mega-menu e menu mobile do JLB.
 *
 * O que a auditoria de produto mudou aqui (grupo NAV):
 *  · NAV-01  o layout desktop ligava em `lg` (1024px) mas o conteúdo pedia
 *            1208px — entre 1024 e 1210 o site inteiro rolava de lado. Subiu
 *            para `xl`.
 *  · NAV-02  `Escape` não fechava nada. Agora todo popover sai pelo mesmo hook
 *            (`useDispensar`): Esc, clique fora e rolagem.
 *  · NAV-03  o botão anunciava `⌘K` no Windows. O rótulo passou a ser o do
 *            teclado de quem lê.
 *  · NAV-04  "sair" ficava no header mobile, colado no botão de tema. Foi para
 *            dentro do menu, com confirmação.
 *  · NAV-05  "Análise IA" e "Minha Conta" quebravam em duas linhas e
 *            desalinhavam a fileira inteira.
 *  · NAV-06  a segunda barra repetia destinos dos próprios dropdowns e comia
 *            40px em todas as rotas. Saiu.
 *  · NAV-07  trocar de menu aberto exigia dois cliques.
 *  · NAV-08  "IA 0/4" não dizia o que era nem se 0 era o usado ou o restante.
 *  · NAV-10  o topo era uma `div`: o documento não tinha landmark de cabeçalho.
 */
import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  BarChart3, Calculator, LayoutDashboard, Menu, X,
  LineChart, GitCompare, Sun, Moon,
  LogIn, LogOut, User, GraduationCap, Newspaper, Star, Brain,
  Zap, BookOpen, ChevronRight, Flame,
  Bell, BellRing, Sigma, Map, Search, ShieldCheck, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { pp } from "@shared/formato";
import { loadProgress } from "@/lib/userProgress";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketAlerts } from "@/hooks/useMarketAlerts";
import { useDispensar, ATALHO_BUSCA, ehMac } from "@/hooks/useDispensar";
import { prefetchRoute } from "@/lib/prefetch";

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

// NAV-12: as descrições eram escritas longas e cortadas na renderização
// ("EV, Margem da Casa, Baye…"). Agora cabem em uma linha — 4 a 6 palavras.
const NAV_GROUPS: NavGroup[] = [
  {
    id: "mercados",
    label: "Mercados",
    children: [
      { label: "Mercados Ao Vivo",     href: "/apostas",   icon: Flame,     desc: "Preços em tempo real", badge: "AO VIVO" },
      { label: "Análise de Mercados",  href: "/noticias",  icon: Newspaper, desc: "Mercados cruzados com notícias" },
      { label: "Banca Simulada",       href: "/portfolio", icon: Wallet,    desc: "Dinheiro fictício, mercado real", badge: "NOVO" },
    ],
  },
  {
    id: "aprender",
    label: "Aprender",
    children: [
      { label: "Trilha Completa",             href: "/educacao", icon: Map,           desc: "Os cinco níveis, em ordem" },
      { label: "Nível 1 — Fundamentos",       href: "/nivel/1",  icon: GraduationCap, desc: "EV, margem da casa, Bayes" },
      { label: "Nível 2 — Leitura de Dados",  href: "/nivel/2",  icon: BarChart3,     desc: "Z-score, intervalo, correlação" },
      { label: "Nível 3 — Modelos Básicos",   href: "/nivel/3",  icon: LineChart,     desc: "Poisson, GARCH e vizinhos" },
      { label: "Nível 4 — Vieses",            href: "/nivel/4",  icon: Brain,         desc: "Por que erramos com convicção" },
      { label: "Nível 5 — Análise Integrada", href: "/nivel/5",  icon: GitCompare,    desc: "Seu número contra o mercado" },
    ],
  },
  {
    id: "analise",
    label: "Análise",
    children: [
      { label: "Previsão Guiada", href: "/previsao",     icon: Brain,       desc: "A IA escolhe o modelo certo", badge: "IA" },
      { label: "Briefing IA",     href: "/briefing",     icon: Zap,         desc: "O resumo da manhã", badge: "IA" },
      { label: "Track Record",    href: "/track-record", icon: ShieldCheck, desc: "Nossos acertos e nossos erros", badge: "PROVA" },
    ],
  },
  {
    id: "ferramentas",
    label: "Ferramentas",
    children: [
      { label: "Simulador EV",    href: "/simulador",    icon: Sigma,      desc: "Monte Carlo e Kelly na prática" },
      { label: "Calculadoras",    href: "/calculadoras", icon: Calculator, desc: "EV, overround, Brier, Kelly" },
    ],
  },
  {
    id: "conta",
    label: "Conta",
    children: [
      { label: "Dashboard",   href: "/dashboard",   icon: LayoutDashboard, desc: "Sua calibração ao longo do tempo" },
      { label: "Perfil",      href: "/perfil",      icon: User,            desc: "Pontos, plano e conquistas" },
      { label: "Leaderboard", href: "/leaderboard", icon: Star,            desc: "Ranking por calibração", badge: "NOVO" },
      { label: "Sobre",       href: "/sobre",       icon: BookOpen,        desc: "Metodologia e missão" },
    ],
  },
];

// Atalhos do menu mobile: ali os dropdowns nascem fechados, então a fileira de
// pílulas é o caminho curto — não uma segunda navegação como era no desktop.
const ATALHOS_MOBILE = [
  { label: "Mercados",   href: "/apostas"    },
  { label: "Análise",    href: "/noticias"   },
  { label: "Previsão IA",href: "/previsao"   },
  { label: "Dashboard",  href: "/dashboard"  },
];

// ── Theme toggle ─────────────────────────────────────────────────────────────

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="alvo-toque p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
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

function UserMenu({ compacto = false }: { compacto?: boolean }) {
  const { user, session } = useAuth();
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
        className="alvo-toque flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
      >
        <LogIn className="w-3.5 h-3.5" aria-hidden="true" />
        Entrar
      </button>
    );
  }

  const creditUsed = credits?.used ?? 0;
  const creditLimit = credits?.limit ?? 4; // fallback = cota grátis (FREE_LIMIT no servidor)
  const isPremium = credits?.plan === "premium";
  const restantes = Math.max(0, creditLimit - creditUsed);

  return (
    <div className="flex items-center gap-1.5">
      {/* NAV-08: a cota é gancho de conversão, não etiqueta de sistema. Diz o
          que sobrou, com o substantivo por extenso e em tamanho legível. */}
      {credits && !compacto && (
        <Link
          href="/perfil"
          title={isPremium
            ? "Plano Premium — análises de IA ilimitadas"
            : `Você usou ${creditUsed} de ${creditLimit} análises de IA este mês`}
          className={`hidden sm:inline-flex alvo-toque items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
            isPremium
              ? "border-gold/25 bg-gold/10 text-gold"
              : restantes === 0
                ? "border-negative/30 bg-negative/10 text-negative"
                : "border-border/30 bg-secondary/30 text-muted-foreground hover:bg-secondary/50"
          }`}
        >
          <Brain className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          {isPremium
            ? <span className="font-semibold">Premium</span>
            : <span><span className="font-semibold text-foreground">{restantes}</span> análise{restantes === 1 ? "" : "s"} de IA</span>}
        </Link>
      )}
      <Link href="/perfil" title={`${points} pontos acumulados`}
        className="alvo-toque flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gold/10 border border-gold/20 text-[11px] font-bold text-gold hover:bg-gold/20 transition-colors">
        <Star className="w-3 h-3" aria-hidden="true" />
        {points}
      </Link>
      <Link href="/perfil" aria-label="Abrir meu perfil"
        className="alvo-toque w-9 h-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center hover:bg-primary/25 transition-colors">
        <User className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
      </Link>
    </div>
  );
}

// ── Alert bell ────────────────────────────────────────────────────────────────

function AlertBell() {
  const { alerts, unreadCount, markAllRead } = useMarketAlerts();
  const [open, setOpen] = useState(false);
  const d = useDispensar<HTMLDivElement>(open, () => setOpen(false), { aoRolar: false });

  function handleOpen() {
    const abrindo = !open;
    setOpen(abrindo);
    // Zera ao ABRIR: o badge existe para chamar, não para acumular.
    if (abrindo) markAllRead();
  }

  function timeAgo(iso: string) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins} min atrás`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} h atrás`;
    return `${Math.floor(hrs / 24)} d atrás`;
  }

  return (
    <div className="relative" ref={d.ref}>
      <button
        onClick={handleOpen}
        {...d.props}
        className="alvo-toque relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
        aria-label={unreadCount > 0 ? `Alertas de mercado, ${unreadCount} novos` : "Alertas de mercado"}
      >
        {unreadCount > 0
          ? <BellRing className="w-4 h-4 text-gold" aria-hidden="true" />
          : <Bell className="w-4 h-4" aria-hidden="true" />
        }
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-negative flex items-center justify-center text-[11px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 max-w-[calc(100vw-1.5rem)] bg-popover/98 backdrop-blur-xl border border-border/40 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/20">
            <span className="text-sm font-semibold text-foreground">Alertas de Mercado</span>
            <span className="text-[11px] text-muted-foreground">a partir de 3 pp</span>
          </div>

          {alerts.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Bell className="w-6 h-6 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">Nenhum alerta ainda.</p>
              <p className="text-[11px] text-muted-foreground mt-1">Acompanhando os mercados em tempo real.</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {alerts.slice(0, 8).map((alert) => {
                const isUp = alert.delta > 0;
                return (
                  <div key={alert.key ?? `${alert.source}-${alert.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 border-b border-border/10 hover:bg-secondary/10 transition-colors">
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${
                      alert.source === "kalshi"
                        ? "border-green-500/30 bg-green-500/10 text-green-500"
                        : "border-neon-blue/30 bg-neon-blue/10 text-neon-blue"
                    }`}>{alert.source === "kalshi" ? "Kalshi" : "Poly"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-foreground/80 truncate">{alert.title}</p>
                      <p className="text-[11px] text-muted-foreground">{timeAgo(alert.receivedAt)}</p>
                    </div>
                    {/* O servidor já manda `delta` em pontos percentuais. A versão
                        anterior multiplicava por 100 outra vez e imprimia
                        "+5000.0pp" para uma variação de 50 pp. */}
                    <span className={`text-xs font-mono font-bold shrink-0 ${isUp ? "text-positive" : "text-negative"}`}>
                      {pp(alert.delta)} {isUp ? "↑" : "↓"}
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
      role="menu"
      aria-label={group.label}
      className={`absolute top-full left-0 mt-1 bg-popover/98 backdrop-blur-xl border border-border/40 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 ${
        cols === 2 ? "w-[480px]" : "w-[300px]"
      }`}
    >
      <div className={`p-2 grid gap-0.5 ${cols === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {group.children.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} role="menuitem" onClick={onClose} onMouseEnter={() => prefetchRoute(item.href)}>
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/40 transition-colors group cursor-pointer">
                <div className="w-8 h-8 rounded-lg bg-secondary/30 group-hover:bg-primary/10 flex items-center justify-center shrink-0 transition-colors">
                  <Icon className="w-4 h-4 text-neon-blue group-hover:text-primary transition-colors" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground leading-tight">{item.label}</p>
                    {item.badge && (
                      <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/20 leading-none">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{item.desc}</p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-muted-foreground transition-colors shrink-0" aria-hidden="true" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────

export function Navbar() {
  const [location] = useLocation();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const dMenu = useDispensar<HTMLDivElement>(activeMenu !== null, () => setActiveMenu(null));

  // Close on route change
  useEffect(() => {
    setActiveMenu(null);
    setMobileOpen(false);
    setConfirmarSaida(false);
  }, [location]);

  return (
    // NAV-10: landmark de cabeçalho. Era uma `div` — quem usa leitor de tela
    // não tinha como pular direto para a navegação.
    <header className="sticky top-0 z-40 bg-background/90 backdrop-blur-xl border-b border-border/30">
      <nav aria-label="Navegação principal">
        <div className="container flex items-center justify-between h-14 gap-2" ref={(n) => { menuRef.current = n; dMenu.ref.current = n; }}>

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
              <span className="text-[11px] font-mono font-medium text-gold/80 tracking-[0.25em] uppercase">Analytics</span>
            </div>
          </Link>

          {/* Desktop nav groups — `xl` e não `lg`: em 1024–1210px o conteúdo
              transbordava e a aplicação inteira rolava de lado (NAV-01). */}
          <div className="hidden xl:flex items-center gap-0.5 ml-6 flex-1">
            {NAV_GROUPS.map((group) => {
              const isActive = group.children.some((c) => location === c.href || location.startsWith(c.href + "/"));
              const isOpen = activeMenu === group.id;
              return (
                <div key={group.id} className="relative">
                  <button
                    onClick={() => setActiveMenu(isOpen ? null : group.id)}
                    // NAV-07: com um menu já aberto, passar o mouse troca — antes o
                    // primeiro clique era comido pelo fechamento do anterior.
                    onMouseEnter={() => { if (activeMenu !== null) setActiveMenu(group.id); }}
                    aria-expanded={isOpen}
                    aria-haspopup="menu"
                    className={`alvo-toque flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
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
          <div className="hidden xl:flex items-center gap-1.5">
            {/* Busca global — o rótulo do atalho segue o teclado de quem lê (NAV-03) */}
            <button
              onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", {
                key: "k", metaKey: ehMac, ctrlKey: !ehMac, bubbles: true,
              }))}
              className="alvo-toque flex items-center gap-1.5 px-2.5 py-2 rounded-md border border-border/30 text-[11px] text-muted-foreground hover:text-foreground hover:border-border/50 transition-colors"
              aria-label="Abrir busca global"
            >
              <Search className="w-3 h-3" aria-hidden="true" />
              <span>Buscar</span>
              <kbd className="text-[11px] border border-border/20 rounded px-1 bg-secondary/20">{ATALHO_BUSCA}</kbd>
            </button>
            <AlertBell />
            <div className="w-px h-5 bg-border/40 mx-0.5" aria-hidden="true" />
            <ThemeToggle />
            <UserMenu />
          </div>

          {/* Mobile toggle — NAV-04: sem "sair" aqui. Encerrar a sessão a um
              toque de distância do botão de tema era acidente esperando. */}
          <div className="flex xl:hidden items-center gap-1">
            <UserMenu compacto />
            <AlertBell />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-expanded={mobileOpen}
              className="alvo-toque p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/30 transition-colors"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            >
              {mobileOpen
                ? <X className="w-5 h-5" aria-hidden="true" />
                : <Menu className="w-5 h-5" aria-hidden="true" />
              }
            </button>
          </div>
        </div>

        {/* ── Mobile menu ── */}
        {mobileOpen && (
            <div className="xl:hidden overflow-hidden border-t border-border/30 bg-popover/98 backdrop-blur-xl animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="container py-3 space-y-0.5">
                {/* Atalhos */}
                <div className="flex flex-wrap gap-1.5 pb-3 border-b border-border/20 mb-2">
                  {ATALHOS_MOBILE.map((l) => (
                    <Link key={l.href} href={l.href} onClick={() => setMobileOpen(false)}
                      className={`alvo-toque inline-flex items-center text-xs font-medium px-3 py-2 rounded-full border transition-colors ${
                        location === l.href
                          ? "border-gold/40 bg-gold/10 text-gold"
                          : "border-border/30 text-muted-foreground hover:text-foreground"
                      }`}>
                      {l.label}
                    </Link>
                  ))}
                </div>

                {/* Nav groups */}
                {NAV_GROUPS.map((group) => (
                  <div key={group.id}>
                    <button
                      onClick={() => setMobileSection(mobileSection === group.id ? null : group.id)}
                      aria-expanded={mobileSection === group.id}
                      className="alvo-toque w-full flex items-center justify-between px-3 py-3 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/20 transition-colors"
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
                        <div className="overflow-hidden ml-2 animate-in fade-in slide-in-from-top-1 duration-200">
                          {group.children.map((child) => {
                            const Icon = child.icon;
                            return (
                              <Link key={child.href} href={child.href} onClick={() => setMobileOpen(false)}
                                className={`alvo-toque flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${
                                  location === child.href
                                    ? "text-gold bg-gold/10"
                                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/20"
                                }`}>
                                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                                <span className="text-sm">{child.label}</span>
                                {child.badge && (
                                  <span className="ml-auto text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/20">
                                    {child.badge}
                                  </span>
                                )}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                  </div>
                ))}

                {/* Tema e sessão — o lugar de "sair" (NAV-04), atrás de confirmação */}
                <div className="flex items-center justify-between gap-2 pt-3 mt-2 border-t border-border/20">
                  <ThemeToggle />
                  {user && (
                    confirmarSaida ? (
                      <span className="flex items-center gap-2">
                        <button onClick={() => setConfirmarSaida(false)}
                          className="alvo-toque px-3 py-2 rounded-lg text-xs font-semibold border border-border/40 text-muted-foreground">
                          Cancelar
                        </button>
                        <button onClick={() => { void signOut(); }}
                          className="alvo-toque px-3 py-2 rounded-lg text-xs font-semibold border border-negative/40 bg-negative/10 text-negative">
                          Confirmar saída
                        </button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmarSaida(true)}
                        className="alvo-toque flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-border/40 text-muted-foreground hover:text-foreground transition-colors">
                        <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                        Sair da conta
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          )}
      </nav>
    </header>
  );
}
