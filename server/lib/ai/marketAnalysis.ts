import { getNewsForMarket } from "../news.ts";
import { fetchCerebroContext, fetchMarketMomentum } from "../cerebro.ts";
import { fetchBcbSerie } from "../bcb.ts";
import { CATEGORY_BASE_RATES } from "../categoryRates.ts";
import { callClaude } from "../anthropic.ts";
import { extractJson } from "../extractJson.ts";
import { clampFairValue } from "./guardrails.ts";
import { recordClamp } from "./metrics.ts";
import { INJECTION_GUARD } from "./promptSafety.ts";
import { humanizeCitations } from "../citations.ts";
import { logAiForecast } from "../aiForecasts.ts";
import { log } from "../log.ts";

export interface AnalyzeParams { title: string; yesProb: number; source: string; description?: string; marketId?: string; category?: string }
export type PhaseEmit = (step: string, data?: Record<string, unknown>) => void;

/**
 * Núcleo da análise de mercado — compartilhado por /analyze (JSON) e
 * /analyze/stream (SSE). Emite fases reais via onPhase para o streaming mostrar
 * progresso de verdade (notícias → fontes cruzadas → IA analisando), em vez de
 * um cronômetro adivinhado no cliente.
 */
export async function runMarketAnalysis(p: AnalyzeParams, onPhase: PhaseEmit = () => {}): Promise<Record<string, unknown>> {
  const { title, yesProb, source, description, marketId, category = "other" } = p;
  {
    const NEWS_API_KEY = process.env.NEWS_API_KEY ?? "";
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY ?? "";
    const probPct = Math.round((yesProb ?? 0.5) * 100);
    const platformName = source === "kalshi" ? "Kalshi" : "Polymarket";
    const catKey = (category ?? "other").toLowerCase().replace(/[^a-z]/g, "") || "other";
    const catInfo = CATEGORY_BASE_RATES[catKey] ?? CATEGORY_BASE_RATES["other"];

    onPhase("sources");
    // ── Fase 1: cruzamento de TODAS as fontes em paralelo ────────────────────
    // Notícias (NewsAPI) + Cerebro (base proprietária) + momentum (snapshots)
    const [newsResult, cerebro, momentum, ratesSettled] = await Promise.all([
      getNewsForMarket(title, NEWS_API_KEY, description, { maxTotal: 10 }),
      fetchCerebroContext(title, description),
      fetchMarketMomentum(marketId, source),
      Promise.allSettled([fetchBcbSerie(432), fetchBcbSerie(13522)]),
    ]);
    const allArticles = newsResult.articles;
    const selicVal = ratesSettled[0].status === "fulfilled" ? ratesSettled[0].value : null;
    const ipcaVal  = ratesSettled[1].status === "fulfilled" ? ratesSettled[1].value : null;
    onPhase("sources_done", { articles: allArticles.length, cerebroHits: cerebro.hits.length, hasMomentum: momentum.length > 0 });
    onPhase("analyzing");

    // ── IA: motor analítico completo ──────────────────────────────────────────
    let analysis: string; let keyFactors: string[] = []; let watchFor: string | undefined;
    let biasAlert: string | null = null; let newsRelevance: string = "low";
    let probabilityAssessment: "fair" | "underpriced" | "overpriced" | "uncertain" = "uncertain";
    let edgeSignal: string | null = null;
    let fairValue: number | null = null;
    let confidence: "baixa" | "media" | "alta" = "media";
    let provider = "anthropic"; // provedor que respondeu — gravado no track record p/ fatiar Brier por provedor
    let referenceClass: string | null = null;
    let relevantIndices: number[] = allArticles.map((_, i) => i);

    if (ANTHROPIC_KEY) {
      const articlesBlock = allArticles.length > 0
        ? allArticles.map((a, i) => `[${i + 1}] "${a.title}" — ${a.source.name} (${a.publishedAt.slice(0, 10)})\n${a.description ?? "sem descrição"}`).join("\n\n")
        : "Nenhum artigo de notícias encontrado.";

      const prompt = `Você é o motor de análise quantitativa da JLB Analytics — combina o rigor de um Superforecaster do Good Judgment Project com a precisão de um quant de mesa proprietária.

MERCADO: "${title}"
PLATAFORMA: ${platformName} | PREÇO ATUAL: ${probPct}% SIM
CATEGORIA: ${category} | BASE RATE HISTÓRICA: ${catInfo.baseRate}% (${catInfo.note})
DATA: ${new Date().toLocaleDateString("pt-BR")}
${newsResult.isBR ? `CONTEXTO BR: Selic ${selicVal ?? "~10.5"}% | IPCA ${ipcaVal ?? "~4.8"}% — considere dados do BCB/IBGE.` : ""}
${description ? `CRITÉRIOS DE RESOLUÇÃO: ${description}` : ""}
${momentum ? `\n${momentum}` : ""}

═══ FONTE 1: NOTÍCIAS EM TEMPO REAL (${allArticles.length}) ═══
${articlesBlock}

═══ FONTE 2: CEREBRO — BASE DE CONHECIMENTO PROPRIETÁRIA JLB ${cerebro.hits.length > 0 ? `(${cerebro.hits.length})` : "(sem correspondências)"} ═══
${cerebro.context || "Nenhuma síntese ou artigo curado relevante encontrado."}

EXECUTE O PROTOCOLO (em ordem):

1. FILTRO — dos artigos de notícias [N], selecione apenas os DIRETAMENTE relevantes (mesmo ator/evento/região). Rejeite coincidência de palavras-chave.

2. ÂNCORA (base rate) — parta da frequência histórica da classe de referência (${catInfo.baseRate}% para ${category}). Ajuste com as notícias + Cerebro + trajetória do mercado.

3. FAIR VALUE — calcule SUA probabilidade independente (5-95%), cruzando:
   - O que as notícias [N] revelam (cite os números)
   - O que o Cerebro [CN] adiciona de contexto proprietário (cite se usar)
   - A trajetória/momentum do mercado (se disponível)
   - A base rate da categoria como âncora
   Seu fairValue PODE divergir do preço de ${probPct}% — é assim que se encontra valor.

4. VEREDITO — compare seu fairValue com ${probPct}%:
   - "underpriced": seu fairValue > ${probPct}%+4
   - "overpriced": seu fairValue < ${probPct}%−4
   - "fair": dentro de ±4pp
   - confidence: "alta" só com notícias fortes + Cerebro convergindo; "baixa" se fontes fracas/ausentes

5. MONITORAMENTO + VIÉS cognitivo dominante neste mercado.

${INJECTION_GUARD}

Os artigos são numerados a partir de [1]. JSON exato (sem markdown):
{"relevantIndices":[1,3],"fairValue":62,"confidence":"baixa|media|alta","referenceClass":"qual classe de referência e base rate usada","analysis":"3-4 frases densas citando [N] e [CN] quando usados","keyFactors":["fator com nome próprio 1","fator 2","fator 3"],"watchFor":"evento/indicador concreto","biasAlert":"viés específico ou null","newsRelevance":"high|medium|low|none","probabilityAssessment":"fair|underpriced|overpriced|uncertain","edgeSignal":"1 frase: seu fairValue vs preço e por quê"}`;

      try {
        const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 1000, messages: [{ role: "user", content: prompt }], timeoutMs: 22_000, onProvider: (p) => { provider = p; } });
        interface ParsedAnalysis {
          analysis?: string; keyFactors?: string[]; watchFor?: string; biasAlert?: string | null;
          relevantIndices?: number[]; newsRelevance?: string;
          probabilityAssessment?: string; edgeSignal?: string | null;
          fairValue?: number; confidence?: string; referenceClass?: string | null;
        }
        const parsed = extractJson(raw) as ParsedAnalysis;
        analysis      = parsed.analysis ?? "";
        keyFactors    = parsed.keyFactors ?? [];
        watchFor      = parsed.watchFor;
        biasAlert     = parsed.biasAlert ?? null;
        newsRelevance = parsed.newsRelevance ?? "low";
        probabilityAssessment = (parsed.probabilityAssessment ?? "uncertain") as typeof probabilityAssessment;
        edgeSignal    = parsed.edgeSignal ?? null;
        referenceClass = parsed.referenceClass ?? null;
        // Mesmo guardrail de calibração do /fair-value e do seed: ±15pp do
        // mercado (além de 5-95). Sem isto, a análise logava desvios enormes no
        // track record — o buraco que deixava um "42% vs 21%" (21pp) passar.
        if (typeof parsed.fairValue === "number") {
          const rawFv = Math.round(parsed.fairValue);
          fairValue = clampFairValue(rawFv, probPct);
          if (fairValue !== rawFv) recordClamp(); // clamp mordeu → sinal de calibração/alucinação
        }
        if (parsed.confidence === "baixa" || parsed.confidence === "media" || parsed.confidence === "alta") confidence = parsed.confidence;
        if (Array.isArray(parsed.relevantIndices)) {
          // Marcadores são 1-indexed no prompt → converte para índice de array
          relevantIndices = parsed.relevantIndices
            .filter((i) => typeof i === "number" && i >= 1 && i <= allArticles.length)
            .map((i) => i - 1);
        }
        // Troca [N]/[CN] pelos nomes reais das fontes no texto visível ao usuário
        const newsSources = allArticles.map((a) => a.source.name);
        const cerebroSources = cerebro.hits.map((h) => h.kind === "síntese" ? "Síntese Cerebro" : `Cerebro · ${h.source}`);
        analysis   = humanizeCitations(analysis, newsSources, cerebroSources);
        edgeSignal = edgeSignal ? humanizeCitations(edgeSignal, newsSources, cerebroSources) : edgeSignal;
        keyFactors = keyFactors.map((f) => humanizeCitations(f, newsSources, cerebroSources));
        if (watchFor) watchFor = humanizeCitations(watchFor, newsSources, cerebroSources);
      } catch (e) {
        log.warn("[market-analyze] Claude analysis failed:", e instanceof Error ? e.message : e);
        analysis = `Mercado em ${probPct}% no ${platformName}. ${allArticles.length > 0 ? `${allArticles.length} artigos encontrados — análise IA temporariamente indisponível.` : "Sem notícias recentes localizadas para este mercado específico."}`;
      }
    } else {
      analysis = "Configure ANTHROPIC_API_KEY no .env para análise por IA.";
    }

    const relevantArticles = relevantIndices.map((i) => allArticles[i]).filter(Boolean);
    const edgePp = fairValue !== null ? Number((fairValue - probPct).toFixed(0)) : null;

    const result = {
      analysis, keyFactors, watchFor, biasAlert, newsRelevance,
      probabilityAssessment, edgeSignal,
      fairValue, edgePp, confidence, referenceClass,
      cerebroHits: cerebro.hits.length,
      hasMomentum: momentum.length > 0,
      articles: relevantArticles.map((a) => ({
        title: a.title, description: a.description, url: a.url,
        source: a.source.name, publishedAt: a.publishedAt, urlToImage: a.urlToImage,
      })),
      searchedQueries: newsResult.queries,
      isBR: newsResult.isBR,
      cached: false,
    };
    // Registra a previsão da IA para track record + divergências (fire-and-forget)
    if (fairValue !== null && marketId) {
      void logAiForecast({
        marketId, source: source ?? "polymarket", title, category,
        marketProb: probPct, aiFairValue: fairValue, confidence, model: provider,
      });
    }
    return result;
  }
}

export const ANALYZE_CACHE_KEY = (p: AnalyzeParams) => `market-analyze:v3:${p.source ?? ""}:${p.title.slice(0, 80)}`;
