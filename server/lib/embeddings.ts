// ── Embeddings (Google Gemini) para o RAG semântico do Cerebro ───────────────
// gemini-embedding-001 @ 768 dims — compacto e indexável pelo pgvector (o padrão
// de 3072 estoura o limite de índice). Usa a MESMA GEMINI_API_KEY do fallback.
// Inerte sem a chave: retorna null e o Cerebro cai graciosamente no FTS atual.
//
// taskType separa a intenção (query vs. documento) e melhora o recall. Com
// cosine distance a normalização é irrelevante (escala não importa), então
// dims reduzidas podem ser usadas direto.
import { log } from "./log.ts";
import { recordEmbedding } from "./ai/metrics.ts";

const EMBED_MODEL = "gemini-embedding-001";
export const EMBED_DIMS = 768;

export function embeddingsEnabled(): boolean {
  return (process.env.GEMINI_API_KEY ?? "").length > 0;
}

export type EmbedTaskType = "RETRIEVAL_QUERY" | "RETRIEVAL_DOCUMENT";

/** vetor + status HTTP da chamada (0 = sem chave/texto ou erro de rede/timeout). */
export interface EmbedResult { vector: number[] | null; status: number; }

/**
 * Chamada crua à API de embeddings, expondo o status HTTP. Usado pelo backfill
 * para distinguir "cota estourada" (429) de "falha pontual" e parar cedo em vez
 * de martelar a API. Nunca lança. Para o caminho de RAG ao vivo, prefira
 * `embedText`, que descarta o status e só devolve o vetor (ou null).
 */
export async function rawEmbed(
  text: string,
  taskType: EmbedTaskType = "RETRIEVAL_QUERY",
  timeoutMs = 15_000,
): Promise<EmbedResult> {
  const key = process.env.GEMINI_API_KEY ?? "";
  const clean = (text ?? "").trim();
  if (!key || !clean) return { vector: null, status: 0 };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: clean.slice(0, 8_000) }] },
          taskType,
          outputDimensionality: EMBED_DIMS,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    recordEmbedding(res.status); // observabilidade da cota (1000/dia, compartilhada com o RAG ao vivo)
    if (!res.ok) {
      log.warn(`[embeddings] HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
      return { vector: null, status: res.status };
    }
    const data = await res.json() as { embedding?: { values?: number[] } };
    const v = data.embedding?.values;
    const vector = Array.isArray(v) && v.length === EMBED_DIMS ? v : null;
    return { vector, status: 200 };
  } catch (e) {
    log.warn("[embeddings] falhou:", e instanceof Error ? e.message : e);
    return { vector: null, status: 0 };
  }
}

/**
 * Gera o embedding de um texto. Retorna `null` em qualquer falha (sem chave,
 * HTTP, timeout, dims inesperadas) — quem chama trata como "sem vetor" e usa o
 * fallback. Nunca lança, para não derrubar o caminho de RAG.
 */
export async function embedText(
  text: string,
  taskType: EmbedTaskType = "RETRIEVAL_QUERY",
  timeoutMs = 15_000,
): Promise<number[] | null> {
  return (await rawEmbed(text, taskType, timeoutMs)).vector;
}
