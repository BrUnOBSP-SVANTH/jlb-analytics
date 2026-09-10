/**
 * MercadosTabs — barra de navegação compartilhada entre Apostas e Notícias.
 */
import { Link, useLocation } from "wouter";
import { Flame, Newspaper, Wallet } from "lucide-react";

/**
 * NAV-11: em 390px "Banca Simulada" aparecia como "Ba… Sim…" e o selo "AO VIVO"
 * encostava no texto da aba vizinha. Truncar no meio da palavra parece defeito
 * de layout, não conteúdo que continua — quem olha conclui que quebrou.
 *
 * Rótulo curto no celular, completo a partir de `sm`. E o selo só aparece onde
 * há largura para ele respirar.
 */
const TABS = [
  { href: "/mercados",  curto: "Ao vivo", label: "Mercados Ao Vivo",    icon: Flame,     badge: "AO VIVO" },
  { href: "/noticias",  curto: "Análise", label: "Análise de Mercados", icon: Newspaper },
  { href: "/portfolio", curto: "Banca",   label: "Banca Simulada",      icon: Wallet,    badge: "NOVO" },
];

export default function MercadosTabs() {
  const [location] = useLocation();

  return (
    <div className="border-b border-border/30 bg-secondary/5 sticky top-14 z-30 backdrop-blur-sm">
      <div className="container">
        <div className="flex items-center gap-0 h-11 overflow-x-auto scrollbar-none rolagem-lateral">
          {TABS.map((t) => {
            const active = location === t.href || (t.href === "/mercados" && location.startsWith("/mercados/"));
            const Icon = t.icon;
            return (
              <Link key={t.href} href={t.href}>
                <span
                  className={`shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 sm:px-5 h-full border-b-2 transition-colors cursor-pointer ${
                    active
                      ? "border-gold text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/20"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="sm:hidden">{t.curto}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                  {t.badge && (
                    <span className="hidden sm:inline-block text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-positive/15 text-positive border border-positive/20 leading-none">
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
