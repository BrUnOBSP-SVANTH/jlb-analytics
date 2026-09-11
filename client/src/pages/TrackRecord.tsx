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
import { ResultComparator } from "@/components/previsao/GuideAndTrackRecord";
import { ShareCard } from "@/components/previsao/ShareCard";
import { ProviderBreakdown } from "@/components/previsao/ProviderBreakdown";
import { VereditoTrackRecord } from "@/components/previsao/VereditoTrackRecord";
import { Termo } from "@/components/Termo";
import { CurvaCalibracao } from "@/components/previsao/CurvaCalibracao";
import { PorTema } from "@/components/previsao/PorTema";
import { Evolucao } from "@/components/previsao/Evolucao";
import { AmostraHonesta } from "@/components/previsao/AmostraHonesta";
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
      {/* Compacto: o hero desta página é o PLACAR, e não o título. Com o
          tratamento cheio — 56px de respiro e a grade decorativa — o cabeçalho
          competia com os dois números que a página existe para mostrar. E o
          badge "PROVA DE VALOR · VERIFICADO" em caixa alta era exatamente o
          eyebrow que a própria prova torna desnecessário. */}
      <PageHeader
        compacto
        title="Nosso track record"
        subtitle="A precisão da nossa IA medida contra o resultado que a plataforma liquidou de verdade, lado a lado com o mercado."
      />

      <div className="container py-10 max-w-4xl">
        {/*
          A ORDEM É O DESENHO.

          A página tinha doze blocos empilhados com o mesmo tratamento — mesma
          borda, mesmo raio, ícone pequeno, título pequeno — em 6.400px de
          altura. O placar pesava igual à seção "como medimos", e o card de
          compartilhar vinha ANTES de o leitor ter visto prova nenhuma.

          A sequência agora é um argumento, e cada passo responde à objeção que o
          anterior levanta:

            1. o veredito       — o que os números dizem, incluindo onde perdemos
            2. por que confiar  — a amostra não foi escolhida a dedo
            3. a calibração     — prometemos 70%, aconteceu quanto?
            4. por tema         — onde temos evidência e onde não temos
            5. estamos melhorando?
            6. de qual modelo veio o número
            7. caso a caso      — confira você mesmo
            8. o método
            9. compartilhe      — agora que já há o que compartilhar
        */}

        {/* 1. O VEREDITO — e o erro antes do acerto. */}
        <VereditoTrackRecord />

        {/* A tese, em prosa, sem moldura de card: é texto de abertura, não um
            widget. A moldura fazia dela mais um bloco entre doze iguais. */}
        <AnimatedSection>
          <div className="max-w-2xl mb-12">
            <p className="text-base text-muted-foreground leading-relaxed">
              A internet está cheia de quem <span className="text-foreground">acerta o passado</span> — mostra
              só os ganhos e esconde as perdas. Aqui é o contrário:{" "}
              <span className="text-foreground">toda</span> previsão da nossa IA é registrada com antecedência
              e depois confrontada com o que a plataforma{" "}
              <span className="text-foreground">liquidou de verdade</span>. O que vem abaixo é auditável e
              atualiza sozinho conforme os mercados fecham.
            </p>
          </div>
        </AnimatedSection>

        <div className="space-y-12">
          {/* 2. A amostra não foi escolhida a dedo. */}
          <AnimatedSection><AmostraHonesta /></AnimatedSection>

          {/* 3. Prometemos 70% — aconteceu quanto? */}
          <AnimatedSection><CurvaCalibracao /></AnimatedSection>

          {/* 4. Onde temos evidência, por assunto.
               UMA tabela por tema, e não duas: `AccuracyAnalysis` e `PorTema`
               listavam os MESMOS temas, um embaixo do outro, com os mesmos
               nomes desde que a taxonomia foi unificada (TRK-04). Duas tabelas
               iguais na mesma página não são duas provas — são uma prova e uma
               dúvida sobre qual delas ler. */}
          <AnimatedSection><PorTema /></AnimatedSection>

          {/* 5. Estamos melhorando? */}
          <AnimatedSection><Evolucao /></AnimatedSection>

          {/* 6. De qual modelo veio o número. */}
          <AnimatedSection><ProviderBreakdown /></AnimatedSection>

          {/* 7. Confira caso a caso. */}
          <ResultComparator limit={12} />

          {/* 8. O método, aberto. */}
          <AnimatedSection>
            <div>
              <h2 className="text-lg font-display font-semibold text-[var(--titulo)] mb-1">
                Como medimos
              </h2>
              <p className="text-sm text-muted-foreground mb-5 max-w-2xl">
                O método inteiro, aberto — para você poder discordar dele.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                {METHOD.map((m) => (
                  <div key={m.title}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <m.icon className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-foreground">{m.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{m.desc}</p>
                  </div>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-6 leading-relaxed max-w-3xl">
                Duas métricas: <span className="text-foreground/80">taxa de acerto</span> (previu o lado
                certo, sim ou não) e <span className="text-foreground/80"><Termo nome="brier">Brier Score</Termo></span>{" "}
                (o quão perto a probabilidade esteve do resultado; menor é melhor). Os selos{" "}
                <span className="text-positive">oficial</span> e{" "}
                <span className="text-muted-foreground">inferido</span> no comparador mostram a procedência
                de cada resolução.
              </p>
            </div>
          </AnimatedSection>

          {/* 9. Agora sim: compartilhe. Antes este card vinha logo após a tese —
               pedia para compartilhar uma prova que o leitor ainda não tinha
               visto. */}
          <ShareCard />
        </div>

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
