/**
 * TrackRecord — Prova de Valor pública do JLB Analytics.
 *
 * A credibilidade é o fosso: num mercado cheio de "palpite de guru" sem prova,
 * aqui mostramos, de forma AUDITÁVEL e sem cherry-picking, a precisão da IA JLB
 * medida contra o resultado que a plataforma (Polymarket/Kalshi) liquidou de
 * verdade — lado a lado com o próprio mercado. Reusa os componentes já provados
 * (AiTrackRecord, ResultComparator) e os enquadra com a tese e o método.
 */
import { Link } from "wouter";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import { AiTrackRecord, ResultComparator } from "@/components/previsao/GuideAndTrackRecord";
import { AccuracyAnalysis } from "@/components/previsao/AccuracyAnalysis";
import { ShareCard } from "@/components/previsao/ShareCard";
import { ProviderBreakdown } from "@/components/previsao/ProviderBreakdown";
import MarginOfError from "@/components/MarginOfError";
import { Termo } from "@/components/Termo";
import {
  ShieldCheck, ClipboardList, Scale, Layers, ArrowRight, Sparkles, BookOpen,
} from "lucide-react";

const METHOD = [
  {
    icon: ClipboardList,
    title: "Registramos ANTES",
    desc: "Cada previsão da IA é gravada com data e fair value antes do mercado resolver. Nada é editado depois — o histórico é imutável.",
  },
  {
    icon: ShieldCheck,
    title: "Comparamos com o resultado REAL",
    desc: "Quando o mercado liquida na plataforma (o mesmo settlement que paga as posições — Kalshi ‘result’, Polymarket UMA), cruzamos o que dissemos com o que aconteceu.",
  },
  {
    icon: Layers,
    title: "Sem cherry-picking",
    desc: "TODAS as previsões entram na conta, não só os acertos. Só exibimos os números a partir de 20 resolvidas — abaixo disso é ruído estatístico, não evidência.",
  },
  {
    icon: Scale,
    title: "IA vs. mercado, lado a lado",
    desc: "Mostramos a nossa nota E a do mercado no mesmo conjunto. Se o mercado estiver mais calibrado, você vê — é uma comparação honesta, não propaganda.",
  },
];

export default function TrackRecord() {
  useSEO(
    "Track Record verificado — a precisão da IA JLB vs. o mercado",
    "Prova auditável e sem cherry-picking: cada previsão da IA JLB confrontada com o resultado que a plataforma liquidou de verdade, lado a lado com o próprio mercado.",
  );

  return (
    <div>
      <PageHeader
        title="Nosso Track Record"
        subtitle="A precisão da IA JLB, medida contra o resultado REAL que a plataforma liquidou — lado a lado com o mercado, sem cherry-picking. Transparência total."
        badge="Prova de valor · verificado"
      />

      <div className="container py-10 space-y-6 max-w-4xl">
        {/* Margem de erro em destaque — a honestidade é a tese da página */}
        <MarginOfError />

        {/* ── Tese ── */}
        <AnimatedSection>
          <div className="glass-card rounded-2xl p-6 border border-positive/20 bg-positive/[0.03]">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-5 h-5 text-positive shrink-0" />
              <p className="text-sm font-semibold text-foreground">Por que isto importa</p>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A internet está cheia de quem <span className="text-foreground">acerta o passado</span> — mostra só os
              ganhos e esconde as perdas. Aqui é o contrário: <span className="text-foreground font-medium">toda</span>{" "}
              previsão da nossa IA é registrada com antecedência e depois confrontada com o que a plataforma{" "}
              <span className="text-foreground font-medium">liquidou de verdade</span>. O resultado abaixo é auditável e
              atualiza sozinho conforme os mercados fecham. Se a IA erra, aparece. É essa honestidade que separa
              educação de palpite.
            </p>
          </div>
        </AnimatedSection>

        {/* ── Números verificados (card já provado) ── */}
        <AiTrackRecord />

        {/* ── De qual modelo veio o número (a manchete soma provedores diferentes) ── */}
        <AnimatedSection>
          <ProviderBreakdown />
        </AnimatedSection>

        {/* ── Ferramenta de análise: onde a IA tem edge, por tema (métricas honestas) ── */}
        <AccuracyAnalysis />

        {/* ── Comparador caso a caso ── */}
        <ResultComparator limit={12} />

        {/* ── Card compartilhável (prova → aquisição) ── */}
        <ShareCard />

        {/* ── Como medimos (transparência do método) ── */}
        <AnimatedSection>
          <div className="panel p-6">
            <div className="flex items-center gap-2 mb-4">
              <Scale className="w-4 h-4 text-neon-blue shrink-0" />
              <p className="text-sm font-semibold text-foreground">Como medimos — o método, aberto</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {METHOD.map((m) => (
                <div key={m.title} className="p-4 rounded-xl border border-border/20 bg-secondary/10">
                  <div className="flex items-center gap-2 mb-1.5">
                    <m.icon className="w-4 h-4 text-primary/70 shrink-0" />
                    <p className="text-xs font-semibold text-foreground">{m.title}</p>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{m.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-4 leading-relaxed">
              Métricas: <span className="text-foreground/80">taxa de acerto</span> (previu o lado certo, SIM/NÃO) e{" "}
              <span className="text-foreground/80"><Termo nome="brier">Brier Score</Termo></span> (calibração fina — quão perto a probabilidade
              esteve do resultado; menor é melhor). Estamos migrando 100% da resolução para o settlement oficial da
              plataforma — os selos <span className="text-positive/80">oficial</span> vs.{" "}
              <span className="text-muted-foreground">inferido</span> no comparador mostram a procedência de cada uma.
            </p>
          </div>
        </AnimatedSection>

        {/* ── CTA ── */}
        <AnimatedSection>
          <div className="glass-card rounded-2xl p-6 text-center">
            <p className="text-base font-semibold text-foreground mb-1.5">Faça sua própria previsão calibrada</p>
            <p className="text-xs text-muted-foreground mb-5 max-w-lg mx-auto leading-relaxed">
              A mesma IA que você acabou de auditar te guia pelo protocolo dos Superforecasters — e o método por trás
              dela é ensinado passo a passo, de graça.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href="/previsao">
                <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity cursor-pointer">
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  Fazer previsão guiada
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </span>
              </Link>
              <Link href="/educacao">
                <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border/40 text-sm font-medium text-foreground/80 hover:text-foreground hover:border-primary/40 transition-colors cursor-pointer">
                  <BookOpen className="w-4 h-4" aria-hidden="true" />
                  Aprender o método
                </span>
              </Link>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </div>
  );
}
