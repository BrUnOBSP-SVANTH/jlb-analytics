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
  user_id: string | null;
}

async function loadSubscriptions(): Promise<StoredSub[]> {
  const cached = getCache<StoredSub[]>("push-subs");
  if (cached) return cached;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=endpoint,keys,watchlist_ids,user_id`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(6_000),
    });
    if (!r.ok) return [];
    const rows = await r.json() as StoredSub[];
    setCache("push-subs", rows, 120);
    return rows;
  } catch { return []; }
}

/** Envia um payload para todas as assinaturas de um usuário (limpa as mortas). */
async function pushToUser(userId: string, payload: { title: string; body: string; url: string }): Promise<number> {
  if (!pushEnabled()) return 0;
  const subs = (await loadSubscriptions()).filter((s) => s.user_id === userId);
  if (subs.length === 0) return 0;
  const body = JSON.stringify(payload);
  await Promise.allSettled(subs.map((sub) =>
    webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, { TTL: 86_400 })
      .catch((err: { statusCode?: number }) => {
        if (err.statusCode === 404 || err.statusCode === 410) return deleteSubscription(sub.endpoint);
        log.warn("[push] envio falhou:", err.statusCode ?? err);
      }),
  ));
  return subs.length;
}

/** Duelo resolvido: avisa os dois lados com o resultado (fecha o loop de retenção). */
export async function sendDuelResultPush(p: {
  creatorId: string; opponentId: string | null; winnerId: string | null;
  creatorBrier: number; opponentBrier: number; opponentName: string | null; creatorName: string;
}): Promise<void> {
  if (!pushEnabled()) return;
  const IA_ID = "00000000-0000-0000-0000-000000000000";
  const sides: Array<{ id: string; mine: number; theirs: number; vs: string }> = [
    { id: p.creatorId, mine: p.creatorBrier, theirs: p.opponentBrier, vs: p.opponentName ?? "oponente" },
  ];
  // O oponente-IA (uuid sentinela) não recebe push
  if (p.opponentId && p.opponentId !== IA_ID) {
    sides.push({ id: p.opponentId, mine: p.opponentBrier, theirs: p.creatorBrier, vs: p.creatorName });
  }

  let sent = 0;
  for (const s of sides) {
    const won = p.winnerId === s.id;
    const tie = p.winnerId === null;
    sent += await pushToUser(s.id, {
      title: tie ? "🤝 Duelo empatado" : won ? "🏆 Você venceu o duelo!" : "Duelo encerrado",
      body: tie
        ? `Briers idênticos contra ${s.vs} (${s.mine.toFixed(3)}).`
        : `Seu Brier ${s.mine.toFixed(3)} vs ${s.theirs.toFixed(3)} de ${s.vs}.${won ? " +25 pts" : " Revanche?"}`,
      url: "/duelos",
    });
  }
  if (sent > 0) log.info(`[push] resultado de duelo enviado para ${sent} assinatura(s)`);
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
