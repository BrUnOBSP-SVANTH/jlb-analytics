/**
 * AnaliseTabs — navegação entre as ferramentas de análise com IA.
 */
import { Link, useLocation } from "wouter";
import { Brain, Zap, BookOpen } from "lucide-react";

const TABS = [
  { href: "/previsao", label: "Previsão IA",     icon: Brain,    badge: "IA" },
  { href: "/briefing", label: "Briefing Diário", icon: Zap,      badge: "IA" },
  { href: "/cerebro",  label: "Cerebro",         icon: BookOpen, badge: null },
];

export default function AnaliseTabs() {
  const [location] = useLocation();

  return (
    <div className="border-b border-border/30 bg-secondary/5 sticky top-14 z-30 backdrop-blur-sm">
      <div className="container">
        <div className="flex items-center gap-0 h-11 overflow-x-auto scrollbar-none">
          {TABS.map((t) => {
            const active = location === t.href;
            const Icon = t.icon;
            return (
              <Link key={t.href} href={t.href}>
                <span
                  className={`shrink-0 flex items-center gap-1.5 text-sm font-medium px-5 h-full border-b-2 transition-colors cursor-pointer ${
                    active
                      ? "border-gold text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/20"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {t.label}
                  {t.badge && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/20 leading-none">
                      {t.badge}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
