/**
 * Footer — rodapé do site + selo de frescor de dados (DataFreshness).
 * Extraído de components/Layout.tsx.
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";

/** "há 2h", "há 3d" — idade amigável de um timestamp ISO. */
function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `há ${mins}min`;
  const h = Math.round(mins / 60);
  if (h < 48) return `há ${h}h`;
  return `há ${Math.round(h / 24)}d`;
}

/** Frescor real dos pipelines de dados — confiança p/ o usuário, alarme p/ nós. */
function DataFreshness() {
  const [data, setData] = useState<{ lastArticleAt: string | null; lastSnapshotAt: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/health/data")
      .then((r) => r.ok ? r.json() as Promise<{ available: boolean; lastArticleAt: string | null; lastSnapshotAt: string | null }> : null)
      .then((d) => { if (d?.available) setData(d); })
      .catch(() => {});
  }, []);

  if (!data || (!data.lastArticleAt && !data.lastSnapshotAt)) return null;
  return (
    <p className="text-[10px] text-muted-foreground text-center tabular-nums">
      {data.lastArticleAt && <>Cerebro atualizado {timeAgo(data.lastArticleAt)}</>}
      {data.lastArticleAt && data.lastSnapshotAt && <span className="mx-1.5 text-border/40">·</span>}
      {data.lastSnapshotAt && <>snapshot de mercados {timeAgo(data.lastSnapshotAt)}</>}
    </p>
  );
}

export function Footer() {
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
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Aprender</h4>
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
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Mercados & Dados</h4>
            <div className="space-y-1.5">
              {[
                { label: "Mercados Ao Vivo", href: "/apostas"  },
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
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Ferramentas</h4>
            <div className="space-y-1.5">
              {[
                { label: "Previsão IA",   href: "/previsao"    },
                { label: "Banca Simulada", href: "/portfolio"  },
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
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            Caráter educacional — não constitui recomendação de investimento ou aposta.
            Dados de mercado via APIs públicas e podem apresentar atraso.
          </p>
          <div className="flex items-center justify-center gap-4 text-xs">
            <Link href="/termos"><span className="text-muted-foreground hover:text-foreground transition-colors">Termos de Uso</span></Link>
            <span className="text-border/40">·</span>
            <Link href="/privacidade"><span className="text-muted-foreground hover:text-foreground transition-colors">Política de Privacidade</span></Link>
            <span className="text-border/40">·</span>
            <Link href="/sobre"><span className="text-muted-foreground hover:text-foreground transition-colors">Sobre</span></Link>
            <span className="text-border/40">·</span>
            <Link href="/imprensa"><span className="text-muted-foreground hover:text-foreground transition-colors">Imprensa</span></Link>
          </div>
          <p className="text-xs text-muted-foreground/70 text-center">
            &copy; {new Date().getFullYear()} JLB Analytics. Todos os direitos reservados.
          </p>
          <DataFreshness />
        </div>
      </div>
    </footer>
  );
}
