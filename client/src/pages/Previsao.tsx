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
import { MODEL_COUNT } from "@/lib/brand";
import AnaliseTabs from "@/components/AnaliseTabs";
import KlementSection from "@/components/KlementSection";
import { supabase } from "@/lib/supabase";
import {
  Brain, Zap, Clock, BarChart2, AlertCircle,
  ChevronDown, ChevronUp, BookOpen, Target,
  CheckCircle, Loader2, Lightbulb, FlaskConical, Trophy,
} from "lucide-react";
import { awardPoints } from "@/lib/userProgress";
import { addPrediction } from "@/lib/predictions";
import { syncOne } from "@/lib/predictionsSync";
import { useAuth } from "@/contexts/AuthContext";

import type { Domain, Horizon, PredictResult } from "@/components/previsao/types";
import {
  ModelCard, SuperforecasterCard,
  PredictionTimeline, PlainLanguageCard,
} from "@/components/previsao/ResultCards";
import { SuperforecasterGuide, AiTrackRecord } from "@/components/previsao/GuideAndTrackRecord";

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

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function Previsao() {
  useSEO("Previsão Guiada por IA", `IA com método Superforecaster: base rate, decomposição de Fermi e ${MODEL_COUNT} modelos econométricos. Previsões calibradas para esportes, economia, política e mais.`);
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
                  { icon: FlaskConical, color: "text-primary",   title: "Seleção automática de modelo", desc: `A IA escolhe entre ${MODEL_COUNT} modelos econométricos e matemáticos o mais adequado para sua pergunta — OLS, GARCH, Poisson, Elo, Taylor Rule, log-log e muito mais.` },
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


