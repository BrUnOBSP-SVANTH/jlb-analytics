/**
 * Imprensa.tsx — o ativo B2B da Onda 2: o FEED EDITORIAL de probabilidades para
 * redações e portais. Consome /api/feed/editorial (probabilidade AO VIVO + movimento
 * de 7 dias, dado 100% real) e demonstra como a probabilidade vira conteúdo pronto
 * para publicar — o gancho que abre a conversa de licenciamento com a mídia.
 */
import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  Newspaper, TrendingUp, TrendingDown, Minus, ExternalLink,
  ShieldCheck, Rss, Clock, ArrowRight,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import PageHeader from "@/components/PageHeader";

interface FeedItem {
  source: "polymarket" | "kalshi";
  marketId: string;
  question: string;
  prob: number;
  delta7d: number | null;
  volume: number;
  category: string;
  externalUrl?: string;
  read: string;
}

const SOURCE_LABEL: Record<string, string> = { polymarket: "Polymarket", kalshi: "Kalshi" };

const VALUE = [
  { icon: ShieldCheck, t: "Auditável", d: "Cada número nasce do mercado e tem histórico de acerto público." },
  { icon: Rss, t: "Pronto pra publicar", d: "Manchete, probabilidade, variação e leitura — via feed, API ou widget." },
  { icon: Clock, t: "Sempre atual", d: "Atualiza sozinho conforme o mercado se move. Zero curadoria manual." },
];

function MovementChip({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Minus className="w-3 h-3" /> novo</span>;
  if (Math.abs(delta) < 0.5) return <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Minus className="w-3 h-3" /> estável</span>;
  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${up ? "text-positive" : "text-negative"}`}>
      <Icon className="w-3 h-3" />{up ? "+" : ""}{delta.toFixed(1)} pts / 7d
    </span>
  );
}

/** Prosa editorial em pt-BR a partir do dado real (determinística, sem IA). */
function prose(it: FeedItem): string {
  const mv = it.delta7d == null || Math.abs(it.delta7d) < 0.5
    ? ""
    : it.delta7d > 0
      ? `, em alta de ${it.delta7d.toFixed(1)} pts na semana`
      : `, em queda de ${Math.abs(it.delta7d).toFixed(1)} pts na semana`;
  return `há ${it.prob}% de chance${mv}, segundo o mercado preditivo`;
}

export default function Imprensa() {
  useSEO(
    "Probabilidades para Redações",
    "Feed editorial de probabilidades auditáveis: número ao vivo dos mercados + movimento semanal, pronto para publicar. Para mídia e portais.",
  );
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/api/feed/editorial?limit=12")
      .then((r) => (r.ok ? (r.json() as Promise<{ items: FeedItem[] }>) : Promise.reject(new Error("feed"))))
      .then((d) => setItems(d.items ?? []))
      .catch(() => setError(true));
  }, []);

  const featured = items?.[0];

  return (
    <div>
      <PageHeader
        badge="Para redações e portais"
        title="Probabilidades como conteúdo editorial"
        subtitle="A mesma probabilidade que move os mercados, pronta para a sua matéria: número ao vivo, movimento da semana e leitura em português — com histórico auditável por trás."
      />
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-14">

        {/* Valor B2B */}
        <section className="grid sm:grid-cols-3 gap-4">
          {VALUE.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.t} className="glass-card rounded-xl p-4 border border-border/50">
                <Icon className="w-4 h-4 text-primary mb-2" />
                <p className="font-semibold text-sm text-foreground">{c.t}</p>
                <p className="text-xs text-muted-foreground mt-1">{c.d}</p>
              </div>
            );
          })}
        </section>

        {/* Embed mockup — como fica dentro de uma matéria */}
        {featured && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Como aparece na sua matéria</h2>
            <div className="glass-card rounded-2xl p-6 border border-border/50 bg-background/40">
              <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-2xl">
                …e o cenário segue em aberto. Para os apostadores que arriscam dinheiro de verdade,{" "}
                <span className="text-foreground font-medium">{prose(featured)}</span>.
              </p>
              <div className="inline-flex items-stretch rounded-xl border border-gold/30 bg-gold/5 overflow-hidden max-w-full">
                <div className="px-4 py-3 flex flex-col justify-center shrink-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Probabilidade</p>
                  <p className="text-2xl font-display font-bold text-foreground tabular-nums">{featured.prob}%</p>
                </div>
                <div className="px-4 py-3 border-l border-gold/20 flex flex-col justify-center min-w-0">
                  <p className="text-xs text-foreground line-clamp-2">{featured.question}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <MovementChip delta={featured.delta7d} />
                    <span className="text-[10px] text-muted-foreground">via JLB Analytics</span>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-3">Exemplo com dado ao vivo. Formato final a combinar: card, tabela, gráfico ou API — títulos traduzíveis para pt-BR.</p>
            </div>
          </section>
        )}

        {/* O feed, ao vivo */}
        <section>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Newspaper className="w-5 h-5 text-primary" /> O feed, ao vivo</h2>
            <span className="text-[11px] text-muted-foreground">ordenado pelos maiores movimentos da semana</span>
          </div>

          {error && <p className="text-sm text-muted-foreground">O feed está indisponível no momento. Tente novamente em instantes.</p>}

          {!items && !error && (
            <div className="space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-muted/30 animate-pulse" />)}</div>
          )}

          {items && items.length > 0 && (
            <div className="space-y-3">
              {items.map((it) => (
                <article key={`${it.source}-${it.marketId}`} className="glass-card rounded-xl p-4 border border-border/50 flex items-start gap-4">
                  <div className="shrink-0 w-16 text-center">
                    <p className="text-2xl font-display font-bold text-foreground tabular-nums leading-none">{it.prob}<span className="text-sm">%</span></p>
                    <div className="mt-1.5 flex justify-center"><MovementChip delta={it.delta7d} /></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-foreground text-sm leading-snug text-balance">{it.question}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{it.read}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">{SOURCE_LABEL[it.source] ?? it.source}</span>
                      {it.externalUrl && (
                        <a href={it.externalUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary inline-flex items-center gap-0.5 hover:underline">
                          fonte <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {items && items.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">Sem itens no feed agora — os dados aparecem conforme os snapshots de mercado são coletados.</p>
          )}
        </section>

        {/* Credibilidade + CTA de licenciamento */}
        <section className="glass-card rounded-2xl p-6 border border-gold/20 bg-gradient-to-br from-gold/5 to-transparent">
          <h2 className="font-display font-bold text-foreground text-lg mb-2">Por que uma redação confiaria nesses números?</h2>
          <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
            Porque o acerto é <strong className="text-foreground">público e auditável</strong>. Cada previsão é registrada,
            comparada ao resultado <strong className="text-foreground">oficial</strong> da plataforma e agregada numa taxa de
            acerto que qualquer um confere — o oposto do palpite anônimo.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/track-record">
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gold text-on-accent text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer">
                <ShieldCheck className="w-4 h-4" /> Ver o histórico auditável
              </span>
            </Link>
            <Link href="/sobre">
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-muted/50 transition-colors cursor-pointer">
                Falar sobre licenciamento <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}
