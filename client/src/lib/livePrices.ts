/**
 * A CONEXÃO AO VIVO DO SITE — uma só, compartilhada.
 *
 * O servidor transmite pelo mesmo `/ws/quotes` duas coisas: `market_prices`
 * (mapa id→prob, para o card piscar quando muda) e `market_alerts` (os
 * movimentos de 3 pp que alimentam o sino).
 *
 * ⚠️ ERAM DUAS CONEXÕES (Auditoria 21/09, UXP-04). Este módulo abria a sua e o
 * `useMarketAlerts` abria outra, para o mesmo endereço, no mesmo navegador. Em
 * qualquer página com cards havia sempre as duas abertas, porque o sino mora na
 * barra e a barra está em toda tela. Consequências: o dobro de sockets vivos no
 * plano de 0,1 CPU do Render, cada transmissão enviada duas vezes para a mesma
 * pessoa e — o que engana de verdade — `wsClients.size` contando o dobro de
 * gente conectada, num site cuja audiência inteira cabe em duas dezenas.
 *
 * Agora quem quer ouvir assina por TIPO de mensagem. A conexão nasce com o
 * primeiro assinante e morre com o último.
 */
import { useEffect, useRef, useState } from "react";

const prices = new Map<string, number>(); // id (poly-/kalshi-) → prob 0-100
const listeners = new Set<() => void>();
/** tipo da mensagem → quem quer ouvir. */
const assinantes = new Map<string, Set<(msg: unknown) => void>>();
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
        // Um assinante que estoura não pode calar os outros nem derrubar a
        // conexão: cada um corre no seu try.
        // `Array.from`: o alvo de TS deste projeto não itera Set direto.
        for (const ouvir of Array.from(assinantes.get(String(msg.type)) ?? [])) {
          try { ouvir(msg); } catch { /* assinante com defeito é problema dele */ }
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
 * Ouvir um tipo de mensagem da conexão ao vivo. Devolve a função de cancelar.
 *
 * Quem assina segura a conexão aberta enquanto estiver ouvindo — mesma
 * contagem de referências que os cards usam, para a conexão fechar sozinha
 * quando a última tela que precisava dela sair.
 */
export function assinarAoVivo(tipo: string, ouvir: (msg: unknown) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const doTipo = assinantes.get(tipo) ?? new Set();
  doTipo.add(ouvir);
  assinantes.set(tipo, doTipo);
  refCount++;
  connect();
  return () => {
    doTipo.delete(ouvir);
    refCount--;
    if (refCount <= 0) {
      try { ws?.close(); } catch { /* noop */ }
      ws = null;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    }
  };
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
