/**
 * MercadosTabs — barra de navegação compartilhada entre Apostas, Notícias e Portfolio.
 */
import { Link, useLocation } from "wouter";
import { Flame, Newspaper, Briefcase } from "lucide-react";

const TABS = [
  { href: "/apostas",  label: "Apostas Ao Vivo",    icon: Flame,     badge: "AO VIVO" },
  { href: "/noticias", label: "Análise de Mercados", icon: Newspaper },
  { href: "/portfolio", label: "Portfólio",          icon: Briefcase },
];

export default function MercadosTabs() {
  const [location] = useLocation();

  return (
    <div className="border-b border-border/30 bg-secondary/5 sticky top-14 z-30 backdrop-blur-sm">
      <div className="container">
        <div className="flex items-center gap-0 h-11 overflow-x-auto scrollbar-none">
          {TABS.map((t) => {
            const active = location === t.href || (t.href === "/apostas" && location.startsWith("/apostas/"));
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
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-positive/15 text-positive border border-positive/20 leading-none">
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
