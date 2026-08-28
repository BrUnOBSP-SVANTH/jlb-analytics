/**
 * Calibração por categoria — o "loop fechado" da IA JLB.
 *
 * Descoberta (backtest leave-one-out sobre 294 forecasts resolvidos, 2026-08-27):
 * a IA empata com o mercado no Brier (0,1294 vs 0,1290 = skill −0,3%), MAS tem
 * viés sistemático por categoria — subestima crypto (~−15pp) e superestima
 * política (~+21pp). Corrigir esse viés SÓ onde ele é grande e há amostra leva o
 * Brier a 0,1220 → skill +5,4% vs mercado, OUT-OF-SAMPLE. Aplicar em tudo (viés
 * pequeno) só adiciona ruído — por isso a correção é GATED (n≥minN, |viés|≥minBias).
 *
 * Este módulo é PURO e testável. O viés é calculado a partir dos resolvidos
 * (computeCategoryBiases) por um job periódico; marketAnalysis aplica o mapa ao
 * fair value já clampado, antes de virar edge. Nada aqui chuta número: se não há
 * viés estável para a categoria, não mexe (no-op honesto).
 */

// ── Taxonomia canônica ────────────────────────────────────────────────────────
// A categoria crua vem fragmentada (tags do Polymarket: "Politics"/"politics",
// "Soccer"/"football"/"Sports", "bitcoin"/"ethereum"/"xrp"...). Sem normalizar,
// cada bucket vira n pequeno e a calibração por segmento é impossível. Regras por
// substring (primeira que casar vence) — robustas a variações novas.

export type CanonicalCategory =
  | "crypto" | "politics" | "sports" | "tennis" | "esports"
  | "culture" | "economy" | "science" | "climate" | "other";

// Tokens curtos/ambíguos evitados de propósito (ex.: "eth"→ethiopia, "sol"→solar,
// "war"→awards, "ai"→sem espaços). Onde inevitável, usa espaços de borda.
const RULES: Array<[CanonicalCategory, string[]]> = [
  ["crypto",   ["bitcoin", "ethereum", "crypto", "xrp", "solana", "cardano", "dogecoin", "altcoin", "stablecoin"]],
  ["tennis",   ["tennis", "roland garros", "wimbledon", "us open"]],
  ["esports",  ["esport", "e-sport", "league of legends", "dota", "counter-strike", "cs:go", "csgo", "valorant", "overwatch"]],
  ["sports",   ["sport", "soccer", "football", "nfl", "nba", "mlb", "nhl", "basketball", "baseball", "hockey", "formula 1", "formula1", "ufc", "boxing", "golf", "cricket", "olymp"]],
  ["politics", ["politic", "election", "president", "senate", "congress", "trump", "biden", "geopolit", "iran", "government", "parliament", "prime minister", "united states", "machado"]],
  ["economy",  ["econom", "finance", "financ", "gdp", "inflation", "selic", "interest rate", "recession", "oil price", "stock", "unemployment"]],
  ["science",  ["science", "scien", "technolog", "nasa", "spacex", "artificial intelligence", " ai ", "vaccine", "medicine"]],
  ["climate",  ["climate", "weather", "temperature", "hurricane", "enso", "el niño", "el nino", "la niña", "la nina", "co2", "emission"]],
  ["culture",  ["culture", "pop-culture", "movie", "film", "oscar", "award", "music", "grammy", "entertainment", "celebrity", "streaming", "box office"]],
];

/** Mapeia uma categoria crua para a taxonomia canônica. `null`/desconhecida → "other". */
export function normalizeCategory(raw: string | null | undefined): CanonicalCategory {
  if (!raw) return "other";
  const s = ` ${raw.toLowerCase().trim()} `; // espaços nas bordas p/ o " ai " casar como palavra
  for (const [canon, keys] of RULES) {
    for (const k of keys) {
      if (s.includes(k)) return canon;
    }
  }
  return "other";
}

// ── Cálculo do viés (o "aprendizado" do loop) ─────────────────────────────────

export interface ResolvedForecast {
  fairValue: number;      // 0-100, já clampado (como está gravado em ai_forecasts)
  outcome: boolean;       // resultado oficial
  category: string | null;
}

export interface CategoryBias {
  biasPp: number;         // viés médio em pp: >0 = IA superestima; <0 = subestima
  n: number;
}

export type BiasMap = Partial<Record<CanonicalCategory, CategoryBias>>;

export interface CalibrationOpts {
  /** amostra mínima por bucket para confiar no viés (default 15) */
  minN?: number;
  /** viés mínimo em pp para valer a correção — abaixo disso é ruído (default 10) */
  minBiasPp?: number;
}

/**
 * Calcula o mapa de viés por categoria a partir dos resolvidos. Só inclui buckets
 * com amostra suficiente E viés relevante — os demais ficam de fora (no-op na
 * aplicação). É este gating que preserva o ganho e evita o ruído das categorias
 * de viés pequeno (esports/tennis/sports no backtest).
 */
export function computeCategoryBiases(rows: ResolvedForecast[], opts: CalibrationOpts = {}): BiasMap {
  const minN = opts.minN ?? 15;
  const minBiasPp = opts.minBiasPp ?? 10;

  const acc = new Map<CanonicalCategory, { sumGap: number; n: number }>();
  for (const r of rows) {
    if (!Number.isFinite(r.fairValue) || (r.outcome !== true && r.outcome !== false)) continue;
    const bucket = normalizeCategory(r.category);
    const gap = r.fairValue - (r.outcome ? 100 : 0); // erro assinado em pp
    const cur = acc.get(bucket) ?? { sumGap: 0, n: 0 };
    cur.sumGap += gap;
    cur.n += 1;
    acc.set(bucket, cur);
  }

  const map: BiasMap = {};
  acc.forEach((v, bucket) => {
    const bias = v.sumGap / v.n;
    if (v.n >= minN && Math.abs(bias) >= minBiasPp) {
      map[bucket] = { biasPp: Number(bias.toFixed(2)), n: v.n };
    }
  });
  return map;
}

/**
 * Peso de amostragem por DÉFICIT: quanto mais longe do alvo (n resolvidos por
 * categoria), maior a prioridade no seed. Categoria zerada vale 4×; já saturada
 * (n ≥ alvo) vale 1× — sem boost, mas nunca zero (continua elegível se for a
 * única opção). Puro e testável; a leitura do banco vive em aiForecasts.
 */
export function deficitWeight(resolvedCount: number, target = 30): number {
  const n = Math.max(0, resolvedCount);
  const deficit = Math.max(0, target - n) / target; // 1 = zerada, 0 = saturada
  return Number((1 + 3 * deficit).toFixed(2));
}

// ── Aplicação (o que roda em cada análise) ────────────────────────────────────

export interface CalibrationResult {
  fairValue: number;                 // valor final (calibrado ou original)
  applied: boolean;
  bucket: CanonicalCategory;
  biasPp: number | null;             // viés subtraído (null = não aplicado)
}

/**
 * Aplica a correção de viés ao fair value JÁ CLAMPADO. Se a categoria não tem viés
 * estável no mapa, devolve o valor original (no-op). Limita a [5, 95] — o mesmo
 * piso/teto absoluto do clampFairValue, para a correção nunca extrapolar a borda.
 */
export function applyCategoryCalibration(
  fairValue: number,
  rawCategory: string | null | undefined,
  biasMap: BiasMap,
): CalibrationResult {
  const bucket = normalizeCategory(rawCategory);
  const entry = biasMap[bucket];
  if (!entry) return { fairValue, applied: false, bucket, biasPp: null };
  const corrected = Math.max(5, Math.min(95, fairValue - entry.biasPp));
  return { fairValue: Math.round(corrected), applied: true, bucket, biasPp: entry.biasPp };
}
