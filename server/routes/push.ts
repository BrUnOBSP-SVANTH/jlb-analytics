/**
 * Rotas de assinatura Web Push — JLB Analytics
 * POST /api/push/subscribe   { subscription, watchlistIds } — upsert por endpoint
 * POST /api/push/unsubscribe { endpoint }
 */
import { Router } from "express";
import { isRateLimited } from "../lib/cache.ts";
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "../lib/supabaseRest.ts";
import { verifyUserId } from "../middleware/aiCredits.ts";
import { pushEnabled } from "../lib/push.ts";
import { log } from "../lib/log.ts";

const router = Router();

interface SubscribeBody {
  subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  watchlistIds?: unknown;
}

router.post("/subscribe", async (req, res) => {
  if (!pushEnabled()) return res.status(503).json({ error: "push_not_configured" });
  const ip = req.ip ?? "unknown";
  if (isRateLimited(`push-sub:${ip}`, 10, 60_000)) return res.status(429).json({ error: "rate_limited" });

  const { subscription, watchlistIds } = (req.body ?? {}) as SubscribeBody;
  const endpoint = subscription?.endpoint;
  const keys = subscription?.keys;
  if (!endpoint?.startsWith("https://") || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "invalid_subscription" });
  }
  const ids = Array.isArray(watchlistIds)
    ? watchlistIds.filter((i): i is string => typeof i === "string").slice(0, 200)
    : [];

  const authHeader = String(req.headers.authorization ?? "");
  const userId = authHeader ? await verifyUserId(authHeader) : null;

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions`, {
      method: "POST",
      headers: { ...supaWriteHeaders(), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        watchlist_ids: ids,
        user_id: userId,
        updated_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!r.ok) throw new Error(`supabase ${r.status}`);
    res.json({ ok: true, watching: ids.length });
  } catch (err) {
    log.warn("[push] subscribe falhou:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "subscribe_failed" });
  }
});

router.post("/unsubscribe", async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_KEY) return res.json({ ok: true });
  const { endpoint } = (req.body ?? {}) as { endpoint?: string };
  if (!endpoint) return res.status(400).json({ error: "endpoint_required" });
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: "DELETE",
      headers: supaWriteHeaders(),
      signal: AbortSignal.timeout(6_000),
    });
  } catch { /* best-effort */ }
  res.json({ ok: true });
});

export default router;
