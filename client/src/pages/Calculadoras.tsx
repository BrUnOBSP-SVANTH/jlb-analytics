/**
 * Calculadoras — JLB Analytics
 * Ferramentas quantitativas para mercados preditivos com guia educacional completo.
 */
import { useState, useRef } from "react";
import { type LucideIcon } from "lucide-react";
import { awardPoints } from "@/lib/userProgress";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import LaboratorioTabs from "@/components/LaboratorioTabs";
import {
  Calculator, Percent, Target, TrendingUp, BookOpen, GitCompare,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { ToolIntro } from "@/components/calculadoras/CalcPrimitives";
import { ValorEsperado } from "@/components/calculadoras/ValorEsperado";
import { OverroundCalc } from "@/components/calculadoras/OverroundCalc";
import { BrierScoreCalc } from "@/components/calculadoras/BrierScoreCalc";
import { KellyCalc } from "@/components/calculadoras/KellyCalc";
import { GuiaModelos } from "@/components/calculadoras/GuiaModelos";
import { CorrelacaoTab } from "@/components/calculadoras/CorrelacaoTab";

type CalcTab = "ev" | "overround" | "brier" | "kelly" | "correlacao" | "guia";

// ─── Main ────────────────────────────────────────────────────────────────────

const CALC_LABELS: Partial<Record<CalcTab, string>> = {
  ev:          "Usou calculadora de Valor Esperado",
  overround:   "Usou calculadora de Overround",
  brier:       "Usou calculadora de Brier Score",
  kelly:       "Usou calculadora de Kelly",
  correlacao:  "Usou calculadora de Correlação",
};

export default function Calculadoras() {
  useSEO("Calculadoras Quantitativas", "Valor Esperado, Critério de Kelly, Overround e Brier Score — calculadoras educacionais com dados reais para operar com método.");
  const [tab, setTab] = useState<CalcTab>("guia");
  const awardedTabs = useRef<Set<CalcTab>>(new Set());

  function switchTab(next: CalcTab) {
    if (next !== "guia" && !awardedTabs.current.has(next)) {
      awardedTabs.current.add(next);
      awardPoints("calculator_used", CALC_LABELS[next]!);
    }
    setTab(next);
  }

  const tabs: { id: CalcTab; label: string; icon: LucideIcon }[] = [
    { id: "guia",        label: "Guia de Modelos",  icon: BookOpen   },
    { id: "ev",          label: "Valor Esperado",   icon: Calculator },
    { id: "overround",   label: "Overround",        icon: Percent    },
    { id: "brier",       label: "Brier Score",      icon: Target     },
    { id: "kelly",       label: "Kelly",            icon: TrendingUp },
    { id: "correlacao",  label: "Correlação",       icon: GitCompare },
  ];

  const introMap: Record<Exclude<CalcTab, "guia" | "correlacao">, React.ReactNode> = {
    ev: (
      <ToolIntro icon={Calculator}
        tagline="Descubra se uma posição vale a pena matematicamente antes de entrar."
        description="O Valor Esperado (EV) responde: se você tomasse esta posição mil vezes, lucraria ou perderia? Uma posição pode ter 70% de chance de dar certo e ainda assim ser um mau negócio — depende da odd. Use no Polymarket comparando a probabilidade do mercado com a sua estimativa."
        example="Odd 1.8 com 60% de chance real → EV = +8% por posição. Matematicamente favorável no longo prazo."
        accuracy={{ label: "Precisão", value: "100% (matemático)", color: "text-positive border-positive/30 bg-positive/10" }} />
    ),
    overround: (
      <ToolIntro icon={Percent}
        tagline="Veja quanto a casa está cobrando e calcule as odds que você realmente merece."
        description="Toda casa embutiu uma margem nas odds para garantir lucro independente do resultado. O Overround mostra esse valor — e as 'fair odds' revelam a odd justa sem taxa. Polymarket e Kalshi têm ~1–3% de overround; casas esportivas tradicionais cobram 5–10%."
        example="Odds 1.90/1.90 → overround 5.3% → fair odds seriam 2.0/2.0. A casa já embolsou 5.3%."
        accuracy={{ label: "Precisão", value: "100% (matemático)", color: "text-positive border-positive/30 bg-positive/10" }} />
    ),
    brier: (
      <ToolIntro icon={Target}
        tagline="Meça se suas previsões são boas de verdade — não só se você acertou."
        description="Taxa de acerto engana. O Brier Score mede calibração: se você diz 70%, isso acontece 70% das vezes? Superforecasters do Good Judgment Project têm BS < 0.10. Compare sua calibração com o mercado usando o histórico de probabilidades do Polymarket."
        example="Polymarket tinha 60% em evento que aconteceu (erro² = 0.16). Você tinha 80% (erro² = 0.04). Você estava melhor calibrado."
        accuracy={{ label: "Benchmark GJP", value: "BS < 0.10", color: "text-neon-blue border-neon-blue/30 bg-neon-blue/10" }} />
    ),
    kelly: (
      <ToolIntro icon={TrendingUp}
        tagline="Saiba exatamente quanto pôr para crescer sem risco de ruína."
        description="Kelly calcula o tamanho ótimo que maximiza o crescimento do bankroll. Passar do Kelly aumenta a chance de ruína exponencialmente. Profissionais usam ½ Kelly para proteger contra erros de estimativa. Combine com EV+ para entrar apenas em posições com vantagem matemática."
        example="Edge de +15pp com odd 1.67 (Polymarket a 60%, você estima 75%) → Kelly ≈ 37% → use ½ Kelly ≈ 18%."
        accuracy={{ label: "Prova matemática", value: "Shannon/Kelly 1956", color: "text-gold border-gold/30 bg-gold/10" }} />
    ),
  };

  return (
    <div>
      <LaboratorioTabs />
      <PageHeader
        title="Calculadoras Quantitativas"
        subtitle="Ferramentas para Valor Esperado, Overround, Brier Score e Kelly — com guia completo de uso em mercados preditivos."
        badge="Ferramentas"
      />

      <div className="container py-10">
        <AnimatedSection>
          <div className="flex flex-wrap gap-2 mb-8" role="tablist" aria-label="Tipo de calculadora">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => switchTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="w-4 h-4" aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>
        </AnimatedSection>

        {tab === "guia"       && <GuiaModelos />}
        {tab === "correlacao" && <CorrelacaoTab />}
        {tab !== "guia" && tab !== "correlacao" && (
          <>
            {introMap[tab]}
            {tab === "ev"        && <ValorEsperado />}
            {tab === "overround" && <OverroundCalc />}
            {tab === "brier"     && <BrierScoreCalc />}
            {tab === "kelly"     && <KellyCalc />}
          </>
        )}
      </div>
    </div>
  );
}
