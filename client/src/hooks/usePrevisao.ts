/**
 * usePrevisao — camada de DADOS da Previsão Guiada por IA.
 *
 * Extraído de pages/Previsao.tsx (741 → ~560 linhas). Mesma escolha do
 * useMarketDetail: mover estado/efeitos/fetches em vez de recortar JSX, porque o
 * risco desta tela (a mais complexa do site) mora na renderização — que ficou
 * intacta.
 *
 * Cuida de: estado do formulário, mercados "em alta" (entrada e relacionados),
 * contador de tempo decorrido, contexto do Cérebro (RAG) e a chamada de previsão
 * por streaming SSE com tradução de erro técnico → mensagem amigável.
 */
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { maybeAuthGate } from "@/lib/upgrade";
import { useSEO } from "@/hooks/useSEO";
import { MODEL_COUNT } from "@/lib/brand";
import { awardPoints } from "@/lib/userProgress";
import { useAuth } from "@/contexts/AuthContext";
import { fetchHotMarkets, relatedMarkets, type HotMarket } from "@/lib/previsaoMarkets";
import type { Domain, Horizon, PredictResult } from "@/components/previsao/types";
import { apiFetch } from "@/lib/api";

export function usePrevisao() {
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
  const [hotMarkets, setHotMarkets] = useState<HotMarket[]>([]);
  const [predictedQuery, setPredictedQuery] = useState("");
  const [hotTab, setHotTab] = useState<"br" | "world">("br");
  const [anchorMarket, setAnchorMarket] = useState<HotMarket | null>(null);

  useEffect(() => {
    awardPoints("level_visited", "Acessou a Previsão Guiada por IA", "level_visited_previsao");
  }, []);

  // Mercados ao vivo alimentam as sugestões "em alta" (entrada) e os relacionados (saída).
  useEffect(() => { void fetchHotMarkets().then(setHotMarkets).catch(() => {}); }, []);

  const hotMundo  = useMemo(() => hotMarkets.filter((m) => !m.isBR).slice(0, 14), [hotMarkets]);
  const hotBrasil = useMemo(() => hotMarkets.filter((m) => m.isBR).slice(0, 8), [hotMarkets]);
  const related   = useMemo(() => relatedMarkets(predictedQuery, hotMarkets, 3), [predictedQuery, hotMarkets]);
  const activeHot = hotTab === "br" ? hotBrasil : hotMundo;

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
    setPredictedQuery(question);
    // Âncora: se a pergunta casa com um mercado ao vivo, a IA recebe a prob dele
    // como base rate coletiva — estima ancorada à realidade, não no vácuo.
    const anchor = relatedMarkets(question, hotMarkets, 1)[0] ?? null;
    setAnchorMarket(anchor);
    setLoading(true);
    setError(null);
    setResult(null);
    setCerebroHits(0);
    setShowKlement(false);

    try {
      const { context: cerebroCtx, hits } = await fetchCerebroContext(domain, question);
      setCerebroHits(hits);
      const marketCtx = anchor && anchor.prob != null
        ? `\n\n[Mercado ao vivo] O mercado "${anchor.title}" precifica este evento em ${anchor.prob}% agora. Ancore-se nesse valor como base rate coletiva do mercado, mas forme sua própria estimativa e explique eventuais divergências.`
        : "";
      const enrichedContext = (context.trim()
        ? context.trim() + cerebroCtx
        : cerebroCtx.trimStart()) + marketCtx;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90_000);
      setPhase(null);
      try {
        // Streaming SSE: mostra as fases REAIS (contexto → modelo/protocolo → resultado)
        const res = await apiFetch("/api/ai/model-predict/stream", {
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
          if (await maybeAuthGate(res)) return;   // 401 login ou cota esgotada → modal, não erro
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

  return {
    user, session,
    domain, setDomain, question, setQuestion, context, setContext,
    horizon, setHorizon, bankroll, setBankroll,
    loading, result, setResult, error, showContext, setShowContext,
    cerebroHits, savingPred, setSavingPred, savedPred, setSavedPred,
    userProbInput, setUserProbInput, showKlement, setShowKlement,
    elapsed, phase, hotMarkets, hotTab, setHotTab, anchorMarket,
    hotMundo, hotBrasil, related, activeHot,
    handleAnalyze,
  };
}
