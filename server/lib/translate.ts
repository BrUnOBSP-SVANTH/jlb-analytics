// ── Tradução EN→pt-BR compartilhada (Google gtx → MyMemory fallback) ─────────
// Extraída de routes/news.ts para o RAG do Cerebro poder traduzir títulos de
// mercado antes da busca full-text (o índice FTS é português; keywords em
// inglês zeravam o recall). Cache 24h; falha nunca é cacheada.
import { getCache, setCache } from "./cache.ts";
import { fetchJSON } from "./fetcher.ts";

function isTranslationError(text: string): boolean {
  const t = text.toLowerCase();
  return t.includes("mymemory warning") || t.includes("quota") ||
    t.includes("you used all") || t.includes("invalid language pair") ||
    t.includes("must be shorter than") || t.startsWith("http");
}

async function tryGoogleTranslate(text: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt-BR&dt=t&q=${encodeURIComponent(text)}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(6000),
    });
    if (!r.ok) return null;
    const data = await r.json() as Array<unknown>;
    const chunks = (data[0] as Array<[string]> | null) ?? [];
    const result = chunks.map((c) => c[0] ?? "").join("").trim();
    return result && !isTranslationError(result) ? result : null;
  } catch { return null; }
}

async function tryMyMemory(text: string): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|pt-BR`;
    interface MyMemoryResponse { responseData: { translatedText: string }; responseStatus: number }
    const data = await fetchJSON<MyMemoryResponse>(url);
    if (data.responseStatus !== 200) return null;
    const result = data.responseData?.translatedText?.trim() ?? "";
    return result && !isTranslationError(result) ? result : null;
  } catch { return null; }
}

/** Traduz EN→pt-BR com cache 24h. Retorna null quando ambos os provedores falham. */
export async function translateToPt(text: string): Promise<string | null> {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return null;
  const cacheKey = `translate:${trimmed}`;
  const cached = getCache<string>(cacheKey);
  if (cached) return cached;
  const translation = await tryGoogleTranslate(trimmed) ?? await tryMyMemory(trimmed);
  if (translation) {
    setCache(cacheKey, translation, 86400);
    return translation;
  }
  return null;
}
