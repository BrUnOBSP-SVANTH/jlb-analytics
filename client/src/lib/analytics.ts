/**
 * Telemetria first-party — best-effort, nunca quebra o app.
 * Sem cookies e sem PII: só um anon_id aleatório em localStorage,
 * o nome do evento e a rota. Enviado via sendBeacon (sobrevive à
 * navegação) com fallback para fetch keepalive.
 */

const ANON_KEY = "jlb_anon_id";

function anonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return "00000000-0000-0000-0000-000000000000";
  }
}

export function track(event: string, meta?: Record<string, unknown>): void {
  if (typeof window === "undefined") return; // testes/SSR
  try {
    const body = JSON.stringify({ event, path: window.location.pathname, anonId: anonId(), meta });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    }
  } catch { /* telemetria é best-effort */ }
}
