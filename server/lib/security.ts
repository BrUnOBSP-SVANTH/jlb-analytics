/**
 * Detecção leve de abuso — VISIBILIDADE contra ataques (não se defende do que não se
 * vê). Conta eventos de segurança por IP numa janela deslizante, e ESCALA para um
 * alerta de log (log.error) quando um IP cruza o limiar — sinal de ataque em curso
 * (força-bruta de chave, scraping, DoS). Em memória, com limpeza periódica.
 *
 * As partes de contagem são puras/testáveis; recordSecurityEvent mantém o estado.
 */
import { log } from "./log.ts";

export type SecEventType = "rate_limit" | "auth_fail" | "cors_block" | "payload_too_large" | "bad_input";
export interface StampedEvent { t: number; type: SecEventType }

const WINDOW_MS = 10 * 60_000;   // janela de observação: 10 min
const ALERT_THRESHOLD = 20;      // eventos suspeitos na janela → alerta de possível ataque
const records = new Map<string, { events: StampedEvent[]; alerted: boolean }>();

/** Descarta eventos fora da janela. Puro. */
export function pruneEvents(events: StampedEvent[], now: number, windowMs = WINDOW_MS): StampedEvent[] {
  return events.filter((e) => now - e.t < windowMs);
}
/** Conta eventos por tipo. Puro. */
export function breakdown(events: StampedEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) out[e.type] = (out[e.type] ?? 0) + 1;
  return out;
}

/** Registra um evento de segurança de um IP e alerta se cruzar o limiar. */
export function recordSecurityEvent(type: SecEventType, ip: string | undefined): void {
  const key = ip || "unknown";
  const now = Date.now();
  const rec = records.get(key) ?? { events: [], alerted: false };
  rec.events = pruneEvents(rec.events, now);
  rec.events.push({ t: now, type });
  if (rec.events.length < ALERT_THRESHOLD) {
    rec.alerted = false;             // esfriou → rearma o alerta
  } else if (!rec.alerted) {
    rec.alerted = true;              // alerta UMA vez por surto (não spamma o log)
    log.error(`[security] atividade suspeita de ${key}: ${rec.events.length} eventos/10min ${JSON.stringify(breakdown(rec.events))}`);
  }
  records.set(key, rec);
}

/** Resumo para monitoramento: IPs com atividade suspeita na janela atual. */
export function securitySummary(now = Date.now()): { trackedIps: number; suspicious: Array<{ ip: string; count: number; types: Record<string, number> }> } {
  const suspicious: Array<{ ip: string; count: number; types: Record<string, number> }> = [];
  records.forEach((rec, ip) => {
    const ev = pruneEvents(rec.events, now);
    if (ev.length >= ALERT_THRESHOLD) suspicious.push({ ip, count: ev.length, types: breakdown(ev) });
  });
  return { trackedIps: records.size, suspicious: suspicious.sort((a, b) => b.count - a.count) };
}

// Limpeza periódica pra não vazar memória (IPs sem eventos recentes saem do mapa).
setInterval(() => {
  const now = Date.now();
  records.forEach((rec, ip) => {
    rec.events = pruneEvents(rec.events, now);
    if (rec.events.length === 0) records.delete(ip);
  });
}, 5 * 60_000).unref();
