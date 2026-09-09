/**
 * Telemetria first-party — best-effort, nunca quebra o app.
 * Sem cookies e sem PII: só um anon_id aleatório em localStorage,
 * o nome do evento e a rota. Enviado via sendBeacon (sobrevive à
 * navegação) com fallback para fetch keepalive.
 *
 * ⚠️ SÓ MEDE COM CONSENTIMENTO. Sem a autorização, esta função não envia nada e
 * NÃO CRIA o identificador — é o que torna o aviso de cookies real em vez de
 * decorativo. Um aviso que não muda comportamento dá ao usuário a impressão de
 * escolha e ao site a impressão de conformidade, sem nenhuma das duas.
 */

import { podeMedir } from "./cookies";

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
  // A checagem vem ANTES de anonId(): chamá-la criaria o identificador que a
  // pessoa acabou de recusar.
  if (!podeMedir()) return;
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
      }).catch(() => { /* best-effort: nunca propaga rejeição */ });
    }
  } catch { /* telemetria é best-effort */ }
}
