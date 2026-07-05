/**
 * consensus.ts — Motor de Consenso JLB (agregação de previsões)
 *
 * Combina múltiplos sinais de probabilidade (mercado, IA, comunidade) num
 * único número calibrado, usando a AGREGAÇÃO LOGIT EXTREMIZADA PONDERADA POR
 * SKILL — a técnica que o Good Judgment Project usou para vencer o torneio
 * IARPA ACE (Satopää, Baron, Mellers, Tetlock, Ungar, 2014).
 *
 * Por que logit extremizado e não média simples:
 *  - Médias de probabilidade são sistematicamente SUB-confiantes (puxam pro 50%).
 *  - Trabalhar em log-odds (logit) e extremizar (×a, a>1) empurra a estimativa
 *    para longe de 50%, o que comprovadamente REDUZ o Brier Score do consenso.
 *  - Os pesos refletem a confiabilidade histórica de cada fonte (skill-weighted).
 */

export interface ConsensusSignal {
  /** Nome legível da fonte (ex: "Mercado", "IA JLB", "Comunidade"). */
  name: string;
  /** Probabilidade da fonte, 0–100. */
  prob: number;
  /** Peso de confiabilidade (≥0). Quanto mais provada a fonte, maior. */
  weight: number;
  /** Detalhe curto do porquê desse peso (mostrado ao usuário). */
  note?: string;
}

export interface ConsensusResult {
  /** Estimativa final de consenso, 0–100. */
  consensus: number;
  /** Limites do intervalo de confiança 80% (0–100). */
  low: number;
  high: number;
  /** Concordância entre as fontes, 0–1 (1 = total acordo). */
  agreement: number;
  /** Fator de extremização aplicado. */
  extremizeFactor: number;
  /** Fontes usadas com seu peso normalizado (0–1). */
  sources: Array<{ name: string; prob: number; weight: number; note?: string }>;
  /** Quantas fontes independentes entraram. */
  nSources: number;
}

const clampP = (p: number) => Math.min(0.99, Math.max(0.01, p / 100));
const logit = (p: number) => Math.log(clampP(p) / (1 - clampP(p)));
const sigmoid = (l: number) => 1 / (1 + Math.exp(-l));

/**
 * Calcula o consenso a partir dos sinais fornecidos.
 * @param signals fontes com prob (0–100) e peso (≥0)
 * @param extremize fator de extremização. O ótimo do GJP (~1.5) assume fontes
 *   INDEPENDENTES; como mercado/IA/comunidade são parcialmente correlacionados
 *   (a IA lê o mercado, a comunidade vê o preço), usamos 1.2 para não
 *   super-extremizar — mais conservador e correto.
 */
export function computeConsensus(signals: ConsensusSignal[], extremize = 1.2): ConsensusResult | null {
  const valid = signals.filter((s) => s.weight > 0 && isFinite(s.prob));
  if (valid.length === 0) return null;

  const totalW = valid.reduce((a, s) => a + s.weight, 0);
  if (totalW <= 0) return null;

  // Média ponderada em log-odds
  const meanLogit = valid.reduce((a, s) => a + s.weight * logit(s.prob), 0) / totalW;

  // Só extremiza quando há ≥2 fontes (1 fonte = nada a agregar)
  const a = valid.length >= 2 ? extremize : 1;
  const consensusLogit = a * meanLogit;
  const consensus = sigmoid(consensusLogit) * 100;

  // Dispersão ponderada em log-odds → incerteza
  const variance = valid.reduce((acc, s) => acc + s.weight * Math.pow(logit(s.prob) - meanLogit, 2), 0) / totalW;
  const sd = Math.sqrt(variance);

  // IC 80%: ±1.2816 desvios (quantil normal) no espaço logit
  const low = sigmoid(consensusLogit - 1.2816 * sd) * 100;
  const high = sigmoid(consensusLogit + 1.2816 * sd) * 100;

  // Concordância: dispersão logit de ~1.4 já é desacordo forte
  const agreement = Math.max(0, Math.min(1, 1 - sd / 1.4));

  return {
    consensus: Math.round(consensus),
    low: Math.round(low),
    high: Math.round(high),
    agreement: Math.round(agreement * 100) / 100,
    extremizeFactor: a,
    nSources: valid.length,
    sources: valid.map((s) => ({ name: s.name, prob: Math.round(s.prob), weight: Math.round((s.weight / totalW) * 100) / 100, note: s.note })),
  };
}

// ── Cálculo de pesos por fonte (calibration-aware) ────────────────────────────

/**
 * Peso do MERCADO: cresce com a liquidez. Mercados líquidos são quase-eficientes
 * (muito dinheiro informado), então merecem mais confiança.
 */
export function marketWeight(liquidity?: number): { weight: number; note: string } {
  if (liquidity === undefined || liquidity <= 0) return { weight: 0.6, note: "liquidez desconhecida" };
  const w = 0.5 + 0.5 * Math.min(1, Math.log10(liquidity + 1) / 5.5); // ~1.0 acima de ~$300k
  const tier = liquidity > 100_000 ? "alta liquidez" : liquidity > 10_000 ? "liquidez média" : "baixa liquidez";
  return { weight: Math.round(w * 100) / 100, note: tier };
}

/**
 * Peso da IA: parte de um prior e sobe/desce conforme o TRACK RECORD comprovado
 * (skill vs mercado) e a confiança declarada na análise daquele mercado.
 */
export function aiWeight(opts: {
  skillVsMarket?: number | null;   // 1 - aiBrier/marketBrier; >0 = bate o mercado
  resolvedCount?: number;          // nº de previsões já resolvidas (credibilidade)
  confidence?: "baixa" | "media" | "alta";
}): { weight: number; note: string } {
  let base = 0.5; // prior neutro
  let note = "sem histórico ainda";

  // Ajuste pelo track record (só confia no histórico com amostra mínima)
  if (opts.skillVsMarket != null && (opts.resolvedCount ?? 0) >= 10) {
    if (opts.skillVsMarket > 0.1) { base = 0.85; note = "bate o mercado no histórico"; }
    else if (opts.skillVsMarket > 0) { base = 0.65; note = "levemente acima do mercado"; }
    else { base = 0.35; note = "abaixo do mercado no histórico"; }
  }

  // Modula pela confiança declarada da análise atual
  const conf = opts.confidence === "alta" ? 1.15 : opts.confidence === "baixa" ? 0.7 : 1.0;
  const weight = Math.round(Math.max(0.2, Math.min(1, base * conf)) * 100) / 100;
  return { weight, note };
}

/**
 * Peso da COMUNIDADE: cresce com o nº de forecasters (sabedoria das multidões
 * exige amostra). Poucos usuários → peso baixo.
 */
export function communityWeight(nForecasters?: number): { weight: number; note: string } {
  if (!nForecasters || nForecasters < 1) return { weight: 0, note: "sem previsões da comunidade" };
  const w = Math.min(0.7, 0.15 + 0.55 * Math.min(1, nForecasters / 8));
  return { weight: Math.round(w * 100) / 100, note: `${nForecasters} forecaster${nForecasters > 1 ? "s" : ""}` };
}
