/**
 * Backfill de embeddings do Cerebro — lógica compartilhada entre o endpoint
 * POST /api/ai/embed-cerebro (uma leva sob demanda) e o agendador diário
 * (server/index.ts). Completa os artigos antigos sem vetor respeitando o teto
 * gratuito do Gemini de 1000/dia, que é COMPARTILHADO com as buscas semânticas
 * ao vivo — por isso o backfill diário para num limite folgado (dailyCap) em
 * vez de consumir a cota inteira.
 */
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "./supabaseRest.ts";
import { rawEmbed, embeddingsEnabled } from "./embeddings.ts";
import { log } from "./log.ts";

export interface EmbedBatchResult {
  embedded: number;
  remaining: number;   // artigos ainda sem vetor (-1 = desconhecido)
  done: boolean;
  rateLimited: boolean; // cota diária do Gemini estourou (429)
  error?: string;
}

/**
 * Embute UMA leva de até `limit` artigos ativos sem vetor. Nunca lança: falhas
 * viram `error` ou `rateLimited` para quem chama decidir. Para no primeiro 429
 * (não adianta insistir hoje) para não desperdiçar chamadas.
 */
export async function embedCerebroBatch(limit = 100): Promise<EmbedBatchResult> {
  const none = (error?: string): EmbedBatchResult => ({ embedded: 0, remaining: -1, done: false, rateLimited: false, error });
  if (!SUPABASE_URL || !SUPABASE_KEY) return none("supabase ausente");
  if (!embeddingsEnabled()) return none("gemini ausente");

  // MAIS NOVO PRIMEIRO, explicitamente. Sem `order` a fila sai na ordem física do
  // Postgres — que hoje calha de favorecer o recente, mas é coincidência, não
  // garantia. Importa porque a cota gratuita do Gemini (1000/dia) é o gargalo: se
  // a fila passar do teto diário, o que fica para trás tem que ser o artigo velho,
  // nunca o do jogo de amanhã. Notícia esportiva tem validade de dias — virar
  // vetor depois da partida é o mesmo que não virar.
  const sel = await fetch(
    `${SUPABASE_URL}/rest/v1/cerebro_articles?embedding=is.null&status=eq.active&select=id,title,summary&order=published_at.desc.nullslast&limit=${limit}`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
  ).catch(() => null);
  if (!sel || !sel.ok) return none("select_failed"); // coluna ausente → migração 016 não aplicada

  const rows = await sel.json() as Array<{ id: string; title: string; summary: string | null }>;
  if (rows.length === 0) return { embedded: 0, remaining: 0, done: true, rateLimited: false };

  let embedded = 0;
  let rateLimited = false;
  for (const a of rows) {
    const { vector, status } = await rawEmbed(`${a.title}\n${a.summary ?? ""}`.trim(), "RETRIEVAL_DOCUMENT");
    if (status === 429) { rateLimited = true; break; }
    if (!vector) continue; // falha pontual → pula; próxima rodada tenta de novo
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/cerebro_articles?id=eq.${a.id}`, {
      method: "PATCH",
      headers: supaWriteHeaders(),
      body: JSON.stringify({ embedding: `[${vector.join(",")}]` }),
    }).catch(() => null);
    if (pr?.ok) embedded += 1;
    await new Promise((r) => setTimeout(r, 150)); // throttle p/ o rate limit do Gemini
  }

  const cnt = await fetch(
    `${SUPABASE_URL}/rest/v1/cerebro_articles?embedding=is.null&status=eq.active&select=id`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact", Range: "0-0" } },
  ).catch(() => null);
  const remaining = cnt?.ok ? (Number(cnt.headers.get("content-range")?.split("/")[1] ?? "0") || 0) : -1;
  return { embedded, remaining, done: remaining === 0, rateLimited };
}

/**
 * Backfill diário (chamado pelo agendador 1×/dia). Roda várias levas até: bater
 * no teto do dia (`dailyCap`, folgado para deixar cota às buscas ao vivo),
 * terminar todos os artigos, ou a cota estourar. Observável via log.
 */
export async function runDailyEmbedBackfill(dailyCap = 800): Promise<EmbedBatchResult> {
  if (!embeddingsEnabled() || !SUPABASE_URL || !SUPABASE_KEY) {
    return { embedded: 0, remaining: -1, done: false, rateLimited: false, error: "config ausente" };
  }
  let total = 0, remaining = -1, rateLimited = false, done = false;
  while (total < dailyCap) {
    const r = await embedCerebroBatch(Math.min(100, dailyCap - total));
    if (r.error) return { embedded: total, remaining, done, rateLimited, error: r.error };
    total += r.embedded;
    remaining = r.remaining;
    if (r.rateLimited) { rateLimited = true; break; }
    if (r.done) { done = true; break; }
    if (r.embedded === 0) break; // nada progrediu → evita loop infinito
  }
  if (total > 0 || done) {
    log.info(`[embeddings] backfill diário: +${total} embutidos, restam ${remaining}${
      done ? " — completo ✅" : rateLimited ? " — cota do dia atingida, segue amanhã" : ""}`);
  }
  return { embedded: total, remaining, done, rateLimited };
}
