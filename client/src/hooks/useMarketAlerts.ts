/**
 * useMarketAlerts — Recebe alertas de variação de mercado via WebSocket.
 *
 * O servidor envia `{ type: "market_alerts", alerts: [...] }` quando qualquer
 * mercado Polymarket/Kalshi movimenta ≥ 3pp, para TODO mundo conectado. Quem
 * decide o que interessa é este hook, comparando com a watchlist.
 *
 * ⚠️ SEM WATCHLIST, SILÊNCIO (Auditoria 21/09, UXP-04). A regra era o inverso:
 * `if (!watchlistIds || watchlistIds.size === 0) return true` — lista vazia
 * deixava passar TUDO. E o sino da barra chamava o hook sem argumento nenhum,
 * então avisava sobre mercados que a pessoa nunca escolheu seguir.
 *
 * Um alerta é uma promessa: "algo que VOCÊ acompanha se mexeu". Quebrada essa
 * promessa, o sino vira ruído — e sino que vira ruído deixa de ser olhado
 * inclusive quando traz o alerta certo. Por isso agora o padrão é a watchlist
 * de verdade, e lista vazia significa nenhum alerta (com a tela explicando
 * como receber o primeiro).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { filtrarAlertas, alertasQueInteressam, MAX_ALERTAS } from "@/lib/alertas";
import { idsDaWatchlist, EVENTO_WATCHLIST } from "@/lib/watchlist";
import { assinarAoVivo } from "@/lib/livePrices";

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
  /**
   * Quem não recebe a lista pronta (o sino da barra) lê a do navegador — e
   * continua lendo: seguir um mercado durante a visita passa a valer na hora,
   * e em qualquer aba aberta.
   */
  const [seguidosLocais, setSeguidosLocais] = useState<Set<string>>(() => {
    try { return idsDaWatchlist(); } catch { return new Set(); }
  });
  useEffect(() => {
    if (watchlistIds) return;
    const reler = () => { try { setSeguidosLocais(idsDaWatchlist()); } catch { /* sem storage */ } };
    window.addEventListener(EVENTO_WATCHLIST, reler);
    window.addEventListener("storage", reler);
    return () => {
      window.removeEventListener(EVENTO_WATCHLIST, reler);
      window.removeEventListener("storage", reler);
    };
  }, [watchlistIds]);
  const seguidos = watchlistIds ?? seguidosLocais;
  /**
   * A lista vive numa ref porque quem a lê é o `onmessage` de um WebSocket já
   * aberto. Se ela entrasse nas dependências do `connect`, seguir um mercado
   * derrubaria e reabriria a conexão — e o filtro ficaria certo ao custo de um
   * reconecta a cada clique.
   */
  const seguidosRef = useRef(seguidos);
  // Em efeito, não na renderização: escrever em ref durante o render é o que o
  // React Compiler proíbe (e com razão — o render pode rodar duas vezes).
  useEffect(() => { seguidosRef.current = seguidos; }, [seguidos]);
  const [lastReadTime, setLastReadTime] = useState(() => getLastReadTime());
  const [latestAlert, setLatestAlert] = useState<MarketAlert | null>(null);

  /**
   * ⚠️ ASSINA a conexão do site, não abre outra (UXP-04).
   *
   * Este hook mantinha o próprio WebSocket, com o próprio reconectar, para o
   * mesmo `/ws/quotes` que `lib/livePrices.ts` já usava. Como o sino mora na
   * barra e a barra está em toda tela, todo visitante com uma página de cards
   * aberta gastava DUAS conexões — e o servidor contava duas pessoas.
   */
  useEffect(() => {
    return assinarAoVivo("market_alerts", (msg) => {
      const payload = msg as WsMarketAlertsPayload;
      if (!Array.isArray(payload?.alerts)) return;

      const receivedAt = new Date().toISOString();
      const incoming: MarketAlert[] = alertasQueInteressam(payload.alerts, seguidosRef.current)
        .map((a) => ({ ...a, receivedAt }));

      if (incoming.length === 0) return;

      setAlerts((prev) => {
        const next = filtrarAlertas([...incoming, ...prev]);
        saveAlerts(next);
        return next;
      });
      // O toast só aparece para o que sobreviveu à régua: alerta de mercado já
      // liquidado interrompia o usuário para não dizer nada.
      const primeiro = filtrarAlertas(incoming)[0];
      if (primeiro) setLatestAlert(primeiro);
    });
  }, []);

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

  // `semSeguidos` separa "nada se mexeu" de "você não segue nada" — são
  // estados vazios diferentes, e só um deles tem uma ação a oferecer.
  return { alerts, latestAlert, clearAlerts, unreadCount, markAllRead, semSeguidos: seguidos.size === 0 };
}
