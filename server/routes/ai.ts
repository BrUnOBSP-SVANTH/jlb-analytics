import { Router } from "express";
import { getCache, setCache, isRateLimited } from "../lib/cache.ts";
import { fetchJSON } from "../lib/fetcher.ts";
import { fetchBcbSerie } from "../lib/bcb.ts";
import type { NewsApiResponse, PolyEvent, KalshiEventsResponse } from "../lib/types.ts";
import { aiCreditsMiddleware, verifyUserId } from "../middleware/aiCredits.ts";
import { extractJson } from "../lib/extractJson.ts";
import { callClaude } from "../lib/anthropic.ts";
import { getNewsForMarket } from "../lib/news.ts";
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "../lib/supabaseRest.ts";
import { CATEGORY_BASE_RATES } from "../lib/categoryRates.ts";
import { fetchCerebroContext } from "../lib/cerebro.ts";
import { seedAiForecasts, computeDivergences, parsePolyPrices, getCalibrationMemo } from "../lib/aiForecasts.ts";
import { log } from "../lib/log.ts";
// Lógica de domínio extraída para módulos de serviço (router fino, comportamento idêntico):
import { buildDigest, sendWeeklyDigests } from "../lib/ai/digest.ts";
import { runChat, chatGuards, type ChatRequest } from "../lib/ai/chat.ts";
import { runMarketAnalysis, ANALYZE_CACHE_KEY, type AnalyzeParams } from "../lib/ai/marketAnalysis.ts";
import { runModelPredict, PREDICT_CACHE_KEY, type PredictParams } from "../lib/ai/modelPredict.ts";

// Reexport para o cron em index.ts (setInterval do resumo semanal).
export { sendWeeklyDigests };

const router = Router();

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
