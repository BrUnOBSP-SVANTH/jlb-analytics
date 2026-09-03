/**
 * Educacao.tsx — JLB Analytics
 * Hub central de progressão: mapa dos 5 níveis + contexto de mercados preditivos.
 */

import { Link } from "wouter";
import {
  GraduationCap, BarChart3, TrendingUp, Brain, GitMerge,
  ArrowRight, Lock, CheckCircle, BookOpen, Star,
  Scale, TrendingDown, Target,
} from "lucide-react";
import { isLevelUnlocked } from "@/lib/userProgress";
import { VERBETES } from "@/lib/glossario";
import { useSEO } from "@/hooks/useSEO";
import PageHeader from "@/components/PageHeader";

const LEVELS = [
  {
    n: 1,
    title: "Fundamentos",
    free: true,
    badge: "Grátis",
    pts: 0,
    href: "/nivel/1",
    icon: GraduationCap,
    color: "text-positive",
    bg: "bg-positive/10",
    border: "border-positive/30",
    topics: ["Valor Esperado — E[X] = Σ pᵢ · xᵢ", "Margem da casa / overround", "Atualização Bayesiana"],
    outcome: "Você sai calculando a margem implícita de qualquer odd e o EV de qualquer posição.",
  },
  {
    n: 2,
    title: "Leitura de Dados",
    free: true,
    badge: "Grátis",
    pts: 0,
    href: "/nivel/2",
    icon: BarChart3,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
    topics: ["Z-score e detecção de anomalias", "Intervalo de Confiança — nunca uma estimativa sem incerteza", "Correlação de Pearson vs. causalidade"],
    outcome: "Você sai diferenciando correlação de causalidade e nunca mais apresenta uma estimativa sem intervalo.",
  },
  {
    n: 3,
    title: "Modelos Básicos",
    free: true,
    badge: "Grátis",
    pts: 0,
    href: "/nivel/3",
    icon: TrendingUp,
    color: "text-level3",
    bg: "bg-level3/10",
    border: "border-level3/30",
    topics: ["Regra de Taylor — benchmark de política monetária", "Poisson duplo + Dixon-Coles — futebol", "Elo Rating — probabilidade de vitória", "GARCH — volatilidade (não direção)", "ENSO — fases climáticas e impacto regional"],
    outcome: "Você entende o que cada modelo calcula, quais são suas premissas e quando ele falha.",
  },
  {
    n: 4,
    title: "Vieses e Psicologia",
    free: false,
    badge: "50 pts",
    pts: 50,
    href: "/nivel/4",
    icon: Brain,
    color: "text-level4",
    bg: "bg-level4/10",
    border: "border-level4/30",
    topics: ["Prospect Theory — λ=2.25 (Kahneman & Tversky 1992)", "Brier Score + Skill Score — calibração real", "Falácia do Jogador — independência de eventos", "Overconfidence Index por decil", "Perfil de Maturidade Analítica"],
    outcome: "Você mede seus próprios vieses com matemática e identifica onde o comportamento destrói retorno.",
  },
  {
    n: 5,
    title: "Análise Integrada",
    free: false,
    badge: "100 pts",
    pts: 100,
    href: "/nivel/5",
    icon: GitMerge,
    color: "text-neon-blue",
    bg: "bg-neon-blue/10",
    border: "border-neon-blue/30",
    topics: ["Divergência modelo vs. mercado — 5 tiers", "Ensemble skill-weighted (modelos com SS ≤ 0 são excluídos)", "Nota educacional obrigatória em todo output", "Filtro de output por nível de usuário"],
    outcome: "Você interpreta quando o modelo diverge do mercado, por que diverge e o que isso significa para investigar.",
  },
];

const PLATFORMS = [
  { name: "Polymarket", desc: "Maior mercado preditivo descentralizado. US$ 13bi/mês em volume (2025).", tag: "Internacional" },
  { name: "Kalshi", desc: "Regulamentado nos EUA. Parceria com XP International para Brasil (março 2026).", tag: "Regulamentado" },
  { name: "B3 Mercados Preditivos", desc: "Aprovação da CVM em fevereiro 2026. Primeira operadora brasileira.", tag: "Brasil" },
  { name: "Metaculus", desc: "Focado em previsões científicas e tecnológicas. Comunidade de forecasters calibrados.", tag: "Educacional" },
];


export default function Educacao() {
  useSEO("Trilha Completa de Educação", "Cinco níveis progressivos: Valor Esperado, leitura de dados, modelos quantitativos, vieses cognitivos e análise integrada de mercados preditivos.");

  return (
    <div>
      <PageHeader
        badge="Guia de aprendizado"
        title="Do Fundamento à Análise Integrada"
        subtitle="Cada nível constrói sobre o anterior. Você não precisa de matemática avançada para começar — precisa de disposição para questionar o que acreditava saber sobre probabilidade."
      />
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-16">

      {/* Porta de entrada: Aposta ≠ Investimento — o enquadramento que separa
          achismo de método. É a primeira ideia que todo visitante precisa virar,
          e o funil que liga a educação à prova (track record) e às ferramentas. */}
      <section>
        <div className="glass-card rounded-2xl border border-border/60 overflow-hidden">
          <div className="p-6 sm:p-8 bg-gradient-to-br from-primary/5 to-transparent">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary mb-3">
              <Scale className="w-3.5 h-3.5" /> Comece por aqui
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground text-balance mb-3">
              Aposta <span className="text-negative">≠</span> Investimento
            </h2>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Apostar no achismo é imposto sobre a esperança: a casa embute a margem dela em cada odd, e a emoção faz o resto.
              Investir é o oposto — você só entra quando a <strong className="text-foreground">probabilidade real</strong> está do seu lado,
              com <strong className="text-foreground">valor esperado positivo</strong> e disciplina. Este site inteiro existe para te levar de um lado ao outro.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-px bg-border/40">
            <div className="p-5 sm:p-6 bg-background/40">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown className="w-4 h-4 text-negative" />
                <h3 className="font-semibold text-foreground text-sm">Apostar no achismo</h3>
              </div>
              <ul className="space-y-2 text-xs text-muted-foreground">
                {[
                  "A casa embute a margem (overround) — você já começa perdendo",
                  "Decisão movida por emoção, torcida e o resultado mais recente",
                  "EV negativo: matematicamente perdedor no longo prazo",
                  "Sem registro e sem prova — impossível saber se você acerta",
                ].map((x) => (
                  <li key={x} className="flex items-start gap-2"><span className="text-negative mt-0.5 shrink-0">✗</span>{x}</li>
                ))}
              </ul>
            </div>
            <div className="p-5 sm:p-6 bg-background/40">
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-positive" />
                <h3 className="font-semibold text-foreground text-sm">Decidir com método</h3>
              </div>
              <ul className="space-y-2 text-xs text-muted-foreground">
                {[
                  "Você calcula a probabilidade e a margem implícita de cada odd",
                  "Só age quando há divergência real entre o modelo e o mercado",
                  "EV positivo e Kelly: o tamanho da posição vem da vantagem",
                  "Track record auditável — a gente PROVA o histórico de acertos",
                ].map((x) => (
                  <li key={x} className="flex items-start gap-2"><CheckCircle className="w-3.5 h-3.5 text-positive shrink-0 mt-0.5" />{x}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="p-5 sm:p-6 flex flex-wrap gap-3 border-t border-border/40">
            <Link href="/nivel/1">
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity cursor-pointer">
                Começar pelo Valor Esperado <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
            <Link href="/track-record">
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gold/40 text-gold text-sm font-semibold hover:bg-gold/5 transition-colors cursor-pointer">
                <Star className="w-3.5 h-3.5" /> Ver a prova (track record)
              </span>
            </Link>
            <Link href="/calculadoras">
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-foreground text-sm font-medium hover:bg-muted/50 transition-colors cursor-pointer">
                Calcular meu edge
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* Mapa de progressão */}
      <section>
        <h2 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-primary" />
          Mapa de Progressão
        </h2>
        <div className="space-y-4">
          {LEVELS.map((level, idx) => {
            const Icon = level.icon;
            const isUnlocked = level.free || isLevelUnlocked(level.n);
            return (
              <div key={level.n} className="relative">
                {/* Linha conectora */}
                {idx < LEVELS.length - 1 && (
                  <div className="absolute left-5 top-full w-0.5 h-4 bg-border/30 z-10" />
                )}
                <div className={`rounded-xl border ${level.border} ${level.bg} overflow-hidden`}>
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-background/50 flex items-center justify-center shrink-0">
                        <Icon className={`w-5 h-5 ${level.color}`} />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="text-xs text-muted-foreground font-medium">Nível {level.n}</span>
                          <span className="font-bold text-foreground">{level.title}</span>
                          {level.free ? (
                            <span className="px-1.5 py-0.5 rounded text-xs bg-positive/10 text-positive border border-positive/20 font-medium">Grátis</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-gold/10 text-gold border border-gold/20 font-medium">
                              <Star className="w-2.5 h-2.5" />{level.badge}
                            </span>
                          )}
                        </div>

                        {/* Tópicos */}
                        <ul className="space-y-1 mb-3">
                          {level.topics.map((t) => (
                            <li key={t} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <span className={`mt-0.5 ${level.color}`}>▸</span>
                              {t}
                            </li>
                          ))}
                        </ul>

                        {/* Outcome */}
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-background/40 border border-border/20">
                          <CheckCircle className="w-3.5 h-3.5 text-positive shrink-0 mt-0.5" />
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            <strong className="text-foreground">Ao concluir:</strong> {level.outcome}
                          </p>
                        </div>
                      </div>

                      <Link href={level.href}>
                        <span className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium shrink-0 transition-opacity hover:opacity-80 ${
                          isUnlocked
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary/50 text-muted-foreground border border-border/50"
                        }`}>
                          {isUnlocked ? (
                            <><ArrowRight className="w-3.5 h-3.5" />Acessar</>
                          ) : (
                            <><Lock className="w-3.5 h-3.5" />{level.pts} pts</>
                          )}
                        </span>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* O que são mercados preditivos */}
      <section>
        <h2 className="text-lg font-bold text-foreground mb-4 flex items-center gap-2">
          <GitMerge className="w-5 h-5 text-primary" />
          O que são Mercados Preditivos
        </h2>
        <div className="p-5 rounded-xl border border-border/30 bg-secondary/10 space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Mercados preditivos são plataformas onde participantes compram e vendem contratos
            baseados em probabilidade de eventos futuros. Uma posição de "Sim" a R$0,65 implica
            probabilidade implícita de 65% para o evento ocorrer.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Diferente de apostas esportivas tradicionais, os preços são determinados pela
            negociação entre participantes — não pela casa. Isso cria ineficiências reais
            que modelos quantitativos podem detectar.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">No Brasil (2026):</strong> A B3 recebeu aprovação
            da CVM para operar mercados preditivos. A XP International fez parceria com a Kalshi.
            O mercado está sendo criado agora — junto com a regulamentação.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {PLATFORMS.map((p) => (
            <div key={p.name} className="p-4 rounded-xl border border-border/30 bg-secondary/5">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-foreground">{p.name}</span>
                <span className="px-2 py-0.5 rounded text-xs bg-primary/10 text-primary border border-primary/20">{p.tag}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Glossário */}
      <section>
        <h2 className="text-lg font-bold text-foreground mb-6 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          Glossário de Termos-Chave
        </h2>
        {/* Fonte ÚNICA (lib/glossario.ts) — a mesma que alimenta o <Termo> no resto
            do site. Antes esta lista tinha definições próprias e TÉCNICAS ("Brier:
            (1/n) Σ(previsão − resultado)²"), que é explicar com a mesma linguagem
            que confundiu. Agora a explicação simples vem primeiro e a definição
            exata fica embaixo, para quem quiser. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {VERBETES.map((item) => (
            <div key={item.termo} className="p-4 rounded-xl border border-border/30 bg-secondary/5">
              <p className="font-semibold text-sm text-foreground mb-1">{item.termo}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{item.simples}</p>
              {item.tecnico && (
                <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-2 pt-2 border-t border-border/30">
                  <span className="font-medium">Definição técnica:</span> {item.tecnico}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center py-8 border-t border-border/30">
        <p className="text-muted-foreground text-sm mb-6 max-w-xl mx-auto">
          O melhor momento para começar foi quando você fez sua primeira aposta sem calcular o EV.
          O segundo melhor momento é agora.
        </p>
        <Link href="/nivel/1">
          <span className="inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
            Começar pelo Nível 1 — grátis <ArrowRight className="w-4 h-4" />
          </span>
        </Link>
      </section>
    </div>
    </div>
  );
}
