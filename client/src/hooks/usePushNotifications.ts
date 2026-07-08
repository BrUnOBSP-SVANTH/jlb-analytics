/**
 * usePushNotifications — assinatura Web Push para alertas de watchlist.
 *
 * Fluxo: permissão do browser → pushManager.subscribe (VAPID de /api/config)
 * → POST /api/push/subscribe com os ids da watchlist. O flag local permite
 * re-sincronizar a watchlist na assinatura quando ela muda.
 */
import { useCallback, useEffect, useState } from "react";
import { loadWatchlist } from "@/lib/watchlist";
import { supabase } from "@/lib/supabase";

const FLAG_KEY = "jlb_push_enabled";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function postSubscription(sub: PushSubscription): Promise<boolean> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const r = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
    },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      watchlistIds: loadWatchlist().map((w) => w.id),
    }),
  });
  return r.ok;
}

/** Re-sincroniza a watchlist na assinatura existente (chamar após add/remove). */
export async function syncPushWatchlist(): Promise<void> {
  try {
    if (localStorage.getItem(FLAG_KEY) !== "1" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) void postSubscription(sub);
  } catch { /* best-effort */ }
}

export function usePushNotifications() {
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!supported) return;
    setDenied(Notification.permission === "denied");
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEnabled(!!sub && localStorage.getItem(FLAG_KEY) === "1"))
      .catch(() => {});
  }, [supported]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!supported || busy) return false;
    setBusy(true);
    try {
      const cfg = await fetch("/api/config").then((r) => r.json()) as { vapidPublicKey?: string | null };
      if (!cfg.vapidPublicKey) return false;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setDenied(permission === "denied"); return false; }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription()
        ?? await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(cfg.vapidPublicKey) as BufferSource,
        });

      const ok = await postSubscription(sub);
      if (ok) { localStorage.setItem(FLAG_KEY, "1"); setEnabled(true); }
      return ok;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, [supported, busy]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        void fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      localStorage.removeItem(FLAG_KEY);
      setEnabled(false);
    } catch { /* best-effort */ } finally {
      setBusy(false);
    }
  }, [supported]);

  return { supported, enabled, busy, denied, subscribe, unsubscribe };
}
