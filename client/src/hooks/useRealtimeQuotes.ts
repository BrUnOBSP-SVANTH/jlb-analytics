/**
 * useRealtimeQuotes — WebSocket hook for live price updates
 * Fase 5: Feature nova
 *
 * Connects to /ws/quotes, reconnects automatically on disconnect.
 * Falls back gracefully if WebSocket is unavailable.
 */

import { useState, useEffect, useRef, useCallback } from "react";

export interface RealtimeQuote {
  ticker: string;
  price: number;
  change: number; // percent
}

interface WsPayload {
  type: string;
  updatedAt: string;
  br: RealtimeQuote[];
  us: RealtimeQuote[];
}

export interface RealtimeData {
  br: RealtimeQuote[];
  us: RealtimeQuote[];
  updatedAt: string | null;
  connected: boolean;
}

const RECONNECT_DELAY = 5000; // 5s

export function useRealtimeQuotes(): RealtimeData {
  const [data, setData] = useState<RealtimeData>({
    br: [], us: [], updatedAt: null, connected: false,
  });

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

      ws.onopen = () => {
        if (unmounted.current) { ws.close(); return; }
        setData((prev) => ({ ...prev, connected: true }));
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data as string) as WsPayload;
          if (payload.type === "quotes") {
            setData({ br: payload.br, us: payload.us, updatedAt: payload.updatedAt, connected: true });
          }
        } catch { /* ignore malformed messages */ }
      };

      ws.onclose = () => {
        if (unmounted.current) return;
        setData((prev) => ({ ...prev, connected: false }));
        // Auto-reconnect
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // WebSocket not available (e.g. build preview without server)
      setData((prev) => ({ ...prev, connected: false }));
    }
  }, []);

  useEffect(() => {
    unmounted.current = false;
    connect();

    return () => {
      unmounted.current = true;
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return data;
}
