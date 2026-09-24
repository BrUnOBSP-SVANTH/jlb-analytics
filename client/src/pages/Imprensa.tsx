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
import { num } from "@shared/formato";

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
      <Icon className="w-3 h-3" />{up ? "+" : ""}{num(delta, 1)} pts / 7d
    </span>
  );
}

/** Prosa editorial em pt-BR a partir do dado real (determinística, sem IA). */
function prose(it: FeedItem): string {
  const mv = it.delta7d == null || Math.abs(it.delta7d) < 0.5
    ? ""
    : it.delta7d > 0
      ? `, em alta de ${num(it.delta7d, 1)} pts na semana`
      : `, em queda de ${num(Math.abs(it.delta7d), 1)} pts na semana`;
  return `há ${it.prob}% de chance${mv}, segundo o mercado preditivo`;
}

const MARKET_FACTS = [
  { stat: "70%",    desc: "dos endereços no Polymarket têm perdas históricas",                    source: "CryptoSlate 2025" },
  { stat: "0,04%",  desc: "das contas capturaram mais de 70% de todos os lucros do mercado",      source: "CryptoSlate 2025" },
  { stat: "R$30bi", desc: "fluxo mensal via Pix para casas de apostas no Brasil",                 source: "BCB 2025" },
  { stat: "Feb/26", desc: "CVM aprovou a primeira operadora brasileira de mercados preditivos na B3", source: "CVM 2026" },
];

const ROADMAP = [
  { phase: "MVP — concluído",      status: "done",    items: ["Mercados ao vivo (Polymarket + Kalshi)", "IA adaptativa por domínio e nível", "5 níveis educacionais com calculadoras", "Cérebro (base curada por RSS + IA)", "Dashboard de calibração pessoal", "Sync de previsões em nuvem (Supabase)", "Rankings de calibração públicos", "Comunidade de forecasters (duelos)"] },
  { phase: "Q3 2026 — em andamento", status: "active",  items: ["Integração Stripe (plano premium)", "Mobile app (PWA avançado)"] },
  { phase: "Q4 2026 — planejado",  status: "planned", items: ["API para desenvolvedores", "Integração B3 Mercados Preditivos"] },
];

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
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Probabilidade</p>
                  <p className="text-2xl font-display font-bold text-foreground tabular-nums">{featured.prob}%</p>
                </div>
                <div className="px-4 py-3 border-l border-gold/20 flex flex-col justify-center min-w-0">
                  <p className="text-xs text-foreground line-clamp-2" data-fonte="externa">{featured.question}</p>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <MovementChip delta={featured.delta7d} />
                    <span className="text-[11px] text-muted-foreground">via JLB Analytics</span>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mt-3">Exemplo com dado ao vivo. Formato final a combinar: card, tabela, gráfico ou API — títulos traduzíveis para pt-BR.</p>
            </div>
          </section>
        )}

        {/* O feed, ao vivo */}
        <section>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-[var(--titulo)] flex items-center gap-2"><Newspaper className="w-5 h-5 text-primary" /> O feed, ao vivo</h2>
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
                    {/* `data-fonte="externa"`: a pergunta é da PLATAFORMA, com a
                        grafia dela ("$110", "82,000"). Reformatar seria adulterar
                        a citação — e este feed existe para redações citarem. */}
                    <h3 className="font-display font-semibold text-foreground text-sm leading-snug text-balance" data-fonte="externa">{it.question}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{it.read}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground">{SOURCE_LABEL[it.source] ?? it.source}</span>
                      {it.externalUrl && (
                        <a href={it.externalUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary inline-flex items-center gap-0.5 hover:underline">
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

        {/* Contexto de mercado, roadmap e licenciamento — moradores novos.
            Viviam em /sobre, que é lida por quem vai USAR a plataforma: ali
            "a janela para capturar usuários antes da commoditização é estreita"
            transformava o leitor no recurso a ser capturado (auditoria de
            14/09, item 23). Aqui o público é outro — imprensa e parceiros —, e
            o mesmo texto é informação legítima. */}
        <section className="space-y-4">
          <h2 className="text-lg font-bold text-[var(--titulo)]">Por que agora</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            O mercado preditivo brasileiro está sendo construído agora, junto com a regulamentação —
            e por isso quase tudo que se publica sobre ele ainda é estimativa sem fonte.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MARKET_FACTS.map((f) => (
              <div key={f.stat} className="glass-card rounded-xl p-5 flex gap-4 items-start">
                <span className="text-2xl font-bold font-mono text-gold shrink-0">{f.stat}</span>
                <div>
                  <p className="text-sm text-foreground leading-snug">{f.desc}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{f.source}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-bold text-[var(--titulo)]">Roadmap</h2>
          <div className="space-y-4">
            {ROADMAP.map((phase) => (
              <div key={phase.phase} className={`glass-card rounded-xl p-5 border ${
                phase.status === "done" ? "border-positive/20" :
                phase.status === "active" ? "border-gold/30" :
                "border-border/20"
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-sm font-semibold ${
                    phase.status === "done" ? "text-positive" :
                    phase.status === "active" ? "text-gold" :
                    "text-muted-foreground"
                  }`}>{phase.phase}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {phase.items.map((item) => (
                    <span key={item} className={`text-[11px] px-2 py-1 rounded-full border ${
                      phase.status === "done" ? "bg-positive/5 border-positive/20 text-positive/80" :
                      phase.status === "active" ? "bg-gold/5 border-gold/20 text-gold/80" :
                      "bg-secondary/20 border-border/20 text-muted-foreground"
                    }`}>{item}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-card rounded-2xl p-6 border border-neon-blue/20">
          <h2 className="text-lg font-bold text-[var(--titulo)] mb-2">API e licenciamento (B2B)</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Acesso programático aos modelos econométricos e ao feed de probabilidades, para redações,
            corretoras e plataformas que precisam do número com procedência. Fale pelo e-mail abaixo.
          </p>
        </section>

        {/* Credibilidade + CTA de licenciamento */}
        <section className="glass-card rounded-2xl p-6 border border-gold/20 bg-gradient-to-br from-gold/5 to-transparent">
          <h2 className="font-display font-bold text-[var(--titulo)] text-lg mb-2">Por que uma redação confiaria nesses números?</h2>
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
