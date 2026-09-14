/**
 * Analytics first-party — JLB Analytics
 *
 * POST /api/track: registra eventos de produto em analytics_events.
 * Princípios: 204 SEMPRE e imediato (telemetria nunca atrasa nem quebra o
 * app), allowlist fechada de eventos, zero PII (sem IP/user-agent).
 */
import { Router } from "express";
import { isRateLimited } from "../lib/cache.ts";
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "../lib/supabaseRest.ts";
import { log } from "../lib/log.ts";
import { EVENTOS } from "../../shared/eventos.ts";

const router = Router();

// A MESMA lista que o cliente é obrigado a usar (shared/eventos.ts). Havia uma
// cópia aqui, e sete eventos do cliente não estavam nela — descartados em silêncio.
const EVENTS = new Set<string>(EVENTOS);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/track", (req, res) => {
  res.status(204).end();

  const ip = req.ip ?? "unknown";
  if (isRateLimited(`track:${ip}`, 60, 60_000)) return;
  if (!SUPABASE_URL || !SUPABASE_KEY) return;

  const { event, path, anonId, meta } = (req.body ?? {}) as {
    event?: string; path?: string; anonId?: string; meta?: Record<string, unknown>;
  };
  if (!event || !EVENTS.has(event)) return;

  const metaStr = meta && typeof meta === "object" ? JSON.stringify(meta) : null;
  void fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
    method: "POST",
    headers: supaWriteHeaders(),
    body: JSON.stringify({
      event,
      path: typeof path === "string" ? path.slice(0, 200) : null,
      anon_id: typeof anonId === "string" && UUID_RE.test(anonId) ? anonId : null,
      meta: metaStr && metaStr.length <= 500 ? meta : null,
    }),
    signal: AbortSignal.timeout(6_000),
  }).catch((e) => log.warn("[track] insert falhou:", e instanceof Error ? e.message : e));
});

export default router;
