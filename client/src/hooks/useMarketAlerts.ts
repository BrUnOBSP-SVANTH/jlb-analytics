/**
 * useMarketAlerts — Recebe alertas de variação de mercado via WebSocket.
 *
 * O servidor envia `{ type: "market_alerts", alerts: [...] }` quando
 * qualquer mercado Polymarket/Kalshi movimenta ≥ 3pp.
 * Este hook filtra apenas os itens que estão na watchlist do usuário.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

export interface MarketAlert {
  id: string;
  title: string;
  source: "polymarket" | "kalshi";
  prob: number;
  prevProb: number;
  delta: number;
  receivedAt: string;
  context?: string;
}

interface WsMarketAlertsPayload {
  type: "market_alerts";
  updatedAt: string;
  alerts: Omit<MarketAlert, "receivedAt">[];
}

const RECONNECT_DELAY = 7_000;
const MAX_ALERTS = 50;
const HISTORY_KEY = "jlb_alert_history_v1";
const LAST_READ_KEY = "jlb_alert_last_read";
const MAX_STORED = 50;

function loadStoredAlerts(): MarketAlert[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) as MarketAlert[] : [];
  } catch { return []; }
}

function saveAlerts(alerts: MarketAlert[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(alerts.slice(0, MAX_STORED)));
}

function getLastReadTime(): number {
  const raw = localStorage.getItem(LAST_READ_KEY);
  return raw ? parseInt(raw, 10) : 0;
}

export function useMarketAlerts(watchlistIds?: Set<string>) {
  const [alerts, setAlerts] = useState<MarketAlert[]>(() => loadStoredAlerts());
  const [lastReadTime, setLastReadTime] = useState(() => getLastReadTime());
  const [latestAlert, setLatestAlert] = useState<MarketAlert | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);

  const connect = useCallback(() => {
    if (unmounted.current) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws/quotes`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as WsMarketAlertsPayload;
          if (payload.type !== "market_alerts") return;

          const receivedAt = new Date().toISOString();
          const incoming: MarketAlert[] = payload.alerts
            .filter((a) => {
              // Se watchlistIds fornecido, filtra só itens salvos
              if (!watchlistIds || watchlistIds.size === 0) return true;
              return watchlistIds.has(a.id);
            })
            .map((a) => ({ ...a, receivedAt }));

          if (incoming.length === 0) return;

          setAlerts((prev) => {
            const next = [...incoming, ...prev].slice(0, MAX_ALERTS);
            saveAlerts(next);
            return next;
          });
          setLatestAlert(incoming[0]);
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        if (unmounted.current) return;
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      };
      ws.onerror = () => ws.close();
    } catch {
      // WS indisponível (build preview sem servidor)
    }
  }, [watchlistIds]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const unreadCount = useMemo(
    () => alerts.filter(a => new Date(a.receivedAt).getTime() > lastReadTime).length,
    [alerts, lastReadTime]
  );

  function markAllRead() {
    const now = Date.now();
    localStorage.setItem(LAST_READ_KEY, now.toString());
    setLastReadTime(now);
  }

  function clearAlerts() {
    setAlerts([]);
    setLatestAlert(null);
  }

  return { alerts, latestAlert, clearAlerts, unreadCount, markAllRead };
}
