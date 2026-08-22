/**
 * JLB Analytics — Server entry point
 * Registers CORS, routes, WebSocket and starts the HTTP server.
 */

import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

import { cache, getCache, setCache } from "./lib/cache.ts";
import { registerSnapshotJob } from "./lib/triggers.ts";
import { emailEnabled } from "./lib/email.ts";
import { fetchBrapiQuotes } from "./lib/brapi.ts";
import { fetchYahooQuotes } from "./lib/yahoo.ts";

import marketRouter   from "./routes/market.ts";
import polymarketRouter from "./routes/polymarket.ts";
import kalshiRouter   from "./routes/kalshi.ts";
import redditRouter   from "./routes/reddit.ts";
import newsRouter     from "./routes/news.ts";
import aiRouter, { sendWeeklyDigests } from "./routes/ai.ts";
import { scoreAiForecasts, seedAiForecasts } from "./lib/aiForecasts.ts";
import { runDailyEmbedBackfill } from "./lib/cerebroEmbeddings.ts";
import stripeRouter   from "./routes/stripe.ts";
import manifoldRouter from "./routes/manifold.ts";
import snapshotsRouter from "./routes/snapshots.ts";
import duelsRouter, { resolveActiveDuels } from "./routes/duels.ts";
import levelsRouter   from "./routes/levels.ts";
import analyticsRouter from "./routes/analytics.ts";
import pushRouter from "./routes/push.ts";
import settlementsRouter from "./routes/settlements.ts";
import feedRouter from "./routes/feed.ts";
import engineRouter from "./routes/engine.ts";
import { sendAlertPushes, pushEnabled, vapidPublicKey } from "./lib/push.ts";
import { recordSecurityEvent, isBanned } from "./lib/security.ts";
import { log } from "./lib/log.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Cerebro + Snapshots scheduler ─────────────────────────────────────────────

const PYTHON_DIR = path.resolve(__dirname, "..", "python");
const CEREBRO_INTERVAL_MS = 2 * 60 * 60 * 1000;  // 2 horas
const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas

function runPythonScript(script: string, args: string[] = []): Promise<void> {
  return new Promise((resolve) => {
    const py = spawn("python", [path.join(PYTHON_DIR, script), ...args], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    py.stdout.on("data", (d: Buffer) => process.stdout.write(`[cerebro:${script}] ${d}`));
    py.stderr.on("data", (d: Buffer) => process.stderr.write(`[cerebro:${script}] ${d}`));
    py.on("close", (code) => {
      if (code !== 0) log.warn(`[cerebro] ${script} saiu com código ${code}`);
      resolve();
    });
    py.on("error", (err) => {
      log.warn(`[cerebro] Não foi possível iniciar ${script}: ${err.message}`);
      resolve();
    });
  });
}

async function runCerebroCollection() {
  if (!process.env.SUPABASE_SERVICE_KEY) {
    log.warn("[cerebro] SUPABASE_SERVICE_KEY não configurada — coleta automática desativada.");
    return;
  }
  log.info("[cerebro] Iniciando coleta RSS...");
  await runPythonScript("rss_collector.py", ["--limit", "30"]);
  log.info("[cerebro] Coleta concluída. Iniciando síntese IA...");
  await runPythonScript("cerebro_synthesizer.py");
  log.info("[cerebro] Síntese concluída.");
}

async function runMarketSnapshots() {
  if (!process.env.SUPABASE_SERVICE_KEY) {
    log.warn("[snapshots] SUPABASE_SERVICE_KEY ausente — snapshots desativados.");
    return;
  }
  log.info("[snapshots] Coletando snapshots diários de mercados...");
  await runPythonScript("market_snapshots.py", ["--limit", "100"]);
  log.info("[snapshots] Snapshots concluídos.");
}
registerSnapshotJob(runMarketSnapshots); // POST /api/snapshots/trigger dispara este job

async function startServer() {
  // ── Env validation ─────────────────────────────────────────────────────────
  const REQUIRED_ENV: Array<{ key: string; feature: string }> = [
    { key: "ANTHROPIC_API_KEY", feature: "AI endpoints (/api/ai/*, /api/market/analyze)" },
    { key: "NEWS_API_KEY",      feature: "news context in market analysis" },
  ];
  for (const { key, feature } of REQUIRED_ENV) {
    if (!process.env[key]) log.warn(`⚠️  [env] ${key} not set — ${feature} will be degraded`);
  }

  const app = express();

  // Atrás de proxy/CDN em produção — sem isso req.ip vira o IP do proxy e
  // todo o rate limiting por IP colapsa num balde só.
  app.set("trust proxy", 1);

  // ── Auto-ban (RESPOSTA) — gate mais externo ────────────────────────────────
  // IP que a detecção bloqueou (abuso claro) é rejeitado AQUI, antes de qualquer
  // processamento — resposta automática a força-bruta/scraping/DoS, sem intervenção.
  app.use((req, res, next) => {
    if (isBanned(req.ip)) {
      res.setHeader("Retry-After", "900");
      return res.status(429).json({ error: "temporarily_blocked", message: "Acesso temporariamente bloqueado por atividade suspeita." });
    }
    next();
  });

  // ── Security headers ───────────────────────────────────────────────────────
  // Sem inline scripts (tema é /theme-init.js) e fontes self-hosted, a CSP
  // pode ser restrita. 'unsafe-inline' só em style-src: React/Recharts usam
  // style attributes. img-src https: porque thumbnails de notícias vêm de
  // hosts arbitrários (NewsAPI/Reddit). O wss explícito cobre navegadores
  // antigos onde 'self' não casa com WebSocket same-origin.
  const supabaseHost = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "")
    .replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  // No Render, RENDER_EXTERNAL_URL é injetada automaticamente com a URL
  // pública do serviço — dispensa configurar APP_URL à mão no free tier.
  const APP_URL = process.env.APP_URL ?? process.env.RENDER_EXTERNAL_URL ?? "";
  const appHost = APP_URL.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"],
        "font-src": ["'self'", "data:"],
        "connect-src": [
          "'self'",
          ...(supabaseHost ? [`https://${supabaseHost}`, `wss://${supabaseHost}`] : []),
          ...(appHost ? [`wss://${appHost}`] : []),
          ...(process.env.NODE_ENV !== "production" ? ["ws://localhost:*", "http://localhost:*"] : []),
        ],
        "worker-src": ["'self'"],
        "manifest-src": ["'self'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"],
        "frame-ancestors": ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // Permissions-Policy: nega recursos de browser que o site NÃO usa (câmera, mic,
  // geolocalização, USB, sensores) — reduz o estrago de um XSS hipotético e some
  // com o browser sniffing esses acessos. helmet não seta este header por padrão.
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), payment=(self)");
    next();
  });

  // ── Compressão ─────────────────────────────────────────────────────────────
  // Gzip para JSON grande (mercados) e estáticos. SSE NUNCA pode ser
  // comprimido — o buffer do gzip segura os eventos e o streaming congela.
  app.use(compression({
    filter: (req, res) => {
      if (req.path.endsWith("/stream")) return false;
      if (String(res.getHeader("Content-Type") ?? "").includes("text/event-stream")) return false;
      return compression.filter(req, res);
    },
  }));

  // ── CORS ───────────────────────────────────────────────────────────────────
  // Restrict API access to known origins only.
  const allowedOrigins =
    process.env.NODE_ENV === "production"
      ? (APP_URL ? [APP_URL] : [])
      : [
          "http://localhost:3000",
          "http://localhost:3001",
          "http://localhost:3002",
          "http://localhost:5173",
        ];

  // Nota: scripts `crossorigin` do Vite enviam header Origin MESMO same-origin —
  // por isso o próprio host da requisição é sempre aceito (senão o site
  // bloquearia os próprios assets quando APP_URL divergir do domínio servido).
  app.use((req, res, next) =>
    cors({
      origin: (origin, callback) => {
        const self = `${req.protocol}://${req.headers.host ?? ""}`;
        if (!origin || origin === self || allowedOrigins.includes(origin)) return callback(null, true);
        recordSecurityEvent("cors_block", req.ip);
        callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-user-level"],
    })(req, res, next),
  );

  // ── Body parsing ───────────────────────────────────────────────────────────
  // Stripe webhook needs raw body for HMAC signature verification — skip json() for that path.
  app.use((req, res, next) => {
    if (req.path === "/api/stripe/webhook") return next();
    // Limite explícito de payload — corta DoS por corpo gigante (nenhuma API legítima
    // manda >100kb de JSON; o maior é o contexto do motor, ~4kb). Body gigante é sinal
    // de sonda/ataque → registra pra detecção.
    express.json({ limit: "100kb" })(req, res, (err?: unknown) => {
      if (err) {
        recordSecurityEvent("payload_too_large", req.ip);
        return res.status(413).json({ error: "payload_too_large", message: "Corpo da requisição excede o limite." });
      }
      next();
    });
  });

  // ── Rate limit GLOBAL por IP (anti-abuso/DoS/scraping) ─────────────────────
  // Defesa em profundidade: os endpoints de IA já têm limites finos; este é o teto
  // grosso que protege TODOS os /api (inclusive os públicos: feed, mercados, notícias)
  // de um cliente abusivo. 300/min por IP é folgado pra uso real (SPA dispara dezenas
  // no load) e barra scraper/DoS. Em memória (por processo) + limpeza periódica.
  const RL_WINDOW = 60_000, RL_MAX = 300;
  const rlHits = new Map<string, number[]>();
  setInterval(() => {
    const now = Date.now();
    rlHits.forEach((arr, ip) => {
      const keep = arr.filter((t) => now - t < RL_WINDOW);
      if (keep.length) rlHits.set(ip, keep); else rlHits.delete(ip);
    });
  }, 5 * 60_000).unref();
  app.use("/api", (req, res, next) => {
    const ip = req.ip ?? "unknown";
    const now = Date.now();
    const arr = (rlHits.get(ip) ?? []).filter((t) => now - t < RL_WINDOW);
    if (arr.length >= RL_MAX) {
      recordSecurityEvent("rate_limit", ip);
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ error: "rate_limited", message: "Muitas requisições. Aguarde um instante." });
    }
    arr.push(now);
    rlHits.set(ip, arr);
    next();
  });

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use("/api",             marketRouter);
  app.use("/api/polymarket",  polymarketRouter);
  app.use("/api/kalshi",      kalshiRouter);
  app.use("/api/reddit",      redditRouter);
  app.use("/api",             newsRouter);       // /api/translate, /api/news, /api/articles
  app.use("/api/ai",          aiRouter);         // /api/ai/chat, analyze, model-predict, reddit-context, daily-briefing
  app.use("/api/stripe",      stripeRouter);
  app.use("/api",             levelsRouter);     // /api/level1–5/* — TypeScript nativo (dev e prod)
  app.use("/api",             analyticsRouter);  // /api/track — telemetria first-party
  app.use("/api/push",        pushRouter);       // Web Push: subscribe/unsubscribe
  app.use("/api/manifold",    manifoldRouter);
  app.use("/api/snapshots",   snapshotsRouter);  // /api/snapshots/history/:marketId
  app.use("/api/duels",       duelsRouter);      // Duelos de Previsão Fase 1 (pontos) — DUELOS.md
  app.use("/api/settlements", settlementsRouter); // resolução oficial em lote das apostas do usuário
  app.use("/api/feed",        feedRouter);        // feed editorial de probabilidades (ativo B2B mídia)
  app.use("/api/engine",      engineRouter);      // motor de previsão como serviço (B2B, chave de parceiro)

  // ── Health check ───────────────────────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // ── Config pública (capacidades do servidor) ───────────────────────────────
  // O cliente usa para esconder features cuja infra não está configurada —
  // ex.: toggles de email sem RESEND_API_KEY prometeriam algo que nunca chega.
  app.get("/api/config", (_req, res) => {
    res.json({
      emailEnabled: emailEnabled(),
      vapidPublicKey: pushEnabled() ? vapidPublicKey() : null,
    });
  });

  // ── Frescor dos dados ──────────────────────────────────────────────────────
  // Sinal de confiança no rodapé + alarme visual de cron parado. Cache 5min.
  app.get("/api/health/data", async (_req, res) => {
    const cached = getCache<object>("health-data");
    if (cached) return res.json(cached);

    const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY ?? "";
    if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ available: false });

    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    const latest = async (table: string, col: string): Promise<string | null> => {
      try {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${col}&order=${col}.desc&limit=1`,
          { headers, signal: AbortSignal.timeout(6_000) });
        if (!r.ok) return null;
        const rows = await r.json() as Array<Record<string, string>>;
        return rows[0]?.[col] ?? null;
      } catch { return null; }
    };

    const [lastArticleAt, lastSnapshotAt] = await Promise.all([
      latest("cerebro_articles", "ingested_at"),
      latest("market_snapshots", "snapped_at"),
    ]);
    const result = { available: true, lastArticleAt, lastSnapshotAt };
    setCache("health-data", result, 300);
    res.json(result);
  });

  // ── Cache stats (debug) ────────────────────────────────────────────────────
  // Contém chaves com conteúdo de usuário (ex.: perguntas do chat em
  // chat-cerebro:*) — em produção exige DEBUG_STATS_KEY; chaves truncadas.
  app.get("/api/cache/stats", (req, res) => {
    const debugKey = process.env.DEBUG_STATS_KEY ?? "";
    if (process.env.NODE_ENV === "production" && (!debugKey || req.headers["x-debug-key"] !== debugKey)) {
      return res.status(404).json({ error: "not_found" });
    }
    const now = Date.now();
    const entries = Array.from(cache.entries()).map(([key, entry]) => ({
      key: key.length > 40 ? `${key.slice(0, 40)}…` : key,
      expiresIn: Math.max(0, Math.round(((entry as { expiresAt: number }).expiresAt - now) / 1000)),
      expired: (entry as { expiresAt: number }).expiresAt < now,
    }));
    res.json({
      total: cache.size,
      live: entries.filter((e) => !e.expired).length,
      expired: entries.filter((e) => e.expired).length,
      entries: entries.sort((a, b) => b.expiresIn - a.expiresIn),
    });
  });

  // ── security.txt (divulgação responsável — RFC 9116) ───────────────────────
  // Dá a pesquisadores um canal pra REPORTAR falhas em vez de vazar/vender/explorar.
  // Sinal de maturidade e defesa via colaboração (muitos white-hats checam isto 1º).
  app.get("/.well-known/security.txt", (_req, res) => {
    const contact = process.env.SECURITY_CONTACT || (APP_URL ? `${APP_URL}/sobre` : "https://jlb.analytics/sobre");
    const expires = new Date(Date.now() + 365 * 86_400_000).toISOString();
    res.type("text/plain").send(`Contact: ${contact}\nExpires: ${expires}\nPreferred-Languages: pt, en\n`);
  });

  // ── Static files + SPA fallback ────────────────────────────────────────────
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  // Assets com hash no nome são imutáveis (cache 1 ano); index.html e sw.js
  // sempre revalidam (senão deploy novo não chega); resto fica 1h.
  app.use(express.static(staticPath, {
    setHeaders: (res, filePath) => {
      const f = filePath.replace(/\\/g, "/");
      if (f.includes("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (f.endsWith("index.html") || f.endsWith("sw.js")) {
        res.setHeader("Cache-Control", "no-cache");
      } else {
        res.setHeader("Cache-Control", "public, max-age=3600");
      }
    },
  }));

  // Endpoint de API inexistente responde 404 JSON — não o index.html do SPA.
  app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));

  // ── Dynamic rendering p/ SEO ───────────────────────────────────────────────
  // Crawlers sem JS recebem o snapshot HTML completo (gerado por
  // `pnpm prerender`); usuários reais seguem no SPA — sem flash de conteúdo.
  const PRERENDER_DIR = path.resolve(__dirname, "..", "prerendered");
  let prerenderedFiles = new Set<string>();
  try {
    prerenderedFiles = new Set(fs.readdirSync(PRERENDER_DIR).filter((f) => f.endsWith(".html")));
    if (prerenderedFiles.size > 0) log.info(`[seo] ${prerenderedFiles.size} snapshots pré-renderizados disponíveis para bots`);
  } catch { /* sem snapshots — SPA para todo mundo */ }
  const BOT_UA = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|twitterbot|whatsapp|telegrambot|linkedin|discord|pinterest|ia_archiver|semrush|ahrefs/i;

  app.get("*", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    if (BOT_UA.test(String(req.headers["user-agent"] ?? ""))) {
      const f = (req.path === "/" ? "index" : req.path.replace(/^\/|\/$/g, "").replace(/\//g, "-")) + ".html";
      if (prerenderedFiles.has(f)) return res.sendFile(path.join(PRERENDER_DIR, f));
    }
    res.sendFile(path.join(staticPath, "index.html"));
  });

  // ── HTTP server + WebSocket ────────────────────────────────────────────────
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws/quotes" });
  const wsClients = new Set<WebSocket>();

  // Probabilidades anteriores dos mercados — para detectar variações ≥ threshold
  const prevMarketProbs = new Map<string, number>();

  // Heartbeat: cliente que não responde ping em 30s é terminado — sem isso,
  // sockets mortos (rede caiu sem FIN) ficam no Set para sempre e todo
  // broadcast tenta escrever neles.
  const wsAlive = new WeakMap<WebSocket, boolean>();

  wss.on("connection", (ws) => {
    wsClients.add(ws);
    wsAlive.set(ws, true);
    ws.on("pong", () => wsAlive.set(ws, true));
    void broadcastQuotes();
    ws.on("close", () => wsClients.delete(ws));
    ws.on("error", () => wsClients.delete(ws));
  });

  setInterval(() => {
    wss.clients.forEach((ws) => {
      if (wsAlive.get(ws) === false) return ws.terminate();
      wsAlive.set(ws, false);
      ws.ping();
    });
  }, 30_000);

  function broadcast(payload: unknown) {
    const msg = JSON.stringify(payload);
    wsClients.forEach((ws) => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
  }

  async function broadcastQuotes() {
    if (wsClients.size === 0) return;
    try {
      const [brRaw, usRaw] = await Promise.allSettled([
        fetchBrapiQuotes(["PETR4", "VALE3", "ITUB4"]),
        fetchYahooQuotes(["AAPL", "MSFT", "^BVSP", "^GSPC"]),
      ]);
      broadcast({
        type: "quotes",
        updatedAt: new Date().toISOString(),
        br: brRaw.status === "fulfilled" ? brRaw.value.map((q) => ({ ticker: q.symbol, price: q.regularMarketPrice, change: q.regularMarketChangePercent })) : [],
        us: usRaw.status === "fulfilled" ? usRaw.value.map((q) => ({ ticker: q.symbol, price: q.regularMarketPrice ?? 0, change: q.regularMarketChangePercent ?? 0 })) : [],
      });
    } catch (err) {
      log.error("[WS] Broadcast error:", err);
    }
  }

  // Detecta variações ≥ ALERT_THRESHOLD_PP nos mercados Polymarket+Kalshi
  // e envia alerta via WS para todos os clientes conectados.
  // O cliente filtra pelos itens da watchlist local.
  const ALERT_THRESHOLD_PP = 3;

  const alertContextCache = new Map<string, { ts: number; context: string }>();

  async function generateAlertContext(alert: { title: string; prob: number; prevProb: number; delta: number }): Promise<string> {
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
      if (!apiKey) return "";
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 80,
          messages: [{
            role: "user",
            content: `Mercado: "${alert.title.slice(0, 80)}", era ${Math.round(alert.prevProb * 100)}%, agora ${Math.round(alert.prob * 100)}%. Em 1 frase curta (pt-BR), qual a hipótese mais provável para este movimento?`,
          }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return "";
      const data = await response.json() as { content: Array<{ type: string; text: string }> };
      const block = data.content.find((b) => b.type === "text");
      return block ? block.text.trim() : "";
    } catch { return ""; }
  }

  async function broadcastMarketAlerts() {
    if (wsClients.size === 0) return;
    try {
      const [polyRaw, kalshiRaw] = await Promise.allSettled([
        fetch("http://localhost:" + (process.env.PORT ?? 3001) + "/api/polymarket/markets?limit=50")
          .then((r) => r.ok ? r.json() as Promise<{ markets: Array<{ id: string; question: string; outcomePrices?: string | string[] }> }> : { markets: [] }),
        fetch("http://localhost:" + (process.env.PORT ?? 3001) + "/api/kalshi/markets?limit=40")
          .then((r) => r.ok ? r.json() as Promise<{ markets: Array<{ ticker: string; title: string; yesProb: number }> }> : { markets: [] }),
      ]);

      // `key` = id prefixado ("poly-…"/"kalshi-…") — MESMO formato dos ids da
      // watchlist do cliente; é a chave de join do filtro de toast e do push.
      const alerts: Array<{ id: string; key: string; title: string; source: string; prob: number; prevProb: number; delta: number; context?: string }> = [];
      // Mapa completo de preços ao vivo (chaveado como os cards: poly-/kalshi-)
      const livePrices: Record<string, number> = {};

      if (polyRaw.status === "fulfilled") {
        for (const m of (polyRaw.value.markets ?? [])) {
          const prices = m.outcomePrices;
          let prob: number | null = null;
          if (prices) {
            try {
              const arr = typeof prices === "string" ? JSON.parse(prices) as string[] : prices as string[];
              prob = Math.round(parseFloat(String(arr[0])) * 100);
            } catch { /* skip */ }
          }
          if (prob === null || !isFinite(prob)) continue;
          livePrices[`poly-${m.id}`] = prob;
          const key = `poly:${m.id}`;
          const prev = prevMarketProbs.get(key);
          if (prev !== undefined && Math.abs(prob - prev) >= ALERT_THRESHOLD_PP) {
            alerts.push({ id: m.id, key: `poly-${m.id}`, title: m.question, source: "polymarket", prob, prevProb: prev, delta: prob - prev });
          }
          prevMarketProbs.set(key, prob);
        }
      }

      if (kalshiRaw.status === "fulfilled") {
        for (const m of (kalshiRaw.value.markets ?? [])) {
          const prob = m.yesProb;
          if (isFinite(prob)) livePrices[`kalshi-${m.ticker}`] = prob;
          const key = `kalshi:${m.ticker}`;
          const prev = prevMarketProbs.get(key);
          if (prev !== undefined && Math.abs(prob - prev) >= ALERT_THRESHOLD_PP) {
            alerts.push({ id: m.ticker, key: `kalshi-${m.ticker}`, title: m.title, source: "kalshi", prob, prevProb: prev, delta: prob - prev });
          }
          prevMarketProbs.set(key, prob);
        }
      }

      // Transmite o mapa de preços a cada ciclo (cards atualizam ao vivo + flash)
      if (Object.keys(livePrices).length > 0) {
        broadcast({ type: "market_prices", updatedAt: new Date().toISOString(), prices: livePrices });
      }

      if (alerts.length > 0) {
        const biggestMover = alerts.reduce((prev, curr) =>
          Math.abs(curr.delta) > Math.abs(prev.delta) ? curr : prev, alerts[0]);

        const contextCacheKey = `${biggestMover.id}:${Math.round(biggestMover.prob * 100)}`;
        const cachedCtx = alertContextCache.get(contextCacheKey);

        if (cachedCtx && Date.now() - cachedCtx.ts < 5 * 60 * 1000) {
          biggestMover.context = cachedCtx.context;
        } else {
          generateAlertContext(biggestMover).then(ctx => {
            alertContextCache.set(contextCacheKey, { ts: Date.now(), context: ctx });
            biggestMover.context = ctx;
          }).catch(() => {});
        }

        broadcast({ type: "market_alerts", updatedAt: new Date().toISOString(), alerts });
        log.info(`[WS] Market alerts: ${alerts.length} movimentos ≥${ALERT_THRESHOLD_PP}pp`);

        // Web Push para quem tem esses mercados na watchlist (site fechado incluso)
        void sendAlertPushes(alerts.map((a) => ({ key: a.key, title: a.title, prob: a.prob, delta: a.delta })));
      }
    } catch (err) {
      log.error("[WS] Market alerts error:", err);
    }
  }

  setInterval(() => { void broadcastQuotes(); }, 30_000);
  setInterval(() => { void broadcastMarketAlerts(); }, 90_000); // 90s: preços ao vivo + alertas

  // ── Start ──────────────────────────────────────────────────────────────────
  const port = process.env.PORT ?? 3001;
  httpServer.listen(port, () => {
    log.info(`✅ Server running on http://localhost:${port}/`);
    log.info("   Routes: market | polymarket | kalshi | reddit | news | ai | stripe");
    log.info("   WebSocket: ws://localhost:3001/ws/quotes");
  });

  // ── Cerebro auto-collection ────────────────────────────────────────────────
  if (process.env.SUPABASE_SERVICE_KEY) {
    setTimeout(() => { void runCerebroCollection(); }, 30_000);
    setInterval(() => { void runCerebroCollection(); }, CEREBRO_INTERVAL_MS);
    log.info("   Cerebro: coleta automática a cada 2h ✅");

    // Snapshots de mercado: primeira coleta 2min após o boot, depois 1× por dia
    setTimeout(() => { void runMarketSnapshots(); }, 2 * 60_000);
    setInterval(() => { void runMarketSnapshots(); }, SNAPSHOT_INTERVAL_MS);
    log.info("   Snapshots: coleta diária de mercados ✅");

    // Scoring das previsões da IA + resolução de duelos: mesmos preços extremos
    setTimeout(() => { void scoreAiForecasts(); void resolveActiveDuels(); }, 3 * 60_000);
    setInterval(() => { void scoreAiForecasts(); void resolveActiveDuels(); }, 6 * 60 * 60 * 1000); // a cada 6h
    log.info("   AI track record + duelos: scoring automático a cada 6h ✅");

    // Seed de previsões da IA: 4min após o boot, depois a cada 6h. Frequência
    // subiu de 24h→6h porque o seed agora é news-aware (lê o Cerebro): rodar
    // mais vezes mantém as previsões coladas às notícias recentes, em vez de
    // congeladas por um dia. Cota folgada: 18 mercados × 4/dia = 72 chamadas.
    setTimeout(() => { void seedAiForecasts(); }, 4 * 60_000);
    setInterval(() => { void seedAiForecasts(); }, 6 * 60 * 60 * 1000);
    log.info("   AI seed: previsões news-aware nos top mercados, a cada 6h ✅");

    // Resumo semanal por email: checa 1×/dia, RPC entrega só a quem está há 6+ dias sem receber
    setInterval(() => { void sendWeeklyDigests(); }, 24 * 60 * 60 * 1000);
    log.info("   Resumo semanal: email aos inscritos (precisa RESEND_API_KEY) ✅");

    // Backfill de embeddings do Cerebro: 1×/dia, ~800 (deixa folga p/ as buscas
    // semânticas ao vivo no teto free de 1000/dia do Gemini). Auto-limita e para
    // sozinho quando todos os artigos têm vetor. Inerte sem GEMINI_API_KEY.
    setTimeout(() => { void runDailyEmbedBackfill(); }, 6 * 60_000);
    setInterval(() => { void runDailyEmbedBackfill(); }, 24 * 60 * 60 * 1000);
    log.info("   Embeddings Cerebro: backfill diário (~800/dia, respeita a cota free) ✅");
  } else {
    log.warn("   Cerebro/Snapshots: SUPABASE_SERVICE_KEY ausente — coleta manual apenas.");
  }

  // Graceful shutdown so node --watch can restart without EADDRINUSE
  const shutdown = () => {
    wss.close();
    httpServer.close(() => process.exit(0));
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

startServer().catch((err) => log.error("[boot] Falha ao iniciar o servidor:", err));

// Keep the process alive through unhandled errors instead of crashing.
process.on("uncaughtException", (err) => {
  log.error("[process] uncaughtException — servidor continua:", err);
});
process.on("unhandledRejection", (reason) => {
  log.error("[process] unhandledRejection — servidor continua:", reason);
});
