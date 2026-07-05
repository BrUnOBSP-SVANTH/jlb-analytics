/**
 * CommandPalette — JLB Analytics
 * Busca global ativada com Cmd+K (Mac) ou Ctrl+K (Windows/Linux).
 * Busca em: páginas, artigos do Cerebro (Supabase full-text).
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { Search, X, FileText, LayoutDashboard, Brain, Zap, BookOpen, BarChart3, Activity, Calculator, Briefcase, GraduationCap, Newspaper } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { trapTab } from "@/lib/focusTrap";

interface CmdPage {
  type: "page";
  label: string;
  href: string;
  icon: React.ElementType;
  keywords: string;
}

interface CmdArticle {
  type: "article";
  id: string;
  title: string;
  category: string;
  summary: string | null;
}

type CmdItem = CmdPage | CmdArticle;

const PAGES: CmdPage[] = [
  { type: "page", label: "Apostas ao Vivo",    href: "/apostas",      icon: Zap,            keywords: "apostas mercados polymarket kalshi hype" },
  { type: "page", label: "Análise de Mercados", href: "/noticias",    icon: Newspaper,      keywords: "noticias análise mercados preditivos" },
  { type: "page", label: "Previsão Guiada IA", href: "/previsao",    icon: Brain,          keywords: "previsão ia modelo econométrico" },
  { type: "page", label: "Briefing Diário IA", href: "/briefing",    icon: Zap,            keywords: "briefing diário análise matinal" },
  { type: "page", label: "Cerebro",            href: "/cerebro",     icon: Brain,          keywords: "cerebro base conhecimento artigos sínteses" },
  { type: "page", label: "Dashboard",          href: "/dashboard",   icon: LayoutDashboard,keywords: "dashboard calibração brier score previsões" },
  { type: "page", label: "Portfólio",          href: "/portfolio",   icon: Briefcase,      keywords: "portfolio posições simulado" },
  { type: "page", label: "Backtester",         href: "/backtester",  icon: Activity,       keywords: "backtester estratégias mean reversion" },
  { type: "page", label: "Simulador EV",       href: "/simulador",   icon: BarChart3,      keywords: "simulador kelly monte carlo" },
  { type: "page", label: "Calculadoras",       href: "/calculadoras",icon: Calculator,     keywords: "calculadoras ev overround brier kelly correlação" },
  { type: "page", label: "Trilha Completa",    href: "/educacao",    icon: GraduationCap,  keywords: "educação níveis aprender" },
  { type: "page", label: "Nível 1 — Fundamentos",   href: "/nivel/1", icon: BookOpen,     keywords: "nível 1 valor esperado bayes overround" },
  { type: "page", label: "Nível 2 — Dados",         href: "/nivel/2", icon: BookOpen,     keywords: "nível 2 z-score correlação IC" },
  { type: "page", label: "Nível 3 — Modelos",       href: "/nivel/3", icon: BookOpen,     keywords: "nível 3 taylor poisson garch enso" },
  { type: "page", label: "Nível 4 — Vieses",        href: "/nivel/4", icon: BookOpen,     keywords: "nível 4 prospect theory gambler overconfidence" },
  { type: "page", label: "Nível 5 — Integrado",     href: "/nivel/5", icon: BookOpen,     keywords: "nível 5 divergência ensemble" },
  { type: "page", label: "Perfil",             href: "/perfil",      icon: FileText,       keywords: "perfil pontos badges conquistas" },
  { type: "page", label: "Sobre",              href: "/sobre",       icon: FileText,       keywords: "sobre missão roadmap modelo negócio" },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState<CmdArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null); // foco a restaurar ao fechar
  const [, navigate] = useLocation();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abre com Cmd+K ou Ctrl+K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Foca input ao abrir; restaura o foco ao gatilho ao fechar (WCAG 2.4.3)
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setArticles([]);
      setSelectedIdx(0);
    } else if (triggerRef.current) {
      triggerRef.current.focus?.();
      triggerRef.current = null;
    }
  }, [open]);

  // Filtra páginas por query
  const filteredPages = query.trim()
    ? PAGES.filter((p) => {
        const q = query.toLowerCase();
        return p.label.toLowerCase().includes(q) || p.keywords.includes(q);
      }).slice(0, 5)
    : PAGES.slice(0, 6);

  // Busca artigos no Cerebro (debounced)
  const searchArticles = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) { setArticles([]); return; }
    setLoadingArticles(true);
    try {
      const { data } = await supabase
        .from("cerebro_articles")
        .select("id, title, category, summary")
        .textSearch("fts", q, { config: "portuguese" })
        .eq("status", "active")
        .order("published_at", { ascending: false })
        .limit(4);
      setArticles((data ?? []).map((a) => ({
        type: "article" as const,
        id: a.id,
        title: a.title,
        category: a.category,
        summary: a.summary,
      })));
    } catch { setArticles([]); }
    finally { setLoadingArticles(false); }
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { void searchArticles(query); }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, searchArticles]);

  const allItems: CmdItem[] = [...filteredPages, ...articles];

  // Navegação por teclado
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Tab" && panelRef.current) { trapTab(e, panelRef.current); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, allItems.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter") {
        const item = allItems[selectedIdx];
        if (!item) return;
        if (item.type === "page") { navigate(item.href); setOpen(false); }
        else { navigate("/cerebro"); setOpen(false); }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, allItems, selectedIdx, navigate]);

  useEffect(() => { setSelectedIdx(0); }, [query, articles.length]);

  const CAT_COLORS: Record<string, string> = {
    macro: "text-emerald-400",
    "política": "text-blue-400",
    esportes: "text-green-400",
    cripto: "text-orange-400",
    "ciência": "text-purple-400",
    mercados: "text-gold",
  };

  if (!open) return null;

  return (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setOpen(false)}
          />

          {/* Palette — centralização no wrapper; animação no card interno (sem conflito de transform) */}
          <div className="fixed top-[15vh] left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Busca global"
              className="glass-card rounded-2xl border border-border/40 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150"
            >
              {/* Input */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/20">
                <Search className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar páginas, artigos, modelos…"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                />
                <div className="flex items-center gap-1.5">
                  {query && (
                    <button onClick={() => setQuery("")} className="text-muted-foreground/40 hover:text-muted-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded border border-border/30 text-[10px] text-muted-foreground/50">esc</kbd>
                </div>
              </div>

              {/* Results */}
              <div className="max-h-[360px] overflow-y-auto py-1.5">
                {/* Páginas */}
                {filteredPages.length > 0 && (
                  <div>
                    {!query && (
                      <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                        Navegação rápida
                      </p>
                    )}
                    {filteredPages.map((item, i) => {
                      const Icon = item.icon;
                      const isSelected = selectedIdx === i;
                      return (
                        <button
                          key={item.href}
                          onClick={() => { navigate(item.href); setOpen(false); }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            isSelected ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-secondary/20 hover:text-foreground"
                          }`}
                        >
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isSelected ? "bg-primary/20" : "bg-secondary/30"}`}>
                            <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                          </div>
                          <span className="text-sm">{item.label}</span>
                          {isSelected && <kbd className="ml-auto text-[10px] text-muted-foreground/40">↵</kbd>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Artigos do Cerebro */}
                {query.length >= 2 && (
                  <div>
                    <p className="px-4 py-1.5 text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider flex items-center gap-2">
                      <Brain className="w-3 h-3" />
                      Cerebro
                      {loadingArticles && <span className="w-2.5 h-2.5 rounded-full border border-gold border-t-transparent animate-spin" />}
                    </p>
                    {articles.length === 0 && !loadingArticles && query.length >= 2 && (
                      <p className="px-4 py-3 text-xs text-muted-foreground/50">Nenhum artigo encontrado para "{query}"</p>
                    )}
                    {articles.map((art, i) => {
                      const idx = filteredPages.length + i;
                      const isSelected = selectedIdx === idx;
                      return (
                        <button
                          key={art.id}
                          onClick={() => { navigate("/cerebro"); setOpen(false); }}
                          className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                            isSelected ? "bg-primary/10" : "hover:bg-secondary/20"
                          }`}
                        >
                          <FileText className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground/50"}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground leading-snug line-clamp-1">{art.title}</p>
                            {art.summary && (
                              <p className="text-[11px] text-muted-foreground/60 line-clamp-1 mt-0.5">{art.summary}</p>
                            )}
                          </div>
                          {art.category && (
                            <span className={`text-[10px] font-semibold shrink-0 ${CAT_COLORS[art.category] ?? "text-muted-foreground/50"}`}>
                              {art.category}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {allItems.length === 0 && !loadingArticles && query.length >= 2 && (
                  <div className="px-4 py-8 text-center">
                    <Search className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground/60">Nenhum resultado para "{query}"</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-border/15 flex items-center gap-4 text-[10px] text-muted-foreground/40">
                <span className="flex items-center gap-1"><kbd className="border border-border/30 rounded px-1">↑↓</kbd> navegar</span>
                <span className="flex items-center gap-1"><kbd className="border border-border/30 rounded px-1">↵</kbd> abrir</span>
                <span className="flex items-center gap-1"><kbd className="border border-border/30 rounded px-1">esc</kbd> fechar</span>
                <span className="ml-auto">JLB Cerebro · {articles.length > 0 ? `${articles.length} artigos` : "busca ativa"}</span>
              </div>
            </div>
          </div>
        </>
  );
}
