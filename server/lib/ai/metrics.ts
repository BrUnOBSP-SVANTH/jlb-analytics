/**
 * Métricas leves das chamadas de IA (observabilidade).
 *
 * Antes: só havia log textual — não dava para ver quanto do site roda no Claude
 * vs. no fallback Gemini, a taxa de fallback nem a latência. Estes contadores em
 * memória (por instância) respondem essas perguntas com custo ~zero e alimentam
 * o GET /api/ai/metrics. Não é billing — é sinal direcional para operar a IA.
 */

type Provider = "anthropic" | "gemini" | "error";

interface AiMetrics {
  calls: number;
  anthropic: number; // respondidas pela Anthropic (Claude)
  gemini: number;    // respondidas pelo fallback Gemini
  errors: number;    // nenhum provedor respondeu
  latencyMsTotal: number;
  latencyMsCount: number;
  embedOk: number;          // embeddings gerados (consomem a cota Gemini de 1000/dia)
  embedRateLimited: number; // 429 — cota diária estourada (RAG semântico cai p/ FTS)
  clampHits: number;        // vezes que o guardrail moveu o fair value (sinal de calibração)
  since: string;     // ISO do início da coleta (reset/boot)
}

const M: AiMetrics = {
  calls: 0, anthropic: 0, gemini: 0, errors: 0,
  latencyMsTotal: 0, latencyMsCount: 0,
  embedOk: 0, embedRateLimited: 0, clampHits: 0,
  since: new Date().toISOString(),
};

/** Registra uma chamada de IA concluída. `latencyMs` é opcional. */
export function recordAiCall(provider: Provider, latencyMs?: number): void {
  M.calls += 1;
  if (provider === "anthropic") M.anthropic += 1;
  else if (provider === "gemini") M.gemini += 1;
  else M.errors += 1;
  if (typeof latencyMs === "number" && Number.isFinite(latencyMs)) {
    M.latencyMsTotal += latencyMs;
    M.latencyMsCount += 1;
  }
}

/**
 * Registra uma chamada de embedding (Gemini). A cota free é 1000/dia e é
 * COMPARTILHADA entre o backfill e as buscas ao vivo — sem este contador, o
 * estouro (429 → o RAG semântico cai p/ FTS em silêncio) era invisível.
 */
export function recordEmbedding(status: number): void {
  if (status === 429) M.embedRateLimited += 1;
  else if (status >= 200 && status < 300) M.embedOk += 1;
}

/** Registra que o guardrail clampFairValue moveu o valor — sinal direto de calibração/alucinação. */
export function recordClamp(): void { M.clampHits += 1; }

/** Snapshot com métricas derivadas (média de latência, taxa de fallback). */
export function aiMetricsSnapshot(): {
  calls: number; anthropic: number; gemini: number; errors: number;
  avgLatencyMs: number | null; fallbackRatePct: number; errorRatePct: number;
  embeddings: { ok: number; rateLimited: number }; clampHits: number; since: string;
} {
  const answered = M.anthropic + M.gemini;
  return {
    calls: M.calls,
    anthropic: M.anthropic,
    gemini: M.gemini,
    errors: M.errors,
    avgLatencyMs: M.latencyMsCount ? Math.round(M.latencyMsTotal / M.latencyMsCount) : null,
    fallbackRatePct: answered ? Math.round((M.gemini / answered) * 100) : 0,
    errorRatePct: M.calls ? Math.round((M.errors / M.calls) * 100) : 0,
    embeddings: { ok: M.embedOk, rateLimited: M.embedRateLimited },
    clampHits: M.clampHits,
    since: M.since,
  };
}

/** Zera os contadores — usado nos testes. */
export function _resetAiMetrics(): void {
  M.calls = 0; M.anthropic = 0; M.gemini = 0; M.errors = 0;
  M.latencyMsTotal = 0; M.latencyMsCount = 0;
  M.embedOk = 0; M.embedRateLimited = 0; M.clampHits = 0;
  M.since = new Date().toISOString();
}
