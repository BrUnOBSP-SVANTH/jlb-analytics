/**
 * Prediction Tracker — JLB Analytics
 * localStorage-based store, schema-compatible with the Supabase predictions table (003_predictions.sql).
 * All logic is pure: no React, no side effects. Import and call freely.
 */

import { getAllMarkets } from "./marketsCache";
import { idDeLiquidacao } from "@shared/liquidacao";
import { pctDoKalshi } from "@shared/precoKalshi";

export type ResolutionSource = "settled" | "inferred" | "manual";

export interface StoredPrediction {
  id: string;
  marketId: string;
  question: string;
  marketProb: number;   // 0-100, market consensus at save time
  userProb: number;     // 0-100, user's estimate
  savedAt: string;      // ISO 8601
  resolved: boolean;
  outcome: boolean | null;   // true = YES resolved, false = NO resolved
  brierScore: number | null; // (outcome01 - userProb/100)^2, null until resolved
  // Procedência da resolução: settled = resultado OFICIAL da plataforma;
  // inferred = inferido de preço extremo; manual = o usuário marcou na mão.
  resolutionSource?: ResolutionSource;
  /**
   * Mercado com MAIS de dois desfechos: qual deles a previsão analisa.
   *
   * Sem isto, uma estimativa de 19% num mercado de 12 times não dizia 19% DE
   * QUÊ — a previsão nascia órfã, impossível de pontuar com Brier. Com o id,
   * cada previsão vira um evento binário próprio ("Barcelona campeão? sim/não").
   *
   * `outcomeId` é o identificador ESTÁVEL da fonte (token CLOB no Polymarket,
   * ticker no Kalshi), nunca o rótulo: nome de time muda e levaria o histórico
   * junto. `outcomeLabel` é só o retrato do nome no momento do registro.
   * Ausentes (undefined/null) = mercado binário, como sempre foi.
   */
  outcomeId?: string | null;
  outcomeLabel?: string | null;
}

/**
 * O título de uma previsão de desfecho: "<pergunta> — <desfecho>".
 *
 * Vai no `question` de propósito. Seis telas leem esse campo (log do Dashboard,
 * Briefing, CSV, texto de compartilhar, conquistas, sugestões de resolução) — e
 * todas passam a dizer de qual time é a previsão sem ninguém tocar nelas. O id
 * e o rótulo continuam guardados à parte para identidade.
 */
export function tituloComDesfecho(pergunta: string, rotulo: string | null | undefined): string {
  return rotulo ? `${pergunta} — ${rotulo}` : pergunta;
}

/**
 * A previsão MAIS RECENTE do usuário para este desfecho deste mercado.
 *
 * Existe para o botão virar "Atualizar previsão": a nova entra como VERSÃO
 * DATADA e a antiga fica. Calibração se mede pelo que você disse quando disse —
 * reescrever o passado destruiria o próprio track record que o botão alimenta.
 */
export function previsaoDoDesfecho(marketId: string, outcomeId: string): StoredPrediction | null {
  // A lista é mantida da mais nova para a mais antiga (addPrediction faz unshift).
  return loadPredictions().find((p) => p.marketId === marketId && p.outcomeId === outcomeId) ?? null;
}

/**
 * Soma das estimativas ativas do usuário num mercado de vários desfechos, em
 * pontos percentuais — contando a que está NA TELA agora no lugar da registrada
 * para aquele desfecho.
 *
 * Só um desfecho pode acontecer, então a soma coerente é no máximo 100. Passar
 * disso é o erro de calibração mais comum em mercado múltiplo (achar todo time
 * "mais provável que o mercado diz"), e a tela avisa — sem bloquear.
 */
export function somaDasEstimativas(
  marketId: string,
  naTela: { outcomeId: string; userProb: number },
): number {
  const ultimaPorDesfecho = new Map<string, number>();
  for (const p of loadPredictions()) {
    if (p.marketId !== marketId || !p.outcomeId || p.resolved) continue;
    if (!ultimaPorDesfecho.has(p.outcomeId)) ultimaPorDesfecho.set(p.outcomeId, p.userProb);
  }
  ultimaPorDesfecho.set(naTela.outcomeId, naTela.userProb);
  return Array.from(ultimaPorDesfecho.values()).reduce((soma, v) => soma + v, 0);
}

export interface CalibrationBucket {
  bucket: number;      // midpoint of the bucket (5, 15, 25, ... 95)
  actualRate: number;  // fraction that actually resolved YES in this bucket
  count: number;       // number of resolved predictions in bucket
  predicted: number;   // same as bucket (for perfect-calibration reference line)
}

const KEY = "jlb_predictions_v1";

// ── CRUD ──────────────────────────────────────────────────────────────────

export function loadPredictions(): StoredPrediction[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as StoredPrediction[];
  } catch { return []; }
}

function save(list: StoredPrediction[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

/** Replace the entire stored list (used by cloud sync). */
export function savePredictions(list: StoredPrediction[]): void {
  save(list);
}

export function addPrediction(
  data: Omit<StoredPrediction, "id" | "savedAt" | "resolved" | "outcome" | "brierScore">
): StoredPrediction {
  const p: StoredPrediction = {
    ...data,
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    resolved: false,
    outcome: null,
    brierScore: null,
  };
  const list = loadPredictions();
  list.unshift(p);
  save(list);
  return p;
}

export function resolvePrediction(
  id: string,
  outcome: boolean,
  source: ResolutionSource = "manual",
): StoredPrediction | null {
  const list = loadPredictions();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const p = list[idx];
  const outcome01 = outcome ? 1 : 0;
  const prob01 = p.userProb / 100;
  list[idx] = {
    ...p,
    resolved: true,
    outcome,
    brierScore: Math.pow(outcome01 - prob01, 2),
    resolutionSource: source,
  };
  save(list);
  return list[idx];
}

export function deletePrediction(id: string): void {
  save(loadPredictions().filter((p) => p.id !== id));
}

// ── Auto-resolution detection ───────────────────────────────────────────────
// Cruza previsões pendentes (com marketId real) contra o estado atual dos
// mercados ao vivo. Quando um mercado atinge probabilidade extrema (≥97% ou
// ≤3%) ele está efetivamente resolvido — sugerimos o resultado ao usuário.

export interface ResolutionSuggestion {
  prediction: StoredPrediction;
  suggestedOutcome: boolean;    // true = SIM, false = NÃO
  currentProb: number;           // prob atual do mercado (0-100)
  confidence: "alta" | "media";  // alta = oficial ou ≥97/≤3, media = ≥90/≤10
  resolutionSource: "settled" | "inferred"; // settled = resultado OFICIAL, inferred = preço
}

/**
 * Detecta previsões prontas para resolver, priorizando o RESULTADO OFICIAL da
 * plataforma sobre a inferência por preço:
 *   1. POST /api/settlements → resultado liquidado de verdade (settled). Pega até
 *      mercados que já FECHARAM (saíram da lista ao vivo) — o caso que a heurística
 *      antiga perdia. Estes o Dashboard aplica sozinho: é fato, não há o que confirmar.
 *   2. Fallback só para os sem resultado oficial: preço extremo ao vivo (inferred),
 *      apresentado como sugestão para o usuário confirmar.
 */
// A regra de qual id liquida cada previsão mora em shared/ — o servidor
// (resolveUserPredictions) aplica a MESMA. Ver o cabeçalho de lá.
export { idDeLiquidacao } from "@shared/liquidacao";

export async function detectResolutions(pending: StoredPrediction[]): Promise<ResolutionSuggestion[]> {
  const liquidaveis = pending
    .map((p) => ({ p, id: idDeLiquidacao(p) }))
    .filter((x): x is { p: StoredPrediction; id: string } => x.id !== null);
  if (liquidaveis.length === 0) return [];

  const suggestions: ResolutionSuggestion[] = [];
  const resolvidas = new Set<string>();   // ids de PREVISÃO já resolvidas oficialmente

  // ── 1) Resultado OFICIAL em lote (autoritativo) ────────────────────────────
  try {
    const res = await fetch("/api/settlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(new Set(liquidaveis.map((x) => x.id))) }),
    });
    if (res.ok) {
      const { settlements } = await res.json() as { settlements: Record<string, boolean> };
      for (const { p, id } of liquidaveis) {
        const outcome = settlements[id];
        if (outcome !== undefined) {
          suggestions.push({
            prediction: p, suggestedOutcome: outcome,
            currentProb: outcome ? 100 : 0, confidence: "alta", resolutionSource: "settled",
          });
          resolvidas.add(p.id);
        }
      }
    }
  } catch { /* segue para o fallback heurístico */ }

  // O fallback por preço só serve à previsão BINÁRIA: o preço ao vivo do mercado
  // é o do desfecho líder, e inferir por ele o resultado de outro desfecho é o
  // mesmo erro que o comentário de `idDeLiquidacao` descreve.
  const realMarketPreds = liquidaveis.map((x) => x.p).filter((p) => !p.outcomeId && !resolvidas.has(p.id));

  // ── 2) Fallback: preço extremo ao vivo, só para os sem resultado oficial ────
  const stillPending = realMarketPreds;
  if (stillPending.length === 0) return suggestions;

  const priceMap = new Map<string, number>(); // marketId → yesProb (0-100)
  try {
    const { polymarket, kalshi } = await getAllMarkets<
      { id: string; outcomePrices?: string; yesProb?: number },
      { ticker: string; yesProb: number }
    >();

    for (const m of polymarket) {
      let prob = m.yesProb;
      if (prob === undefined && m.outcomePrices) {
        try { prob = parseFloat((JSON.parse(m.outcomePrices) as string[])[0]); } catch { /* skip */ }
      }
      if (prob !== undefined && !isNaN(prob)) {
        priceMap.set(`poly-${m.id}`, prob > 1 ? prob : prob * 100);
      }
    }
    for (const m of kalshi) {
      // Kalshi já vem em % (shared/precoKalshi.ts). Com a adivinhação antiga, um
      // mercado a 0,9% virava 90% e a sua previsão ganhava a sugestão "provável SIM".
      const p = pctDoKalshi(m.yesProb);
      if (p !== null) priceMap.set(`kalshi-${m.ticker}`, p);
    }
  } catch { return suggestions; }

  for (const pred of stillPending) {
    const currentProb = priceMap.get(pred.marketId);
    if (currentProb === undefined) continue; // mercado não está mais ativo — não dá pra inferir
    if (currentProb >= 90) {
      suggestions.push({ prediction: pred, suggestedOutcome: true, currentProb, confidence: currentProb >= 97 ? "alta" : "media", resolutionSource: "inferred" });
    } else if (currentProb <= 10) {
      suggestions.push({ prediction: pred, suggestedOutcome: false, currentProb, confidence: currentProb <= 3 ? "alta" : "media", resolutionSource: "inferred" });
    }
  }
  return suggestions;
}

// ── Analytics ──────────────────────────────────────────────────────────────

/** Mean Brier Score over resolved predictions. Lower = better. Baseline = 0.25. */
export function meanBrierScore(preds: StoredPrediction[]): number | null {
  const resolved = preds.filter((p) => p.resolved && p.brierScore !== null);
  if (resolved.length === 0) return null;
  const sum = resolved.reduce((acc, p) => acc + (p.brierScore ?? 0), 0);
  return sum / resolved.length;
}

/**
 * Skill Score = 1 - (mean Brier) / 0.25.
 * > 0: better than random. 1.0: perfect. < 0: worse than random.
 */
export function skillScore(preds: StoredPrediction[]): number | null {
  const bs = meanBrierScore(preds);
  if (bs === null) return null;
  return 1 - bs / 0.25;
}

/** Brier médio do MERCADO nas MESMAS previsões — baseline pra "você bate o mercado?". */
export function meanMarketBrier(preds: StoredPrediction[]): number | null {
  const resolved = preds.filter((p) => p.resolved && p.outcome !== null);
  if (resolved.length === 0) return null;
  const sum = resolved.reduce((acc, p) => acc + Math.pow((p.outcome ? 1 : 0) - p.marketProb / 100, 2), 0);
  return sum / resolved.length;
}

export interface ConfidenceCalibration {
  n: number;
  avgConfidence: number;  // 0-100: quão CERTO o usuário se diz (do lado que escolheu)
  accuracy: number;       // 0-100: quão frequentemente ele acertou esse lado
  gap: number;            // avgConfidence - accuracy (>0 = superconfiante; <0 = cauteloso)
  verdict: "superconfiante" | "calibrado" | "cauteloso";
}

/**
 * Diagnóstico de EXCESSO DE CONFIANÇA (o viés nº1 que destrói retorno). Puro/testável.
 * Compara o quanto a pessoa DIZ ter certeza (max(p, 100-p) do lado escolhido) com o
 * quanto ela realmente ACERTA. Gap positivo = superconfiante. Previsões em 50 (sem
 * lado) ficam de fora. É a lição "aposta ≠ investimento" feita com o dado da pessoa.
 */
export function confidenceCalibration(preds: StoredPrediction[]): ConfidenceCalibration | null {
  const sided = preds.filter((p) => p.resolved && p.outcome !== null && p.userProb !== 50);
  if (sided.length === 0) return null;
  let confSum = 0, correct = 0;
  for (const p of sided) {
    confSum += Math.max(p.userProb, 100 - p.userProb);
    if ((p.userProb > 50) === (p.outcome === true)) correct++;
  }
  const avgConfidence = Math.round(confSum / sided.length);
  const accuracy = Math.round((correct / sided.length) * 100);
  const gap = avgConfidence - accuracy;
  const verdict = gap > 10 ? "superconfiante" : gap < -10 ? "cauteloso" : "calibrado";
  return { n: sided.length, avgConfidence, accuracy, gap, verdict };
}

/**
 * Build calibration buckets in steps of 10 (0-10, 10-20, ..., 90-100).
 * Only uses resolved predictions.
 */
export function calibrationBuckets(preds: StoredPrediction[]): CalibrationBucket[] {
  const resolved = preds.filter((p) => p.resolved && p.outcome !== null);
  const buckets: CalibrationBucket[] = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const hi = lo + 10;
    const inBucket = resolved.filter((p) => p.userProb >= lo && p.userProb < hi);
    if (inBucket.length === 0) continue;
    const yesCount = inBucket.filter((p) => p.outcome === true).length;
    buckets.push({
      bucket: lo + 5,
      predicted: lo + 5,
      actualRate: Math.round((yesCount / inBucket.length) * 100),
      count: inBucket.length,
    });
  }
  return buckets;
}

// ── Calibration History ────────────────────────────────────────────────────

export interface CalibrationSnapshot {
  date: string;       // ISO date (YYYY-MM-DD) — one snapshot per day
  meanBrier: number | null;
  skillScore: number | null;
  resolvedCount: number;
  totalCount: number;
}

const HISTORY_KEY = "jlb_calibration_history_v1";
const MAX_SNAPSHOTS = 90; // ~3 months

export function loadCalibrationHistory(): CalibrationSnapshot[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as CalibrationSnapshot[];
  } catch { return []; }
}

/** Call this after resolving a prediction to persist a daily snapshot. */
export function saveCalibrationSnapshot(): void {
  const preds = loadPredictions();
  const today = new Date().toISOString().slice(0, 10);
  const history = loadCalibrationHistory();

  const bs = meanBrierScore(preds);
  const ss = bs !== null ? parseFloat((1 - bs / 0.25).toFixed(4)) : null;
  const snapshot: CalibrationSnapshot = {
    date: today,
    meanBrier: bs !== null ? parseFloat(bs.toFixed(4)) : null,
    skillScore: ss,
    resolvedCount: preds.filter((p) => p.resolved).length,
    totalCount: preds.length,
  };

  // Replace today's entry if it exists, otherwise append
  const idx = history.findIndex((s) => s.date === today);
  if (idx >= 0) history[idx] = snapshot;
  else history.push(snapshot);

  // Keep only the most recent MAX_SNAPSHOTS entries, sorted ascending
  const trimmed = history
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_SNAPSHOTS);

  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
}

/** Edge: user estimate minus market consensus. Positive = you think market underprices. */
export function edge(userProb: number, marketProb: number): number {
  return userProb - marketProb;
}

/**
 * Kelly fraction (full Kelly) given estimated prob and market odds (decimal).
 * marketOdds = 100 / marketProb (implied from price).
 * Returns 0 if no edge, capped at 0.25 (¼ Kelly conservative default).
 */
export function kellyFraction(userProb: number, marketProb: number): number {
  if (marketProb <= 0 || marketProb >= 100) return 0;
  const p = userProb / 100;
  const q = 1 - p;
  const b = (100 - marketProb) / marketProb; // net odds on YES side
  const f = (p * b - q) / b;
  return Math.max(0, Math.min(f, 0.25));
}

// ── Sentiment (wordlist approach) ─────────────────────────────────────────

const POS_WORDS = [
  "win", "wins", "won", "beats", "leads", "surge", "rise", "rises",
  "higher", "bull", "likely", "probable", "confirms", "elected", "approved",
  "passes", "yes", "gains", "grows", "up", "strong", "positive", "bullish",
  "momentum", "breakout", "record", "all-time", "outperforms",
];
const NEG_WORDS = [
  "lose", "loses", "lost", "trails", "miss", "misses", "crash", "fall", "falls",
  "lower", "bear", "unlikely", "improbable", "fails", "rejected", "defeated",
  "denied", "no", "drops", "down", "weak", "negative", "bearish",
  "underperforms", "slump", "collapse", "crisis",
];

export interface SentimentResult {
  score: number;  // -1 to +1
  label: "Positivo" | "Neutro" | "Negativo";
  color: string;  // tailwind class
}

export function analyzeSentiment(text: string): SentimentResult {
  // Tokeniza em palavras INTEIRAS (inclui hifenizadas como "all-time").
  // Antes usava substring (`includes`), o que dava falso positivo grave:
  // "economy" contém "no", "support" contém "up", "winter" contém "win".
  const words = new Set(text.toLowerCase().match(/[a-z]+(?:-[a-z]+)?/g) ?? []);
  let pos = 0;
  let neg = 0;
  POS_WORDS.forEach((w) => { if (words.has(w)) pos++; });
  NEG_WORDS.forEach((w) => { if (words.has(w)) neg++; });
  if (pos + neg === 0) return { score: 0, label: "Neutro", color: "text-muted-foreground" };
  const score = (pos - neg) / (pos + neg);
  if (score > 0.2) return { score, label: "Positivo", color: "text-positive" };
  if (score < -0.2) return { score, label: "Negativo", color: "text-negative" };
  return { score, label: "Neutro", color: "text-muted-foreground" };
}
