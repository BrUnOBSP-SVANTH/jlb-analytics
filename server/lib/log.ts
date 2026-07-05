/**
 * Logger estruturado mínimo — JLB Analytics
 *
 * Formato: `2026-07-05T12:00:00.000Z INFO  mensagem`
 * - Sem dependências (util.format lida com objetos/erros como o console).
 * - `LOG_LEVEL` (debug|info|warn|error, padrão info) filtra o que é emitido.
 * - warn/error vão para stderr — separáveis do stdout em produção.
 *
 * Os prefixos de escopo existentes nas mensagens (`[cerebro]`, `[WS]`, …)
 * continuam sendo a convenção de rastreio por subsistema.
 */
import { format } from "node:util";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

const envLevel = process.env.LOG_LEVEL as Level | undefined;
const minLevel: number = (envLevel && LEVELS[envLevel]) || LEVELS.info;

function emit(level: Level, args: unknown[]): void {
  if (LEVELS[level] < minLevel) return;
  const stream = LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout;
  stream.write(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${format(...args)}\n`);
}

export const log = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};
