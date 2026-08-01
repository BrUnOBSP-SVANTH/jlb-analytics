import { Router } from "express";
import { getCache, setCache, isRateLimited } from "../lib/cache.ts";
import { aiCreditsMiddleware, verifyUserId } from "../middleware/aiCredits.ts";
import { extractJson } from "../lib/extractJson.ts";
import { callClaude, anthropicBreakerState } from "../lib/anthropic.ts";
import { aiMetricsSnapshot } from "../lib/ai/metrics.ts";
import { rawEmbed, embeddingsEnabled } from "../lib/embeddings.ts";
import { getNewsForMarket } from "../lib/news.ts";
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "../lib/supabaseRest.ts";
import { seedAiForecasts, computeDivergences } from "../lib/aiForecasts.ts";
import { log } from "../lib/log.ts";
// Lógica de domínio extraída para módulos de serviço (router fino, comportamento idêntico):
import { buildDigest, sendWeeklyDigests } from "../lib/ai/digest.ts";
import { runChat, chatGuards, type ChatRequest } from "../lib/ai/chat.ts";
import { runMarketAnalysis, ANALYZE_CACHE_KEY, type AnalyzeParams } from "../lib/ai/marketAnalysis.ts";
import { runModelPredict, PREDICT_CACHE_KEY, type PredictParams } from "../lib/ai/modelPredict.ts";
import { dailyBriefingHandler } from "../lib/ai/briefing.ts";
import { fairValueHandler } from "../lib/ai/fairValue.ts";
import { portfolioHandler } from "../lib/ai/portfolio.ts";
import { crossrefHandler } from "../lib/ai/crossref.ts";

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
    // Valida o JWT no Supabase Auth (assinatura + expiração), em vez de decodificar
    // o payload às cegas — decodificar sem verificar permitiria forjar `sub` e ler a
    // cota de qualquer usuário. Mesma invariante já aplicada no aiCreditsMiddleware.
    const userId = await verifyUserId(authHeader);
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

// ── Observabilidade: métricas das chamadas de IA (read-only, agregado) ────────
// Quanto roda no Claude vs. fallback Gemini, taxa de fallback, latência média e
// estado do circuit breaker. Dado direcional para operar a IA (e decidir recarga).
router.get("/metrics", (_req, res) => {
  res.json({ ...aiMetricsSnapshot(), breaker: anthropicBreakerState() });
});

// ── Backfill de embeddings do Cerebro (RAG semântico) ─────────────────────────
// Embeda em lote os artigos ativos que ainda não têm vetor. Idempotente e
// bounded (chame repetidamente até remaining=0; um cron pode fazer isso). Só
// funciona após aplicar a migração 016_cerebro_embeddings.sql.
router.post("/embed-cerebro", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(503).json({ error: "supabase ausente" });
  if (!embeddingsEnabled()) return res.status(503).json({ error: "GEMINI_API_KEY ausente" });
  if (isRateLimited(`embed-cerebro:${req.ip ?? "?"}`, 6, 60_000)) {
    return res.status(429).json({ error: "rate_limited" });
  }
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
  try {
    const sel = await fetch(
      `${SUPABASE_URL}/rest/v1/cerebro_articles?embedding=is.null&status=eq.active&select=id,title,summary&limit=${limit}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
    );
    if (!sel.ok) {
      const msg = (await sel.text()).slice(0, 200);
      // coluna ainda não existe → migração não aplicada
      return res.status(400).json({ error: "select_failed", hint: "aplicou a migração 016?", detail: msg });
    }
    const rows = await sel.json() as Array<{ id: string; title: string; summary: string | null }>;
    if (rows.length === 0) return res.json({ embedded: 0, remaining: 0, done: true });

    let embedded = 0;
    let rateLimited = false;
    for (const a of rows) {
      const { vector: vec, status } = await rawEmbed(`${a.title}\n${a.summary ?? ""}`.trim(), "RETRIEVAL_DOCUMENT");
      // 429 = cota diária do Gemini free estourada (1000/dia). Não adianta insistir
      // hoje: para o lote e avisa quem chamou para tentar de novo depois do reset.
      if (status === 429) { rateLimited = true; break; }
      if (!vec) continue; // falha pontual → pula; próxima rodada tenta de novo
      const pr = await fetch(`${SUPABASE_URL}/rest/v1/cerebro_articles?id=eq.${a.id}`, {
        method: "PATCH",
        headers: supaWriteHeaders(),
        body: JSON.stringify({ embedding: `[${vec.join(",")}]` }),
      }).catch(() => null);
      if (pr?.ok) embedded += 1;
      await new Promise((r) => setTimeout(r, 150)); // throttle p/ o rate limit do Gemini
    }

    const cnt = await fetch(
      `${SUPABASE_URL}/rest/v1/cerebro_articles?embedding=is.null&status=eq.active&select=id`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact", Range: "0-0" } },
    );
    const remaining = Number(cnt.headers.get("content-range")?.split("/")[1] ?? "0") || 0;
    res.json({ embedded, remaining, done: remaining === 0, ...(rateLimited ? { rate_limited: true } : {}) });
  } catch (err) {
    log.error("[embed-cerebro] error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "embed_failed" });
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

router.get("/daily-briefing", dailyBriefingHandler);

// ── Fair Value ────────────────────────────────────────────────────────────────
// Calcula um fair value independente para um mercado preditivo com base em:
//   - Base rate histórica da categoria
//   - Dados macro BCB (Selic, IPCA)
//   - Momentum de prob (variação recente)
//   - Claude Haiku para análise qualitativa
// Retorna: fairValue, confidence, edge vs mercado, reasoning detalhado.


router.post("/fair-value", aiCreditsMiddleware, fairValueHandler);

// ── Portfolio Analysis ────────────────────────────────────────────────────────

router.post("/portfolio-analysis", portfolioHandler);

// ── Article Cross-Reference ───────────────────────────────────────────────────
// Dado um artigo de notícias, busca os mercados preditivos relacionados e faz
// uma avaliação honesta da probabilidade real, podendo discordar do preço do mercado.

router.post("/article-crossref", crossrefHandler);

export default router;
