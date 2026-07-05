import { Link } from "wouter";
import { Home, TrendingUp, BookOpen, LayoutDashboard } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-20">
      {/* Error code */}
      <div className="relative mb-8">
        <p className="text-[120px] font-display font-bold leading-none text-foreground/5 select-none">
          404
        </p>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-secondary/40 border border-border/40 flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-7 h-7 text-muted-foreground/60" aria-hidden="true" />
            </div>
            <p className="text-3xl font-bold font-mono text-foreground">404</p>
          </div>
        </div>
      </div>

      <h1 className="text-xl font-semibold text-foreground mb-2">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground text-center max-w-sm leading-relaxed mb-8">
        A página que você está procurando não existe ou foi movida.
        Veja algumas opções abaixo.
      </p>

      {/* Quick navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-md mb-8">
        {[
          { href: "/",          label: "Início",     icon: Home,            desc: "Voltar ao início" },
          { href: "/apostas",   label: "Mercados",   icon: TrendingUp,      desc: "Apostas em Hype" },
          { href: "/dashboard", label: "Dashboard",  icon: LayoutDashboard, desc: "Suas métricas" },
        ].map(({ href, label, icon: Icon, desc }) => (
          <Link key={href} href={href}>
            <div className="glass-card rounded-xl p-4 flex flex-col items-center gap-2 hover:border-primary/30 transition-colors cursor-pointer text-center">
              <div className="w-9 h-9 rounded-lg bg-secondary/40 flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-[11px] text-muted-foreground">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <Link href="/nivel/1">
        <span className="inline-flex items-center gap-2 text-sm text-primary/70 hover:text-primary transition-colors">
          <BookOpen className="w-4 h-4" aria-hidden="true" />
          Explorar os níveis educacionais
        </span>
      </Link>
    </div>
  );
}
