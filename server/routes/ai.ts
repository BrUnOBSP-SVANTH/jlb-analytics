import { Router } from "express";
import { getCache, setCache, isRateLimited } from "../lib/cache.ts";
import { fetchJSON } from "../lib/fetcher.ts";
import { fetchBcbSerie } from "../lib/bcb.ts";
import type { NewsApiResponse, PolyEvent, KalshiEventsResponse } from "../lib/types.ts";
import { aiCreditsMiddleware, verifyUserId } from "../middleware/aiCredits.ts";
import { sendEmail, emailEnabled, renderWeeklyDigestHtml } from "../lib/email.ts";
import { extractJson } from "../lib/extractJson.ts";
import { callClaude, streamClaude, type ClaudeMessage } from "../lib/anthropic.ts";
import { getNewsForMarket } from "../lib/news.ts";
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "../lib/supabaseRest.ts";
import { CATEGORY_BASE_RATES } from "../lib/categoryRates.ts";
import { fetchCerebroContext, fetchMarketMomentum } from "../lib/cerebro.ts";
import { humanizeCitations } from "../lib/citations.ts";
import { logAiForecast, seedAiForecasts, computeDivergences, getTrackRecordData, getClosingSoon, parsePolyPrices, getCalibrationMemo } from "../lib/aiForecasts.ts";
import { log } from "../lib/log.ts";

const router = Router();

/** Monta o digest semanal — usado tanto pelo endpoint quanto pelo email. */
async function buildDigest() {
  const [divergences, trackRecord] = await Promise.all([computeDivergences(), getTrackRecordData()]);
  return {
    generatedAt: new Date().toISOString(),
    trackRecord,
    topDivergences: divergences.slice(0, 5),
    closingSoon: getClosingSoon(),
  };
}

/** Envia o Resumo Semanal por email aos usuários que optaram. No-op sem RESEND_API_KEY. */
export async function sendWeeklyDigests(): Promise<{ sent: number; skipped: string }> {
  if (!emailEnabled()) return { sent: 0, skipped: "RESEND_API_KEY ausente" };
  if (!SUPABASE_URL || !SUPABASE_KEY) return { sent: 0, skipped: "supabase ausente" };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_digest_recipients`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return { sent: 0, skipped: `rpc HTTP ${r.status}` };
    const recipients = await r.json() as Array<{ user_id: string; email: string }>;
    if (recipients.length === 0) return { sent: 0, skipped: "nenhum inscrito" };

    const digest = await buildDigest();
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const html = renderWeeklyDigestHtml(digest, appUrl);
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    let sent = 0;
    for (const rec of recipients) {
      const result = await sendEmail({ to: rec.email, subject: "Seu resumo semanal — JLB Analytics", html });
      if (result.ok) {
        sent++;
        // marca como enviado
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${rec.user_id}`, {
          method: "PATCH",
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({ last_digest_sent_at: new Date().toISOString() }),
        }).catch(() => {});
      }
      await sleep(400); // throttle (Resend free: ~2 req/s)
    }
    log.info(`[weekly-digest] ${sent}/${recipients.length} emails enviados`);
    return { sent, skipped: "" };
  } catch (e) {
    return { sent: 0, skipped: e instanceof Error ? e.message : "erro" };
  }
}

// ── Credits status (read-only) ────────────────────────────────────────────────

router.get("/credits", async (req, res) => {
  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";
  const FREE_LIMIT = 30;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.json({ used: 0, limit: FREE_LIMIT, plan: "free" });
  }

  const authHeader = String(req.headers.authorization ?? "");
  if (!authHeader) return res.json({ used: 0, limit: FREE_LIMIT, plan: "free" });

  try {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const [, payload] = token.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as { sub?: string };
    const userId = decoded.sub;
    if (!userId) return res.json({ used: 0, limit: FREE_LIMIT, plan: "free" });

    const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_credits?user_id=eq.${userId}&select=plan,used_this_month`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!r.ok) return res.json({ used: 0, limit: FREE_LIMIT, plan: "free" });

    const rows = await r.json() as Array<{ plan: string; used_this_month: number }>;
    if (rows.length === 0) return res.json({ used: 0, limit: FREE_LIMIT, plan: "free" });

    const row = rows[0];
    return res.json({
      used: row.used_this_month,
      limit: row.plan === "premium" ? null : FREE_LIMIT,
      plan: row.plan,
    });
  } catch {
    return res.json({ used: 0, limit: FREE_LIMIT, plan: "free" });
  }
});

// ── Explain My Edge ──────────────────────────────────────────────────────────

router.post("/explain-edge", aiCreditsMiddleware, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY não configurada." });

  interface ExplainEdgeReq { title: string; marketProb: number; userProb: number; source?: string }
  const { title, marketProb, userProb, source = "polymarket" } = req.body as ExplainEdgeReq;
  if (!title || marketProb == null || userProb == null) return res.status(400).json({ error: "title, marketProb e userProb são obrigatórios." });

  const cacheKey = `explain-edge:${title.slice(0, 60)}:${Math.round(marketProb * 100)}:${Math.round(userProb * 100)}`;
  const cached = getCache<object>(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  const edge = Math.round((userProb - marketProb) * 100);
  const direction = edge > 0 ? "acima" : "abaixo";
  const platformName = source === "kalshi" ? "Kalshi" : "Polymarket";

  const prompt = `Você é um analista sênior de mercados preditivos. Um usuário da plataforma JLB Analytics acredita ter uma vantagem de estimativa sobre o mercado.

MERCADO: "${title}" (${platformName})
PROBABILIDADE DO MERCADO: ${Math.round(marketProb * 100)}% SIM
ESTIMATIVA DO USUÁRIO: ${Math.round(userProb * 100)}% SIM
EDGE: ${edge > 0 ? "+" : ""}${edge}pp ${direction} do mercado

Explique de forma educacional e específica:
1. De onde pode vir essa vantagem de estimativa
2. Por que o mercado coletivo pode estar sub/superestimando
3. Quais riscos podem invalidar essa tese
4. Um insight acionável baseado nessa análise

JSON exato, sem markdown:
{"explanation":"2 frases explicando a origem do edge","whyMarketMightBeMistaken":"Por que o mercado pode estar errado","keyInsight":"O insight mais importante para o usuário","riskFactor":"Principal risco que invalida a tese","confidence":"low|medium|high"}`;

  try {
    const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 500, messages: [{ role: "user", content: prompt }], timeoutMs: 15_000 });
    const parsed = extractJson(raw) as Record<string, string>;
    const result = { ...parsed, edge, cached: false };
    setCache(cacheKey, result, 1800);
    res.json(result);
  } catch (err) {
    log.error("[explain-edge] error:", err);
    res.status(500).json({ error: "explain_edge_failed" });
  }
});

// ── AI Chat (widget flutuante) ────────────────────────────────────────────────
// Duas rotas sobre o MESMO núcleo (runChat): POST /chat (JSON, retrocompat) e
// POST /chat/stream (SSE — o widget vê o texto nascendo, TTFT percebido ~1s).

interface ChatContext { portfolio?: string; isAuthenticated?: boolean; userLevel?: number; levelContext?: string }
interface ChatRequest { message?: string; history?: unknown; context?: ChatContext }

// Bloco ESTÁTICO do system — idêntico para todos os usuários, vai com
// cache_control (prompt caching real: TTFT menor e ~90% mais barato).
// Tudo que varia por request fica no bloco dinâmico, nunca aqui.
const CHAT_SYSTEM = `Você é o Analista JLB — assistente da JLB Analytics, plataforma brasileira de educação quantitativa para mercados preditivos (Polymarket, Kalshi), apostas esportivas racionais e finanças.

PERSONA: analista quantitativo sênior e professor paciente. Tom direto e caloroso, zero jargão vazio; o rigor de quem ensina com números.

ESCOPO — você responde sobre:
- Mercados preditivos: probabilidades, odds, liquidez, volume, como ler Polymarket/Kalshi
- Método quantitativo: Valor Esperado, Critério de Kelly, Brier Score, calibração, overround, base rates, decomposição de Fermi
- Estatística e modelos: Poisson, regressão, Elo, Monte Carlo, vieses cognitivos
- Macro/finanças em contexto educacional (Selic, CDI, IPCA, juros, inflação)
- A própria plataforma JLB: páginas, calculadoras, trilha de níveis 1-5

FORA DO ESCOPO: qualquer outro assunto → redirecione com gentileza, em 1 frase, para o que você cobre. Nunca finja saber.

REGRAS INEGOCIÁVEIS:
- SEMPRE em português brasileiro
- NUNCA recomende aposta, posição, compra ou venda específica. Você ensina o método; a decisão é do usuário. Pressionado por uma "dica", explique o porquê da regra e ofereça o cálculo no lugar
- Corrija achismos com matemática, não com opinião — mostre a conta
- Probabilidade sem contexto não existe: relacione com valor esperado, margem e gestão de banca quando relevante
- NÃO invente dados, notícias ou cotações; use apenas o que estiver nos blocos de contexto. Sem dado, diga que não tem
- Use os indicadores do BCB do contexto ao falar de macro brasileira

FORMATO:
- Curto por padrão: 1 a 3 parágrafos, TEXTO PURO — sem nenhum markdown (nada de **negrito**, títulos, tabelas ou crase); hífens para listas curtas são ok
- Adapte a profundidade ao nível do usuário indicado no contexto (1 = iniciante absoluto, 5 = avançado)
- Números com 1-2 casas decimais e unidade sempre (%, R$, pp)
- Ao usar material do Cerebro, cite [C1], [C2]…
- Quando fizer sentido, feche apontando a página da JLB que aprofunda o tema (/calculadoras, /nivel/3, /previsao, /apostas)`;

function sanitizeHistory(history: unknown): ClaudeMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((m): m is ClaudeMessage =>
      !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-10)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4_000) }));
}

/** Top mercados ao vivo (do cache do servidor) — o Analista JLB responde sobre
 *  preços reais em vez de dizer que não tem acesso. Cache 3 min. */
function buildLiveMarketsBlock(): string {
  const cached = getCache<string>("chat-live-markets");
  if (cached !== null) return cached;
  const poly = getCache<Array<{ question: string; outcomePrices?: string; volume?: number }>>("polymarket:markets:active") ?? [];
  const kalshi = getCache<Array<{ title: string; yesProb: number; volume?: number }>>("kalshi:markets") ?? [];
  const items: { t: string; p: number; v: number; src: string }[] = [];
  for (const m of poly) {
    const p = parsePolyPrices(m.outcomePrices)[0];
    if (m.question && p !== undefined) items.push({ t: m.question, p: Math.round(p * 100), v: m.volume ?? 0, src: "Polymarket" });
  }
  for (const m of kalshi) {
    if (m.title) items.push({ t: m.title, p: Math.round(m.yesProb > 1 ? m.yesProb : m.yesProb * 100), v: m.volume ?? 0, src: "Kalshi" });
  }
  const top = items.sort((a, b) => b.v - a.v).slice(0, 10);
  if (top.length === 0) return ""; // cache frio de mercados — NÃO cachear o vazio
  const block = `MERCADOS PREDITIVOS AO VIVO (probabilidade de SIM agora — use quando a pergunta tocar nesses temas; são os preços reais):\n${top.map((i) => `- [${i.src}] "${i.t}" — ${i.p}%`).join("\n")}`;
  setCache("chat-live-markets", block, 180);
  return block;
}

/** Contexto dinâmico do system: data, BCB (cache 1h), Cerebro (cache 10min) e mercados ao vivo em PARALELO. */
async function buildChatDynamicContext(message: string, context?: ChatContext): Promise<string> {
  const cerebroKey = `chat-cerebro:${message.toLowerCase().replace(/\s+/g, " ").slice(0, 100)}`;
  const cachedCerebro = getCache<string>(cerebroKey);
  const [selic, cdi, ipca, cerebro] = await Promise.all([
    fetchBcbSerie(432), fetchBcbSerie(4389), fetchBcbSerie(13522),
    cachedCerebro !== null
      ? Promise.resolve(cachedCerebro)
      : fetchCerebroContext(message).then((c) => { setCache(cerebroKey, c.context, 600); return c.context; }),
  ]);

  const parts = [
    `DATA ATUAL: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
    `INDICADORES (Banco Central do Brasil): Selic ${selic ?? "~11"}% a.a. · CDI ${cdi ?? "~11"}% a.a. · IPCA ${ipca ?? "~4.5"}% a.a.`,
    `NÍVEL DO USUÁRIO NA TRILHA: ${context?.userLevel ?? 1}/5`,
  ];
  if (context?.levelContext) parts.push(`CONTEXTO DO USUÁRIO:\n${String(context.levelContext).slice(0, 800)}`);
  if (context?.portfolio) parts.push(`CARTEIRA SIMULADA DO USUÁRIO:\n${String(context.portfolio).slice(0, 800)}`);
  const liveMarkets = buildLiveMarketsBlock();
  if (liveMarkets) parts.push(liveMarkets);
  parts.push(cerebro
    ? `BASE DE CONHECIMENTO CEREBRO (material curado; cite como [C1], [C2]…):\n${cerebro}`
    : "BASE DE CONHECIMENTO CEREBRO: nenhum material relevante para esta pergunta. NÃO invente notícias, números de mercado ou eventos recentes — responda com o conhecimento conceitual e, se o dado recente fizer falta, diga isso ao usuário.");
  return parts.join("\n\n");
}

/** Núcleo do chat — valida, monta contexto e chama o Claude (com ou sem streaming). */
async function runChat(body: ChatRequest, onDelta?: (text: string) => void): Promise<string> {
  const message = String(body.message ?? "").trim().slice(0, 4_000);
  const dynamic = await buildChatDynamicContext(message, body.context);
  return streamClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 1024,
    system: CHAT_SYSTEM,
    systemDynamic: dynamic,
    messages: [...sanitizeHistory(body.history), { role: "user", content: message }],
    timeoutMs: 55_000,
    onDelta,
  });
}

function chatGuards(req: Parameters<Parameters<typeof router.post>[1]>[0], res: Parameters<Parameters<typeof router.post>[1]>[1]): boolean {
  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: "AI service not configured. Add ANTHROPIC_API_KEY to .env" });
    return false;
  }
  const { message } = (req.body ?? {}) as ChatRequest;
  if (!message?.trim()) { res.status(400).json({ error: "message is required" }); return false; }
  const ip = req.ip ?? "unknown";
  if (isRateLimited(`chat:${ip}`, 10, 60_000)) {
    res.status(429).json({ error: "rate_limited", message: "Muitas mensagens. Aguarde um instante." });
    return false;
  }
  return true;
}

router.post("/chat", aiCreditsMiddleware, async (req, res) => {
  if (!chatGuards(req, res)) return;
  try {
    const reply = await runChat(req.body as ChatRequest);
    res.json({ reply });
  } catch (err) {
    log.error("[AI chat] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/chat/stream", aiCreditsMiddleware, async (req, res) => {
  if (!chatGuards(req, res)) return;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event: string, data: Record<string, unknown>) =>
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    const reply = await runChat(req.body as ChatRequest, (text) => send("delta", { text }));
    send("done", { reply });
  } catch (err) {
    log.error("[AI chat/stream] error:", err);
    send("error", { message: "O assistente está indisponível agora. Tente de novo em instantes." });
  }
  res.end();
});

// Avaliação 👍/👎 de uma resposta — alimenta chat_feedback (base para refinar
// prompt/RAG com dados reais). Escrita só pelo backend; anônimo é permitido.
router.post("/chat/feedback", async (req, res) => {
  const ip = req.ip ?? "unknown";
  if (isRateLimited(`chat-fb:${ip}`, 6, 60_000)) return res.status(429).json({ error: "rate_limited" });

  const { question, answer, rating } = (req.body ?? {}) as { question?: string; answer?: string; rating?: number };
  if (!question?.trim() || !answer?.trim() || (rating !== 1 && rating !== -1)) {
    return res.status(400).json({ error: "invalid_feedback" });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ ok: true }); // degrada sem Supabase

  const authHeader = String(req.headers.authorization ?? "");
  const userId = authHeader ? await verifyUserId(authHeader) : null;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/chat_feedback`, {
      method: "POST",
      headers: supaWriteHeaders(),
      body: JSON.stringify({
        user_id: userId,
        question: question.slice(0, 2_000),
        answer: answer.slice(0, 4_000),
        rating,
      }),
      signal: AbortSignal.timeout(6_000),
    });
  } catch (err) {
    log.warn("[chat-feedback] insert falhou:", err instanceof Error ? err.message : err);
  }
  res.json({ ok: true });
});

// ── Market Analyze ────────────────────────────────────────────────────────────
// Pipeline de 3 fases:
// 1. Parallel: AI gera queries otimizadas + busca inicial com keywords brutas
// 2. Busca secundária com query gerada pela IA
// 3. IA filtra relevância + analisa (retorna apenas artigos genuinamente relevantes)

interface AnalyzeParams { title: string; yesProb: number; source: string; description?: string; marketId?: string; category?: string }
type PhaseEmit = (step: string, data?: Record<string, unknown>) => void;

/**
 * Núcleo da análise de mercado — compartilhado por /analyze (JSON) e
 * /analyze/stream (SSE). Emite fases reais via onPhase para o streaming mostrar
 * progresso de verdade (notícias → fontes cruzadas → IA analisando), em vez de
 * um cronômetro adivinhado no cliente.
 */
async function runMarketAnalysis(p: AnalyzeParams, onPhase: PhaseEmit = () => {}): Promise<Record<string, unknown>> {
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

Os artigos são numerados a partir de [1]. JSON exato (sem markdown):
{"relevantIndices":[1,3],"fairValue":62,"confidence":"baixa|media|alta","referenceClass":"qual classe de referência e base rate usada","analysis":"3-4 frases densas citando [N] e [CN] quando usados","keyFactors":["fator com nome próprio 1","fator 2","fator 3"],"watchFor":"evento/indicador concreto","biasAlert":"viés específico ou null","newsRelevance":"high|medium|low|none","probabilityAssessment":"fair|underpriced|overpriced|uncertain","edgeSignal":"1 frase: seu fairValue vs preço e por quê"}`;

      try {
        const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 1000, messages: [{ role: "user", content: prompt }], timeoutMs: 22_000 });
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
          const fv = Math.round(parsed.fairValue);
          fairValue = Math.max(5, Math.min(95, Math.max(probPct - 15, Math.min(probPct + 15, fv))));
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
        marketProb: probPct, aiFairValue: fairValue, confidence,
      });
    }
    return result;
  }
}

// ── Endpoints da análise: JSON (/analyze) + SSE (/analyze/stream) ─────────────

const ANALYZE_CACHE_KEY = (p: AnalyzeParams) => `market-analyze:v3:${p.source ?? ""}:${p.title.slice(0, 80)}`;

router.post("/analyze", aiCreditsMiddleware, async (req, res) => {
  try {
    const ip = req.ip ?? "unknown";
    if (isRateLimited(`analyze:${ip}`, 5, 60_000)) {
      return res.status(429).json({ error: "rate_limited", message: "Muitas análises em sequência. Aguarde um momento." });
    }
    const body = req.body as AnalyzeParams;
    if (!body?.title) return res.status(400).json({ error: "title required" });

    const cacheKey = ANALYZE_CACHE_KEY(body);
    const cached = getCache<object>(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const result = await runMarketAnalysis(body);
    setCache(cacheKey, result, 1800);
    res.json(result);
  } catch (err) {
    log.error("[market-analyze] error:", err);
    res.status(500).json({ error: "analyze_failed" });
  }
});

// Streaming SSE — emite fases reais (sources → analyzing → result) para o cliente
// mostrar progresso de verdade em vez de um cronômetro adivinhado.
router.post("/analyze/stream", aiCreditsMiddleware, async (req, res) => {
  const ip = req.ip ?? "unknown";
  if (isRateLimited(`analyze:${ip}`, 5, 60_000)) {
    return res.status(429).json({ error: "rate_limited", message: "Muitas análises em sequência. Aguarde um momento." });
  }
  const body = req.body as AnalyzeParams;
  if (!body?.title) return res.status(400).json({ error: "title required" });

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // evita buffering em proxies
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const cacheKey = ANALYZE_CACHE_KEY(body);
  const cached = getCache<object>(cacheKey);
  if (cached) {
    send("result", { ...cached, cached: true });
    send("done", {});
    return res.end();
  }

  try {
    const result = await runMarketAnalysis(body, (step, data) => send("phase", { step, ...data }));
    setCache(cacheKey, result, 1800);
    send("result", result);
    send("done", {});
    res.end();
  } catch (err) {
    log.error("[market-analyze-stream] error:", err);
    send("error", { message: "analyze_failed" });
    res.end();
  }
});

// ── AI Track Record ─────────────────────────────────────────────────────────
// Calibração real da própria IA: Brier da IA vs Brier do mercado em previsões resolvidas.
router.get("/track-record", async (_req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ available: false });
  const cached = getCache<object>("ai-track-record");
  if (cached) return res.json({ ...cached, cached: true });
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_track_record?select=*`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return res.json({ available: false });
    const rows = await r.json() as Array<Record<string, number | null>>;
    const t = rows[0] ?? {};
    const resolvedCount = Number(t.resolved_count ?? 0);
    const result = {
      available: true,
      resolvedCount,
      totalCount: Number(t.total_count ?? 0),
      aiBrier: t.ai_brier !== null ? Number(t.ai_brier) : null,
      marketBrier: t.market_brier !== null ? Number(t.market_brier) : null,
      beatMarketCount: Number(t.beat_market_count ?? 0),
      beatMarketPct: resolvedCount > 0 ? Math.round((Number(t.beat_market_count ?? 0) / resolvedCount) * 100) : null,
      avgAbsEdge: t.avg_abs_edge !== null ? Number(t.avg_abs_edge) : null,
      skillVsMarket: (t.ai_brier !== null && t.market_brier !== null && Number(t.market_brier) > 0)
        ? Number((1 - Number(t.ai_brier) / Number(t.market_brier)).toFixed(3)) : null,
    };
    setCache("ai-track-record", result, 600);
    res.json(result);
  } catch {
    res.json({ available: false });
  }
});

// ── Onde a JLB discorda do mercado ──────────────────────────────────────────
// Lê as previsões recentes da IA e cruza com o preço atual — ranqueia por edge.
router.get("/divergences", async (_req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ divergences: [] });
  const cached = getCache<object>("ai-divergences");
  if (cached) return res.json({ ...cached, cached: true });
  const divergences = await computeDivergences();
  const result = { divergences, count: divergences.length };
  setCache("ai-divergences", result, 300);
  res.json(result);
});

// ── Resumo Semanal JLB (digest) — conteúdo compartilhado app + email ─────────
router.get("/weekly-digest", async (_req, res) => {
  const cached = getCache<object>("weekly-digest");
  if (cached) return res.json({ ...cached, cached: true });
  try {
    const digest = await buildDigest();
    setCache("weekly-digest", digest, 1800); // 30 min
    res.json(digest);
  } catch {
    res.status(500).json({ error: "digest_failed" });
  }
});

// ── Seed manual de previsões da IA (ativa Consenso/Divergências/Track Record) ──
router.post("/seed-forecasts", async (req, res) => {
  const ip = req.ip ?? "unknown";
  if (isRateLimited(`ai-seed:${ip}`, 2, 600_000)) {
    return res.status(429).json({ error: "rate_limited", message: "Seed já disparado recentemente. Aguarde." });
  }
  const result = await seedAiForecasts();
  if (!result.started) return res.status(result.reason === "já em execução" ? 409 : 503).json({ ok: false, ...result });
  res.json({ ok: true, message: "Seed iniciado em background — previsões aparecem em ~1 min." });
});

// ── Histórico de fair value da IA por mercado (evolução da previsão) ──────────
router.get("/forecast-history", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ history: [] });
  const marketId = String(req.query.marketId ?? "");
  if (!marketId) return res.status(400).json({ error: "marketId required" });
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_forecasts?market_id=eq.${encodeURIComponent(marketId)}&select=ai_fair_value,market_prob,confidence,created_at&order=created_at.asc&limit=60`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(8_000) }
    );
    if (!r.ok) return res.json({ history: [] });
    const rows = await r.json() as Array<{ ai_fair_value: number; market_prob: number; confidence: string; created_at: string }>;
    res.json({
      history: rows.map((x) => ({
        aiFairValue: Math.round(x.ai_fair_value), marketProb: Math.round(x.market_prob),
        confidence: x.confidence, date: x.created_at,
      })),
    });
  } catch {
    res.json({ history: [] });
  }
});

// ── Model Predict ─────────────────────────────────────────────────────────────

interface PredictParams { domain: string; question: string; context?: string; timeHorizon: "short" | "medium" | "long"; bankroll?: number }

const PREDICT_CACHE_KEY = (p: PredictParams) =>
  `model-predict:${p.domain}:${p.question.slice(0, 60)}:${p.timeHorizon}${p.bankroll ? `:br${Math.round(p.bankroll)}` : ""}`;

/** Núcleo da Previsão Guiada — compartilhado por /model-predict (JSON) e
 *  /model-predict/stream (SSE). Emite fases reais via onPhase. */
async function runModelPredict(p: PredictParams, onPhase: PhaseEmit = () => {}): Promise<Record<string, unknown>> {
  const { domain, question, context = "", timeHorizon = "medium", bankroll } = p;
  const NEWS_API_KEY = process.env.NEWS_API_KEY ?? "";

  onPhase("context");
  // Fase 1 em paralelo: macro (BCB) + notícias + Cerebro (base curada própria).
  const [bcbSettled, predictNewsResult, cerebroSettled] = await Promise.all([
    Promise.allSettled([fetchBcbSerie(432), fetchBcbSerie(13522)]),
    getNewsForMarket(question, NEWS_API_KEY, context || undefined, { maxTotal: 6, daysPrimary: 7 }),
    fetchCerebroContext(question, context || undefined).catch(() => ({ context: "", hits: [] })),
  ]);
  const selicVal = bcbSettled[0].status === "fulfilled" ? bcbSettled[0].value : null;
  const ipcaVal = bcbSettled[1].status === "fulfilled" ? bcbSettled[1].value : null;
  const predictArticles = predictNewsResult.articles;
  const cerebroCtx = cerebroSettled.context;
  onPhase("context_done", { articles: predictArticles.length, isBR: predictNewsResult.isBR, cerebroHits: cerebroSettled.hits.length });
  onPhase("analyzing");

  const DOMAIN_LABELS: Record<string, string> = { sports: "Esportes", economy: "Economia / Macro", energy: "Energia / Commodities", politics: "Política", science: "Ciência / Tecnologia", crypto: "Cripto / Digital Assets", finance: "Finanças / Mercado", climate: "Clima / ENSO" };
  const HORIZON_MAP = { short: "curto prazo (dias a semanas)", medium: "médio prazo (1–6 meses)", long: "longo prazo (6 meses a 5 anos)" };

  const systemPrompt = `Você é o melhor sistema de previsão quantitativa do mundo — combina a precisão de Nate Silver (538), a rigorosidade de Philip Tetlock (Superforecasting), os modelos de Daron Acemoglu e a prática de quantistas do JP Morgan e BCB.

Sua missão em cada análise:
1. DETECTAR nível de expertise do usuário pela linguagem da pergunta
2. IDENTIFICAR domínio exato e sub-tipo da previsão
3. APLICAR o Protocolo Superforecaster completo (4 etapas)
4. SELECIONAR o modelo mais calibrado e empiricamente validado
5. ADAPTAR toda a saída ao nível detectado do usuário

════════════════════════════════════════════
PROTOCOLO SUPERFORECASTER OBRIGATÓRIO
(Philip Tetlock — Good Judgment Project)
════════════════════════════════════════════

Toda previsão deve seguir EXATAMENTE estas 4 etapas:

ETAPA 1 — VISÃO EXTERNA (Reference Class Forecasting)
• Identifique a "classe de referência" — qual TIPO de evento é esse?
• Qual a frequência base histórica? (ex: "Oposições vencem incumbentes em 42% das vezes")
• Essa é sua âncora ANTES de olhar para detalhes específicos
• Cite a fonte da frequência base (paper, base de dados histórica, BCB, FIFA, etc.)

ETAPA 2 — DECOMPOSIÇÃO DE FERMI
• Quebre a pergunta em 2-4 sub-questões independentes
• Estime a probabilidade de cada sub-questão separadamente
• Combine com a regra da cadeia de probabilidades: P(A∩B∩C) = P(A)×P(B|A)×P(C|A,B)
• Exemplo: P(Copa) = P(passa grupo) × P(quartas) × P(semi) × P(final)

ETAPA 3 — VISÃO INTERNA (Inside View Adjustments)
• O que torna ESTE caso diferente da frequência base?
• Liste 2-3 fatores que AUMENTAM a probabilidade vs. base rate
• Liste 2-3 fatores que DIMINUEM a probabilidade vs. base rate
• Quantifique o ajuste de cada fator (ex: "+5pp pela vantagem de casa")

ETAPA 4 — SÍNTESE + CALIBRAÇÃO
• Combine base rate + ajustes internos
• Aplique o modelo econométrico selecionado para validar
• Extremize levemente em direção a 0 ou 1 (crowds tendem a subestimar)
• Aplique os limites de calibração por domínio
• Resultado: probabilidade com intervalo de confiança 80%

════════════════════════════════════════════
DETECÇÃO DE EXPERTISE (analise a linguagem da pergunta)
════════════════════════════════════════════
"leigo": linguagem cotidiana sem termos técnicos — "vai ganhar?", "vai subir?", "o que acontece se...?"
"intermediario": conhece conceitos de mercado e probabilidade — pergunta sobre inflação, taxa, mercado, risco
"avancado": usa termos técnicos — menciona modelos, coeficientes, p-valor, derivadas, correlação, regressão, cita papers

════════════════════════════════════════════
BIBLIOTECA COMPLETA — MODELO CERTO PARA CADA CONTEXTO
════════════════════════════════════════════

ESPORTES — FUTEBOL
• Partida única → Dixon-Coles Poisson Bivariado
  λ_h = exp(μ + vantagem_casa + ataque_A − defesa_B)
  λ_a = exp(μ + ataque_B − defesa_A)
  P(i,j) = τ(i,j) × Poisson(λ_h,i) × Poisson(λ_a,j)
  [Paper: Dixon & Coles, J.Applied Statistics, 1997]
• Copa do Mundo / torneio → Hoffmann-Klement Monte Carlo
  score = −1.175 + 0.221·ln(PIBpc) + 0.184·ln(pop) + 0.046T − 0.0016T² + 0.50·FIFA_norm + bônus_sede
  [Paper: Hoffmann et al., J.Applied Economics, 2002 — 3/3 acertos 2014/2018/2022]
• Temporada / ranking → Elo com decaimento temporal
  E_A = 1/(1 + 10^(−ΔElo/400)); ΔElo_ganho = K × (resultado − esperado); K=32; decaimento 5%/mês inatividade
• Basketball (NBA/NBB) → Pythagorean wins
  win% = pts^e / (pts^e + opp^e), e≈14.23 (NBA), e≈12 (NBB)
• Atletismo / recordes → modelo de Weibull para tempos extremos

ECONOMIA / MACRO BRASIL
• Taxa básica (Selic) → Taylor Rule de Woodford/BCB
  r_t = r* + π* + 1.5·(π_t − π*) + 0.5·(Ŷ_t − Y_t) + ε
  Brasil: r*≈4.5% real, π*=3.0%, gap_output via IBC-Br
• Inflação (IPCA) → Phillips Curve Novo-Keynesiana Híbrida
  π_t = 0.35·E[π_{t+1}] + 0.65·π_{t−1} + 0.048·(U*−U_t) + γ·câmbio + ε
  [Estimativa BCB Working Paper 2023]
• Câmbio USD/BRL → UIP + carry trade + risco emergente
  E[ΔBRL] = (i_BR − i_US)/4 − risk_premium_EM
  risk_premium_EM Brasil histórico: 220–320bps acima UST
• PIB → Solow growth accounting + indicador coincidente BCB
  Δln(Y) = ΔA/A + α·ΔK/K + (1−α)·ΔL/L; α≈0.38 Brasil
• Recessão (prob 12m) → Probit com curva de juros
  P(recessão) = Φ(−1.37 − 0.91·spread_10y2y) — calibrado EUA; Brasil: use spread CDI futuro 1y−3m
• Dívida pública / fiscal → modelo DSGE simplificado do FMI

POLÍTICA / ELEIÇÕES
• Eleição presidencial EUA → Bread & Peace (Abramowitz 2012, acurácia 87%)
  V = 47.02 + 0.108·Q2_GDP_ann − 2.4·fatalities/100k + 3.89·(−1 se 2+ mandatos incumbente)
• Eleição presidencial Brasil → voto econômico calibrado IPEA
  V_inc ≈ 50 + 2.1·Δcrescimento_PIB − 1.3·Δinflação − 0.8·desemprego + 3.0·aprovação_presidencial/10
  [Referência: Veiga & Veiga, Economia Aplicada, 2004–2022]
• Aprovação presidencial → ARIMA(1,1,1) sobre série histórica do Datafolha/Ipespe
• Reforma legislativa → base rate + ajuste coalizão
  P(aprovação) ≈ P_histórica_tipo + Δcoalizão_% × 0.55
• Referendo / plebiscito → meta-análise de polls com prior Dirichlet

FINANÇAS / MERCADO
• Retorno esperado de ação → CAPM / Fama-French 3 fatores
  E(r_i) = r_f + β_i·(E(r_m)−r_f) + s_i·SMB + h_i·HML
  Brasil: r_f=Selic, prêmio de risco Ibovespa histórico≈4.8%aa
• Volatilidade → GARCH(1,1) — padrão indústria
  σ²_t = ω + α·ε²_{t−1} + β·σ²_{t−1}; α+β<1 (persistência); VIX como proxy global
• Opção de compra → Black-Scholes (precificação risk-neutral)
  C = S₀N(d₁) − Ke^{−rT}N(d₂); d₁=[ln(S/K)+(r+σ²/2)T]/(σ√T)
• Portfólio eficiente → Markowitz mean-variance
  max Sharpe = (E(r_p)−r_f)/σ_p; fronteira eficiente via otimização quadrática
• Valuation → DCF com perpetuidade Gordon
  V = FCF₁/(WACC−g); g≈PIB_nominal_longo_prazo≈6% Brasil

CRIPTO / ATIVOS DIGITAIS
• Tendência estrutural → Stock-to-Flow Power Law (Plan B, 2019)
  ln(P_BTC) = a + b·ln(S2F); b≈3.3; limitações documentadas (não causal)
• Volatilidade → GARCH-t (fat tails obrigatório em cripto)
  σ_BTC histórica: ~70%aa; σ_ETH: ~85%aa; altcoins: >120%aa
• Ciclos de mercado → análise de dominância BTC + on-chain (MVRV, NVT)
• Correlação cripto-macro → rolling 90d vs DXY, SPX, VIX; regime change detection (Markov)

CIÊNCIA / TECNOLOGIA
• Difusão de inovação → Bass (1969) — padrão ouro em tech
  dN/dt = [p + q·(N/M)]·(M−N)
  p_típico≈0.01 (inovadores), q_típico≈0.38 (imitadores); smartphone global: p=0.008, q=0.421
• Crescimento de plataforma → Verhulst logística
  N(t) = K / (1 + A·e^{−r·t}); K=capacidade máxima estimada de mercado
• Adoção de IA → S-curve Fisher-Pry: ln(f/(1−f)) = a + b·t; f=fração do potencial
• Startups → lei de potências (power law) para valuations

ENERGIA / COMMODITIES
• Petróleo (WTI/Brent) → VAR(2) com DXY + OPEC_output + inventários EIA
  Modelo ARIMA(2,1,1)+GARCH(1,1) para forecast de curto prazo
• Energia elétrica Brasil → sazonalidade harmônica + reservatórios
  P_t = μ + A·cos(2πt/12 + φ) + γ·(1−reserv_%) + β·PIB_industrial + ε
• Commodities agrícolas → modelo de supply & demand estocástico
• Energia renovável → logística de capacidade instalada global

CLIMA / ENSO
• El Niño/La Niña → índice ONI + ARIMA com forcings sazonais
  ONI(t+6) = f(ONI_atual, gradiente_termoclina, fase_AMO)
• Safras Brasil → regressão múltipla com INMET/CEPAGRI
  yield = β₀ + β₁·T_média + β₂·chuva_mm + β₃·ONI + β₄·CO₂_ppm + ε
• Eventos extremos → distribuição GEV (Generalized Extreme Value)
  F(x) = exp{−[1+ξ(x−μ)/σ]^{−1/ξ}}
• Temperatura global → trend linear + harmônicos de Milankovitch

GEOPOLÍTICA / EVENTOS GLOBAIS
• Conflitos / guerras → base rate histórica + modelo de sobrevivência de Cox
  h(t) = h₀(t)·exp(β₁·PIBpc + β₂·democracia + β₃·etnia)
• Sanções → regressão sintética (synthetic control method)
• Risco soberano → CDS spread + modelo de Merton para defaults
• Epidemias → SIR/SEIR compartmental: dI/dt = β·S·I − γ·I

════════════════════════════════════════════
CALIBRAÇÃO DE CONFIANÇA (nunca inflacionar)
════════════════════════════════════════════
• Finanças / cripto curto prazo: max 62% (mercados quase-eficientes)
• Macro econômica médio prazo: max 72% (ciclos identificáveis, alto ruído)
• Eleições >6 meses: max 68% (eventos políticos disruptivos)
• Esportes (1 jogo): max 78% (variância aleatória alta)
• Esportes (torneio inteiro): max 65%
• Tecnologia longo prazo: max 55% (disrupção imprevisível)
• Clima curto prazo (semanas): max 75%; longo prazo: max 50%

════════════════════════════════════════════
REGRAS DE ADAPTAÇÃO POR NÍVEL
════════════════════════════════════════════
LEIGO:
- plainLanguage: use analogia cotidiana concreta (ex: "é como apostar em cara ou coroa mas com 70% das moedas sendo cara")
- analogyExplanation: explique o fenômeno com algo da vida real, sem nenhum símbolo matemático
- probabilityVerbal: use APENAS uma dessas: "muito provável (>70%)" / "provável (55-70%)" / "incerto (45-55%)" / "improvável (30-45%)" / "muito improvável (<30%)"
- formula: pode ser simplificada ou em palavras
- actionableInsight: diga O QUE FAZER de forma concreta e direta

INTERMEDIARIO:
- use terminologia financeira/econômica padrão
- mostre a fórmula principal com os valores reais substituídos
- plainLanguage: explique como o modelo funciona em termos de mercado
- analogyExplanation: relate ao contexto de apostas / investimento

AVANCADO:
- formula: completa, com todas as variáveis explicitadas e derivação resumida
- cite o paper original com ano e journal
- plainLanguage: análise técnica com limitações epistêmicas
- analogyExplanation: paralelo histórico preciso (ex: "similar ao que aconteceu em X com Y%de desvio")
- mencione grau de incerteza paramétrica e sensibilidade a premissas

RESPONDA SOMENTE COM O JSON ABAIXO, SEM TEXTO ANTES OU DEPOIS, SEM MARKDOWN:
{"modelChosen":"","modelFamily":"","formula":"","whyThisModel":"","shortTermPrediction":"","mediumTermPrediction":"","longTermPrediction":"","confidenceShort":0,"confidenceMedium":0,"confidenceLong":0,"confidenceLow80":0,"confidenceHigh80":0,"plainLanguage":"","bankrollImpact":null,"keyAssumptions":[],"limitations":"","researchBasis":"","actionableInsight":"","expertiseLevel":"intermediario","analogyExplanation":"","probabilityVerbal":"","historicalParallel":"","referenceClass":"","baseRate":0,"baseRateSource":"","decomposition":[{"question":"","probability":0,"reasoning":""}],"insideViewUp":[],"insideViewDown":[],"updateTriggers":[],"calibrationWarning":null}`;

  // Todo o conteúdo por-requisição vive AQUI (não no system): o system fica
  // estático e o prompt caching realmente acerta (~2.5k tokens a ~90% menos).
  const newsBlock = predictArticles.length > 0
    ? `NOTÍCIAS RECENTES (${predictNewsResult.isBR ? "contexto BR" : "contexto global"} — cite pelo número [N] na análise):\n${predictArticles.map((a, i) => `[${i + 1}] "${a.title}" — ${a.source.name} (${a.publishedAt?.slice(0, 10) ?? ""})\n${a.description ?? ""}`).join("\n\n")}`
    : "SEM NOTÍCIAS RECENTES DISPONÍVEIS — baseie-se exclusivamente em dados históricos e modelos.";
  const cerebroBlock = cerebroCtx
    ? `\n\nCONTEXTO DO CEREBRO (base de conhecimento curada própria — cite como [C#]):\n${cerebroCtx}`
    : "";

  const userMessage = `DOMÍNIO: ${DOMAIN_LABELS[domain] ?? domain}\nPERGUNTA: ${question}\nCONTEXTO ADICIONAL: ${context || "nenhum"}\nHORIZONTE: ${HORIZON_MAP[timeHorizon] ?? timeHorizon}\nBANKROLL: ${bankroll ? `R$ ${bankroll.toLocaleString("pt-BR")}` : "não informado"}

DATA: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
MACRO BR: Selic ${selicVal ?? "~10.5"}% a.a. | IPCA ${ipcaVal ?? "~4.8"}% a.a.

${newsBlock}${cerebroBlock}`;

  // Haiku 4.5 (rápido): o prompt é tão prescritivo (20 modelos + protocolo Superforecaster
  // passo a passo) que a qualidade se mantém, e a geração de ~3200 tokens cai para ~25-40s.
  // Timeout 55s cobre picos — callClaude aborta e perde TUDO se estourar.
  const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 3200, system: systemPrompt, messages: [{ role: "user", content: userMessage }], timeoutMs: 55_000, cacheSystem: true });
  const parsed = extractJson(raw) as Record<string, unknown>;

  // Troca os marcadores [N]/[C#] pelos nomes reais das fontes nos campos de
  // texto livre — o usuário lê "(Reuters)" em vez de "[1]".
  const newsSources = predictArticles.map((a) => a.source.name);
  const cerebroSources = (cerebroSettled.hits ?? []).map((h) => h.kind === "síntese" ? "Síntese Cerebro" : `Cerebro · ${h.source}`);
  const humanize = (v: unknown) => typeof v === "string" ? humanizeCitations(v, newsSources, cerebroSources) : v;
  for (const k of ["plainLanguage", "shortTermPrediction", "mediumTermPrediction", "longTermPrediction", "actionableInsight", "analogyExplanation", "historicalParallel", "limitations", "whyThisModel"]) {
    if (typeof parsed[k] === "string") parsed[k] = humanize(parsed[k]);
  }
  if (Array.isArray(parsed.decomposition)) {
    parsed.decomposition = (parsed.decomposition as Array<Record<string, unknown>>).map((d) => ({ ...d, reasoning: humanize(d.reasoning) }));
  }
  for (const k of ["insideViewUp", "insideViewDown", "keyAssumptions", "updateTriggers"]) {
    if (Array.isArray(parsed[k])) parsed[k] = (parsed[k] as unknown[]).map(humanize);
  }

  return { ...parsed, domain, timeHorizon, cached: false };
}

// ── Previsão Guiada: JSON (/model-predict) + SSE (/model-predict/stream) ───────

router.post("/model-predict", aiCreditsMiddleware, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY não configurada." });
  const ip = req.ip ?? "unknown";
  if (isRateLimited(`predict:${ip}`, 8, 60_000)) return res.status(429).json({ error: "rate_limited", message: "Muitas análises. Aguarde um momento." });
  const body = req.body as PredictParams;
  if (!body?.question?.trim() || !body?.domain?.trim()) return res.status(400).json({ error: "domain e question são obrigatórios." });

  const cacheKey = PREDICT_CACHE_KEY(body);
  const cached = getCache<object>(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });
  try {
    const result = await runModelPredict(body);
    setCache(cacheKey, result, 900);
    res.json(result);
  } catch (err) {
    log.error("[model-predict] error:", err);
    res.status(500).json({ error: "predict_failed", message: err instanceof Error ? err.message : "unknown" });
  }
});

router.post("/model-predict/stream", aiCreditsMiddleware, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY não configurada." });
  const ip = req.ip ?? "unknown";
  if (isRateLimited(`predict:${ip}`, 8, 60_000)) return res.status(429).json({ error: "rate_limited", message: "Muitas análises. Aguarde um momento." });
  const body = req.body as PredictParams;
  if (!body?.question?.trim() || !body?.domain?.trim()) return res.status(400).json({ error: "domain e question são obrigatórios." });

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const cacheKey = PREDICT_CACHE_KEY(body);
  const cached = getCache<object>(cacheKey);
  if (cached) { send("result", { ...cached, cached: true }); send("done", {}); return res.end(); }

  try {
    const result = await runModelPredict(body, (step, data) => send("phase", { step, ...data }));
    setCache(cacheKey, result, 900);
    send("result", result);
    send("done", {});
    res.end();
  } catch (err) {
    log.error("[model-predict-stream] error:", err);
    send("error", { message: err instanceof Error ? err.message : "predict_failed" });
    res.end();
  }
});

// ── Reddit Context ────────────────────────────────────────────────────────────

router.post("/reddit-context", async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY não configurada." });

  const ip = req.ip ?? "unknown";
  if (isRateLimited(`reddit-ctx:${ip}`, 8, 60_000)) return res.status(429).json({ error: "rate_limited", message: "Muitas análises. Aguarde um momento." });

  interface RedditCtxRequest { title: string; subreddit?: string; score?: number; comments?: number }
  const { title, subreddit = "", score = 0, comments = 0 } = req.body as RedditCtxRequest;
  if (!title?.trim()) return res.status(400).json({ error: "title required" });

  const cacheKey = `reddit-ctx:${title.slice(0, 100)}`;
  const cached = getCache<object>(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  const NEWS_KEY = process.env.NEWS_API_KEY ?? "";
  // Usa o pipeline unificado com detecção de idioma
  const newsResult = await getNewsForMarket(title, NEWS_KEY, undefined, { maxTotal: 6, daysPrimary: 7, daysSecondary: 14 });
  const articles = newsResult.articles;

  const newsContext = articles.length > 0
    ? articles.map((a, i) => `[${i + 1}] "${a.title}" — ${a.source.name} (${a.publishedAt.slice(0, 10)})\n${a.description ?? ""}`).join("\n\n")
    : "Nenhuma notícia recente disponível.";

  const isControversial = comments / Math.max(1, score) > 0.8;
  const isViral = score > 300;
  const subCtx = subreddit ? `Subreddit: r/${subreddit}` : "";

  const prompt = `Explique POR QUE este post está viral no Reddit. DATA: ${new Date().toLocaleDateString("pt-BR")}

POST: "${title}"
${subCtx}
Votos: ${score.toLocaleString()} | Comentários: ${comments.toLocaleString()}${isControversial ? " (controverso)" : ""}${isViral ? " (viral)" : ""}

NOTÍCIAS RECENTES:
${newsContext}

JSON exato:
{"whyTrending":"3 frases específicas sobre este post","context":"Contexto em 2 frases","bettingAngle":"Impacto em apostas em 1 frase","keyFacts":["fato 1","fato 2","fato 3"]}`;

  try {
    const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 600, messages: [{ role: "user", content: prompt }], timeoutMs: 20_000, prefillJson: false });
    interface ParsedCtx { whyTrending?: string; context?: string; bettingAngle?: string; keyFacts?: string[] }
    const parsed = extractJson(raw) as ParsedCtx;
    const result = {
      whyTrending: parsed.whyTrending ?? "", context: parsed.context ?? "",
      bettingAngle: parsed.bettingAngle ?? "", keyFacts: parsed.keyFacts ?? [],
      articles: articles.map((a) => ({ title: a.title, description: a.description, url: a.url, source: a.source.name, publishedAt: a.publishedAt, urlToImage: a.urlToImage })),
      cached: false,
    };
    setCache(cacheKey, result, 900);
    res.json(result);
  } catch (err) {
    log.error("[reddit-ctx] error:", err);
    res.status(500).json({ error: "reddit_ctx_failed", message: err instanceof Error ? err.message : "unknown" });
  }
});

// ── Daily Briefing ────────────────────────────────────────────────────────────

router.get("/daily-briefing", async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY não configurada." });

  const today = new Date().toISOString().slice(0, 10);
  const force = req.query.force === "1";
  const cacheKey = `daily-briefing:${today}`;
  if (!force) {
    const cached = getCache<object>(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });
  }

  const [polyResult, kalshiResult, ratesResult] = await Promise.allSettled([
    fetchJSON<PolyEvent[]>("https://gamma-api.polymarket.com/events?active=true&closed=false&limit=15&order=volume&ascending=false&with_nested_markets=true"),
    fetchJSON<KalshiEventsResponse>("https://api.elections.kalshi.com/trade-api/v2/events?limit=15&with_nested_markets=true", { "Accept": "application/json" }),
    Promise.all([fetchBcbSerie(432), fetchBcbSerie(13522), fetchBcbSerie(1)]),
  ]);

  const topMarkets: { source: string; title: string; prob: number }[] = [];

  if (polyResult.status === "fulfilled") {
    for (const ev of polyResult.value.slice(0, 8)) {
      const m = ev.markets?.[0];
      if (!m) continue;
      const prices = parsePolyPrices(m.outcomePrices);
      const yesProb = prices[0] !== undefined ? Math.round(prices[0] * 100) : null;
      if (m.question && yesProb !== null) topMarkets.push({ source: "Polymarket", title: m.question, prob: yesProb });
    }
  }
  if (kalshiResult.status === "fulfilled") {
    for (const ev of (kalshiResult.value.events ?? []).slice(0, 8)) {
      const m = ev.markets?.[0];
      if (!m) continue;
      const bid = parseFloat(m.yes_bid_dollars ?? "0") * 100;
      const ask = parseFloat(m.yes_ask_dollars ?? "0") * 100;
      const yesProb = bid > 0 && ask > 0 ? Math.round((bid + ask) / 2) : null;
      if ((m.title ?? ev.title) && yesProb !== null) topMarkets.push({ source: "Kalshi", title: m.title ?? ev.title ?? m.ticker, prob: yesProb });
    }
  }

  const [selic, ipca, usd] = ratesResult.status === "fulfilled" ? ratesResult.value : [null, null, null];

  const NEWS_KEY = process.env.NEWS_API_KEY ?? "";
  let newsHeadlines: string[] = [];
  if (NEWS_KEY) {
    try {
      const from2 = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const data = await fetchJSON<NewsApiResponse>(`https://newsapi.org/v2/everything?q=markets+economy+prediction&pageSize=6&sortBy=publishedAt&from=${from2}&language=en&apiKey=${NEWS_KEY}`);
      newsHeadlines = (data.articles ?? []).filter((a) => a.title !== "[Removed]").slice(0, 5).map((a) => `• ${a.title} (${a.source.name})`);
    } catch { /* skip */ }
  }

  const marketsContext = topMarkets.length > 0
    ? topMarkets.map((m) => `- [${m.source}] ${m.title}: ${m.prob}% SIM`).join("\n")
    : "Dados de mercados temporariamente indisponíveis.";

  const prompt = `Você é um analista quantitativo sênior gerando um briefing matinal para traders brasileiros.

DATA: ${new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
MACRO: Selic ${selic ?? "~10.5"}% | IPCA ${ipca ?? "~4.8"}% | USD/BRL ${usd ?? "~5.85"}

TOP MERCADOS:
${marketsContext}

MANCHETES:
${newsHeadlines.length > 0 ? newsHeadlines.join("\n") : "Sem manchetes disponíveis."}

JSON exato (sem markdown). Em marketHighlights, "prob" é a probabilidade SIM do mercado em número 0-100 (nunca texto):
{"headline":"","summary":"","topTheme":"","macroNote":"","marketHighlights":[{"market":"","prob":0,"insight":""}],"watchToday":"","calibrationTip":"","riskAlert":null}`;

  try {
    const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 1000, messages: [{ role: "user", content: prompt }], timeoutMs: 25_000, prefillJson: false });
    const parsed = extractJson(raw) as { marketHighlights?: { market?: string; prob?: unknown; insight?: string }[] };
    // O modelo às vezes preenche "prob" com um rótulo de texto — normaliza para número 0-100 ou null
    const marketHighlights = (Array.isArray(parsed.marketHighlights) ? parsed.marketHighlights : [])
      .filter((h) => h?.market && h?.insight)
      .map((h) => {
        const n = Number(h.prob);
        return { ...h, prob: Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null };
      });
    const result = { ...parsed, marketHighlights, topMarkets, generatedAt: new Date().toISOString(), cached: false };
    setCache(cacheKey, result, 86400);
    res.json(result);
  } catch (err) {
    log.error("[daily-briefing] error:", err);
    res.status(500).json({ error: "briefing_failed", message: err instanceof Error ? err.message : "unknown" });
  }
});

// ── Fair Value ────────────────────────────────────────────────────────────────
// Calcula um fair value independente para um mercado preditivo com base em:
//   - Base rate histórica da categoria
//   - Dados macro BCB (Selic, IPCA)
//   - Momentum de prob (variação recente)
//   - Claude Haiku para análise qualitativa
// Retorna: fairValue, confidence, edge vs mercado, reasoning detalhado.


router.post("/fair-value", aiCreditsMiddleware, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY não configurada." });

  const ip = req.ip ?? "unknown";
  if (isRateLimited(`fair-value:${ip}`, 10, 60_000)) {
    return res.status(429).json({ error: "rate_limited", message: "Muitas análises. Aguarde." });
  }

  interface FairValueRequest {
    title: string;
    marketProb: number;       // 0-100
    source: string;
    category?: string;
    volume24h?: number;
    weekPriceChange?: number; // delta em pp na última semana
    liquidity?: number;
  }
  const { title, marketProb, source, category = "other", volume24h, weekPriceChange, liquidity } = req.body as FairValueRequest;
  if (!title || marketProb === undefined) return res.status(400).json({ error: "title e marketProb são obrigatórios" });

  const cacheKey = `fair-value:${source}:${title.slice(0, 60)}:${Math.round(marketProb)}`;
  const cached = getCache<object>(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  const catKey = (category ?? "other").toLowerCase().replace(/[^a-z]/g, "") || "other";
  const catInfo = CATEGORY_BASE_RATES[catKey] ?? CATEGORY_BASE_RATES["other"];

  // Cerebro em paralelo com BCB — o fair value era calculado às cegas (só base
  // rate + macro); contexto real é o que separa estimativa de chute calibrado.
  const [selic, ipca, cerebroSettled, memoSettled] = await Promise.allSettled([
    fetchBcbSerie(432), fetchBcbSerie(13522), fetchCerebroContext(title), getCalibrationMemo(),
  ]);
  const selicVal = selic.status === "fulfilled" ? selic.value : null;
  const ipcaVal  = ipca.status === "fulfilled"  ? ipca.value  : null;
  const cerebroCtx = cerebroSettled.status === "fulfilled" ? cerebroSettled.value.context : "";
  const calibMemo = memoSettled.status === "fulfilled" ? memoSettled.value : "";

  // Sinalização de momentum: variação recente sugere tendência
  let momentumAdjust = 0;
  if (weekPriceChange !== undefined) {
    // Reversão à média para movimentos extremos, momentum para movimentos moderados
    if (Math.abs(weekPriceChange) > 10) {
      momentumAdjust = -weekPriceChange * 0.3; // pressão de reversão
    } else {
      momentumAdjust = weekPriceChange * 0.2;  // leve momentum
    }
  }

  // Sinalização de liquidez: mercado com alta liquidez → confiar mais na prob
  let liquidityWeight = 0.5; // peso da prob de mercado no fair value
  if (liquidity !== undefined) {
    if (liquidity > 100_000) liquidityWeight = 0.75;
    else if (liquidity > 10_000) liquidityWeight = 0.65;
    else if (liquidity < 1_000) liquidityWeight = 0.35;
  }

  // Fair value pré-Claude: média ponderada entre base rate e prob do mercado
  const preFairValue = Math.round(
    catInfo.baseRate * (1 - liquidityWeight) +
    marketProb * liquidityWeight +
    momentumAdjust
  );
  const clampedPreFV = Math.max(5, Math.min(95, preFairValue));

  const prompt = `Você é um analista quantitativo calculando o fair value independente de um mercado preditivo.

MERCADO: "${title}"
FONTE: ${source} | CATEGORIA: ${category}
PROB. DO MERCADO: ${marketProb}%
BASE RATE DA CATEGORIA: ${catInfo.baseRate}% (${catInfo.note})
MOMENTUM (variação 7d): ${weekPriceChange !== undefined ? (weekPriceChange > 0 ? "+" : "") + weekPriceChange.toFixed(1) + "pp" : "desconhecido"}
LIQUIDEZ: ${liquidity !== undefined ? "$" + liquidity.toLocaleString() : "desconhecida"}
VOLUME 24h: ${volume24h !== undefined ? "$" + volume24h.toLocaleString() : "desconhecido"}
NOSSO PRÉ-CÁLCULO: ${clampedPreFV}%
MACRO BR: Selic ${selicVal ?? "~10.5"}% | IPCA ${ipcaVal ?? "~4.8"}%
DATA: ${new Date().toLocaleDateString("pt-BR")}

CONTEXTO DO CEREBRO (base de conhecimento curada própria):
${cerebroCtx || "— sem artigos relacionados encontrados —"}
${calibMemo ? `\n${calibMemo}\n` : ""}
REGRAS DE CALIBRAÇÃO (críticas — nosso Brier Score é medido publicamente):
- O preço de um mercado líquido já agrega a informação disponível. Desvie dele APENAS com evidência concreta no contexto acima, e proporcional à força da evidência.
- Sem evidência relevante: fique dentro de ±3pp do mercado e use signal "neutral".
- NUNCA desvie mais de 15pp do preço de mercado.

Ajuste o fair value considerando o contexto real do mercado. Retorne JSON exato:
{"fairValue":65,"confidence":"medium","edge":5,"reasoning":"2-3 frases explicando a diferença entre o fair value e a prob do mercado","factors":["fator positivo","fator negativo"],"signal":"bullish|bearish|neutral","caveat":"limitação principal desta análise"}

Onde:
- fairValue: 5-95 (número inteiro)
- confidence: "low"|"medium"|"high" (baseado em liquidez e qualidade dos dados)
- edge: fairValue - marketProb (pode ser negativo)
- signal: "bullish" se fairValue > marketProb+3, "bearish" se fairValue < marketProb-3, "neutral" caso contrário`;

  try {
    const raw = await callClaude({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 500,
      messages: [{ role: "user", content: prompt }],
      timeoutMs: 15_000,
      prefillJson: false,
    });

    interface FVParsed { fairValue?: number; confidence?: string; edge?: number; reasoning?: string; factors?: string[]; signal?: string; caveat?: string }
    const parsed = extractJson(raw) as FVParsed;

    // Clamp duplo: faixa 5-95 E ±15pp do mercado — guardrail de calibração no
    // código, não só no prompt (mercado líquido raramente erra por >15pp)
    const rawFV = Math.round(Number(parsed.fairValue ?? clampedPreFV));
    const fairValue = Math.max(5, Math.min(95,
      Math.max(marketProb - 15, Math.min(marketProb + 15, rawFV))
    ));
    const result = {
      fairValue,
      confidence: parsed.confidence ?? "medium",
      edge: Number((fairValue - marketProb).toFixed(1)),
      signal: parsed.signal ?? (fairValue > marketProb + 3 ? "bullish" : fairValue < marketProb - 3 ? "bearish" : "neutral"),
      reasoning: parsed.reasoning ?? "",
      factors: parsed.factors ?? [],
      caveat: parsed.caveat ?? catInfo.note,
      categoryBaseRate: catInfo.baseRate,
      marketProb,
      source,
      cached: false,
    };

    setCache(cacheKey, result, 1800); // cache 30 min
    res.json(result);
  } catch (err) {
    log.error("[fair-value] error:", err);
    // Fallback sem Claude: retorna estimativa quantitativa pura
    res.json({
      fairValue: clampedPreFV,
      confidence: "low",
      edge: Number((clampedPreFV - marketProb).toFixed(1)),
      signal: clampedPreFV > marketProb + 3 ? "bullish" : clampedPreFV < marketProb - 3 ? "bearish" : "neutral",
      reasoning: `Estimativa baseada em base rate histórico de ${catInfo.baseRate}% para a categoria ${category} e liquidez do mercado.`,
      factors: [catInfo.note],
      caveat: "Análise qualitativa indisponível — usando apenas modelo quantitativo.",
      categoryBaseRate: catInfo.baseRate,
      marketProb,
      source,
      cached: false,
    });
  }
});

// ── Portfolio Analysis ────────────────────────────────────────────────────────

const portfolioAnalysisCache = new Map<string, { ts: number; data: object }>();
const PORTFOLIO_CACHE_TTL = 30 * 60 * 1000;

router.post("/portfolio-analysis", async (req, res) => {
  try {
    const { positions } = req.body as {
      positions: Array<{
        title: string;
        source: string;
        position: "yes" | "no";
        entryProb: number;
        currentProb?: number;
        betSize: number;
        pnl: number | null;
      }>;
    };

    if (!positions || positions.length === 0) {
      return res.status(400).json({ error: "No positions provided" });
    }

    const cacheKey = positions.map(p => `${p.title.slice(0, 20)}${Math.round(p.entryProb * 100)}`).join("|");
    const cached = portfolioAnalysisCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < PORTFOLIO_CACHE_TTL) {
      return res.json({ ...cached.data, cached: true });
    }

    const positionsList = positions.map(p =>
      `- "${p.title.slice(0, 60)}": ${p.position.toUpperCase()} @ ${Math.round(p.entryProb * 100)}% entrada, atual ${Math.round((p.currentProb ?? p.entryProb) * 100)}%, USD ${p.betSize.toFixed(0)}, P&L: ${p.pnl != null ? (p.pnl >= 0 ? "+" : "") + p.pnl.toFixed(2) : "N/A"}`
    ).join("\n");

    const prompt = `Você é um analista educacional de mercados preditivos (Polymarket/Kalshi). Analise este portfólio simulado de forma educacional. NÃO é recomendação financeira.

Posições:
${positionsList}

Responda em JSON com exatamente estes campos:
{
  "analysis": "parágrafo resumindo saúde geral do portfólio",
  "risks": ["risco 1", "risco 2", "risco 3"],
  "suggestions": ["sugestão 1", "sugestão 2", "sugestão 3"]
}`;

    const raw = await callClaude({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 600,
      messages: [{ role: "user", content: prompt }],
      timeoutMs: 20_000,
    });

    interface ParsedPortfolioAnalysis { analysis?: string; risks?: string[]; suggestions?: string[] }
    let parsed: ParsedPortfolioAnalysis;
    try {
      parsed = extractJson(raw) as ParsedPortfolioAnalysis;
    } catch {
      parsed = { analysis: raw, risks: [], suggestions: [] };
    }

    const result = {
      analysis: parsed.analysis ?? "",
      risks: parsed.risks ?? [],
      suggestions: parsed.suggestions ?? [],
    };

    portfolioAnalysisCache.set(cacheKey, { ts: Date.now(), data: result });
    res.json({ ...result, cached: false });
  } catch (err) {
    log.error("[portfolio-analysis]", err);
    res.status(500).json({ error: "Análise indisponível" });
  }
});

// ── Article Cross-Reference ───────────────────────────────────────────────────
// Dado um artigo de notícias, busca os mercados preditivos relacionados e faz
// uma avaliação honesta da probabilidade real, podendo discordar do preço do mercado.

router.post("/article-crossref", async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY não configurada." });

  const ip = req.ip ?? "unknown";
  if (isRateLimited(`article-crossref:${ip}`, 6, 60_000)) {
    return res.status(429).json({ error: "rate_limited", message: "Muitas análises. Aguarde um momento." });
  }

  interface CrossRefRequest { title: string; description?: string }
  const { title, description = "" } = req.body as CrossRefRequest;
  if (!title?.trim()) return res.status(400).json({ error: "title required" });

  const cacheKey = `article-crossref:${title.slice(0, 80)}`;
  const cached = getCache<object>(cacheKey);
  if (cached) return res.json({ ...cached, cached: true });

  // Busca mercados do cache (populados pelas rotas /polymarket/markets e /kalshi/markets)
  let polyMarkets = getCache<Array<{ id: string; question: string; outcomePrices?: string; category?: string; volume?: number; eventSlug?: string; slug?: string }>>("polymarket:markets:active") ?? [];
  const kalshiMarkets = getCache<Array<{ ticker: string; eventTicker: string; seriesTicker: string; title: string; yesProb: number; category?: string }>>("kalshi:markets") ?? [];

  // Cache frio (ninguém abriu /apostas ainda) → aquece via a própria rota,
  // senão o cruzamento devolvia sempre lista vazia com cara de "sem relação".
  if (polyMarkets.length === 0 && kalshiMarkets.length === 0) {
    try {
      const port = process.env.PORT ?? "3001";
      const r = await fetch(`http://localhost:${port}/api/polymarket/markets?limit=40`, { signal: AbortSignal.timeout(10_000) });
      if (r.ok) {
        const data = await r.json() as { markets?: typeof polyMarkets };
        polyMarkets = data.markets ?? [];
      }
    } catch { /* segue com o que tiver */ }
  }

  // Monta lista compacta de mercados para o Claude (máx 60 mercados)
  interface MarketEntry { idx: number; source: "Polymarket" | "Kalshi"; title: string; prob: number; id: string }
  const allMarkets: MarketEntry[] = [];

  for (const m of polyMarkets.slice(0, 40)) {
    const prices = parsePolyPrices(m.outcomePrices);
    const prob = prices[0] !== undefined ? Math.round(prices[0] * 100) : 50;
    allMarkets.push({ idx: allMarkets.length, source: "Polymarket", title: m.question, prob, id: m.id });
  }
  for (const m of kalshiMarkets.slice(0, 20)) {
    allMarkets.push({ idx: allMarkets.length, source: "Kalshi", title: m.title, prob: Math.round(m.yesProb), id: m.ticker });
  }

  const marketsList = allMarkets
    .map((m) => `[${m.idx}] (${m.source}) "${m.title}" — mercado: ${m.prob}%`)
    .join("\n");

  const prompt = `Você é um analista honesto de mercados preditivos da JLB Analytics.
Analise o artigo abaixo e identifique até 4 mercados preditivos diretamente relacionados.
Para cada mercado relacionado, dê sua estimativa HONESTA da probabilidade real — você PODE e DEVE discordar do preço do mercado se o artigo sugerir isso.
Seja direto e sincero: se o mercado está superestimado ou subestimado, diga.
CALIBRAÇÃO: o desvio deve ser proporcional à força da evidência DO ARTIGO — desvios acima de 15pp exigem fato concreto citado; nunca desvie mais de 20pp do preço.

ARTIGO:
Título: "${title}"
Descrição: "${description || "sem descrição adicional"}"

DATA: ${new Date().toLocaleDateString("pt-BR")}

MERCADOS DISPONÍVEIS:
${marketsList || "Nenhum mercado carregado no momento."}

Retorne JSON exato (sem markdown):
{
  "relatedMarkets": [
    {
      "idx": 0,
      "jlbProb": 72,
      "verdict": "higher",
      "reasoning": "1-2 frases diretas explicando por que a probabilidade real é essa",
      "confidence": "medium"
    }
  ],
  "overallContext": "1-2 frases conectando o artigo ao cenário de apostas"
}

Onde:
- idx: índice do mercado na lista acima
- jlbProb: sua estimativa honesta (5-95)
- verdict: "higher" se jlbProb > mercado+3pp, "lower" se jlbProb < mercado-3pp, "aligned" caso contrário
- confidence: "low" | "medium" | "high"
- relatedMarkets: lista vazia [] se nenhum mercado for relevante`;

  try {
    const raw = await callClaude({
      model: "claude-haiku-4-5-20251001",
      maxTokens: 800,
      messages: [{ role: "user", content: prompt }],
      timeoutMs: 20_000,
    });

    interface CrossRefParsed {
      relatedMarkets?: Array<{ idx: number; jlbProb: number; verdict: string; reasoning: string; confidence: string }>;
      overallContext?: string;
    }
    const parsed = extractJson(raw) as CrossRefParsed;

    const relatedRaw = parsed.relatedMarkets ?? [];
    const relatedMarkets = relatedRaw
      .filter((r) => r.idx >= 0 && r.idx < allMarkets.length)
      .map((r) => {
        const m = allMarkets[r.idx];
        // Guardrail de calibração no código (como no fair value): ±20pp do mercado
        const jlbProb = Math.max(5, Math.min(95,
          Math.max(m.prob - 20, Math.min(m.prob + 20, Math.round(r.jlbProb)))
        ));
        return {
          source: m.source,
          marketTitle: m.title,
          marketProb: m.prob,
          id: m.id,
          jlbProb,
          // Verdict derivado dos números finais — o do modelo às vezes contradiz
          // a própria estimativa (e o clamp pode movê-la)
          verdict: jlbProb > m.prob + 3 ? "higher" : jlbProb < m.prob - 3 ? "lower" : "aligned",
          reasoning: r.reasoning ?? "",
          confidence: r.confidence ?? "medium",
        };
      });

    const result = {
      relatedMarkets,
      overallContext: parsed.overallContext ?? "",
      marketsAvailable: allMarkets.length,
    };
    setCache(cacheKey, result, 1800);
    res.json({ ...result, cached: false });
  } catch (err) {
    log.error("[article-crossref] error:", err);
    res.status(500).json({ error: "crossref_failed", message: err instanceof Error ? err.message : "unknown" });
  }
});

export default router;
