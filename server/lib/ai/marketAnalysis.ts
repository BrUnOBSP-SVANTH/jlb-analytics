import { REGRA_LINGUAGEM } from "./linguagem.ts";
import { getNewsForMarket } from "../news.ts";
import { fetchCerebroContext, fetchMarketMomentum } from "../cerebro.ts";
import { fetchBcbSerie } from "../bcb.ts";
import { CATEGORY_BASE_RATES } from "../categoryRates.ts";
import { montarFicha } from "./fichaMercado.ts";
import { callClaude } from "../anthropic.ts";
import { extractJson } from "../extractJson.ts";
import { clampFairValue } from "./guardrails.ts";
import { recordClamp } from "./metrics.ts";
import { INJECTION_GUARD } from "./promptSafety.ts";
import { humanizeCitations } from "../citations.ts";
import { logAiForecast } from "../aiForecasts.ts";
import { log } from "../log.ts";

export interface AnalyzeParams {
  title: string; yesProb: number; source: string;
  description?: string; marketId?: string; category?: string;
  /** Fechamento e volume alimentam a FICHA (relógio e liquidez). Opcionais: se a
   *  tela não mandar, a ficha sai sem essas linhas — nunca vazia por causa disso. */
  closeTime?: string | null; volume?: number;
}
export type PhaseEmit = (step: string, data?: Record<string, unknown>) => void;

/**
 * Núcleo da análise de mercado — compartilhado por /analyze (JSON) e
 * /analyze/stream (SSE). Emite fases reais via onPhase para o streaming mostrar
 * progresso de verdade (notícias → fontes cruzadas → IA analisando), em vez de
 * um cronômetro adivinhado no cliente.
 */
export async function runMarketAnalysis(p: AnalyzeParams, onPhase: PhaseEmit = () => {}): Promise<Record<string, unknown>> {
  const { title, yesProb, source, description, marketId, category = "other", closeTime, volume } = p;
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
      // A categoria destrava a regra do confronto no Cerebro: sem ela, um mercado
      // "Spirit vs Falcons" não consegue provar que artigo de e-sports é do assunto.
      fetchCerebroContext(title, description, false, undefined, category),
      fetchMarketMomentum(marketId, source),
      Promise.allSettled([fetchBcbSerie(432), fetchBcbSerie(13522)]),
    ]);
    const allArticles = newsResult.articles;
    const selicVal = ratesSettled[0].status === "fulfilled" ? ratesSettled[0].value : null;
    const ipcaVal  = ratesSettled[1].status === "fulfilled" ? ratesSettled[1].value : null;
    // A FICHA é o piso da análise: sai de dado que sempre existe (preço, relógio,
    // liquidez, nosso histórico da categoria). É o que impede a página de sair em
    // branco quando notícia e Cerebro vêm vazios.
    const ficha = await montarFicha({
      titulo: title, precoPct: probPct, categoria: category, plataforma: platformName,
      fechaEm: closeTime, volume, trajetoria: momentum || undefined,
    });
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
    let fairValueClamped = false; // o guardrail moveu o fair value? → reescreve a frase p/ não contradizer o número
    let referenceClass: string | null = null;
    let contexto: string | null = null;
    let cenarios: { sim: string; nao: string } | null = null;
    let relevantIndices: number[] = allArticles.map((_, i) => i);

    if (ANTHROPIC_KEY) {
      const articlesBlock = allArticles.length > 0
        ? allArticles.map((a, i) => `[${i + 1}] "${a.title}" — ${a.source.name} (${a.publishedAt.slice(0, 10)})\n${a.description ?? "sem descrição"}`).join("\n\n")
        : "Nenhum artigo de notícias encontrado.";

      const prompt = `Você é o motor de análise quantitativa da JLB Analytics — combina o rigor de um Superforecaster do Good Judgment Project com a precisão de um quant de mesa proprietária.
${REGRA_LINGUAGEM}

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

═══ FONTE 3: FICHA DO MERCADO — dados nossos, sempre disponíveis ═══
${ficha}

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

5. CONTEXTO PARA QUEM CHEGOU AGORA — 2 a 3 frases explicando o ASSUNTO em si,
   não o mercado: quem são os envolvidos, o que está em disputa, e onde a coisa
   está hoje. Quem abre a página pode nunca ter ouvido falar do tema. Sem isto a
   análise só conversa com quem já sabia — e essa pessoa não precisava de nós.

6. CENÁRIOS — o que precisa ACONTECER para dar SIM, e o que precisa acontecer
   para dar NÃO. Uma frase concreta cada, com o gatilho de verdade (uma decisão,
   uma data, um resultado), não abstração ("se as condições melhorarem").

7. MONITORAMENTO + VIÉS cognitivo dominante neste mercado.

PROFUNDIDADE — o que separa a nossa análise de um chute com selo de IA:
- CITE NÚMERO E NOME. "O favorito venceu 80,5% das vezes nos 220 mercados de
  e-sports que acompanhamos" vale; "o histórico sugere cautela" não vale nada.
- USE A FONTE 3, COPIANDO OS NÚMEROS DELA. O nosso histórico medido é o que
  ninguém mais tem: quando a ficha traz a linha "NOSSO HISTÓRICO EM …", ela
  PRECISA aparecer na análise com o tamanho da amostra. É o diferencial do site.
  ⚠️ Quando essa linha NÃO estiver na ficha, é porque ainda não temos amostra
  suficiente naquela área — e aí você NÃO inventa: diga em uma oração que o
  histórico próprio ainda está sendo formado. Número de histórico que não veio
  da ficha é fabricação, e fabricação aqui destrói o motivo de o site existir.
- DIGA DE ONDE VEIO. Ao usar uma notícia, nomeie a fonte e a data ("HLTV, 31/08").
  Análise sem procedência é opinião.
- Onde não houver dado, diga o que FALTA para ter convicção. Admitir o limite com
  precisão é análise; ficar vago é o contrário.

REGRA INEGOCIÁVEL — NUNCA ENTREGUE ANÁLISE VAZIA. É PROIBIDO escrever que "não
há notícias", "não temos dados" ou "não há informações sobre este confronto" e
parar por aí. A FONTE 3 existe sempre e é sua: o que o preço paga, o relógio do
mercado, a liquidez, a trajetória e o nosso histórico medido da categoria. Se as
notícias vierem vazias, diga isso em UMA oração e use o resto do parágrafo para o
que a ficha traz — o leitor tem que sair sabendo algo concreto que não sabia,
sempre. Não invente fato para preencher: a ficha já é fato.

${INJECTION_GUARD}

Os artigos são numerados a partir de [1]. JSON exato (sem markdown):
{"relevantIndices":[1,3],"fairValue":62,"confidence":"baixa|media|alta","referenceClass":"qual classe de referência e base rate usada","contexto":"2-3 frases sobre o ASSUNTO para quem nunca ouviu falar: quem está envolvido, o que está em jogo, onde está hoje","analysis":"6 a 9 frases, nesta ordem: o que o preço de ${probPct}% está dizendo; o que as notícias [N] mostram (com fonte e data); o que o Cerebro [CN] acrescenta; o que o NOSSO histórico medido da categoria diz, com o tamanho da amostra; onde cai a nossa estimativa e por quê","keyFactors":["cada item PRECISA ter nome próprio, número ou data","fator 2","fator 3","fator 4 (opcional)"],"cenarios":{"sim":"o gatilho concreto que faz dar SIM","nao":"o gatilho concreto que faz dar NÃO"},"watchFor":"evento/indicador concreto e datado","biasAlert":"viés específico ou null","newsRelevance":"high|medium|low|none","probabilityAssessment":"fair|underpriced|overpriced|uncertain","edgeSignal":"1 frase: seu fairValue vs preço e por quê"}`;

      try {
        // maxTokens 2200 (era 1000): o esquema passou a pedir contexto, cenários e
        // uma análise de 6 a 9 frases. Com o teto antigo a resposta era cortada no
        // meio e o JSON vinha inválido — a análise mais rica seria justamente a
        // que falharia. O timeout sobe junto, pela mesma razão.
        const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 2200, messages: [{ role: "user", content: prompt }], timeoutMs: 32_000, onProvider: (p) => { provider = p; } });
        interface ParsedAnalysis {
          analysis?: string; keyFactors?: string[]; watchFor?: string; biasAlert?: string | null;
          relevantIndices?: number[]; newsRelevance?: string;
          probabilityAssessment?: string; edgeSignal?: string | null;
          fairValue?: number; confidence?: string; referenceClass?: string | null;
          contexto?: string; cenarios?: { sim?: string; nao?: string };
        }
        const parsed = extractJson(raw) as ParsedAnalysis;
        analysis      = parsed.analysis ?? "";
        contexto      = parsed.contexto ?? null;
        // Só vale como cenário se os DOIS lados vierem: metade é pior que nada —
        // o leitor compara o que precisa acontecer de cada lado, e um lado só
        // sugere que aquele desfecho é o provável.
        cenarios      = parsed.cenarios?.sim && parsed.cenarios?.nao
          ? { sim: parsed.cenarios.sim, nao: parsed.cenarios.nao }
          : null;
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
          if (fairValue !== rawFv) { recordClamp(); fairValueClamped = true; } // clamp mordeu → métrica + reescreve a frase
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
        if (contexto) contexto = humanizeCitations(contexto, newsSources, cerebroSources);
        if (cenarios) cenarios = {
          sim: humanizeCitations(cenarios.sim, newsSources, cerebroSources),
          nao: humanizeCitations(cenarios.nao, newsSources, cerebroSources),
        };
      } catch (e) {
        log.warn("[market-analyze] Claude analysis failed:", e instanceof Error ? e.message : e);
        analysis = `Mercado em ${probPct}% no ${platformName}. ${allArticles.length > 0 ? `${allArticles.length} artigos encontrados — análise IA temporariamente indisponível.` : "Sem notícias recentes localizadas para este mercado específico."}`;
      }
    } else {
      analysis = "Configure ANTHROPIC_API_KEY no .env para análise por IA.";
    }

    const relevantArticles = relevantIndices.map((i) => allArticles[i]).filter(Boolean);
    const edgePp = fairValue !== null ? Number((fairValue - probPct).toFixed(0)) : null;

    // Quando o guardrail moveu o fair value, a frase do modelo pode citar o valor
    // BRUTO (ex.: "+45pp") e contradizer o número exibido. Reescreve determinística-
    // mente a partir dos números finais — fim da contradição visível ao usuário.
    if (fairValueClamped && fairValue !== null && edgePp !== null) {
      edgeSignal = `Fair value JLB ${fairValue}% vs ${probPct}% do mercado (${edgePp > 0 ? "+" : ""}${edgePp}pp), ajustado ao limite de ±15pp.`;
    }

    const result = {
      analysis, contexto, cenarios, keyFactors, watchFor, biasAlert, newsRelevance,
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
    // Caminho de "abster": um fair value de BAIXA confiança E sem nenhuma evidência
    // (nem notícias nem Cerebro) é um chute — NÃO entra no track record público, para
    // não poluir o Brier. Ainda é mostrado ao usuário (com o caveat), só não registrado.
    const abstain = confidence === "baixa" && newsRelevance === "none" && cerebro.hits.length === 0;
    // Registra a previsão da IA para track record + divergências (fire-and-forget)
    if (fairValue !== null && marketId && !abstain) {
      void logAiForecast({
        marketId, source: source ?? "polymarket", title, category,
        marketProb: probPct, aiFairValue: fairValue, confidence, model: provider,
      });
    }
    return result;
  }
}

export const ANALYZE_CACHE_KEY = (p: AnalyzeParams) => `market-analyze:v3:${p.source ?? ""}:${p.title.slice(0, 80)}`;
