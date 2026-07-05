// ── Busca e enriquecimento de notícias (NewsAPI + queries inteligentes) ──────
// Extraído de routes/ai.ts. Público: getNewsForMarket.
import { fetchJSON } from "./fetcher.ts";
import { extractJson } from "./extractJson.ts";
import { callClaude } from "./anthropic.ts";
import type { NewsArticle, NewsApiResponse } from "./types.ts";

// ── NewsAPI keyword extractor (fallback simples) ─────────────────────────────
function extractNewsKeywords(text: string): string {
  const clean = text.replace(/[?!.,'"()[\]]/g, " ").replace(/\s+/g, " ").trim();
  const words = clean.split(" ");
  const entityPhrases: string[] = [];
  let phrase: string[] = [];
  for (const w of words) {
    if (/^[A-Z][a-zA-Z]{1,}$/.test(w)) { phrase.push(w); }
    else {
      if (phrase.length >= 2) entityPhrases.push(`"${phrase.join(" ")}"`);
      else if (phrase.length === 1) entityPhrases.push(phrase[0]);
      phrase = [];
    }
  }
  if (phrase.length >= 2) entityPhrases.push(`"${phrase.join(" ")}"`);
  else if (phrase.length === 1) entityPhrases.push(phrase[0]);
  const stopWords = new Set(["will","the","a","an","be","in","on","for","of","to","at","is","are","was","were","by","or","and","not","that","this","with","from","have","has","what","when","who","which","than","more","after","over","year","years","first","time","new","now","five","three","como","que","para","com","por","uma","dos","das","ser","está"]);
  const fallback = words.filter((w) => w.length > 4 && !stopWords.has(w.toLowerCase()) && !/^\d+$/.test(w)).sort((a, b) => b.length - a.length).slice(0, 4);
  const seen = new Set(entityPhrases.map((p) => p.replace(/"/g, "").toLowerCase()));
  const extra = fallback.filter((w) => !seen.has(w.toLowerCase()));
  return [...entityPhrases.slice(0, 3), ...extra].slice(0, 5).join(" ");
}

// Detecta se o texto é sobre um mercado brasileiro (Selic, IPCA, BR, etc.)
function isBrazilianMarket(text: string): boolean {
  const BR_SIGNALS = /\b(brasil|brazil|selic|ipca|bcb|ibovespa|petrobras|bolsonaro|lula|congresso|câmbio|brl|cvm|b3|embrapa|agronegócio|bolsa brasileira|eleição brasileira|eleições brasil)\b/i;
  return BR_SIGNALS.test(text);
}

// ── NewsAPI helper com suporte a múltiplos idiomas ───────────────────────────
async function searchNewsAPI(query: string, apiKey: string, fromDays = 14, lang = "en"): Promise<NewsArticle[]> {
  if (!apiKey || !query.trim()) return [];
  try {
    const from = new Date(Date.now() - fromDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=6&sortBy=relevancy&from=${from}&language=${lang}&apiKey=${apiKey}`;
    const data = await fetchJSON<NewsApiResponse>(url);
    if (data.status !== "ok") return [];
    return data.articles.filter((a) => a.title !== "[Removed]" && a.description).slice(0, 5);
  } catch { return []; }
}

function deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  return articles.filter((a) => { if (seen.has(a.url)) return false; seen.add(a.url); return true; });
}

// ── AI-powered search query generator ────────────────────────────────────────
async function generateSmartQueries(title: string, description?: string): Promise<{ query1: string; query2: string; isBR: boolean }> {
  const ctx = description ? `${title}\n${description}` : title;
  const isBR = isBrazilianMarket(ctx);
  const langInstruction = isBR
    ? "For query1 use Portuguese (pt-BR). For query2 use English."
    : "Use English for both queries.";
  const prompt = `You are a news search specialist. Given this prediction market, generate 2 optimized search queries for NewsAPI.

MARKET: "${ctx}"

${langInstruction}
Rules:
- query1: specific named entities + the key event
- query2: broader context — causal factors, institutions, key people, related developments
- NEVER include "will", "probability", "market", "predict", "bet" — focus on the REAL WORLD SUBJECT
- Be very specific to avoid unrelated results

JSON only: {"query1":"...","query2":"..."}`;
  try {
    const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 130, messages: [{ role: "user", content: prompt }], timeoutMs: 5_000 });
    const parsed = extractJson(raw) as { query1?: string; query2?: string };
    return { query1: parsed.query1 ?? "", query2: parsed.query2 ?? "", isBR };
  } catch { return { query1: "", query2: "", isBR }; }
}

// ── Função unificada de busca de notícias para todos os endpoints ─────────────
// Substitui código duplicado nos 3 endpoints que buscavam notícias de forma diferente.
// Usa 3 fases: fallback keyword → smart query1 (idioma correto) → smart query2 (contexto)
export async function getNewsForMarket(
  title: string,
  apiKey: string,
  description?: string,
  opts: { maxTotal?: number; daysPrimary?: number; daysSecondary?: number } = {}
): Promise<{ articles: NewsArticle[]; queries: { fallback: string; q1: string; q2: string }; isBR: boolean }> {
  const { maxTotal = 8, daysPrimary = 14, daysSecondary = 21 } = opts;

  const fallbackKw = extractNewsKeywords(title + (description ? " " + description : ""));

  const [smartResult, fallbackResult] = await Promise.allSettled([
    apiKey ? generateSmartQueries(title, description) : Promise.resolve({ query1: "", query2: "", isBR: isBrazilianMarket(title) }),
    searchNewsAPI(fallbackKw, apiKey, daysPrimary, "en"),
  ]);

  const smart = smartResult.status === "fulfilled" ? smartResult.value : { query1: "", query2: "", isBR: false };
  const fallbackArticles = fallbackResult.status === "fulfilled" ? fallbackResult.value : [];

  // Fase 2: TODAS as buscas inteligentes em UMA onda paralela (sem 3ª onda serial).
  // Para mercado BR, já dispara q1 em PT e EN juntos — antes isso era um fallback serial.
  const lang1 = smart.isBR ? "pt" : "en";
  const settled = await Promise.allSettled([
    smart.query1 ? searchNewsAPI(smart.query1, apiKey, daysPrimary, lang1) : Promise.resolve([] as NewsArticle[]),
    smart.query2 ? searchNewsAPI(smart.query2, apiKey, daysSecondary, "en") : Promise.resolve([] as NewsArticle[]),
    smart.isBR && smart.query1 ? searchNewsAPI(smart.query1, apiKey, daysPrimary, "en") : Promise.resolve([] as NewsArticle[]),
  ]);
  const [primaryArticles, secondaryArticles, brEnArticles] = settled.map((s) =>
    s.status === "fulfilled" ? s.value : ([] as NewsArticle[]),
  );

  const merged = deduplicateArticles([...primaryArticles, ...fallbackArticles, ...brEnArticles, ...secondaryArticles]).slice(0, maxTotal);

  return {
    articles: merged,
    queries: { fallback: fallbackKw, q1: smart.query1, q2: smart.query2 },
    isBR: smart.isBR,
  };
}

// extractJson + tryCloseAndParse foram extraídos para ../lib/extractJson.ts
// (módulo puro e testável — ver server/lib/extractJson.test.ts).

