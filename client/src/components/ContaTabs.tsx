/**
 * ContaTabs — barra de navegação compartilhada entre Dashboard, Perfil e Leaderboard.
 */
import { Link, useLocation } from "wouter";
import { LayoutDashboard, User, Trophy } from "lucide-react";

const TABS = [
  { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
  { href: "/perfil",      label: "Meu Perfil",   icon: User },
  { href: "/leaderboard", label: "Leaderboard",  icon: Trophy },
];

export default function ContaTabs() {
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
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
