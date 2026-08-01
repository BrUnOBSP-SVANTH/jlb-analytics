/**
 * Cards de resultado da Previsão Guiada — extraídos de pages/Previsao.tsx.
 */
import { useState } from "react";
import AnimatedSection from "@/components/AnimatedSection";
import {
  Brain, TrendingUp, TrendingDown, Clock, AlertCircle,
  ChevronDown, ChevronUp, BookOpen, Target, DollarSign,
  CheckCircle, Info, Lightbulb, FlaskConical,
  AlertTriangle, ArrowUpDown,
} from "lucide-react";
import type { PredictResult } from "./types";

const EXPERTISE_CONFIG = {
  leigo:        { label: "Linguagem acessível",  color: "bg-positive/10 text-positive border-positive/20",  icon: "🟢" },
  intermediario:{ label: "Nível intermediário",  color: "bg-gold/10 text-gold border-gold/20",               icon: "🟡" },
  avancado:     { label: "Modo avançado",         color: "bg-primary/10 text-primary border-primary/20",     icon: "🔵" },
} as const;

export function ExpertiseTag({ level }: { level: "leigo" | "intermediario" | "avancado" }) {
  const cfg = EXPERTISE_CONFIG[level];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <span>{cfg.icon}</span> {cfg.label}
    </span>
  );
}

export function ConfidenceBar({ value, label }: { value: number; label: string }) {
  const color = value >= 70 ? "bg-positive" : value >= 50 ? "bg-gold" : "bg-negative";
  return (
    <div>
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="font-mono font-bold text-foreground">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary/40 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ModelCard({ result }: { result: PredictResult }) {
  const level = result.expertiseLevel ?? "intermediario";
  const isAdvanced = level === "avancado";
  const [formulaOpen, setFormulaOpen] = useState(isAdvanced);
  const [assumptionsOpen, setAssumptionsOpen] = useState(false);

  return (
    <AnimatedSection>
      <div className="glass-card rounded-2xl overflow-hidden">

        {/* Header */}
        <div className="p-6 border-b border-border/20">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <FlaskConical className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Modelo selecionado</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                  {result.modelFamily}
                </span>
                <ExpertiseTag level={level} />
              </div>
              <h3 className="text-lg font-bold text-foreground">{result.modelChosen}</h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{result.whyThisModel}</p>
            </div>
          </div>
        </div>

        {/* Analogia — para leigos fica proeminente, para avançados fica como paralelo histórico */}
        {result.analogyExplanation && (
          <div className={`px-6 py-4 border-b border-border/20 ${level === "leigo" ? "bg-gold/5" : "bg-secondary/5"}`}>
            <div className="flex items-start gap-2">
              <Lightbulb className={`w-4 h-4 shrink-0 mt-0.5 ${level === "leigo" ? "text-gold" : "text-neon-blue"}`} />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 font-medium">
                  {level === "avancado" ? "Paralelo histórico" : level === "leigo" ? "Em outras palavras" : "Contexto"}
                </p>
                <p className="text-sm text-foreground leading-relaxed">{result.analogyExplanation}</p>
              </div>
            </div>
          </div>
        )}

        {/* Probabilidade verbal — destaque para leigos */}
        {result.probabilityVerbal && level === "leigo" && (
          <div className="px-6 py-4 border-b border-border/20 bg-primary/5">
            <div className="flex items-center gap-3">
              <Target className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5 font-medium">Avaliação do modelo</p>
                <p className="text-base font-bold text-foreground">{result.probabilityVerbal}</p>
              </div>
            </div>
          </div>
        )}

        {/* Fórmula — aberta por padrão para avançados */}
        <div className="border-b border-border/20">
          <button
            onClick={() => setFormulaOpen((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-3.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-2 font-medium">
              <BookOpen className="w-4 h-4 text-gold" />
              {level === "leigo" ? "Curiosidade: ver a matemática por trás" : "Fórmula matemática"}
              {isAdvanced && <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 ml-1">Paper citado</span>}
            </span>
            {formulaOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {formulaOpen && (
            <div className="px-6 pb-5 space-y-3">
              <div className="p-4 rounded-xl bg-obsidian/60 border border-border/30">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Fórmula</p>
                <p className="font-mono text-sm text-gold leading-relaxed whitespace-pre-wrap">{result.formula}</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">Base de pesquisa:</span> {result.researchBasis}
              </p>
            </div>
          )}
        </div>

        {/* Premissas */}
        <div className="border-b border-border/20">
          <button
            onClick={() => setAssumptionsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-6 py-3.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-2 font-medium">
              <Info className="w-4 h-4 text-neon-blue" />
              {level === "leigo" ? "O que o modelo assume" : "Premissas e limitações"}
            </span>
            {assumptionsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {assumptionsOpen && (
            <div className="px-6 pb-5 space-y-3">
              <div className="space-y-1.5">
                {result.keyAssumptions.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-neon-blue shrink-0 mt-0.5" />
                    {a}
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-negative/5 border border-negative/20">
                <AlertCircle className="w-3.5 h-3.5 text-negative shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground"><strong className="text-foreground">Limitação:</strong> {result.limitations}</p>
              </div>
            </div>
          )}
        </div>

        {/* Confiança por horizonte */}
        <div className="px-6 py-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
              {level === "leigo" ? "Quão segura é essa previsão?" : "Grau de confiança por horizonte"}
            </p>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 font-medium">estimativa do modelo</span>
          </div>
          <ConfidenceBar value={result.confidenceShort}  label="Curto prazo"  />
          <ConfidenceBar value={result.confidenceMedium} label="Médio prazo"  />
          <ConfidenceBar value={result.confidenceLong}   label="Longo prazo"  />
          {result.historicalParallel && level !== "leigo" && (
            <div className="flex items-start gap-2 pt-1 p-3 rounded-lg bg-neon-blue/5 border border-neon-blue/15">
              <TrendingUp className="w-3.5 h-3.5 text-neon-blue shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{result.historicalParallel}</p>
            </div>
          )}
          <div className="flex items-start gap-1.5 pt-1">
            <AlertCircle className="w-3 h-3 text-muted-foreground/50 shrink-0 mt-0.5" />
            <p className="text-[10px] text-muted-foreground/70">
              {level === "leigo"
                ? "Esses percentuais mostram o quanto o modelo tem certeza — nenhum modelo é perfeito. Use isso como referência, não como verdade absoluta."
                : "Estimativas do modelo econométrico — não são probabilidades empiricamente calibradas. Registre suas previsões no Dashboard para calibração real."}
            </p>
          </div>
        </div>
      </div>
    </AnimatedSection>
  );
}

// ── Superforecaster Protocol Card ─────────────────────────────────────────────

export function SuperforecasterCard({ result }: { result: PredictResult }) {
  const [open, setOpen] = useState(false);
  const hasData = result.referenceClass || (result.decomposition && result.decomposition.length > 0);
  if (!hasData) return null;

  const baseRate    = result.baseRate ?? null;
  const finalProb   = result.confidenceMedium;
  const adjustment  = baseRate !== null ? finalProb - baseRate : null;

  return (
    <AnimatedSection>
      <div className="glass-card rounded-xl border border-neon-blue/20 overflow-hidden">
        {/* Header toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 hover:bg-secondary/10 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-neon-blue/10 flex items-center justify-center shrink-0">
            <ArrowUpDown className="w-4 h-4 text-neon-blue" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Protocolo Superforecaster</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Visão externa → Decomposição → Ajuste → Síntese
            </p>
          </div>
          <span className="text-xs text-muted-foreground/50">
            {open ? "Fechar" : "Ver raciocínio"}
          </span>
        </button>

        {open && (
          <div className="px-5 pb-5 space-y-5 border-t border-border/20">

            {/* Etapa 1 — Classe de Referência */}
            {result.referenceClass && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-neon-blue/70 uppercase tracking-wider mt-4">
                  Etapa 1 — Visão Externa (Base Rate)
                </p>
                <div className="p-3 rounded-lg bg-neon-blue/5 border border-neon-blue/15">
                  <p className="text-xs text-muted-foreground leading-relaxed">{result.referenceClass}</p>
                  {baseRate !== null && (
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex-1">
                        <p className="text-[10px] text-muted-foreground/60 mb-1">Frequência base histórica</p>
                        <div className="h-2 bg-secondary/40 rounded-full overflow-hidden">
                          <div className="h-full bg-neon-blue/50 rounded-full" style={{ width: `${baseRate}%` }} />
                        </div>
                      </div>
                      <span className="text-lg font-mono font-bold text-neon-blue shrink-0">{baseRate}%</span>
                    </div>
                  )}
                  {result.baseRateSource && (
                    <p className="text-[10px] text-muted-foreground/50 mt-1">Fonte: {result.baseRateSource}</p>
                  )}
                </div>
              </div>
            )}

            {/* Etapa 2 — Decomposição de Fermi */}
            {result.decomposition && result.decomposition.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gold/70 uppercase tracking-wider">
                  Etapa 2 — Decomposição de Fermi
                </p>
                <div className="space-y-2">
                  {result.decomposition.map((item, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gold/5 border border-gold/15">
                      <span className="text-[11px] font-mono font-bold text-gold shrink-0 mt-0.5 w-8 text-right">{item.probability}%</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{item.question}</p>
                        {item.reasoning && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{item.reasoning}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Etapa 3 — Ajuste (Visão Interna) */}
            {((result.insideViewUp && result.insideViewUp.length > 0) || (result.insideViewDown && result.insideViewDown.length > 0)) && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                  Etapa 3 — Visão Interna (Ajustes)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {result.insideViewUp && result.insideViewUp.length > 0 && (
                    <div className="p-3 rounded-lg bg-positive/5 border border-positive/15 space-y-1.5">
                      <p className="text-[10px] font-semibold text-positive flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Aumenta a probabilidade
                      </p>
                      {result.insideViewUp.map((f, i) => (
                        <p key={i} className="text-[11px] text-muted-foreground">• {f}</p>
                      ))}
                    </div>
                  )}
                  {result.insideViewDown && result.insideViewDown.length > 0 && (
                    <div className="p-3 rounded-lg bg-negative/5 border border-negative/15 space-y-1.5">
                      <p className="text-[10px] font-semibold text-negative flex items-center gap-1">
                        <TrendingDown className="w-3 h-3" /> Diminui a probabilidade
                      </p>
                      {result.insideViewDown.map((f, i) => (
                        <p key={i} className="text-[11px] text-muted-foreground">• {f}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Etapa 4 — Síntese */}
            {adjustment !== null && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                  Etapa 4 — Síntese
                </p>
                <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/20 border border-border/20">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Base rate</p>
                    <p className="text-xl font-mono font-bold text-muted-foreground">{baseRate}%</p>
                  </div>
                  <div className={`text-center px-3 py-1 rounded-lg ${adjustment >= 0 ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>
                    <p className="text-xs">Ajuste</p>
                    <p className="text-sm font-mono font-bold">{adjustment >= 0 ? "+" : ""}{adjustment.toFixed(1)}pp</p>
                  </div>
                  <div className="text-[10px] text-muted-foreground/50">=</div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Final</p>
                    <p className="text-xl font-mono font-bold text-primary">{finalProb}%</p>
                  </div>
                  {result.confidenceLow80 != null && result.confidenceHigh80 != null && (
                    <div className="ml-auto text-center">
                      <p className="text-[10px] text-muted-foreground">IC 80%</p>
                      <p className="text-xs font-mono text-foreground">[{result.confidenceLow80}%–{result.confidenceHigh80}%]</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Quando atualizar */}
            {result.updateTriggers && result.updateTriggers.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                  Quando atualizar esta previsão
                </p>
                <div className="space-y-1">
                  {result.updateTriggers.map((t, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                      <Info className="w-3 h-3 text-primary shrink-0 mt-0.5" /> {t}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Warning de calibração */}
            {result.calibrationWarning && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/5 border border-yellow-500/20">
                <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">{result.calibrationWarning}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </AnimatedSection>
  );
}

export function PredictionTimeline({ result }: { result: PredictResult }) {
  const cards = [
    {
      horizon: "Curto Prazo", desc: "dias a semanas",
      prediction: result.shortTermPrediction,
      confidence: result.confidenceShort,
      color: result.confidenceShort >= 65 ? "border-positive/30 bg-positive/5" : "border-yellow-500/30 bg-yellow-500/5",
      iconColor: result.confidenceShort >= 65 ? "text-positive" : "text-yellow-500",
    },
    {
      horizon: "Médio Prazo", desc: "1 a 6 meses",
      prediction: result.mediumTermPrediction,
      confidence: result.confidenceMedium,
      color: result.confidenceMedium >= 65 ? "border-primary/30 bg-primary/5" : "border-yellow-500/30 bg-yellow-500/5",
      iconColor: result.confidenceMedium >= 65 ? "text-primary" : "text-yellow-500",
    },
    {
      horizon: "Longo Prazo", desc: "6 meses a 5 anos",
      prediction: result.longTermPrediction,
      confidence: result.confidenceLong,
      color: result.confidenceLong >= 55 ? "border-neon-blue/30 bg-neon-blue/5" : "border-border/30 bg-secondary/10",
      iconColor: result.confidenceLong >= 55 ? "text-neon-blue" : "text-muted-foreground",
    },
  ];

  return (
    <AnimatedSection>
      <div className="space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" /> Previsões por horizonte temporal
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cards.map((c) => (
            <div key={c.horizon} className={`rounded-xl border p-5 ${c.color}`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs font-bold text-foreground">{c.horizon}</p>
                  <p className="text-[10px] text-muted-foreground">{c.desc}</p>
                </div>
                <span className={`text-xs font-bold font-mono ${c.iconColor}`}>{c.confidence}%</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{c.prediction}</p>
            </div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
}

export function PlainLanguageCard({ result }: { result: PredictResult }) {
  const level = result.expertiseLevel ?? "intermediario";

  const titles = {
    leigo:        { main: "O que isso significa para você",   action: "O que fazer agora" },
    intermediario:{ main: "Interpretação da análise",         action: "Aplicação prática" },
    avancado:     { main: "Síntese analítica",                action: "Implicações operacionais" },
  } as const;
  const t = titles[level];

  return (
    <AnimatedSection>
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-gold" />
          <h3 className="font-semibold text-foreground">{t.main}</h3>
          {level !== "leigo" && <span className="text-[10px] text-muted-foreground ml-auto">análise quantitativa</span>}
        </div>

        {/* Bloco principal — tom adapta ao nível */}
        <div className={`p-4 rounded-xl border ${level === "leigo" ? "bg-gold/5 border-gold/20" : "bg-primary/5 border-primary/10"}`}>
          <p className="text-sm text-foreground leading-relaxed">{result.plainLanguage}</p>
        </div>

        {/* Paralelo histórico para leigos (vem do campo historicalParallel) */}
        {result.historicalParallel && level === "leigo" && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-neon-blue/5 border border-neon-blue/15">
            <Clock className="w-4 h-4 text-neon-blue shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Já aconteceu antes?</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{result.historicalParallel}</p>
            </div>
          </div>
        )}

        {/* Ação */}
        <div className="p-4 rounded-xl bg-secondary/10 border border-border/20">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-medium">{t.action}</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{result.actionableInsight}</p>
        </div>

        {/* Bankroll */}
        {result.bankrollImpact && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-neon-blue/5 border border-neon-blue/20">
            <DollarSign className="w-4 h-4 text-neon-blue shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-foreground mb-1">Impacto no seu patrimônio</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{result.bankrollImpact}</p>
            </div>
          </div>
        )}

        <div className="p-3 rounded-lg bg-secondary/10 border border-border/10">
          <p className="text-[10px] text-muted-foreground">
            {level === "leigo"
              ? "Esta análise é educacional. Nenhum modelo prevê o futuro com certeza — use como ferramenta de apoio, não como verdade definitiva."
              : "Análise educacional. O modelo tem limitações documentadas e premissas que podem não se verificar. Decisão de investimento ou aposta é sempre responsabilidade do usuário."}
          </p>
        </div>
      </div>
    </AnimatedSection>
  );
}

// ── Superforecaster Guide ─────────────────────────────────────────────────────

export const SF_STEPS = [
  {
    step: "01",
    title: "Visão Externa — Base Rate",
    color: "text-neon-blue",
    bg: "bg-neon-blue/5",
    border: "border-neon-blue/20",
    desc: "Antes de qualquer análise específica: em situações SIMILARES, com que frequência isso acontece?",
    example: "\"Partidos de oposição vencem incumbentes em 42% das eleições presidenciais em democracias consolidadas\" — esta é sua âncora.",
    icon: "📊",
  },
  {
    step: "02",
    title: "Decomposição de Fermi",
    color: "text-gold",
    bg: "bg-gold/5",
    border: "border-gold/20",
    desc: "Quebre a pergunta em partes menores. Cada pedaço tem uma probabilidade mais fácil de estimar.",
    example: "P(Brasil campeão) = P(sair do grupo) × P(quartas) × P(semi) × P(final) = 0.92 × 0.60 × 0.50 × 0.45 ≈ 12%",
    icon: "🔢",
  },
  {
    step: "03",
    title: "Visão Interna — Ajuste",
    color: "text-positive",
    bg: "bg-positive/5",
    border: "border-positive/20",
    desc: "O que torna ESTE caso diferente da base? Ajuste o número para cima ou para baixo com evidências concretas.",
    example: "Base 42% + Economia crescendo +5pp + Aprovação alta +3pp − Candidato fraco −7pp = 43%",
    icon: "⚖️",
  },
  {
    step: "04",
    title: "Calibração Final",
    color: "text-purple-400",
    bg: "bg-purple-400/5",
    border: "border-purple-400/20",
    desc: "Estou sendo influenciado por vieses? Disponibilidade, ancoragem, excesso de confiança?",
    example: "Superforecasters perguntam: \"O que precisaria ser verdadeiro para eu estar errado?\" Se não consegue responder, está enviesado.",
    icon: "🧠",
  },
];

