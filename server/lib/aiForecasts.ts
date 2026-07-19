// ── Track record da IA: log, resolução, seed, divergências ───────────────────
// Registra cada fair value da IA, resolve contra mercados em preço extremo
// (ao vivo + snapshots), semeia previsões nos top mercados e computa onde a JLB
// mais discorda do mercado. Extraído de routes/ai.ts.
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "./supabaseRest.ts";
import { CATEGORY_BASE_RATES } from "./categoryRates.ts";
import { callClaude } from "./anthropic.ts";
import { extractJson } from "./extractJson.ts";
import { getCache, setCache } from "./cache.ts";
import { log } from "./log.ts";

// ── Auto-calibração: o viés medido nas resolvidas volta para o prompt ────────
// Erro médio assinado (estimativa − resultado) é a medida padrão de viés de
// calibração. Injetado nos prompts de fair value, fecha o loop: a IA corrige
// na direção oposta ao erro que ELA MESMA cometeu no track record público.
export async function getCalibrationMemo(): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return "";
  const cached = getCache<string>("ai-calibration-memo");
  if (cached !== null) return cached;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_forecasts?resolved=eq.true&select=ai_fair_value,market_prob,outcome&order=resolved_at.desc&limit=200`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(6_000) },
    );
    if (!res.ok) return "";
    const rows = await res.json() as Array<{ ai_fair_value: number; market_prob: number; outcome: boolean }>;
    if (rows.length < 5) { setCache("ai-calibration-memo", "", 3600); return ""; }

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const aiErr = mean(rows.map((r) => r.ai_fair_value - (r.outcome ? 100 : 0)));
    const mktErr = mean(rows.map((r) => r.market_prob - (r.outcome ? 100 : 0)));
    const aiBrier = mean(rows.map((r) => (r.ai_fair_value / 100 - (r.outcome ? 1 : 0)) ** 2));
    const dir = aiErr > 2 ? "SUPERESTIMAR probabilidades" : aiErr < -2 ? "SUBESTIMAR probabilidades" : "viés direcional pequeno";
    const sign = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}`;

    const memo = `AUTO-CALIBRAÇÃO (medida no nosso track record público, ${rows.length} previsões resolvidas):
- Erro médio assinado da nossa IA: ${sign(aiErr)}pp (tendência histórica a ${dir}); do mercado: ${sign(mktErr)}pp.
- Brier da nossa IA: ${aiBrier.toFixed(3)} (mercado costuma ser mais calibrado).
- Antes de responder, corrija seu palpite na direção OPOSTA ao viés medido acima.`;
    setCache("ai-calibration-memo", memo, 3600);
    return memo;
  } catch { return ""; }
}

export async function logAiForecast(f: {
  marketId: string; source: string; title: string; category?: string;
  marketProb: number; aiFairValue: number; confidence?: string;
}): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  if (!f.marketId || (!f.marketId.startsWith("poly-") && !f.marketId.startsWith("kalshi-"))) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/ai_forecasts?on_conflict=market_id,source,forecast_date`, {
      method: "POST",
      headers: supaWriteHeaders(),
      body: JSON.stringify({
        market_id: f.marketId, source: f.source, title: f.title.slice(0, 300),
        category: f.category ?? "other", market_prob: f.marketProb,
        ai_fair_value: f.aiFairValue, confidence: f.confidence ?? "media",
      }),
      signal: AbortSignal.timeout(6_000),
    });
  } catch { /* fire-and-forget */ }
}

/** Parse seguro de outcomePrices do Polymarket → array de números finitos (nunca lança). */
export function parsePolyPrices(raw?: string): number[] {
  if (!raw) return [];
  try { return (JSON.parse(raw) as string[]).map((s) => parseFloat(s)).filter((n) => isFinite(n)); }
  catch { return []; }
}

/** Lê os preços atuais direto do cache do servidor (sem self-call HTTP). */
export function getLiveMarketPrices(): Map<string, number> {
  const priceMap = new Map<string, number>();
  const poly = getCache<Array<{ id: string; outcomePrices?: string }>>("polymarket:markets:active") ?? [];
  const kalshi = getCache<Array<{ ticker: string; yesProb: number }>>("kalshi:markets") ?? [];
  for (const m of poly) {
    try { const p = parseFloat((JSON.parse(m.outcomePrices ?? "[]") as string[])[0]); if (!isNaN(p)) priceMap.set(`poly-${m.id}`, Math.round(p * 100)); } catch { /* skip */ }
  }
  for (const m of kalshi) priceMap.set(`kalshi-${m.ticker}`, Math.round(m.yesProb > 1 ? m.yesProb : m.yesProb * 100));
  return priceMap;
}

/**
 * Lê o histórico de snapshots e retorna os mercados que JÁ atingiram preço
 * extremo (≥97 / ≤3) em algum momento — keyed por `${source}:${rawId}`.
 * Crucial: mercados que fecham saem do cache ativo, então sem o histórico de
 * snapshots eles nunca resolveriam. Uma query só, ordenada por mais recente.
 * Se a escala/formato divergir, o pior caso é mapa vazio (0 resoluções) — nunca
 * uma resolução falsa.
 */
export async function getSnapshotExtremes(): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (!SUPABASE_URL || !SUPABASE_KEY) return map;
  try {
    const url = `${SUPABASE_URL}/rest/v1/market_snapshots?or=(yes_prob.gte.97,yes_prob.lte.3)&select=market_id,source,yes_prob&order=snapped_at.desc&limit=3000`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return map;
    const rows = await res.json() as Array<{ market_id: string; source: string; yes_prob: number }>;
    for (const r of rows) {
      const key = `${r.source}:${r.market_id}`;
      if (map.has(key)) continue; // mais recente já registrado (order desc)
      map.set(key, r.yes_prob >= 97);
    }
    return map;
  } catch { return map; }
}

/** Resolve previsões da IA contra mercados que atingiram preço extremo (≥97 / ≤3). */
export async function scoreAiForecasts(): Promise<{ scored: number }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { scored: 0 };
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ai_forecasts?resolved=eq.false&select=id,market_id,source&limit=500`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { scored: 0 };
    const pending = await res.json() as Array<{ id: string; market_id: string; source: string }>;
    if (pending.length === 0) return { scored: 0 };

    // Fonte 1: preço atual (mercados ainda ativos no cache do servidor)
    const priceMap = getLiveMarketPrices();
    // Fonte 2: histórico de snapshots (captura mercados que já fecharam em extremo)
    const extremeMap = await getSnapshotExtremes();
    if (priceMap.size === 0 && extremeMap.size === 0) return { scored: 0 };

    let scored = 0;
    for (const f of pending) {
      let outcome: boolean | null = null;
      // Fonte 1: preço ao vivo (chave com prefixo poly-/kalshi-)
      const live = priceMap.get(f.market_id);
      if (live !== undefined) {
        if (live >= 97) outcome = true;
        else if (live <= 3) outcome = false;
      }
      // Fonte 2: histórico (chave `${source}:${rawId}` sem prefixo)
      if (outcome === null) {
        const rawId = f.market_id.replace(/^(poly-|kalshi-|manifold-)/, "");
        const hist = extremeMap.get(`${f.source}:${rawId}`);
        if (hist !== undefined) outcome = hist;
      }
      if (outcome === null) continue;
      await fetch(`${SUPABASE_URL}/rest/v1/ai_forecasts?id=eq.${f.id}`, {
        method: "PATCH",
        headers: supaWriteHeaders(),
        body: JSON.stringify({ resolved: true, outcome, resolved_at: new Date().toISOString() }),
        signal: AbortSignal.timeout(6_000),
      }).catch(() => {});
      scored++;
    }
    return { scored };
  } catch { return { scored: 0 }; }
}

// ── Seed de previsões da IA ───────────────────────────────────────────────────
// Roda a IA nos top mercados e popula ai_forecasts — ativa Consenso, Divergências
// e Track Record. Background + throttled para não estourar rate limit nem timeout.

let seedRunning = false;

export async function seedAiForecasts(maxMarkets = 18): Promise<{ started: boolean; reason?: string }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { started: false, reason: "supabase ausente" };
  if (!process.env.ANTHROPIC_API_KEY) return { started: false, reason: "anthropic ausente" };
  if (seedRunning) return { started: false, reason: "já em execução" };

  const GENERIC = /\b(Team|Person|Candidate|Player|Country|Party)\s+[A-Z]{1,3}\b/;
  const poly = getCache<Array<{ id: string; question: string; outcomePrices?: string; category?: string; volume?: number }>>("polymarket:markets:active") ?? [];
  const kalshi = getCache<Array<{ ticker: string; title: string; yesProb: number; category?: string; volume?: number }>>("kalshi:markets") ?? [];

  type Target = { marketId: string; source: string; title: string; category: string; marketProb: number; volume: number };
  const targets: Target[] = [];

  for (const m of poly) {
    if (!m.question || GENERIC.test(m.question)) continue;
    let prob = 50;
    try { const p = parseFloat((JSON.parse(m.outcomePrices ?? "[]") as string[])[0]); if (!isNaN(p)) prob = Math.round(p * 100); } catch { /* skip */ }
    targets.push({ marketId: `poly-${m.id}`, source: "polymarket", title: m.question, category: m.category ?? "other", marketProb: prob, volume: m.volume ?? 0 });
  }
  for (const m of kalshi) {
    if (!m.title) continue;
    targets.push({ marketId: `kalshi-${m.ticker}`, source: "kalshi", title: m.title, category: m.category ?? "other", marketProb: Math.round(m.yesProb > 1 ? m.yesProb : m.yesProb * 100), volume: m.volume ?? 0 });
  }

  // Prioriza mercados com mais volume e que não estão em preço extremo (já resolvidos)
  const queue = targets
    .filter((t) => t.marketProb > 4 && t.marketProb < 96)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, maxMarkets);

  if (queue.length === 0) return { started: false, reason: "sem mercados no cache (aguarde o primeiro fetch)" };

  seedRunning = true;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Roda em background — não bloqueia a resposta
  (async () => {
    let done = 0;
    // O seed gera a MAIORIA das previsões do track record público — era o
    // caminho sem guardrail nenhum (fonte principal do Brier ruim da IA).
    const memo = await getCalibrationMemo();
    for (const t of queue) {
      try {
        const catKey = t.category.toLowerCase().replace(/[^a-z]/g, "") || "other";
        const baseRate = (CATEGORY_BASE_RATES[catKey] ?? CATEGORY_BASE_RATES["other"]).baseRate;
        const prompt = `Mercado preditivo: "${t.title}"
Preço atual do mercado: ${t.marketProb}% SIM
Categoria: ${t.category} (base rate histórica ~${baseRate}%)
${memo ? `\n${memo}\n` : ""}
REGRAS DE CALIBRAÇÃO (nosso Brier é medido publicamente):
- O preço de um mercado líquido já agrega a informação disponível — ele é sua âncora principal, não a base rate.
- Desvie do preço APENAS se souber de fato concreto que o justifique; sem isso, fique a ±3pp do mercado.
- NUNCA desvie mais de 15pp do preço.

Dê seu fair value independente — sua melhor estimativa honesta da probabilidade real de SIM (5-95).
JSON apenas: {"fairValue": <inteiro 5-95>, "confidence": "baixa|media|alta"}`;
        const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 80, messages: [{ role: "user", content: prompt }], timeoutMs: 12_000 });
        const parsed = extractJson(raw) as { fairValue?: number; confidence?: string };
        // Clamp duplo no código (como no endpoint de fair value): 5-95 E ±15pp do mercado
        const rawFv = Math.round(Number(parsed.fairValue));
        const fv = Math.max(5, Math.min(95, Math.max(t.marketProb - 15, Math.min(t.marketProb + 15, rawFv))));
        if (!isNaN(fv)) {
          const conf = (parsed.confidence === "alta" || parsed.confidence === "baixa") ? parsed.confidence : "media";
          await logAiForecast({ marketId: t.marketId, source: t.source, title: t.title, category: t.category, marketProb: t.marketProb, aiFairValue: fv, confidence: conf });
          done++;
        }
      } catch { /* pula mercado */ }
      await sleep(300); // throttle
    }
    log.info(`[ai-seed] ${done}/${queue.length} previsões da IA registradas`);
    seedRunning = false;
  })().catch(() => { seedRunning = false; });

  return { started: true };
}

// ── Helpers de leitura para Divergências, Track Record e Digest ──────────────

interface DivergenceItem {
  marketId: string; source: string; title: string; category: string;
  currentProb: number; aiFairValue: number; edge: number; confidence: string;
}

export async function computeDivergences(): Promise<DivergenceItem[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const since = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_forecasts?resolved=eq.false&created_at=gte.${since}&select=market_id,source,title,category,market_prob,ai_fair_value,confidence,created_at&order=created_at.desc&limit=100`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(8_000) }
    );
    if (!r.ok) return [];
    const rows = await r.json() as Array<{ market_id: string; source: string; title: string; category: string; market_prob: number; ai_fair_value: number; confidence: string }>;
    const priceMap = getLiveMarketPrices();
    const seen = new Set<string>();
    return rows
      .filter((row) => { if (seen.has(row.market_id)) return false; seen.add(row.market_id); return true; })
      .map((row) => {
        const livePrice = priceMap.get(row.market_id);
        const currentProb = livePrice ?? Math.round(row.market_prob);
        return {
          marketId: row.market_id, source: row.source, title: row.title, category: row.category,
          currentProb, aiFairValue: Math.round(row.ai_fair_value),
          edge: Math.round(row.ai_fair_value - currentProb), confidence: row.confidence,
          stillLive: livePrice !== undefined,
        };
      })
      .filter((d) => d.stillLive && Math.abs(d.edge) >= 6)
      .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))
      .slice(0, 12)
      .map(({ stillLive, ...d }) => { void stillLive; return d; });
  } catch { return []; }
}

export async function getTrackRecordData(): Promise<{ resolvedCount: number; aiBrier: number | null; marketBrier: number | null; beatMarketPct: number | null } | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ai_track_record?select=*`, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(8_000) });
    if (!r.ok) return null;
    const [t] = await r.json() as Array<Record<string, number | null>>;
    if (!t) return null;
    const resolved = Number(t.resolved_count ?? 0);
    return {
      resolvedCount: resolved,
      aiBrier: t.ai_brier != null ? Number(t.ai_brier) : null,
      marketBrier: t.market_brier != null ? Number(t.market_brier) : null,
      beatMarketPct: resolved > 0 ? Math.round((Number(t.beat_market_count ?? 0) / resolved) * 100) : null,
    };
  } catch { return null; }
}

/** Mercados encerrando nos próximos 7 dias (do cache do servidor). */
export function getClosingSoon(): Array<{ marketId: string; source: string; title: string; prob: number; daysLeft: number }> {
  const out: Array<{ marketId: string; source: string; title: string; prob: number; daysLeft: number }> = [];
  const now = Date.now();
  const poly = getCache<Array<{ id: string; question: string; outcomePrices?: string; endDate?: string }>>("polymarket:markets:active") ?? [];
  for (const m of poly) {
    if (!m.endDate || !m.question) continue;
    const end = new Date(m.endDate).getTime();
    const daysLeft = (end - now) / 86_400_000;
    if (daysLeft > 0 && daysLeft <= 7) {
      let prob = 50;
      try { const p = parseFloat((JSON.parse(m.outcomePrices ?? "[]") as string[])[0]); if (!isNaN(p)) prob = Math.round(p * 100); } catch { /* skip */ }
      out.push({ marketId: `poly-${m.id}`, source: "polymarket", title: m.question, prob, daysLeft: Math.ceil(daysLeft) });
    }
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 6);
}

