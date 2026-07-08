/**
 * Web Push — JLB Analytics
 *
 * Envia notificação nativa quando um mercado da watchlist do usuário move
 * ≥ threshold, mesmo com o site fechado. As assinaturas ficam em
 * push_subscriptions (Supabase, server-only) com os ids prefixados da
 * watchlist ("poly-…"/"kalshi-…") — a MESMA key emitida nos alertas do WS.
 */
import webpush from "web-push";
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "./supabaseRest.ts";
import { getCache, setCache } from "./cache.ts";
import { log } from "./log.ts";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:contato@jlbasset.com";

let configured = false;
export function pushEnabled(): boolean {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE || !SUPABASE_URL || !SUPABASE_KEY) return false;
  if (!configured) {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    configured = true;
  }
  return true;
}

export function vapidPublicKey(): string {
  return VAPID_PUBLIC;
}

interface StoredSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  watchlist_ids: string[];
}

async function loadSubscriptions(): Promise<StoredSub[]> {
  const cached = getCache<StoredSub[]>("push-subs");
  if (cached) return cached;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,keys,watchlist_ids`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(6_000),
    });
    if (!r.ok) return [];
    const rows = await r.json() as StoredSub[];
    setCache("push-subs", rows, 120);
    return rows;
  } catch { return []; }
}

async function deleteSubscription(endpoint: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
      method: "DELETE",
      headers: supaWriteHeaders(),
      signal: AbortSignal.timeout(6_000),
    });
  } catch { /* best-effort */ }
}

export interface AlertForPush {
  key: string;      // "poly-<id>" | "kalshi-<ticker>" — casa com watchlist_ids
  title: string;
  prob: number;     // % atual
  delta: number;    // pp
}

/** Dispara pushes para quem tem algum dos mercados alertados na watchlist. */
export async function sendAlertPushes(alerts: AlertForPush[]): Promise<void> {
  if (!pushEnabled() || alerts.length === 0) return;
  const subs = await loadSubscriptions();
  if (subs.length === 0) return;

  const jobs: Promise<void>[] = [];
  for (const sub of subs) {
    const watched = new Set(sub.watchlist_ids);
    const hit = alerts.find((a) => watched.has(a.key));
    if (!hit) continue;

    const payload = JSON.stringify({
      title: `${hit.delta > 0 ? "📈" : "📉"} ${hit.title.slice(0, 60)}`,
      body: `Moveu ${hit.delta > 0 ? "+" : ""}${hit.delta.toFixed(0)}pp — agora em ${hit.prob.toFixed(0)}%`,
      url: `/apostas/${hit.key}`,
    });
    jobs.push(
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
        { TTL: 3600 },
      ).then(() => undefined).catch((err: { statusCode?: number }) => {
        // 404/410 = assinatura morta (browser revogou) — remove do banco
        if (err.statusCode === 404 || err.statusCode === 410) return deleteSubscription(sub.endpoint);
        log.warn("[push] envio falhou:", err.statusCode ?? err);
      }),
    );
  }
  if (jobs.length > 0) {
    await Promise.allSettled(jobs);
    log.info(`[push] ${jobs.length} notificação(ões) de alerta enviadas`);
  }
}
