/**
 * Previsão Guiada por IA — JLB Analytics
 *
 * O usuário descreve o que quer prever. A IA seleciona autonomamente o modelo
 * econométrico/matemático mais adequado, mostra a fórmula, produz previsão em
 * curto/médio/longo prazo e traduz tudo em linguagem acessível.
 *
 * Endpoint: POST /api/ai/model-predict
 */

import { useState, useEffect } from "react";
import PageHeader from "@/components/PageHeader";
import AnimatedSection from "@/components/AnimatedSection";
import { useSEO } from "@/hooks/useSEO";
import AnaliseTabs from "@/components/AnaliseTabs";
import KlementSection from "@/components/KlementSection";
import { supabase } from "@/lib/supabase";
import {
  Brain, Zap, TrendingUp, TrendingDown, Clock, BarChart2, AlertCircle,
  ChevronDown, ChevronUp, BookOpen, Target, DollarSign,
  CheckCircle, Info, Loader2, Lightbulb, FlaskConical, Trophy,
  AlertTriangle, ArrowUpDown,
} from "lucide-react";
import { awardPoints } from "@/lib/userProgress";
import { addPrediction } from "@/lib/predictions";
import { syncOne } from "@/lib/predictionsSync";
import { useAuth } from "@/contexts/AuthContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type Domain = "sports" | "economy" | "energy" | "politics" | "science" | "crypto" | "finance" | "climate";
type Horizon = "short" | "medium" | "long";

interface DecompositionItem {
  question: string;
  probability: number;
  reasoning: string;
}

interface PredictResult {
  modelChosen: string;
  modelFamily: string;
  formula: string;
  whyThisModel: string;
  shortTermPrediction: string;
  mediumTermPrediction: string;
  longTermPrediction: string;
  confidenceShort: number;
  confidenceMedium: number;
  confidenceLong: number;
  confidenceLow80?: number;
  confidenceHigh80?: number;
  plainLanguage: string;
  bankrollImpact: string | null;
  keyAssumptions: string[];
  limitations: string;
  researchBasis: string;
  actionableInsight: string;
  expertiseLevel?: "leigo" | "intermediario" | "avancado";
  analogyExplanation?: string;
  probabilityVerbal?: string;
  historicalParallel?: string;
  // Protocolo Superforecaster
  referenceClass?: string;
  baseRate?: number;
  baseRateSource?: string;
  decomposition?: DecompositionItem[];
  insideViewUp?: string[];
  insideViewDown?: string[];
  updateTriggers?: string[];
  calibrationWarning?: string | null;
  cached?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAINS: { id: Domain; label: string; emoji: string; examples: string; questions: string[] }[] = [
  { id: "sports",   label: "Esportes",         emoji: "⚽", examples: "gols, placar, desempenho de equipes, lesões",
    questions: ["Quantos gols o Brasil vai marcar em média por jogo nas eliminatórias?", "Qual a probabilidade de um time da Série B subir com 60 pontos em 38 rodadas?", "Como o modelo de Elo prevê o desempenho do Flamengo nos próximos 5 jogos?"] },
  { id: "economy",  label: "Economia / Macro",  emoji: "📊", examples: "inflação, juros, câmbio, PIB, Selic",
    questions: ["A Selic vai cair abaixo de 10% nos próximos 6 meses?", "Como o IPCA deve se comportar dado o câmbio atual acima de R$5,80?", "Qual o impacto de uma alta de 0.5pp na Selic no câmbio USD/BRL?"] },
  { id: "energy",   label: "Energia",           emoji: "⚡", examples: "petróleo, gás, energia solar, commodities",
    questions: ["O petróleo Brent vai ultrapassar US$90 nos próximos 3 meses?", "Como o nível dos reservatórios afeta o preço da energia elétrica no Brasil?", "Qual modelo prevê melhor a volatilidade do preço do petróleo?"] },
  { id: "politics", label: "Política",          emoji: "🗳️", examples: "eleições, aprovação, votações, candidatos",
    questions: ["Como modelar a probabilidade de aprovação de uma reforma no Congresso?", "Qual modelo prevê melhor resultados eleitorais com base em pesquisas?", "Como o índice de aprovação do governo afeta o câmbio historicamente?"] },
  { id: "science",  label: "Ciência / Tech",    emoji: "🔬", examples: "adoção de IA, patentes, startups, inovação",
    questions: ["Como modelar a taxa de adoção de IA generativa nas empresas brasileiras?", "Qual curva descreve melhor o crescimento de usuários de uma nova tecnologia?", "Como o modelo de Bass prevê a difusão de inovações em mercados emergentes?"] },
  { id: "crypto",   label: "Cripto / Digital",  emoji: "₿",  examples: "Bitcoin, altcoins, DeFi, stablecoins",
    questions: ["Como o GARCH modela a volatilidade do Bitcoin nos próximos 30 dias?", "Qual a probabilidade do Bitcoin superar sua última máxima histórica em 12 meses?", "Como correlacionar o preço do BTC com o índice de dominância do dólar?"] },
  { id: "finance",  label: "Finanças",          emoji: "💹", examples: "ações, derivativos, opções, fundos",
    questions: ["Como precificar uma opção de compra de PETR4 com Black-Scholes?", "Qual modelo de séries temporais prevê melhor o Ibovespa?", "Como calcular o beta de uma carteira em relação ao S&P 500?"] },
  { id: "climate",  label: "Clima / ENSO",      emoji: "🌡️", examples: "temperatura, El Niño, safras, eventos extremos",
    questions: ["Como o El Niño afeta a produção de soja no Brasil nos próximos 12 meses?", "Qual modelo harmônico descreve melhor a sazonalidade de chuvas no Nordeste?", "Como o índice ENSO atual se compara com episódios históricos similares?"] },
];

const HORIZONS: { id: Horizon; label: string; desc: string }[] = [
  { id: "short",  label: "Curto prazo",  desc: "dias a semanas" },
  { id: "medium", label: "Médio prazo",  desc: "1 a 6 meses" },
  { id: "long",   label: "Longo prazo",  desc: "6 meses a 5 anos" },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

const EXPERTISE_CONFIG = {
  leigo:        { label: "Linguagem acessível",  color: "bg-positive/10 text-positive border-positive/20",  icon: "🟢" },
  intermediario:{ label: "Nível intermediário",  color: "bg-gold/10 text-gold border-gold/20",               icon: "🟡" },
  avancado:     { label: "Modo avançado",         color: "bg-primary/10 text-primary border-primary/20",     icon: "🔵" },
} as const;

function ExpertiseTag({ level }: { level: "leigo" | "intermediario" | "avancado" }) {
  const cfg = EXPERTISE_CONFIG[level];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.color}`}>
      <span>{cfg.icon}</span> {cfg.label}
    </span>
  );
}

function ConfidenceBar({ value, label }: { value: number; label: string }) {
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

function ModelCard({ result }: { result: PredictResult }) {
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

function SuperforecasterCard({ result }: { result: PredictResult }) {
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

function PredictionTimeline({ result }: { result: PredictResult }) {
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

function PlainLanguageCard({ result }: { result: PredictResult }) {
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

const SF_STEPS = [
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

function SuperforecasterGuide() {
  const [open, setOpen] = useState(false);

  return (
    <AnimatedSection>
      <div className={`glass-card rounded-xl border transition-colors ${open ? "border-neon-blue/30" : "border-border/20"}`}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-secondary/10 transition-colors"
        >
          <span className="text-lg">🎯</span>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">Como Superforecasters chegam a previsões precisas</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              O protocolo de 4 etapas do Good Judgment Project (Philip Tetlock) — base da nossa IA
            </p>
          </div>
          <span className="text-xs text-muted-foreground/60 shrink-0">
            {open ? "Fechar" : "Ver protocolo"}
          </span>
        </button>

        {open && (
          <div className="px-5 pb-5 space-y-3 border-t border-border/20">
            <p className="text-xs text-muted-foreground mt-4">
              Superforecasters do GJP têm Brier Score médio de <strong className="text-foreground">0.10</strong> —
              superando inteligência da CIA e modelos de banco de investimento.
              A nossa IA aplica exatamente este protocolo em cada análise.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {SF_STEPS.map((s) => (
                <div key={s.step} className={`p-4 rounded-xl border ${s.border} ${s.bg} space-y-2`}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{s.icon}</span>
                    <span className={`text-[10px] font-mono font-bold ${s.color}`}>ETAPA {s.step}</span>
                  </div>
                  <p className={`text-xs font-semibold ${s.color}`}>{s.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{s.desc}</p>
                  <div className="p-2 rounded-lg bg-secondary/30 mt-1">
                    <p className="text-[10px] text-muted-foreground/70 italic leading-relaxed">{s.example}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/50 text-center pt-2">
              Referência: Tetlock & Gardner (2015) "Superforecasting: The Art and Science of Prediction" ·
              Good Judgment Project · Kahneman & Tversky (1979)
            </p>
          </div>
        )}
      </div>
    </AnimatedSection>
  );
}

// ── AI Track Record ───────────────────────────────────────────────────────────

interface TrackRecordData {
  available: boolean;
  resolvedCount: number;
  totalCount: number;
  aiBrier: number | null;
  marketBrier: number | null;
  beatMarketPct: number | null;
  avgAbsEdge: number | null;
  skillVsMarket: number | null;
}

function AiTrackRecord() {
  const [data, setData] = useState<TrackRecordData | null>(null);

  useEffect(() => {
    fetch("/api/ai/track-record")
      .then((r) => r.ok ? r.json() as Promise<TrackRecordData> : null)
      .then((d) => { if (d?.available) setData(d); })
      .catch(() => {});
  }, []);

  if (!data) return null;

  // Histórico ainda em construção — estado honesto e substantivo (a máquina já
  // roda). Corte em 20 resolvidas: abaixo disso o Brier é ruído estatístico,
  // não evidência — exibir números com n pequeno mina a credibilidade.
  if (data.resolvedCount < 20) {
    return (
      <AnimatedSection>
        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-gold shrink-0" />
            <p className="text-sm font-semibold text-foreground">Track record da IA — em construção</p>
            <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border border-gold/25 bg-gold/10 text-gold/90">honesto</span>
          </div>
          <div className="flex items-end gap-5">
            <div className="shrink-0">
              <p className="numeric-hero text-5xl text-foreground leading-none">{data.totalCount}</p>
              <p className="text-[10px] text-muted-foreground mt-1.5">previsões<br />sendo acompanhadas</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed flex-1">
              Cada previsão da IA é registrada com data e <span className="text-foreground">fair value</span>, e
              comparada ao mercado <span className="text-foreground">quando ele resolve</span> — sem cherry-picking.
              O <span className="text-foreground">Brier Score</span> (calibração real, IA vs. mercado) aparece aqui
              quando houver 20+ previsões resolvidas ({data.resolvedCount}/20) — antes disso é ruído, não evidência.
            </p>
          </div>
        </div>
      </AnimatedSection>
    );
  }

  const beatMarket = data.skillVsMarket !== null && data.skillVsMarket > 0;
  return (
    <AnimatedSection>
      <div className="glass-card rounded-xl p-5 border border-positive/20 bg-positive/3">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-4 h-4 text-positive" />
          <p className="text-sm font-semibold text-foreground">Track Record verificado da nossa IA</p>
          <span className="ml-auto text-[10px] text-muted-foreground/60">{data.resolvedCount} previsões resolvidas</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-gold">{data.aiBrier?.toFixed(3)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Brier da IA</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-muted-foreground">{data.marketBrier?.toFixed(3)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Brier do mercado</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-mono font-bold ${beatMarket ? "text-positive" : "text-muted-foreground"}`}>
              {data.beatMarketPct}%
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Bateu o mercado</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-mono font-bold text-foreground">±{data.avgAbsEdge}pp</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Edge médio</p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-3 text-center">
          {beatMarket
            ? `A IA da JLB está mais calibrada que o mercado (Brier menor = melhor) em previsões já resolvidas.`
            : `Comparação honesta: Brier menor = mais calibrado. Atualizado conforme mercados resolvem.`}
        </p>
      </div>
    </AnimatedSection>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Previsao() {
  useSEO("Previsão Guiada por IA", "IA com método Superforecaster: base rate, decomposição de Fermi e 16 modelos econométricos. Previsões calibradas para esportes, economia, política e mais.");
  const { user, session } = useAuth();
  const [domain, setDomain]         = useState<Domain>("economy");
  const [question, setQuestion]     = useState("");
  const [context, setContext]       = useState("");
  const [horizon, setHorizon]       = useState<Horizon>("medium");
  const [bankroll, setBankroll]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<PredictResult | null>(null);
  const [error, setError]           = useState<string | null>(null);
  const [showContext, setShowContext] = useState(false);
  const [cerebroHits, setCerebroHits] = useState(0);
  const [savingPred, setSavingPred] = useState(false);
  const [savedPred, setSavedPred]   = useState(false);
  const [userProbInput, setUserProbInput] = useState("");
  const [showKlement, setShowKlement] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<string | null>(null);

  useEffect(() => {
    awardPoints("level_visited", "Acessou a Previsão Guiada por IA", "level_visited_previsao");
  }, []);

  // Contador de tempo decorrido — esta é a previsão mais profunda do site (~40-70s),
  // então comunicar progresso é essencial para a espera não parecer travada.
  useEffect(() => {
    if (!loading) { setElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [loading]);

  async function fetchCerebroContext(domainId: Domain, q: string): Promise<{ context: string; hits: number }> {
    try {
      const keywords = q.trim().split(/\s+/).slice(0, 4).join(" | ");

      // Tenta sínteses curadas primeiro
      const { data: analyses } = await supabase
        .from("cerebro_analyses")
        .select("title, content, wiki_type, domains")
        .eq("status", "active")
        .contains("domains", [domainId])
        .order("wiki_date", { ascending: false })
        .limit(3);

      if (analyses && analyses.length > 0) {
        const context = "\n\n[Contexto Cerebro — sínteses curadas]\n" +
          analyses.map((a) => `## ${a.title} (${a.wiki_type})\n${a.content.slice(0, 600)}`).join("\n\n");
        return { context, hits: analyses.length };
      }

      // Fallback: artigos recentes por busca de texto
      const { data: articles } = await supabase
        .from("cerebro_articles")
        .select("title, summary, source")
        .textSearch("fts", keywords, { config: "portuguese" })
        .eq("status", "active")
        .order("published_at", { ascending: false })
        .limit(5);

      if (!articles || articles.length === 0) return { context: "", hits: 0 };

      const context = "\n\n[Contexto Cerebro — artigos recentes]\n" +
        articles.map((a) => `• ${a.title} (${a.source}): ${a.summary ?? ""}`).join("\n");
      return { context, hits: articles.length };
    } catch {
      return { context: "", hits: 0 };
    }
  }

  async function handleAnalyze() {
    if (!question.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setCerebroHits(0);
    setShowKlement(false);

    try {
      const { context: cerebroCtx, hits } = await fetchCerebroContext(domain, question);
      setCerebroHits(hits);
      const enrichedContext = context.trim()
        ? context.trim() + cerebroCtx
        : cerebroCtx.trimStart();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);
      setPhase(null);
      try {
        // Streaming SSE: mostra as fases REAIS (contexto → modelo/protocolo → resultado)
        const res = await fetch("/api/ai/model-predict/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            domain,
            question: question.trim(),
            context: enrichedContext,
            timeHorizon: horizon,
            bankroll: bankroll ? parseFloat(bankroll) : undefined,
          }),
        });
        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({})) as { message?: string };
          throw new Error(err.message ?? `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let data: PredictResult | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep: number;
          while ((sep = buffer.indexOf("\n\n")) !== -1) {
            const blockStr = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            let evt = "message"; let dataStr = "";
            for (const line of blockStr.split("\n")) {
              if (line.startsWith("event:")) evt = line.slice(6).trim();
              else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
            }
            if (!dataStr) continue;
            const payload = JSON.parse(dataStr) as Record<string, unknown>;
            if (evt === "phase") setPhase(String(payload.step));
            else if (evt === "result") data = payload as unknown as PredictResult;
            else if (evt === "error") throw new Error(String(payload.message ?? "stream_error"));
          }
        }
        if (!data) throw new Error("no_result");
        setResult(data);
        setSavedPred(false);
        setUserProbInput(String(data.confidenceMedium ?? ""));
        awardPoints("market_analyzed", `Análise preditiva: ${question.slice(0, 50)}`);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError")
          throw new Error("A análise está demorando mais que o normal. Tente uma pergunta mais objetiva ou tente novamente.", { cause: e });
        throw e;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      // Traduz erros técnicos (parsing, timeout, rede) → mensagem amigável com retry.
      const friendly =
        /No JSON|JSON|predict_failed|unexpected|parse/i.test(raw)
          ? "A IA retornou uma resposta incompleta desta vez. Toque em Analisar novamente — costuma resolver na segunda tentativa."
        : /timeout|aborted|abort|demorando|network|fetch|Failed to fetch/i.test(raw)
          ? "A análise demorou mais que o normal (é a previsão mais profunda do site). Tente novamente ou use uma pergunta mais objetiva."
        : raw || "Erro ao gerar análise";
      setError(friendly);
    } finally {
      setLoading(false);
    }
  }

  const selectedDomain = DOMAINS.find((d) => d.id === domain)!;

  return (
    <div>
      <AnaliseTabs />
      <PageHeader
        title="Previsão Guiada por IA"
        subtitle="Descreva o que quer prever. A IA seleciona o modelo econométrico mais adequado, mostra a fórmula e traduz em linguagem que qualquer pessoa entende."
        badge="IA + Econometria"
      />

      <div className="container py-10 space-y-8 max-w-4xl">

        {/* ── Modelo Klement (inline) ── */}
        {showKlement && (
          <KlementSection onClose={() => setShowKlement(false)} />
        )}

        {/* ── Track record verificado da IA ── */}
        <AiTrackRecord />

        {/* ── Guia Superforecaster ── */}
        <SuperforecasterGuide />

        {/* ── Formulário ── */}
        <AnimatedSection>
          <div className="glass-card rounded-2xl p-6 space-y-6">

            {/* Domínio */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 font-medium">
                1. Qual área você quer analisar?
              </p>
              <div className="flex flex-wrap gap-2">
                {DOMAINS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDomain(d.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      domain === d.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary/80"
                    }`}
                  >
                    <span>{d.emoji}</span>
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 mb-2">
                Exemplos em <strong>{selectedDomain.label}</strong>: {selectedDomain.examples}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedDomain.questions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuestion(q)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/70 border border-border/20 transition-colors text-left"
                  >
                    {q.length > 60 ? q.slice(0, 58) + "…" : q}
                  </button>
                ))}
              </div>

              {/* Atalho Klement — só em Esportes */}
              {domain === "sports" && (
                <button
                  type="button"
                  onClick={() => setShowKlement(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gold/25 bg-gold/5 hover:bg-gold/10 transition-colors text-left mt-1"
                >
                  <Trophy className="w-4 h-4 text-gold shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gold">Modelo Klement — Copa 2026</p>
                    <p className="text-xs text-muted-foreground">3/3 acertos históricos · Monte Carlo 48 seleções · modelo econométrico pré-configurado</p>
                  </div>
                  <span className="text-xs text-gold/60 shrink-0">Simular →</span>
                </button>
              )}
            </div>

            {/* Pergunta */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-medium">
                2. O que você quer prever?
              </p>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={3}
                placeholder={`Ex: "${selectedDomain.examples.split(",")[0].trim()} nos próximos 3 meses"`}
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Seja específico — quanto mais detalhe, mais preciso o modelo.
              </p>
            </div>

            {/* Contexto adicional (expansível) */}
            <div>
              <button
                onClick={() => setShowContext((v) => !v)}
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showContext ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Adicionar contexto (dados, eventos recentes, referências) — opcional
              </button>
              {showContext && (
                <textarea
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={2}
                  placeholder="Ex: Considere que a Selic está a 10.5%, há eleição em outubro, o petróleo subiu 15% no mês..."
                  className="mt-2 w-full px-4 py-3 rounded-xl bg-secondary/50 border border-border/50 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                />
              )}
            </div>

            {/* Horizonte */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-3 font-medium">
                3. Qual horizonte de previsão?
              </p>
              <div className="grid grid-cols-3 gap-3">
                {HORIZONS.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setHorizon(h.id)}
                    className={`p-3 rounded-xl border text-center transition-colors ${
                      horizon === h.id
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/30 bg-secondary/10 hover:border-border/50"
                    }`}
                  >
                    <p className={`text-sm font-semibold ${horizon === h.id ? "text-primary" : "text-foreground"}`}>
                      {h.label}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{h.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Bankroll */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 font-medium">
                4. Seu patrimônio / bankroll em jogo — opcional
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
                <input
                  type="number"
                  value={bankroll}
                  onChange={(e) => setBankroll(e.target.value)}
                  placeholder="10.000"
                  min={0}
                  step={100}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary/50 border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Se informado, a IA calcula o impacto estimado no seu patrimônio.
              </p>
            </div>

            {/* Botão */}
            <button
              onClick={handleAnalyze}
              disabled={loading || !question.trim()}
              className="w-full py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
            >
              {loading ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Analisando… {elapsed}s</>
              ) : (
                <><Brain className="w-4 h-4" />Analisar com IA</>
              )}
            </button>

            {/* Painel de progresso — esta é a previsão mais profunda do site (~40-70s) */}
            {loading && (
              <div className="p-4 rounded-xl border border-primary/15 bg-primary/3 space-y-2.5">
                <div className="flex items-center gap-2 text-xs text-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  <span className="font-medium">{(phase === "analyzing" || phase === "context_done") ? "Selecionando o modelo e rodando o protocolo…" : "Cruzando notícias, macro e Cerebro…"}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">{elapsed}s</span>
                </div>
                {/* Passos guiados pela FASE REAL do servidor (stream SSE) */}
                <div className="flex flex-col gap-1 pl-5">
                  <span className={`text-[11px] transition-colors ${(phase === null || phase === "context") ? "text-gold" : "text-muted-foreground/40"}`}>{(phase === null || phase === "context") ? "›" : "✓"} Cruza notícias recentes, macro (BCB) e Cerebro</span>
                  <span className={`text-[11px] transition-colors ${(phase === "context_done" || phase === "analyzing") ? "text-gold" : "text-muted-foreground/30"}`}>{(phase === "context_done" || phase === "analyzing") ? "›" : "·"} Seleciona o modelo econométrico e roda o protocolo Superforecaster</span>
                  <span className={`text-[11px] transition-colors ${(phase === "context_done" || phase === "analyzing") ? "text-muted-foreground/50" : "text-muted-foreground/30"}`}>· Calcula os 3 horizontes + impacto no patrimônio</span>
                </div>
                <p className="text-[10px] text-muted-foreground/60 pl-5">
                  {elapsed < 25
                    ? "É a previsão mais completa do site — leva alguns segundos."
                    : "Quase lá — finalizando a análise dos horizontes."}
                </p>
              </div>
            )}

            {/* Indicador Cerebro */}
            {cerebroHits > 0 && !loading && (
              <div className="flex items-center gap-2 p-3 rounded-lg border border-gold/20 bg-gold/3">
                <Brain className="w-3.5 h-3.5 text-gold shrink-0" />
                <p className="text-xs text-muted-foreground">
                  <span className="text-gold font-medium">Cerebro</span> encontrou{" "}
                  <span className="font-mono text-foreground">{cerebroHits}</span>{" "}
                  {cerebroHits === 1 ? "fonte relevante" : "fontes relevantes"} — usadas como contexto na análise.
                </p>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-negative/10 border border-negative/20">
                <AlertCircle className="w-4 h-4 text-negative shrink-0 mt-0.5" />
                <p className="text-sm text-negative">{error}</p>
              </div>
            )}
          </div>
        </AnimatedSection>

        {/* ── Como funciona (só quando não tem resultado) ── */}
        {!result && !loading && (
          <AnimatedSection>
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-gold" />
                <h3 className="font-semibold text-foreground">Como funciona</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { icon: FlaskConical, color: "text-primary",   title: "Seleção automática de modelo", desc: "A IA escolhe entre 20 modelos econométricos e matemáticos o mais adequado para sua pergunta — OLS, GARCH, Poisson, Elo, Taylor Rule, log-log e muito mais." },
                  { icon: BookOpen,     color: "text-neon-blue",  title: "Fórmula real + base de pesquisa", desc: "Mostra a equação matemática exata e cita a linha de pesquisa acadêmica (Harvard, USP, Stanford, ITA) que sustenta a metodologia." },
                  { icon: Clock,        color: "text-gold",       title: "3 horizontes temporais", desc: "Previsão separada para curto, médio e longo prazo, cada uma com grau de confiança calibrado pelo modelo escolhido." },
                  { icon: Lightbulb,    color: "text-positive",   title: "Tradução em linguagem simples", desc: "Toda análise é traduzida para linguagem cotidiana — sem jargão — e inclui impacto no patrimônio se informado." },
                ].map(({ icon: Icon, color, title, desc }) => (
                  <div key={title} className="flex items-start gap-3 p-4 rounded-xl bg-secondary/10 border border-border/10">
                    <Icon className={`w-4 h-4 ${color} shrink-0 mt-0.5`} />
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-1">{title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
                <p className="text-xs text-muted-foreground leading-relaxed text-center">
                  <strong className="text-foreground">Importante:</strong> Esta ferramenta é educacional.
                  Os modelos têm premissas e limitações documentadas. Nunca recomendamos posição, aposta ou investimento.
                </p>
              </div>
            </div>
          </AnimatedSection>
        )}

        {/* ── Resultado ── */}
        {result && (
          <div className="space-y-6">

            {/* Modelo escolhido */}
            <ModelCard result={result} />

            {/* Protocolo Superforecaster — decomposição e base rate */}
            <SuperforecasterCard result={result} />

            {/* Timeline de previsões */}
            <PredictionTimeline result={result} />

            {/* Linguagem simples + impacto */}
            <PlainLanguageCard result={result} />

            {/* Stats rápidos */}
            <AnimatedSection>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="glass-card rounded-xl p-4 text-center">
                  <FlaskConical className="w-4 h-4 text-primary mx-auto mb-1.5" />
                  <p className="text-xs font-mono font-bold text-foreground">{result.modelChosen.split(" ").slice(0, 2).join(" ")}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Modelo</p>
                </div>
                <div className="glass-card rounded-xl p-4 text-center">
                  <Target className="w-4 h-4 text-gold mx-auto mb-1.5" />
                  {result.probabilityVerbal && (result.expertiseLevel ?? "intermediario") === "leigo" ? (
                    <p className="text-xs font-bold text-foreground leading-tight">{result.probabilityVerbal.split(" (")[0]}</p>
                  ) : (
                    <p className="text-xl font-bold font-mono text-foreground">{result.confidenceMedium}%</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-0.5">Confiança</p>
                </div>
                <div className="glass-card rounded-xl p-4 text-center">
                  <BarChart2 className="w-4 h-4 text-neon-blue mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-foreground">{result.modelFamily}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Família</p>
                </div>
                <div className="glass-card rounded-xl p-4 text-center">
                  <Brain className="w-4 h-4 text-positive mx-auto mb-1.5" />
                  <p className="text-xs font-bold text-foreground capitalize">
                    {result.expertiseLevel === "leigo" ? "Acessível" : result.expertiseLevel === "avancado" ? "Avançado" : "Intermediário"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Nível detectado</p>
                </div>
              </div>
            </AnimatedSection>

            {/* Salvar no Dashboard */}
            <AnimatedSection>
              <div className="glass-card rounded-xl p-5 border border-primary/20 space-y-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold text-foreground">Registrar esta previsão no Dashboard</p>
                </div>
                {savedPred ? (
                  <div className="flex items-center gap-2 py-2 text-positive text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Previsão salva! Acompanhe o resultado no Dashboard.
                  </div>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <label className="text-xs text-muted-foreground whitespace-nowrap">Sua probabilidade (%):</label>
                      <input
                        type="number" min="1" max="99" step="1"
                        value={userProbInput}
                        onChange={(e) => setUserProbInput(e.target.value)}
                        className="w-20 px-2 py-1.5 rounded-lg bg-secondary/50 border border-border/50 text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="50"
                      />
                      <span className="text-xs text-muted-foreground">vs. modelo: {result?.confidenceMedium}%</span>
                    </div>
                    <button
                      onClick={async () => {
                        if (!result) return;
                        const userProb = parseFloat(userProbInput);
                        if (isNaN(userProb) || userProb < 1 || userProb > 99) return;
                        setSavingPred(true);
                        const pred = addPrediction({
                          marketId: `previsao-${Date.now()}`,
                          question: question.slice(0, 200),
                          marketProb: result.confidenceMedium,
                          userProb,
                        });
                        awardPoints("prediction_made", `Previsão registrada: ${question.slice(0, 50)}`, `pred_${pred.id}`);
                        if (user && session?.access_token) {
                          await syncOne(pred, user.id).catch(() => {});
                        }
                        setSavingPred(false);
                        setSavedPred(true);
                      }}
                      disabled={savingPred}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                    >
                      {savingPred ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      Salvar previsão
                    </button>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground/60">
                  Salvo no seu Dashboard para acompanhar calibração e Brier Score quando o resultado sair.
                </p>
              </div>
            </AnimatedSection>

            {/* Nova análise */}
            <AnimatedSection>
              <button
                onClick={() => { setResult(null); setQuestion(""); setContext(""); setSavedPred(false); }}
                className="w-full py-3 rounded-xl border border-border/30 text-sm text-muted-foreground hover:text-foreground hover:border-border/60 transition-colors"
              >
                Fazer nova análise
              </button>
            </AnimatedSection>
          </div>
        )}
      </div>
    </div>
  );
}
