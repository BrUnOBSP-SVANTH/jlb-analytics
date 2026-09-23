/**
 * Que dia é hoje — no Brasil.
 *
 * POR QUE EXISTE (Auditoria 21/09, SEG-02). O briefing diário era guardado com
 * a chave `daily-briefing:${new Date().toISOString().slice(0, 10)}`, ou seja, a
 * data UTC. Brasília é UTC−3: às 21h de um dia aqui, lá já é o dia seguinte —
 * então o "briefing de hoje" virava outro às 21h, no meio da noite de quem lê,
 * e gastava IA de novo. Um produto inteiro em português não pode ter o seu dia
 * definido em Londres.
 *
 * O deslocamento é fixo (-03:00): o Brasil não tem horário de verão desde 2019.
 * `Intl` resolveria sozinho, mas ele depende dos dados de fuso do ambiente, e
 * no contêiner do Render essa base pode vir enxuta — uma data errada em
 * silêncio é pior do que uma constante que se explica.
 */

/** Minutos que Brasília está atrás de UTC. */
const BRASILIA_UTC_MIN = -3 * 60;

/** "2026-09-22" — a data de hoje em Brasília, no formato do banco. */
export function hojeEmBrasilia(agora: number | Date = Date.now()): string {
  const ms = agora instanceof Date ? agora.getTime() : agora;
  return new Date(ms + BRASILIA_UTC_MIN * 60_000).toISOString().slice(0, 10);
}

/** Quantos segundos faltam para a virada do dia em Brasília (mínimo 60). */
export function segundosAteVirarODia(agora: number | Date = Date.now()): number {
  const ms = agora instanceof Date ? agora.getTime() : agora;
  const local = new Date(ms + BRASILIA_UTC_MIN * 60_000);
  const meiaNoite = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1);
  return Math.max(60, Math.round((meiaNoite - local.getTime()) / 1000));
}
