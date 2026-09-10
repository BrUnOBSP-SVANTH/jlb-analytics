/**
 * useMarketAlerts — Recebe alertas de variação de mercado via WebSocket.
 *
 * O servidor envia `{ type: "market_alerts", alerts: [...] }` quando
 * qualquer mercado Polymarket/Kalshi movimenta ≥ 3pp.
 * Este hook filtra apenas os itens que estão na watchlist do usuário.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { filtrarAlertas, MAX_ALERTAS } from "@/lib/alertas";

export interface MarketAlert {
  id: string;
  /** Id prefixado ("poly-…"/"kalshi-…") — mesmo formato da watchlist */
  key?: string;
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
// v2: a chave subiu de versão junto com a régua de `lib/alertas` — a lista
// antiga guardava 50 itens com duplicatas e mercados liquidados dentro, e
// reaproveitá-la manteria o badge cravado em "9+" mesmo com o bug corrigido.
const HISTORY_KEY = "jlb_alert_history_v2";
const LAST_READ_KEY = "jlb_alert_last_read";

function loadStoredAlerts(): MarketAlert[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    // Passa pela mesma régua na leitura: o que foi gravado antes de a regra
    // existir não pode voltar como ruído ao recarregar a página.
    return raw ? filtrarAlertas(JSON.parse(raw) as MarketAlert[]) : [];
  } catch { return []; }
}

function saveAlerts(alerts: MarketAlert[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(alerts.slice(0, MAX_ALERTAS))); }
  catch { /* navegador sem storage: o sino ainda funciona nesta sessão */ }
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
              // key = id prefixado do servidor; fallback p/ id cru (retrocompat)
              return watchlistIds.has(a.key ?? a.id);
            })
            .map((a) => ({ ...a, receivedAt }));

          if (incoming.length === 0) return;

          setAlerts((prev) => {
            const next = filtrarAlertas([...incoming, ...prev]);
            saveAlerts(next);
            return next;
          });
          // O toast só aparece para o que sobreviveu à régua: alerta de mercado
          // já liquidado interrompia o usuário para não dizer nada.
          const primeiro = filtrarAlertas(incoming)[0];
          if (primeiro) setLatestAlert(primeiro);
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
