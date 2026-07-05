/**
 * Store de preços ao vivo via WebSocket.
 * O servidor transmite `market_prices` (mapa id→prob 0-100) a cada ~90s. Aqui
 * mantemos UMA conexão compartilhada; os cards assinam via useLivePrice e
 * atualizam a probabilidade + "flash" quando o preço muda — estilo Polymarket.
 */
import { useEffect, useRef, useState } from "react";

const prices = new Map<string, number>(); // id (poly-/kalshi-) → prob 0-100
const listeners = new Set<() => void>();
let ws: WebSocket | null = null;
let refCount = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect() {
  if (ws || typeof window === "undefined") return;
  try {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${window.location.host}/ws/quotes`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type?: string; prices?: Record<string, number> };
        if (msg.type === "market_prices" && msg.prices) {
          for (const [id, prob] of Object.entries(msg.prices)) {
            if (typeof prob === "number" && isFinite(prob)) prices.set(id, prob);
          }
          listeners.forEach((l) => l());
        }
      } catch { /* ignora frame inválido */ }
    };
    ws.onclose = () => {
      ws = null;
      if (refCount > 0 && !reconnectTimer) {
        reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 5000);
      }
    };
    ws.onerror = () => { try { ws?.close(); } catch { /* noop */ } };
  } catch { ws = null; }
}

/**
 * Preço ao vivo de um mercado. Retorna a prob atual (0-100) — do WS se disponível,
 * senão o fallback — e um flash ("up"/"down") transitório quando o preço muda.
 */
export function useLivePrice(id: string, fallbackPct: number): { pct: number; flash: "up" | "down" | null } {
  const [pct, setPct] = useState(fallbackPct);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevRef = useRef(fallbackPct);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    prevRef.current = fallbackPct;
    refCount++;
    connect();

    const update = () => {
      const live = prices.get(id);
      if (live === undefined) return;
      if (Math.abs(live - prevRef.current) >= 0.5) {
        const dir = live > prevRef.current ? "up" : "down";
        prevRef.current = live;
        setPct(live);
        setFlash(dir);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlash(null), 1500);
      } else {
        setPct(live);
      }
    };
    update(); // aplica o valor já em cache no store, se houver
    listeners.add(update);

    return () => {
      listeners.delete(update);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      refCount--;
      if (refCount <= 0) {
        try { ws?.close(); } catch { /* noop */ }
        ws = null;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Sem preço ao vivo para este id (Manifold/Reddit, ou antes do 1º frame do WS):
  // segue o valor do refetch da lista (fallbackPct muda a cada ~60s).
  useEffect(() => {
    if (!prices.has(id)) { prevRef.current = fallbackPct; setPct(fallbackPct); }
  }, [fallbackPct, id]);

  return { pct, flash };
}
