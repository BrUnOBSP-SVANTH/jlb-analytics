/**
 * Sobre — JLB Analytics
 * Missão, produto, mercado e roadmap — orientado ao investidor.
 */
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Target, GraduationCap, BarChart3, Brain, GitMerge,
  Calculator, Activity, ArrowRight, Zap, DollarSign, Users,
  Map, CheckCircle, Clock, Rocket,
} from "lucide-react";

const OFFERINGS = [
  { icon: GraduationCap, title: "5 Níveis de Educação",        desc: "Progressão estruturada: Fundamentos → Dados → Modelos → Vieses → Análise Integrada. Cada nível com calculadoras interativas." },
  { icon: BarChart3,     title: "Modelos Quantitativos",        desc: "Poisson + Dixon-Coles, Elo, GARCH, Regra de Taylor, ENSO. Cada modelo com premissas e limites documentados — implementados em TypeScript." },
  { icon: Calculator,    title: "Calculadoras EV, Kelly, Brier", desc: "Ferramentas interativas para Valor Esperado, Overround, Brier Score e Kelly — os fundamentos que 99% dos apostadores nunca calcularam." },
  { icon: Activity,      title: "Simuladores Monte Carlo",      desc: "Lei dos Grandes Números, Kelly Criterion e calibração interativa. Simulações de até 1.000 apostas com visualização em tempo real." },
  { icon: Brain,         title: "IA Adaptativa por Domínio",    desc: "Previsão Guiada detecta o nível do usuário (leigo / intermediário / avançado) e aplica o modelo econométrico correto para cada pergunta." },
  { icon: GitMerge,      title: "Cerebro — Base Proprietária",  desc: "3.700+ artigos coletados via RSS, 63 sínteses por IA. Motor de contexto que alimenta todas as análises — atualizado a cada 2 horas." },
];

const PRINCIPLES = [
  { title: "EV antes de tudo",        desc: "Qualquer posição que não tenha Valor Esperado calculado não deveria ser tomada.", color: "text-positive",   bg: "bg-positive/10",   border: "border-positive/20" },
  { title: "Calibração, não previsão", desc: "O objetivo não é acertar mais. É ser bem calibrado: quando você diz 70%, deve acontecer 70% das vezes.", color: "text-primary",    bg: "bg-primary/10",    border: "border-primary/20" },
  { title: "Modelos explicam",         desc: "Nenhum modelo é a realidade. Divergências entre modelo e mercado são hipóteses a investigar — não ordens.", color: "text-neon-blue",  bg: "bg-neon-blue/10",  border: "border-neon-blue/20" },
  { title: "Educação, não dependência", desc: "Cada nível torna o usuário mais independente do sistema. Plataformas honestas aumentam capacidade — não criam vício.", color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" },
];

// Metrics fetched dynamically from Supabase where possible
const STATIC_METRICS = [
  { value: "16",  label: "endpoints de modelos econométricos", sub: "TypeScript nativo, sem dependências externas" },
  { value: "5",   label: "níveis de educação progressiva",     sub: "do fundamento à análise integrada" },
];

const MARKET_FACTS = [
  { stat: "70%",    desc: "dos endereços no Polymarket têm perdas históricas",                    source: "CryptoSlate 2025" },
  { stat: "0,04%",  desc: "das contas capturaram mais de 70% de todos os lucros do mercado",      source: "CryptoSlate 2025" },
  { stat: "R$30bi", desc: "fluxo mensal via Pix para casas de apostas no Brasil",                 source: "BCB 2025" },
  { stat: "Feb/26", desc: "CVM aprovou a primeira operadora brasileira de mercados preditivos na B3", source: "CVM 2026" },
];

const ROADMAP = [
  { phase: "MVP — concluído",      status: "done",    items: ["Apostas ao vivo (Polymarket + Kalshi)", "IA adaptativa por domínio e nível", "5 níveis educacionais com calculadoras", "Cerebro com 3.700+ artigos", "Dashboard de calibração pessoal"] },
  { phase: "Q3 2026 — em andamento", status: "active",  items: ["Integração Stripe (plano premium)", "Snapshots históricos para Backtester", "Sync de previsões em nuvem (Supabase)", "Mobile app (PWA avançado)"] },
  { phase: "Q4 2026 — planejado",  status: "planned", items: ["Comunidade de forecasters", "Rankings de calibração públicos", "API para desenvolvedores", "Integração B3 Mercados Preditivos"] },
];

export default function Sobre() {
  useSEO("Sobre — metodologia, mercado e roadmap", "Educação quantitativa para o mercado preditivo brasileiro: método, modelo de negócio, métricas reais e roadmap da JLB Analytics.");
  const [articleCount, setArticleCount] = useState<number | null>(null);
  const [analysisCount, setAnalysisCount] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("cerebro_articles").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("cerebro_analyses").select("id", { count: "exact", head: true }).eq("status", "active"),
    ]).then(([artRes, anaRes]) => {
      if (artRes.count != null) setArticleCount(artRes.count);
      if (anaRes.count != null) setAnalysisCount(anaRes.count);
    }).catch(() => {});
  }, []);

  const metrics = [
    { value: articleCount != null ? articleCount.toLocaleString("pt-BR") : "…", label: "artigos na base Cerebro",          sub: "atualizado diariamente via RSS" },
    { value: analysisCount != null ? String(analysisCount) : "…",               label: "sínteses IA ativas",                sub: "domínios: macro, política, esportes, cripto" },
    ...STATIC_METRICS,
  ];

  return (
    <div>
      <PageHeader
        title="Sobre a JLB Analytics"
        subtitle="A plataforma de educação quantitativa para o mercado preditivo brasileiro."
        badge="Sobre"
      />

      <div className="container py-12 space-y-16 max-w-5xl mx-auto">

        {/* Mission */}
        <AnimatedSection>
          <div className="glass-card rounded-xl p-8 border border-gold/20">
            <div className="flex items-start gap-4">
              <Target className="w-8 h-8 text-gold shrink-0 mt-1" aria-hidden="true" />
              <div>
                <h2 className="text-xl font-display font-bold text-foreground mb-4">Missão</h2>
                <p className="text-muted-foreground leading-relaxed">
                  A JLB Analytics nasceu de uma premissa simples: a maioria das pessoas participa de mercados preditivos
                  — apostas esportivas, Polymarket, Kalshi — sem nunca ter calculado o Valor Esperado de uma única posição.
                  Não por falta de inteligência, mas por falta de estrutura.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-3">
                  Nossa missão é fornecer essa estrutura. Cinco níveis de conhecimento progressivo, modelos quantitativos
                  com premissas documentadas, ferramentas de calibração e uma IA contextualizada — tudo focado em
                  transformar intuição em análise rigorosa.
                </p>
                <p className="text-muted-foreground leading-relaxed mt-3">
                  <strong className="text-foreground">O que não fazemos:</strong>{" "}
                  não recomendamos posições, apostas ou investimentos. O sistema mostra onde o mercado pode estar errado —
                  a decisão é sempre do usuário.
                </p>
              </div>
            </div>
          </div>
        </AnimatedSection>

        {/* Platform metrics */}
        <AnimatedSection>
          <h2 className="text-xl font-display font-bold text-foreground mb-6">Plataforma em números</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {metrics.map((m) => (
              <div key={m.label} className="glass-card rounded-xl p-5 text-center">
                {m.value === "…" ? (
                  <div className="h-9 w-20 mx-auto mb-1 rounded bg-secondary/40 animate-pulse" aria-label="carregando" />
                ) : (
                  <p className="text-3xl font-bold font-mono text-gold mb-1">{m.value}</p>
                )}
                <p className="text-xs font-semibold text-foreground mb-0.5">{m.label}</p>
                <p className="text-[10px] text-muted-foreground/70">{m.sub}</p>
              </div>
            ))}
          </div>
        </AnimatedSection>

        {/* Market context */}
        <AnimatedSection>
          <h2 className="text-xl font-display font-bold text-foreground mb-2">Por que agora</h2>
          <p className="text-sm text-muted-foreground mb-6">
            O mercado preditivo brasileiro está sendo construído agora — junto com a regulamentação.
            A janela para capturar usuários antes da commoditização é estreita.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MARKET_FACTS.map((f) => (
              <div key={f.stat} className="glass-card rounded-xl p-5 flex gap-4 items-start">
                <span className="text-2xl font-bold font-mono text-gold shrink-0">{f.stat}</span>
                <div>
                  <p className="text-sm text-foreground leading-snug">{f.desc}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">{f.source}</p>
                </div>
              </div>
            ))}
          </div>
        </AnimatedSection>

        {/* What we offer */}
        <AnimatedSection>
          <h2 className="text-xl font-display font-bold text-foreground mb-6">O que a plataforma entrega</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {OFFERINGS.map((item, i) => {
              const Icon = item.icon;
              return (
                <AnimatedSection key={item.title} delay={i * 0.06}>
                  <div className="glass-card rounded-xl p-5 h-full">
                    <Icon className="w-5 h-5 text-neon-blue mb-3" aria-hidden="true" />
                    <h3 className="font-display font-semibold text-foreground mb-1 text-sm">{item.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{item.desc}</p>
                  </div>
                </AnimatedSection>
              );
            })}
          </div>
        </AnimatedSection>

        {/* Business model */}
        <AnimatedSection>
          <h2 className="text-xl font-display font-bold text-foreground mb-6">Modelo de negócio</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="glass-card rounded-xl p-5 border border-positive/20">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-positive/10 flex items-center justify-center">
                  <Users className="w-4 h-4 text-positive" />
                </div>
                <span className="text-sm font-semibold text-foreground">Freemium</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Níveis 1–3, calculadoras e simuladores gratuitos. Sem cadastro necessário para explorar.
                Conversão por valor demonstrado — não por paywall.
              </p>
            </div>
            <div className="glass-card rounded-xl p-5 border border-gold/20">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-gold" />
                </div>
                <span className="text-sm font-semibold text-foreground">Premium</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Níveis 4–5, análises IA ilimitadas, Backtester com dados reais, histórico cloud e
                relatórios de calibração exportáveis.
              </p>
            </div>
            <div className="glass-card rounded-xl p-5 border border-neon-blue/20">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-neon-blue/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-neon-blue" />
                </div>
                <span className="text-sm font-semibold text-foreground">API / B2B</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Acesso programático aos modelos econométricos para corretoras, funds e plataformas
                que precisam de análise quantitativa de mercados preditivos.
              </p>
            </div>
          </div>
        </AnimatedSection>

        {/* Roadmap */}
        <AnimatedSection>
          <h2 className="text-xl font-display font-bold text-foreground mb-6">Roadmap</h2>
          <div className="space-y-4">
            {ROADMAP.map((phase) => (
              <div key={phase.phase} className={`glass-card rounded-xl p-5 border ${
                phase.status === "done" ? "border-positive/20" :
                phase.status === "active" ? "border-gold/30 bg-gold/3" :
                "border-border/20"
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  {phase.status === "done" ? (
                    <CheckCircle className="w-4 h-4 text-positive shrink-0" />
                  ) : phase.status === "active" ? (
                    <Rocket className="w-4 h-4 text-gold shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                  )}
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
        </AnimatedSection>

        {/* Principles */}
        <AnimatedSection>
          <h2 className="text-xl font-display font-bold text-foreground mb-6">Princípios de design</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className={`p-5 rounded-xl border ${p.border} ${p.bg}`}>
                <p className={`font-semibold text-sm mb-2 ${p.color}`}>{p.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </AnimatedSection>

        {/* CTA */}
        <AnimatedSection>
          <div className="text-center py-4 space-y-4">
            <p className="text-muted-foreground text-sm max-w-lg mx-auto">
              A melhor forma de entender a plataforma é usá-la.
              Comece pelo Nível 1 — gratuito, sem cadastro, menos de 10 minutos.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/nivel/1">
                <span className="inline-flex items-center gap-2 px-7 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
                  Começar Nível 1 <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </span>
              </Link>
              <Link href="/apostas">
                <span className="inline-flex items-center gap-2 px-7 py-3 rounded-lg border border-border/50 text-foreground font-medium hover:bg-secondary/30 transition-colors">
                  Ver Apostas ao Vivo <Map className="w-4 h-4" aria-hidden="true" />
                </span>
              </Link>
            </div>
          </div>
        </AnimatedSection>

        {/* Disclaimer */}
        <AnimatedSection>
          <div className="glass-card rounded-xl p-5 border-border/20">
            <h3 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">Aviso Legal</h3>
            <p className="text-xs text-muted-foreground/60 leading-relaxed">
              Plataforma exclusivamente educacional. Dados, modelos e análises não constituem recomendação de investimento,
              consultoria financeira ou incentivo a apostas. Dados via APIs públicas — podem apresentar atraso.
              Modelos são simplificações e falham sob condições que violam suas premissas.
              Participação em mercados preditivos envolve risco de perda de capital.
            </p>
          </div>
        </AnimatedSection>

      </div>
    </div>
  );
}
