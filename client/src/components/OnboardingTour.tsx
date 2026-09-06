/**
 * OnboardingTour — JLB Analytics
 * Tour de onboarding exibido uma única vez por dispositivo.
 */
import { useState } from "react";
import { MODEL_COUNT } from "@/lib/brand";
import { TrendingUp, Flame, Brain, Target, BookOpen, Search, X } from "lucide-react";

const STEPS = [
  {
    icon: TrendingUp,
    iconColor: "text-gold",
    title: "Bem-vindo ao JLB Analytics",
    description: "A plataforma de educação quantitativa para mercados preditivos do Brasil.",
    detail: "Polymarket, Kalshi, dados macro reais, IA adaptativa e 3.700+ artigos — tudo em um lugar.",
  },
  {
    icon: Flame,
    iconColor: "text-orange-400",
    title: "Mercados ao Vivo",
    description: "Acompanhe o que o mundo está negociando em tempo real.",
    detail: "Polymarket + Kalshi + Reddit — probabilidades, volume e análise de IA para cada mercado.",
  },
  {
    icon: Brain,
    iconColor: "text-purple-400",
    title: "Previsão Guiada por IA",
    description: "A IA detecta seu nível e escolhe o modelo econométrico certo.",
    detail: `Taylor Rule, Poisson, GARCH, Elo, Prospect Theory — ${MODEL_COUNT} modelos reais.`,
  },
  {
    icon: BookOpen,
    iconColor: "text-neon-blue",
    title: "5 Níveis de Educação",
    description: "Do Valor Esperado à Divergência Modelo vs. Mercado — no seu ritmo.",
    detail: "Níveis 1-3 gratuitos. Cada nível tem calculadoras interativas com dados reais.",
  },
  {
    icon: Target,
    iconColor: "text-positive",
    title: "Rastreie sua Calibração",
    description: "Salve previsões e descubra seu Brier Score real.",
    detail: "Dashboard com Skill Score, curva de calibração e sync em nuvem. Salve previsões direto da IA.",
  },
  {
    icon: Search,
    iconColor: "text-gold",
    title: "Busca Global (⌘K)",
    description: "Pressione Cmd+K (ou Ctrl+K) para buscar em qualquer lugar.",
    detail: "Navega por páginas, busca nos 3.700+ artigos do Cerebro e encontra qualquer mercado.",
  },
];

const STORAGE_KEY = "jlb_onboarding_v3";

export default function OnboardingTour() {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) == null;
    } catch {
      return false;
    }
  });
  const [step, setStep] = useState(0);

  function dismiss() {
    try { localStorage.setItem(STORAGE_KEY, "done"); } catch { /* private browsing */ }
    setVisible(false);
  }

  function handleNext() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }

  function handleBack() {
    if (step > 0) setStep((s) => s - 1);
  }

  if (!visible) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="relative max-w-md w-full glass-card rounded-2xl p-8">
        {/* Skip button */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          aria-label="Pular tour"
        >
          <X className="w-3.5 h-3.5" />
          Pular tour
        </button>

        {/* Icon */}
        <div className="w-16 h-16 rounded-2xl bg-secondary/30 flex items-center justify-center mb-6 mx-auto">
          <Icon className={`w-8 h-8 ${current.iconColor}`} aria-hidden="true" />
        </div>

        {/* Title */}
        <h2 className="text-xl font-bold text-center mb-2 text-[var(--titulo)]">{current.title}</h2>

        {/* Description */}
        <p className="text-sm text-center text-foreground/80 mb-2">{current.description}</p>

        {/* Detail */}
        <p className="text-xs text-center text-muted-foreground mb-8">{current.detail}</p>

        {/* Step dots */}
        <div className="flex justify-center gap-2 mb-6">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Passo ${i + 1}`}
              className={`rounded-full transition-all ${
                i === step
                  ? "w-6 h-2 bg-primary"
                  : "w-2 h-2 bg-secondary/50 hover:bg-secondary"
              }`}
            />
          ))}
        </div>

        {/* Navigation row */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={step === 0}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            Voltar
          </button>

          <span className="text-xs text-muted-foreground">
            {step + 1} / {STEPS.length}
          </span>

          <button
            onClick={handleNext}
            className="px-6 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {isLast ? "Começar" : "Próximo"}
          </button>
        </div>
      </div>
    </div>
  );
}
