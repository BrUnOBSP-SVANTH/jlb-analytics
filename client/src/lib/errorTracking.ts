/**
 * Error tracking first-party — usa a telemetria própria (/api/track).
 * Sem Sentry, sem conta externa: erros de runtime que usuários encontram
 * deixam de ser invisíveis. Cap por sessão + dedupe evitam loop/flood.
 */
import { track } from "./analytics";

const MAX_PER_SESSION = 5;
let sent = 0;
const seen = new Set<string>();

export function reportClientError(message: string, source?: string): void {
  const msg = String(message).slice(0, 200);
  if (sent >= MAX_PER_SESSION || seen.has(msg)) return;
  seen.add(msg);
  sent++;
  track("client_error", { msg, source: source?.slice(0, 120) });
}

export function initErrorTracking(): void {
  window.addEventListener("error", (e) => {
    reportClientError(e.message, `${e.filename ?? ""}:${e.lineno ?? ""}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
    reportClientError(reason, "unhandledrejection");
  });
}
