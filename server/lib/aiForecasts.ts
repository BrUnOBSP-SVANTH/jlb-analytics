// ── Track record da IA: log, resolução, seed, divergências ───────────────────
// Registra cada fair value da IA, resolve contra mercados em preço extremo
// (ao vivo + snapshots), semeia previsões nos top mercados e computa onde a JLB
// mais discorda do mercado. Extraído de routes/ai.ts.
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "./supabaseRest.ts";
import { CATEGORY_BASE_RATES } from "./categoryRates.ts";
import { callClaude } from "./anthropic.ts";
import { clampFairValue } from "./ai/guardrails.ts";
import { extractJson } from "./extractJson.ts";
import { getCache, setCache } from "./cache.ts";
import { fetchCerebroContext } from "./cerebro.ts";
import { fetchRealOutcomesBatch, stripPrefix, chunk } from "./resolveOutcomes.ts";
import { fetchWithRetry } from "./fetcher.ts";
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
  marketProb: number; aiFairValue: number; confidence?: string; model?: string;
}): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  if (!f.marketId || (!f.marketId.startsWith("poly-") && !f.marketId.startsWith("kalshi-"))) return;
  const base: Record<string, unknown> = {
    market_id: f.marketId, source: f.source, title: f.title.slice(0, 300),
    category: f.category ?? "other", market_prob: f.marketProb,
    ai_fair_value: f.aiFairValue, confidence: f.confidence ?? "media",
  };
  // `model` só é gravado se a coluna existir (migration 015). Antes disso, o
  // PostgREST responde 400 PGRST204 → refaz o insert sem o campo. Auto-heal:
  // funciona igual antes e depois da migration, sem env flag.
  const post = (row: Record<string, unknown>) =>
    fetch(`${SUPABASE_URL}/rest/v1/ai_forecasts?on_conflict=market_id,source,forecast_date`, {
      method: "POST", headers: supaWriteHeaders(),
      body: JSON.stringify(row), signal: AbortSignal.timeout(6_000),
    });
  try {
    if (f.model) {
      const res = await post({ ...base, model: f.model });
      if (res.status === 400 && /PGRST204|model/i.test(await res.text())) await post(base);
    } else {
      await post(base);
    }
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

/**
 * Dentre as previsões resolvidas mas AINDA NÃO oficiais (resolution_source nulo ou
 * 'inferred'), seleciona as que a plataforma JÁ liquidou oficialmente — para promovê-
 * las a 'settled' (corrigindo o outcome se o palpite de preço tinha divergido da
 * verdade). Puro/testável. É o que torna as porcentagens OFICIAIS: um mercado inferido
 * ou legado nunca fica preso — vira oficial assim que a plataforma liquida.
 */
export function selectOfficialUpgrades(
  candidates: Array<{ id: string; market_id: string }>,
  settledMap: Map<string, boolean>,
): Array<{ id: string; outcome: boolean }> {
  const jobs: Array<{ id: string; outcome: boolean }> = [];
  for (const f of candidates) {
    const official = settledMap.get(f.market_id);
    if (official !== undefined) jobs.push({ id: f.id, outcome: official });
  }
  return jobs;
}

/**
 * Resolve previsões da IA pelo RESULTADO OFICIAL da plataforma (settlement).
 * Prioridade de fontes, da mais confiável para a menos:
 *   1. Settlement real EM LOTE (Kalshi `result` / Polymarket UMA) via
 *      fetchRealOutcomesBatch — a verdade que paga as posições. Registrado como
 *      resolution_source='settled'. Aplicado tanto aos PENDENTES quanto para
 *      RE-VERIFICAR os inferidos (que agora podem ter liquidado oficialmente).
 *   2. Fallback SÓ quando a plataforma ainda não liquidou: preço extremo (≥97/≤3)
 *      ao vivo ou no histórico de snapshots → 'inferred' (transparente na UI).
 */
export async function scoreAiForecasts(): Promise<{ scored: number; settled: number; upgraded: number }> {
  const EMPTY = { scored: 0, settled: 0, upgraded: 0 };
  if (!SUPABASE_URL || !SUPABASE_KEY) return EMPTY;
  try {
    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
    const fetchRows = (q: string) =>
      fetch(`${SUPABASE_URL}/rest/v1/ai_forecasts?${q}`, { headers, signal: AbortSignal.timeout(8_000) })
        .then((r) => (r.ok ? (r.json() as Promise<Array<{ id: string; market_id: string; source: string }>>) : []));

    // Pendentes (nunca resolvidos) + já resolvidos mas AINDA NÃO OFICIAIS (source nulo
    // — legado pré-migration — ou 'inferred') que vamos RE-VERIFICAR contra o settlement
    // oficial. Conserta o "inferido/legado pra sempre" e é o que oficializa as %.
    const [pending, unofficial] = await Promise.all([
      fetchRows("resolved=eq.false&select=id,market_id,source&order=created_at.asc&limit=500"),
      fetchRows("resolved=eq.true&or=(resolution_source.is.null,resolution_source.eq.inferred)&select=id,market_id,source&order=resolved_at.asc&limit=400"),
    ]);
    if (pending.length === 0 && unofficial.length === 0) return EMPTY;

    // Fonte 1 (autoritativa): resultado OFICIAL em lote para PENDENTES e NÃO-OFICIAIS.
    const realIds = Array.from(new Set(
      [...pending, ...unofficial]
        .filter((f) => f.source === "polymarket" || f.source === "kalshi")
        .map((f) => f.market_id),
    ));
    const { outcomes: settledMap, unavailable } = await fetchRealOutcomesBatch(realIds);

    // Fontes de FALLBACK — só para os PENDENTES, quando a plataforma ainda não liquidou.
    const priceMap = getLiveMarketPrices();          // preço ao vivo (cache do servidor)
    const extremeMap = await getSnapshotExtremes();  // extremos no histórico de snapshots

    const jobs: Array<{ id: string; outcome: boolean; source: "settled" | "inferred" }> = [];
    for (const f of pending) {
      const real = settledMap.get(f.market_id);
      if (real !== undefined) { jobs.push({ id: f.id, outcome: real, source: "settled" }); continue; }
      // Não conseguimos CONSULTAR o settlement (chunk falhou) → deixa pendente para a
      // próxima rodada, em vez de gravar um 'inferred' permanente e possivelmente errado.
      if (unavailable.has(f.market_id)) continue;
      // Fallback: preço extremo ao vivo.
      const live = priceMap.get(f.market_id);
      if (live !== undefined && live >= 97) { jobs.push({ id: f.id, outcome: true, source: "inferred" }); continue; }
      if (live !== undefined && live <= 3) { jobs.push({ id: f.id, outcome: false, source: "inferred" }); continue; }
      // Fallback: extremo no histórico de snapshots (chave sem prefixo).
      const hist = extremeMap.get(`${f.source}:${stripPrefix(f.market_id)}`);
      if (hist !== undefined) jobs.push({ id: f.id, outcome: hist, source: "inferred" });
    }

    // Promoção não-oficial → 'settled' onde a plataforma agora tem resultado OFICIAL.
    const upgradeJobs = selectOfficialUpgrades(unofficial, settledMap);

    // Persiste com concorrência limitada (PATCHes ao nosso próprio Supabase).
    let scored = 0, settled = 0, upgraded = 0;
    for (const group of chunk(jobs, 12)) {
      await Promise.all(group.map(async (j) => {
        await patchResolution(j.id, j.outcome, j.source);
        scored++;
        if (j.source === "settled") settled++;
      }));
    }
    for (const group of chunk(upgradeJobs, 12)) {
      await Promise.all(group.map(async (j) => {
        await patchResolution(j.id, j.outcome, "settled"); // vira OFICIAL (e corrige o outcome)
        upgraded++;
      }));
    }
    return { scored, settled, upgraded };
  } catch { return EMPTY; }
}

/**
 * Marca uma previsão como resolvida. Grava `resolution_source` quando a coluna
 * existe (migration 018); antes dela, o PostgREST responde 400/PGRST204 e
 * refazemos o PATCH sem o campo — funciona antes e depois da migration, sem env
 * flag (mesmo auto-heal do `model` em logAiForecast).
 */
async function patchResolution(id: string, outcome: boolean, resolutionSource: string): Promise<void> {
  const patch = (body: Record<string, unknown>) =>
    fetch(`${SUPABASE_URL}/rest/v1/ai_forecasts?id=eq.${id}`, {
      method: "PATCH", headers: supaWriteHeaders(),
      body: JSON.stringify(body), signal: AbortSignal.timeout(6_000),
    });
  const base = { resolved: true, outcome, resolved_at: new Date().toISOString() };
  try {
    const res = await patch({ ...base, resolution_source: resolutionSource });
    if (res.status === 400 && /PGRST204|resolution_source/i.test(await res.text())) await patch(base);
  } catch { /* fire-and-forget */ }
}

// ── Seed de previsões da IA ───────────────────────────────────────────────────
// Roda a IA nos top mercados e popula ai_forecasts — ativa Consenso, Divergências
// e Track Record. Background + throttled para não estourar rate limit nem timeout.

let seedRunning = false;

export interface RawKalshiMarket {
  ticker?: string; title?: string; yes_sub_title?: string;
  yes_bid_dollars?: string; yes_ask_dollars?: string; last_price_dollars?: string;
  close_time?: string; volume_fp?: string;
}
export interface ShortDatedTarget { ticker: string; title: string; prob: number; volume: number; closeMs: number }

/**
 * Normaliza mercados Kalshi de data CURTA em alvos de seed. Puro (sem I/O) de
 * propósito, para ser testável: pula agregados negRisk (ticker MULTI/CROSSCATEGORY
 * ou título-lista "yes X, yes Y"), calcula a prob do mid (bid/ask) ou do last, e
 * capa por série (evita 90 matchups de golfe monopolizarem a diversidade da prova).
 */
export function parseShortDatedKalshi(markets: RawKalshiMarket[], perSeriesCap = 4): ShortDatedTarget[] {
  const out: ShortDatedTarget[] = [];
  const perSeries: Record<string, number> = {};
  for (const m of markets) {
    if (!m.ticker || /MULTIGAME|CROSSCATEGORY|MULTI/i.test(m.ticker)) continue; // pula agregados negRisk
    const title = (m.title ?? m.yes_sub_title ?? "").trim();
    if (!title || /,\s*(yes|no)\s/i.test(title)) continue;                       // título "yes X, yes Y" = lista/agregado
    const series = m.ticker.split("-")[0];
    if ((perSeries[series] ?? 0) >= perSeriesCap) continue;
    const bid = parseFloat(m.yes_bid_dollars ?? "0"), ask = parseFloat(m.yes_ask_dollars ?? "0"), last = parseFloat(m.last_price_dollars ?? "0");
    // Sem preço REAL (nem mid nem last) → NÃO semeia. Antes caía num padrão-50 que
    // poluía a prova (30% dos resolvidos ficavam com "market_prob=50" falso, virando
    // falsos "mercados voláteis" no backtest). Sem preço, não há âncora — pula.
    if (!(bid > 0 && ask > 0) && !(last > 0)) continue;
    const prob = bid > 0 && ask > 0 ? Math.round((bid + ask) / 2 * 100) : Math.round(last * 100);
    out.push({
      ticker: m.ticker, title: title.slice(0, 300), prob,
      volume: Math.round(parseFloat(m.volume_fp ?? "0")),
      closeMs: m.close_time ? new Date(m.close_time).getTime() : Infinity,
    });
    perSeries[series] = (perSeries[series] ?? 0) + 1;
  }
  return out;
}

/**
 * Prioridade de um mercado pela PROXIMIDADE de resolução — quanto antes fecha, mais
 * cedo vira resultado oficial na prova. Perpétuos (>365d) e sem-data caem no fundo;
 * a janela de ±60d é a melhor. Puro/testável (recebe `now` em vez de ler o relógio).
 */
export function tierForClose(closeMs: number, now: number): number {
  const days = (closeMs - now) / 86_400_000;
  if (!isFinite(days)) return 1;            // sem data conhecida → baixa prioridade
  if (days > 365) return 1;                 // perpétuo (2028, "Marte 2099") → nunca dá retorno útil
  if (days >= -60 && days <= 60) return 5;  // JANELA de resolução (fecha/fechou há pouco) → melhor retorno
  if (days > 60 && days <= 180) return 4;   // resolve nos próximos ~6 meses
  if (days < -60) return 3;                 // atrasado (pode estar resolvendo, ou travado)
  return 2;                                 // 180–365 dias
}

/**
 * Mercados Kalshi que fecham em POUCOS DIAS (via max_close_ts). Liquidam rápido e
 * enchem o track record — a "prova vendável" — em dias, não meses.
 */
async function fetchShortDatedKalshiTargets(daysAhead = 14, limit = 40): Promise<ShortDatedTarget[]> {
  try {
    const maxTs = Math.floor(Date.now() / 1000) + daysAhead * 86_400;
    const data = await fetchWithRetry<{ markets?: RawKalshiMarket[] }>(
      `https://api.elections.kalshi.com/trade-api/v2/markets?status=open&max_close_ts=${maxTs}&limit=${limit}`,
      { Accept: "application/json" },
    );
    return parseShortDatedKalshi(data?.markets ?? []);
  } catch { return []; }
}

export async function seedAiForecasts(maxMarkets = 18): Promise<{ started: boolean; reason?: string }> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { started: false, reason: "supabase ausente" };
  if (!process.env.ANTHROPIC_API_KEY) return { started: false, reason: "anthropic ausente" };
  if (seedRunning) return { started: false, reason: "já em execução" };

  const GENERIC = /\b(Team|Person|Candidate|Player|Country|Party)\s+[A-Z]{1,3}\b/;
  const poly = getCache<Array<{ id: string; question: string; outcomePrices?: string; category?: string; volume?: number; endDate?: string }>>("polymarket:markets:active") ?? [];
  const kalshi = getCache<Array<{ ticker: string; title: string; yesProb: number; category?: string; volume?: number; closeTime?: string }>>("kalshi:markets") ?? [];

  type Target = { marketId: string; source: string; title: string; category: string; marketProb: number; volume: number; closeMs: number };
  const targets: Target[] = [];

  const now = Date.now();
  const parseClose = (d?: string): number => { if (!d) return Infinity; const t = new Date(d).getTime(); return isNaN(t) ? Infinity : t; };

  for (const m of poly) {
    if (!m.question || GENERIC.test(m.question)) continue;
    let prob = NaN;
    try { const p = parseFloat((JSON.parse(m.outcomePrices ?? "[]") as string[])[0]); if (!isNaN(p)) prob = Math.round(p * 100); } catch { /* sem preço */ }
    if (isNaN(prob)) continue; // sem preço REAL → não semeia (o padrão-50 poluía a prova)
    targets.push({ marketId: `poly-${m.id}`, source: "polymarket", title: m.question, category: m.category ?? "other", marketProb: prob, volume: m.volume ?? 0, closeMs: parseClose(m.endDate) });
  }
  for (const m of kalshi) {
    if (!m.title) continue;
    targets.push({ marketId: `kalshi-${m.ticker}`, source: "kalshi", title: m.title, category: m.category ?? "other", marketProb: Math.round(m.yesProb > 1 ? m.yesProb : m.yesProb * 100), volume: m.volume ?? 0, closeMs: parseClose(m.closeTime) });
  }

  // Fonte EXTRA: mercados de data CURTA (fecham em dias) — o cache é dominado por
  // perpétuos, então buscamos direto os que liquidam já, pra encher a prova rápido.
  const seen = new Set(targets.map((t) => t.marketId));
  for (const s of await fetchShortDatedKalshiTargets(21, 200)) {
    const id = `kalshi-${s.ticker}`;
    if (seen.has(id)) continue;
    seen.add(id);
    targets.push({ marketId: id, source: "kalshi", title: s.title, category: "other", marketProb: s.prob, volume: s.volume, closeMs: s.closeMs });
  }

  // Prioriza mercados que RESOLVEM CEDO (tierForClose). Antes ordenava só por volume
  // — e os de maior volume são perpétuos ("Elon a Marte 2099", "próximo Papa", eleição
  // 2028) que NUNCA liquidam, então o track record não ganhava resultados oficiais.
  // Agora: tier de urgência primeiro (quanto antes fecha = mais retorno), volume desempata.
  const queue = targets
    .filter((t) => t.marketProb > 4 && t.marketProb < 96)
    .sort((a, b) => { const d = tierForClose(b.closeMs, now) - tierForClose(a.closeMs, now); return d !== 0 ? d : (b.volume - a.volume); })
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
        // Contexto de notícias recentes (Cerebro): antes o seed previa no escuro,
        // só com preço + base rate. Agora a previsão reflete o que ESTÁ ACONTECENDO
        // — é o que liga a nossa nota (Brier) aos fatos reais, não a chutes.
        // Enxugado a ~900 chars: o seed só devolve fairValue+confidence, então
        // não precisa do contexto inteiro — e prompt menor = chamada mais rápida,
        // crítica porque o Gemini (fallback) é mais lento e estourava o timeout.
        const { context: rawCtx } = await fetchCerebroContext(t.title).catch(() => ({ context: "", hits: [] }));
        const newsCtx = rawCtx ? rawCtx.slice(0, 900) : "";
        const prompt = `Mercado preditivo: "${t.title}"
Preço atual do mercado: ${t.marketProb}% SIM
Categoria: ${t.category} (base rate histórica ~${baseRate}%)
${newsCtx ? `\nNOTÍCIAS RECENTES E CONTEXTO (base curada do Cerebro):\n${newsCtx}\n` : ""}${memo ? `\n${memo}\n` : ""}
REGRAS DE CALIBRAÇÃO (nosso Brier é medido publicamente):
- O preço de um mercado líquido já agrega a informação disponível — ele é sua âncora principal, não a base rate.
- Desvie do preço APENAS se as notícias acima trouxerem um fato concreto que o justifique; sem isso, fique a ±3pp do mercado.
- NUNCA desvie mais de 15pp do preço.

Dê seu fair value independente — sua melhor estimativa honesta da probabilidade real de SIM (5-95).
JSON apenas: {"fairValue": <inteiro 5-95>, "confidence": "baixa|media|alta"}`;
        let provider: "anthropic" | "gemini" = "anthropic";
        // Retry (2 tentativas): o free tier do Gemini tem falhas transitórias —
        // timeout ocasional, rate limit (429), resposta vazia. Sem retry, cada
        // tropeço custava o mercado inteiro (rendimento caiu de 15/18 → 5/18 ao
        // adicionar o contexto de notícias). Uma 2ª tentativa recupera a maioria.
        let fv = NaN; let conf = "media";
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const raw = await callClaude({ model: "claude-haiku-4-5-20251001", maxTokens: 80, messages: [{ role: "user", content: prompt }], timeoutMs: 25_000, onProvider: (p) => { provider = p; } });
            const parsed = extractJson(raw) as { fairValue?: number; confidence?: string };
            // Único ponto de verdade do clamp (5-95 E ±15pp do mercado): a mesma função
            // testada de guardrails.ts que os endpoints usam. Antes reimplementado aqui,
            // no caminho que gera a MAIORIA do track record público.
            const rawFv = Math.round(Number(parsed.fairValue));
            const clamped = clampFairValue(rawFv, t.marketProb);
            if (!isNaN(clamped)) {
              fv = clamped;
              conf = (parsed.confidence === "alta" || parsed.confidence === "baixa") ? parsed.confidence : "media";
              break;
            }
          } catch { if (attempt === 0) await sleep(3_000); } // backoff antes da 2ª tentativa
        }
        if (!isNaN(fv)) {
          await logAiForecast({ marketId: t.marketId, source: t.source, title: t.title, category: t.category, marketProb: t.marketProb, aiFairValue: fv, confidence: conf, model: provider });
          done++;
        }
      } catch { /* pula mercado */ }
      // Throttle: ~10 RPM no free tier do Gemini. Com a chamada news-aware
      // levando ~5-8s, 3s de pausa mantém a folga. Cron em background, sem pressa.
      await sleep(3_000);
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

