import { buscarTudo } from "../lib/supaPaginado.ts";
import { montarCurva } from "../lib/ai/curvaCalibracao.ts";
import { dedupPorMercado } from "../lib/calibrationData.ts";
import { carregarAmostra, resumir, fatiar, MIN_AMOSTRA } from "../lib/amostraIA.ts";
import { normalizeCategory } from "../lib/ai/calibration.ts";
import { intervaloWilson, comparaComMercado } from "../lib/ai/incerteza.ts";
import { Router, type Request, type Response, type NextFunction } from "express";
import { getCache, setCache, isRateLimited } from "../lib/cache.ts";
import { aiCreditsMiddleware, verifyUserId, isStaleMonth, FREE_LIMIT } from "../middleware/aiCredits.ts";
import { extractJson } from "../lib/extractJson.ts";
import { callClaude, anthropicBreakerState } from "../lib/anthropic.ts";
import { aiMetricsSnapshot } from "../lib/ai/metrics.ts";
import { embeddingsEnabled } from "../lib/embeddings.ts";
import { embedCerebroBatch } from "../lib/cerebroEmbeddings.ts";
import { getNewsForMarket } from "../lib/news.ts";
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "../lib/supabaseRest.ts";
import { seedAiForecasts, computeDivergences } from "../lib/aiForecasts.ts";
import { getCalibrationStatus, getBoldExperimentStatus } from "../lib/calibrationData.ts";
import { log } from "../lib/log.ts";
// Lógica de domínio extraída para módulos de serviço (router fino, comportamento idêntico):
import { buildDigest, sendWeeklyDigests } from "../lib/ai/digest.ts";
import { runChat, chatGuards, type ChatRequest } from "../lib/ai/chat.ts";
import { runMarketAnalysis, ANALYZE_CACHE_KEY, type AnalyzeParams } from "../lib/ai/marketAnalysis.ts";
import { serieDoUsuario } from "../lib/calibracaoUsuario.ts";
import { runModelPredict, PREDICT_CACHE_KEY, type PredictParams } from "../lib/ai/modelPredict.ts";
import { dailyBriefingHandler } from "../lib/ai/briefing.ts";
import { portfolioHandler } from "../lib/ai/portfolio.ts";
import { crossrefHandler } from "../lib/ai/crossref.ts";

// Reexport para o cron em index.ts (setInterval do resumo semanal).
export { sendWeeklyDigests };

const router = Router();

// Rate-limit por IP para os endpoints de IA que chamam a Anthropic. O gate de
// crédito (aiCreditsMiddleware) só limita usuário LOGADO — anônimo passa direto;
// sem isto, um anônimo queima tokens reais sem teto. Fecha esse buraco de custo.
const ipLimit = (name: string, max: number, windowMs: number) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (isRateLimited(`${name}:${req.ip ?? "?"}`, max, windowMs)) {
      return res.status(429).json({ error: "rate_limited", message: "Muitas requisições. Aguarde um momento." });
    }
    next();
  };

// ── Credits status (read-only) ────────────────────────────────────────────────

/**
 * Histórico de calibração do usuário — reconstruído das previsões da CONTA.
 *
 * Vive aqui (e não numa rota nova) porque é a mesma família do track record e
 * usa a mesma verificação de identidade. Só devolve a série de QUEM PEDE: sem
 * token válido não há usuário, e sem usuário não há série.
 */
router.get("/user-calibration-history", async (req, res) => {
  try {
    const authHeader = String(req.headers.authorization ?? "");
    // Sem login não há o que devolver — e devolver vazio (em vez de 401) deixa a
    // tela cair no histórico local sem precisar tratar erro.
    if (!authHeader) return res.json({ history: [], source: "anon" });

    const userId = await verifyUserId(authHeader);
    if (!userId) return res.json({ history: [], source: "anon" });

    const history = await serieDoUsuario(userId);
    res.json({ history, source: "conta" });
  } catch (err) {
    log.warn("[user-calibration] falhou:", err instanceof Error ? err.message : err);
    // Falhar aqui não pode quebrar o Dashboard: a tela usa o histórico local.
    res.json({ history: [], source: "erro" });
  }
});

router.get("/credits", async (req, res) => {
  const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";

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

    const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_credits?user_id=eq.${userId}&select=plan,used_this_month,month_reset`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!r.ok) return res.json({ used: 0, limit: FREE_LIMIT, plan: "free" });

    const rows = await r.json() as Array<{ plan: string; used_this_month: number; month_reset: string }>;
    if (rows.length === 0) return res.json({ used: 0, limit: FREE_LIMIT, plan: "free" });

    const row = rows[0];
    // Mês vencido = cota zerada (mesma invariante do enforcement). O reset no banco
    // é lazy (trigger no incremento), então sem isto o display mostraria o uso do
    // mês passado logo após a virada do mês.
    const used = isStaleMonth(row.month_reset) ? 0 : row.used_this_month;
    return res.json({
      used,
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

// Status do loop de calibração (shadow) — a régua do go-live: quais categorias
// estão sendo corrigidas e se o valor calibrado está de fato ganhando do cru e do
// mercado nas resoluções novas. Read-only e agregado (sem dado de usuário).
router.get("/calibration-status", async (_req, res) => {
  res.json(await getCalibrationStatus());
});

// Veredito do experimento da divergência: divergir do mercado paga? Read-only.
router.get("/bold-status", async (_req, res) => {
  res.json(await getBoldExperimentStatus());
});

// ── Backfill de embeddings do Cerebro (RAG semântico) ─────────────────────────
// Embeda em lote os artigos ativos que ainda não têm vetor. Idempotente e
// bounded (chame repetidamente até remaining=0; um cron pode fazer isso). Só
// funciona após aplicar a migração 016_cerebro_embeddings.sql.
// EXCEÇÃO ao login-gate de IA (de propósito): é manutenção do corpus RAG (mesmo
// código do cron), não análise de usuário — por isso fica fora do aiCreditsMiddleware.
router.post("/embed-cerebro", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.status(503).json({ error: "supabase ausente" });
  if (!embeddingsEnabled()) return res.status(503).json({ error: "GEMINI_API_KEY ausente" });
  if (isRateLimited(`embed-cerebro:${req.ip ?? "?"}`, 6, 60_000)) {
    return res.status(429).json({ error: "rate_limited" });
  }
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
  try {
    // Uma leva sob demanda. A lógica vive em lib/cerebroEmbeddings.ts, compartilhada
    // com o agendador diário (server/index.ts) — endpoint e cron rodam o mesmo código.
    const r = await embedCerebroBatch(limit);
    if (r.error === "select_failed") {
      return res.status(400).json({ error: "select_failed", hint: "aplicou a migração 016?" });
    }
    if (r.error) return res.status(503).json({ error: r.error });
    res.json({ embedded: r.embedded, remaining: r.remaining, done: r.done, ...(r.rateLimited ? { rate_limited: true } : {}) });
  } catch (err) {
    log.error("[embed-cerebro] error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "embed_failed" });
  }
});

// ── Explain My Edge ──────────────────────────────────────────────────────────

router.post("/explain-edge", ipLimit("explain-edge", 10, 60_000), aiCreditsMiddleware, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY não configurada." });

  interface ExplainEdgeReq { title: string; marketProb: number; userProb: number; source?: string }
  const { title, marketProb, userProb, source = "polymarket" } = req.body as ExplainEdgeReq;
  if (!title || marketProb == null || userProb == null) return res.status(400).json({ error: "title, marketProb e userProb são obrigatórios." });

  const cacheKey = `explain-edge:${title.slice(0, 60)}:${Math.round(marketProb * 100)}:${Math.round(userProb * 100)}`;
  const cached = getCache<object>(cacheKey);
  if (cached) { res.locals.aiCacheHit = true; return res.json({ ...cached, cached: true }); }

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
    // 3h, e não 30min: quem invalida agora é o PREÇO (ver ANALYZE_CACHE_KEY),
    // então o prazo só existe para a análise não envelhecer num mercado que
    // ficou parado o dia inteiro.
    setCache(cacheKey, result, 10800);
    res.json(result);
  } catch (err) {
    log.error("[explain-edge] error:", err);
    res.status(500).json({ error: "explain_edge_failed" });
  }
});

// ── AI Chat (widget flutuante) ────────────────────────────────────────────────
// Duas rotas sobre o MESMO núcleo (runChat): POST /chat (JSON, retrocompat) e
// POST /chat/stream (SSE — o widget vê o texto nascendo, TTFT percebido ~1s).

router.post("/chat", ipLimit("chat", 12, 60_000), aiCreditsMiddleware, async (req, res) => {
  if (!chatGuards(req, res)) return;
  try {
    const reply = await runChat(req.body as ChatRequest);
    res.json({ reply });
  } catch (err) {
    log.error("[AI chat] error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

router.post("/chat/stream", ipLimit("chat", 12, 60_000), aiCreditsMiddleware, async (req, res) => {
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
    if (cached) { res.locals.aiCacheHit = true; return res.json({ ...cached, cached: true }); }

    const result = await runMarketAnalysis(body);
    // 3h, e não 30min: quem invalida agora é o PREÇO (ver ANALYZE_CACHE_KEY),
    // então o prazo só existe para a análise não envelhecer num mercado que
    // ficou parado o dia inteiro.
    setCache(cacheKey, result, 10800);
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
    res.locals.aiCacheHit = true;
    send("result", { ...cached, cached: true });
    send("done", {});
    return res.end();
  }

  try {
    const result = await runMarketAnalysis(body, (step, data) => send("phase", { step, ...data }));
    // 3h, e não 30min: quem invalida agora é o PREÇO (ver ANALYZE_CACHE_KEY),
    // então o prazo só existe para a análise não envelhecer num mercado que
    // ficou parado o dia inteiro.
    setCache(cacheKey, result, 10800);
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
/**
 * Curva de calibração PÚBLICA — "quando dizemos 70%, acontece quanto?".
 *
 * É a prova mais concreta que uma plataforma de previsão pode dar, e qualquer
 * pessoa lê a tabela sem saber o que é Brier. Separada do /track-record para não
 * engordar aquele payload, que é buscado em várias telas.
 */
/**
 * Estatística POR TEMA, sobre a amostra inteira.
 *
 * A tela já mostrava uma quebra por tema, mas calculada no cliente a partir das
 * 50 resoluções mais recentes — com ~10 categorias, isso dá ~5 casos cada, e
 * cinco casos não sustentam uma porcentagem. Aqui a conta é feita no servidor
 * sobre TODAS as resolvidas (deduplicadas pela regra da view 019), e cada tema
 * leva a própria margem: e-sports com 191 casos merece outra confiança que
 * economia com 25, e o número sozinho não conta isso.
 */
/**
 * Evolução no tempo — estamos melhorando, piorando, ou estáveis?
 *
 * ⚠️ Existe para impedir a leitura ERRADA, não para exibir uma curva bonita. Com
 * ~2 meses de histórico, qualquer sobe-e-desce entre meses cabe dentro da margem
 * — e a tentação de ler "subiu de 77% para 80%" como progresso é exatamente o
 * tipo de erro que custou -7,7% a este projeto em 29/08. Por isso o endpoint não
 * devolve só os números: devolve o VEREDITO sobre haver ou não tendência, e ele
 * é calculado comparando os intervalos, não as porcentagens.
 */
/**
 * Transparência da amostra — "vocês não mostram só as que acertaram?".
 *
 * É a objeção mais justa que um leitor pode ter a qualquer track record, e o site
 * não a respondia: publicava a taxa de acerto das RESOLVIDAS sem dizer quantas
 * ainda estão em aberto nem se as duas populações se parecem.
 *
 * Duas coisas provam que não há escolha a dedo:
 *  1. o número de previsões em aberto fica à vista (elas serão pontuadas quando
 *     resolverem, quer ajudem quer atrapalhem);
 *  2. a DIFICULDADE das duas populações é comparável. Um mercado a 50% é uma
 *     moeda; um a 95% é quase certeza. Se só os fáceis tivessem resolvido, a
 *     distância média do 50% seria bem maior nas resolvidas — e não é.
 */
router.get("/sample-transparency", async (_req, res) => {
  const cached = getCache<object>("ai-sample-transp-v2");
  if (cached) return res.json(cached);
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ available: false });
  try {
    const amostra = await carregarAmostra();
    if (!amostra) return res.json({ available: false });
    const d = amostra.todas;
    const resolvidos = amostra.resolvidas;
    const emAberto = amostra.emAberto;
    if (resolvidos.length === 0) return res.json({ available: false });

    // Distância do 50% = o quanto o mercado já "sabe". Perto de 50 é moeda;
    // perto de 0 ou 100 é quase certeza. Comparar as duas médias responde se
    // resolveu primeiro o que era fácil.
    const dist = (v: typeof d) => v.length ? v.reduce((s, x) => s + Math.abs(Number(x.market_prob) - 50), 0) / v.length : null;
    const distResolvidos = dist(resolvidos);
    const distAbertos = dist(emAberto);
    const diferenca = distResolvidos !== null && distAbertos !== null ? Math.abs(distResolvidos - distAbertos) : null;

    const resultado = {
      available: true,
      total: d.length,
      resolvidos: resolvidos.length,
      emAberto: emAberto.length,
      dificuldadeResolvidos: distResolvidos !== null ? Number(distResolvidos.toFixed(1)) : null,
      dificuldadeAbertos: distAbertos !== null ? Number(distAbertos.toFixed(1)) : null,
      // Até 5pp de diferença tratamos como populações comparáveis. Acima disso, o
      // honesto é avisar que o que já resolveu pode não representar o todo.
      perfilComparavel: diferenca !== null ? diferenca <= 5 : null,
      // Fechou sem resultado utilizável — declarado aqui em vez de somado no
      // total, que era uma das cinco contagens divergentes da auditoria.
      semDesfecho: amostra.semDesfecho.length,
    };
    setCache("ai-sample-transp-v2", resultado, 900);
    res.json(resultado);
  } catch { res.json({ available: false }); }
});

router.get("/evolution", async (_req, res) => {
  const cached = getCache<object>("ai-evolution-v2");
  if (cached) return res.json(cached);
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ available: false });
  try {
    const amostra = await carregarAmostra();
    if (!amostra) return res.json({ available: false });

    // Este é o único bloco que precisa de mais do que "resolvida": precisa de
    // QUANDO. Antes o filtro extra (`resolved_at IS NOT NULL`) ficava escondido
    // na query e produzia um total menor que o dos blocos vizinhos, sem
    // explicação — era um dos cinco números divergentes. Agora a diferença é
    // declarada em `semData` e a tela pode dizer.
    const comData = amostra.resolvidas.filter((x) => !!x.resolved_at);
    if (comData.length === 0) return res.json({ available: false });

    // Agrupa por MÊS (e não por semana): as resoluções chegam em rajada quando o
    // resolvedor roda, então semanas ficam com 1, 2, 369 casos — e uma "semana" de
    // 2 casos não é ponto de série temporal, é ruído com data.
    const meses = fatiar(comData, (x) => String(x.resolved_at).slice(0, 7))
      .sort((a, b) => a.nome.localeCompare(b.nome))
      .map((f) => ({
        mes: f.nome, n: f.n,
        acerto: f.taxaAcerto,
        margemPp: f.margemPp,
        baixo: f.taxaAcerto !== null && f.margemPp !== null ? f.taxaAcerto - f.margemPp : null,
        alto:  f.taxaAcerto !== null && f.margemPp !== null ? f.taxaAcerto + f.margemPp : null,
        acertoMercado: f.taxaAcertoMercado,
      }));

    // Tendência só existe se os intervalos do primeiro e do último mês com amostra
    // NÃO se tocarem. Comparar as porcentagens direto seria ler ruído.
    const comAmostra = meses.filter((m) => m.acerto !== null);
    let tendencia: "sem-dados" | "estavel" | "melhorando" | "piorando" = "sem-dados";
    if (comAmostra.length >= 2) {
      const p = comAmostra[0], u = comAmostra[comAmostra.length - 1];
      tendencia = p.alto! < u.baixo! ? "melhorando"
        : p.baixo! > u.alto! ? "piorando"
        : "estavel";
    }

    const resultado = {
      available: true, meses, tendencia,
      minAmostra: MIN_AMOSTRA,
      mesesComAmostra: comAmostra.length,
      resolvidas: amostra.resolvidas.length,
      semData: amostra.resolvidas.length - comData.length,
    };
    setCache("ai-evolution-v2", resultado, 900);
    res.json(resultado);
  } catch { res.json({ available: false }); }
});

/**
 * Acerto por TEMA. O achado TRK-03 da auditoria estava aqui: a página escreve
 * "só exibimos os números a partir de 20 resolvidas" e esta rota usava 15 — com
 * a tabela logo abaixo do texto listando temas com 1, 2, 3 e 4 casos, porque o
 * corte só apagava a porcentagem e deixava a linha.
 *
 * Agora o corte é `MIN_AMOSTRA`, o mesmo do resto do site, e a tela recebe o
 * `estado` de cada tema para separar o que tem veredito do que ainda não tem.
 */
router.get("/by-category", async (_req, res) => {
  const cached = getCache<object>("ai-by-category-v2");
  if (cached) return res.json(cached);
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ available: false });
  try {
    const amostra = await carregarAmostra();
    if (!amostra) return res.json({ available: false });

    const temas = fatiar(amostra.resolvidas, (x) => normalizeCategory(x.category)).map((f) => ({
      tema: f.nome, n: f.n,
      acerto: f.taxaAcerto,
      margemPp: f.margemPp,
      acertoMercado: f.taxaAcertoMercado,
      comparacao: f.comparacao,
      // A mesma pergunta do bloco de manchete, por tema: divergimos e acertamos?
      // A tabela da tela de análise calculava isto por conta própria, com uma
      // taxonomia de 20 categorias contra as 10 daqui (TRK-04).
      acertoAoDivergir: f.taxaAoDivergir,
      divergimos: f.divergimos,
      estado: f.estado,
    }));

    const resultado = {
      available: true,
      temas: temas.filter((t) => t.estado === "veredito"),
      // Os que ainda não chegaram na amostra aparecem à parte, com o número de
      // casos e sem porcentagem. "Ainda não sei" é informação; 100% sobre 2
      // casos é ruído com cara de prova.
      semAmostra: temas.filter((t) => t.estado === "insuficiente").map((t) => ({ tema: t.tema, n: t.n })),
      minAmostra: MIN_AMOSTRA,
      resolvidas: amostra.resolvidas.length,
    };
    setCache("ai-by-category-v2", resultado, 900);
    res.json(resultado);
  } catch { res.json({ available: false }); }
});

router.get("/calibration-curve", async (_req, res) => {
  const cached = getCache<object>("ai-calibration-curve-v2");
  if (cached) return res.json(cached);
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ available: false });
  try {
    const amostra = await carregarAmostra();
    if (!amostra) return res.json({ available: false });
    const curva = montarCurva(
      amostra.resolvidas.map((x) => ({ prob: Number(x.ai_fair_value), aconteceu: !!x.outcome })),
    );
    const comAmostra = curva.filter((f) => f.aconteceu !== null);
    const resultado = {
      available: true,
      curva,
      faixasCalibradas: comAmostra.filter((f) => f.dentroDaMargem).length,
      faixasComAmostra: comAmostra.length,
      // O total é o denominador do site, não a soma dos baldes: se algum dia uma
      // faixa deixar de caber na curva, o número aqui denunciaria a diferença em
      // vez de escondê-la — foi assim que nasceram os cinco totais da auditoria.
      total: amostra.resolvidas.length,
      minAmostra: MIN_AMOSTRA,
    };
    setCache("ai-calibration-curve-v2", resultado, 900);
    res.json(resultado);
  } catch { res.json({ available: false }); }
});

/**
 * A manchete do Track Record — e, desde a auditoria de 09/09/2026, a ÚNICA
 * origem dos números que aparecem em `/track-record`, na home e no Dashboard.
 *
 * O que mudou: antes este endpoint lia a view `ai_track_record` e cada bloco
 * vizinho da tela lia outra coisa, com outro filtro. Cinco totais diferentes de
 * "previsões resolvidas" na mesma página. Agora tudo desce de `carregarAmostra()`
 * — uma leitura, um denominador. Ver `lib/amostraIA.ts` para o porquê da regra.
 */
router.get("/track-record", async (_req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ available: false });
  const cached = getCache<object>("ai-track-record-v2");
  if (cached) { res.locals.aiCacheHit = true; return res.json({ ...cached, cached: true }); }
  try {
    const amostra = await carregarAmostra();
    if (!amostra) return res.json({ available: false });
    const t = resumir(amostra);

    // Fatiamento POR PROVEDOR. O número principal é a soma de modelos
    // diferentes — hoje quase tudo é o fallback Gemini, com 0 do Claude. Sem
    // separar, três níveis de qualidade viram um número só que ninguém consegue
    // auditar. Sai da MESMA amostra, então as partes somam o todo — o que não
    // acontecia quando vinha da view `ai_track_record_by_model`.
    const byProvider = fatiar(amostra.resolvidas, (x) => x.model ?? "desconhecido", 1)
      .map((f) => ({
        provider: f.nome,
        resolvedCount: f.n,
        hitRate: f.taxaAcerto,
        marketHitRate: f.taxaAcertoMercado,
        aiBrier: f.aiBrier,
        marketBrier: f.marketBrier,
        skillVsMarket: f.skillVsMarket,
        settledCount: f.oficiais,
        // Amostra pequena por provedor é a regra, não a exceção (o Claude tem 0).
        // O rótulo vai junto para a tela não precisar adivinhar.
        amostraSuficiente: f.estado === "veredito",
      }));

    const result = {
      available: true,

      // ── O denominador. Todos os blocos da página dividem por ele. ──
      resolvedCount: t.resolvidas,
      totalCount: t.total,
      openCount: t.emAberto,
      // Fechou sem resultado utilizável. Quase sempre 0; quando não for, a tela
      // diz — em vez de embutir no total e desencontrar a conta.
      semDesfechoCount: t.semDesfecho,

      aiBrier: t.aiBrier,
      marketBrier: t.marketBrier,
      skillVsMarket: t.skillVsMarket,

      // "Bateu o mercado" pelo BRIER, caso a caso.
      beatMarketCount: t.bateuMercado,
      beatMarketPct: t.bateuMercadoPct,

      // "Bateu o mercado" AO DIVERGIR: das vezes em que discordamos do preço,
      // quantas acertamos. É o teste difícil, e o que a tela de análise já
      // mostrava — só que sobre 50 linhas, o que gerava 43% ao lado de 12%.
      edgeRate: t.taxaAoDivergir,
      edgeCount: t.divergimos,
      edgeHits: t.acertosAoDivergir,

      // "Bateu o mercado" pelo LADO. É outra pergunta, com o mesmo denominador
      // de base — a auditoria pegou as duas dividindo por conjuntos diferentes.
      hitRate: t.taxaAcerto,
      marketHitRate: t.taxaAcertoMercado,
      directionalCount: t.comLado,
      marketDirectionalCount: t.comLadoMercado,

      avgAbsEdge: t.edgeMedioPp,
      settledCount: t.oficiais,
      minAmostra: MIN_AMOSTRA,

      // MARGEM DE ERRO de verdade: quanto a taxa de acerto pode variar por sorte
      // da amostra. O site já chamou de "margem de erro" os 21% que sobram de
      // 79%, que é a TAXA DE ERRO — outra pergunta.
      hitRateIntervalo: t.intervalo,
      comparacaoMercado: t.comparacaoMercado,
      byProvider,
    };
    setCache("ai-track-record-v2", result, 600);
    res.json(result);
  } catch {
    res.json({ available: false });
  }
});

// ── Comparador: previsões já resolvidas (nossa previsão × mercado × resultado real) ──
// Alimenta a tela onde o usuário confere, caso a caso, o que a IA disse contra o
// que a plataforma liquidou de verdade. `official` distingue settlement real de
// inferência por preço — transparência total, sem cherry-picking.
router.get("/resolved", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ available: false, items: [] });
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "12"), 10) || 12, 1), 50);
  // v2 na chave: a saída mudou (deduplicada). Sem trocar, o cache antigo
  // continuaria servindo a lista com o mercado repetido.
  const cacheKey = `ai-resolved-v2-${limit}`;
  const cached = getCache<object>(cacheKey);
  if (cached) { res.locals.aiCacheHit = true; return res.json({ ...cached, cached: true }); }
  // `forecast_date` e `created_at` entram no select porque são o CRITÉRIO da
  // deduplicação (ver dedupPorMercado): a previsão que vale é a mais antiga.
  const BASE = "market_id,source,title,category,ai_fair_value,market_prob,outcome,resolved_at,forecast_date,created_at";
  // Busca com folga (3×) porque a deduplicação REMOVE linhas: pedindo só `limit`
  // a lista voltaria menor que o pedido sempre que houvesse repetição.
  const bruto = Math.min(limit * 3, 150);
  const fetchRows = (withSource: boolean) => fetch(
    `${SUPABASE_URL}/rest/v1/ai_forecasts?resolved=eq.true&select=${withSource ? `${BASE},resolution_source` : BASE}&order=resolved_at.desc&limit=${bruto}`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(8_000) },
  );
  try {
    // Auto-heal: antes da migration 018 a coluna resolution_source não existe e o
    // PostgREST responde 400 — refazemos o select sem ela (procedência = 'inferido').
    let r = await fetchRows(true);
    if (!r.ok) r = await fetchRows(false);
    if (!r.ok) return res.json({ available: false, items: [] });
    const rows = await r.json() as Array<{
      market_id: string; source: string; title: string; category: string | null;
      ai_fair_value: number | string; market_prob: number | string;
      outcome: boolean; resolution_source?: string | null; resolved_at: string | null;
      forecast_date: string; created_at: string;
    }>;

    // UMA PREVISÃO POR MERCADO, e pela MESMA regra das estatísticas.
    //
    // O bug que isto conserta: a lista trazia o mesmo mercado duas vezes, com
    // probabilidades DIFERENTES ("Apple Surprise" com 32% e 40%). Duas
    // consequências, e a segunda é a grave:
    //   · a chave do React colidia, e o React pode reaproveitar o componente
    //     errado — mostrando o dado de uma linha em outra;
    //   · o contador "X/Y acertos recentes" pesava o mesmo mercado duas vezes,
    //     numa tela cujo propósito é medição honesta.
    //
    // Usar `dedupPorMercado` (e não um dedup próprio) é o ponto: se a lista
    // seguisse uma regra e a estatística outra, a tela mostraria uma lista que
    // não bate com o próprio número em cima dela.
    const unicos = dedupPorMercado(rows)
      .sort((a, b) => String(b.resolved_at ?? "").localeCompare(String(a.resolved_at ?? "")))
      .slice(0, limit);

    const items = unicos.map((row) => {
      const aiProb = Math.round(Number(row.ai_fair_value));
      const marketProb = Math.round(Number(row.market_prob));
      const outcome = row.outcome === true;
      const aiSided = aiProb !== 50;         // previu um lado (SIM/NÃO)? 50 = sem opinião
      const marketSided = marketProb !== 50;
      return {
        marketId: row.market_id, source: row.source, title: row.title, category: row.category,
        aiProb, marketProb, outcome, aiSided, marketSided,
        aiHit: aiSided && (aiProb > 50) === outcome,      // a IA acertou o lado?
        marketHit: marketSided && (marketProb > 50) === outcome,
        official: row.resolution_source === "settled",
        resolvedAt: row.resolved_at,
      };
    });
    setCache(cacheKey, { available: true, items }, 600);
    res.json({ available: true, items });
  } catch {
    res.json({ available: false, items: [] });
  }
});

// ── Onde a JLB discorda do mercado ──────────────────────────────────────────
// Lê as previsões recentes da IA e cruza com o preço atual — ranqueia por edge.
router.get("/divergences", async (_req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ divergences: [] });
  const cached = getCache<object>("ai-divergences");
  if (cached) { res.locals.aiCacheHit = true; return res.json({ ...cached, cached: true }); }
  const divergences = await computeDivergences();
  const result = { divergences, count: divergences.length };
  setCache("ai-divergences", result, 300);
  res.json(result);
});

// ── Resumo Semanal JLB (digest) — conteúdo compartilhado app + email ─────────
router.get("/weekly-digest", async (_req, res) => {
  const cached = getCache<object>("weekly-digest");
  if (cached) { res.locals.aiCacheHit = true; return res.json({ ...cached, cached: true }); }
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
  if (cached) { res.locals.aiCacheHit = true; return res.json({ ...cached, cached: true }); }
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
  if (cached) { res.locals.aiCacheHit = true; send("result", { ...cached, cached: true }); send("done", {}); return res.end(); }

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

router.post("/reddit-context", aiCreditsMiddleware, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: "ANTHROPIC_API_KEY não configurada." });

  const ip = req.ip ?? "unknown";
  if (isRateLimited(`reddit-ctx:${ip}`, 8, 60_000)) return res.status(429).json({ error: "rate_limited", message: "Muitas análises. Aguarde um momento." });

  interface RedditCtxRequest { title: string; subreddit?: string; score?: number; comments?: number }
  // ⚠️ SEM padrão 0. O feed RSS do Reddit não publica votos nem comentários (ver
  // server/routes/reddit.ts), e "Votos: 0" no prompt faria a IA raciocinar sobre um
  // dado FALSO — pior que a ausência, porque parece informação. Quando não sabemos,
  // o prompt diz que não sabemos.
  const { title, subreddit = "", score, comments } = req.body as RedditCtxRequest;
  if (!title?.trim()) return res.status(400).json({ error: "title required" });

  const cacheKey = `reddit-ctx:${title.slice(0, 100)}`;
  const cached = getCache<object>(cacheKey);
  if (cached) { res.locals.aiCacheHit = true; return res.json({ ...cached, cached: true }); }

  const NEWS_KEY = process.env.NEWS_API_KEY ?? "";
  // Usa o pipeline unificado com detecção de idioma
  const newsResult = await getNewsForMarket(title, NEWS_KEY, undefined, { maxTotal: 6, daysPrimary: 7, daysSecondary: 14 });
  const articles = newsResult.articles;

  const newsContext = articles.length > 0
    ? articles.map((a, i) => `[${i + 1}] "${a.title}" — ${a.source.name} (${a.publishedAt.slice(0, 10)})\n${a.description ?? ""}`).join("\n\n")
    : "Nenhuma notícia recente disponível.";

  const temMetrica = typeof score === "number" && typeof comments === "number";
  const isControversial = temMetrica && comments / Math.max(1, score) > 0.8;
  const isViral = temMetrica && score > 300;
  const linhaEngajamento = temMetrica
    ? `Votos: ${score.toLocaleString()} | Comentários: ${comments.toLocaleString()}`
      + `${isControversial ? " (controverso)" : ""}${isViral ? " (viral)" : ""}`
    : "Engajamento: NÃO DISPONÍVEL nesta fonte — não afirme que o post é viral nem cite números de votos.";
  const subCtx = subreddit ? `Subreddit: r/${subreddit}` : "";

  const prompt = `Explique por que este post ${temMetrica ? "está viral no Reddit" : "chamou atenção no Reddit"}. DATA: ${new Date().toLocaleDateString("pt-BR")}

POST: "${title}"
${subCtx}
${linhaEngajamento}

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
// EXCEÇÃO ao login-gate de IA (de propósito): o briefing é conteúdo diário
// COMPARTILHADO (um por dia pra todos, cacheado), não geração por usuário — e é o
// gancho "primeiro valor sem login" da Home. Gatear quebraria a aquisição.
router.get("/daily-briefing", ipLimit("briefing", 20, 60_000), dailyBriefingHandler);

// ── Portfolio Analysis ────────────────────────────────────────────────────────

router.post("/portfolio-analysis", ipLimit("portfolio", 6, 60_000), aiCreditsMiddleware, portfolioHandler);

// ── Article Cross-Reference ───────────────────────────────────────────────────
// Dado um artigo de notícias, busca os mercados preditivos relacionados e faz
// uma avaliação honesta da probabilidade real, podendo discordar do preço do mercado.

router.post("/article-crossref", ipLimit("crossref", 10, 60_000), aiCreditsMiddleware, crossrefHandler);

export default router;
