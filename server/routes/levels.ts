/**
 * levels.ts — JLB Analytics
 * Implementação TypeScript de todos os endpoints educacionais (Nível 1–5).
 * Elimina dependência do serviço Python. Mesma API, mesmos outputs.
 */

import { Router } from "express";

const router = Router();

// ── Constantes (espelha config.py) ───────────────────────────────────────────

const PROSPECT = { alpha: 0.88, beta: 0.88, lam: 2.25, delta: 0.69, gamma: 0.61 };
const DIVERGENCE = { negligible: 0.03, moderate: 0.08, strong: 0.15, extreme: 0.25 };
const CALIBRATION = { reference_brier: 0.25, min_n_stable: 30 };
const TAYLOR = { r_star: 2.0, pi_target: 3.0, phi_pi: 0.5, phi_y: 0.5, divergence_threshold_pp: 1.5 };
const POISSON = { max_goals: 10, rho: -0.13, apply_dc: true };
const ELO = { k_base: 32, home_advantage: 65 };

// ── Helpers matemáticos ───────────────────────────────────────────────────────

function normalCdf(z: number): number {
  return 0.5 * erfc(-z / Math.SQRT2);
}

function erfc(x: number): number {
  // Aproximação de Horner para erfc
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const result = poly * Math.exp(-x * x);
  return x >= 0 ? result : 2 - result;
}

function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) throw new Error("p deve estar em (0, 1)");
  const r = p < 0.5 ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(r));
  const num = 2.515517 + 0.802853 * t + 0.010328 * t * t;
  const den = 1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t;
  const x = t - num / den;
  return p >= 0.5 ? x : -x;
}

function tQuantile(p: number, df: number): number {
  if (df >= 30) return normalQuantile(p);
  const z = normalQuantile(p);
  return z + (z * z * z + z) / (4 * df);
}

function poissonPmf(k: number, lam: number): number {
  if (lam <= 0) return k === 0 ? 1 : 0;
  let log_p = -lam + k * Math.log(lam);
  for (let i = 1; i <= k; i++) log_p -= Math.log(i);
  return Math.exp(log_p);
}

function logComb(n: number, k: number): number {
  let r = 0;
  for (let i = 0; i < k; i++) r += Math.log(n - i) - Math.log(i + 1);
  return r;
}

// ── Nível 1 ───────────────────────────────────────────────────────────────────

router.post("/level1/ev", (req, res) => {
  const { outcomes, probabilities } = req.body as { outcomes: number[]; probabilities: number[] };
  if (!Array.isArray(outcomes) || !Array.isArray(probabilities) || outcomes.length !== probabilities.length)
    return res.status(422).json({ error: "outcomes e probabilities devem ter o mesmo tamanho" });
  const sum = probabilities.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.001)
    return res.status(422).json({ error: `Probabilidades somam ${sum.toFixed(4)}, esperado 1.0` });
  if (probabilities.some((p) => p < 0 || p > 1))
    return res.status(422).json({ error: "Probabilidades devem estar em [0, 1]" });

  const ev = outcomes.reduce((acc, o, i) => acc + o * probabilities[i], 0);
  const variance = outcomes.reduce((acc, o, i) => acc + probabilities[i] * (o - ev) ** 2, 0);
  const std = Math.sqrt(variance);
  const signal = ev > 0 ? "positive" : ev < 0 ? "negative" : "neutral";
  const label = ev > 0 ? "positivo — matematicamente favorável" : ev < 0 ? "negativo — matematicamente desfavorável" : "neutro — jogo justo";

  res.json({
    value: Math.round(ev * 10000) / 10000,
    std: Math.round(std * 10000) / 10000,
    signal,
    explanation: `Valor Esperado = ${ev >= 0 ? "+" : ""}${ev.toFixed(4)} (${label}). Desvio padrão = ${std.toFixed(4)}. Atenção: EV só é um bom guia com muitas repetições. Em eventos únicos, o risco (desvio padrão) é tão importante quanto a média.`,
  });
});

router.post("/level1/house-edge", (req, res) => {
  const { decimal_odds } = req.body as { decimal_odds: number[] };
  if (!Array.isArray(decimal_odds) || decimal_odds.length < 2)
    return res.status(422).json({ error: "Forneça pelo menos 2 odds decimais" });
  if (decimal_odds.some((o) => o <= 1))
    return res.status(422).json({ error: "Odds decimais devem ser > 1.0" });

  const implied = decimal_odds.map((o) => 1 / o);
  const overround = implied.reduce((a, b) => a + b, 0);
  const margin = overround - 1;
  const fair = implied.map((p) => p / overround);
  const signal = margin < 0.04 ? "positive" : margin < 0.08 ? "neutral" : "negative";
  const label = margin < 0.04 ? "baixa — mercado eficiente" : margin < 0.08 ? "moderada" : "alta — mercado desfavorável ao apostador";

  res.json({
    overround: Math.round(overround * 1e6) / 1e6,
    margin_pct: Math.round(margin * 100 * 1000) / 1000,
    implied_probs: implied.map((p) => Math.round(p * 10000) / 10000),
    fair_probs: fair.map((p) => Math.round(p * 10000) / 10000),
    signal,
    explanation: `Margem da casa: ${(margin * 100).toFixed(2)}% (${label}). A cada R$100 apostados neste mercado, a casa retém em média R$${(margin * 100).toFixed(2)} antes do resultado.`,
  });
});

router.post("/level1/bayes", (req, res) => {
  const { prior, likelihood_given_true: lTrue, likelihood_given_false: lFalse } = req.body as Record<string, number>;
  if (prior <= 0 || prior >= 1) return res.status(422).json({ error: "Prior deve estar em (0, 1) exclusivo" });
  if (lTrue < 0 || lTrue > 1 || lFalse < 0 || lFalse > 1)
    return res.status(422).json({ error: "Likelihoods devem estar em [0, 1]" });

  const pEvidence = lTrue * prior + lFalse * (1 - prior);
  if (pEvidence === 0) return res.status(422).json({ error: "P(E) = 0 — evidência impossível dados os parâmetros" });

  const posterior = (lTrue * prior) / pEvidence;
  const delta = posterior - prior;
  const bf = lFalse > 0 ? lTrue / lFalse : Infinity;
  const signal = Math.abs(delta) < 0.02 ? "neutral" : delta > 0 ? "positive" : "negative";
  const label = Math.abs(delta) < 0.02 ? "evidência fraca — crença pouco alterada" : delta > 0 ? "evidência favorável — aumenta a crença no evento" : "evidência contrária — reduz a crença no evento";

  res.json({
    prior: Math.round(prior * 10000) / 10000,
    posterior: Math.round(posterior * 10000) / 10000,
    delta: Math.round(delta * 10000) / 10000,
    bayes_factor: isFinite(bf) ? Math.round(bf * 10000) / 10000 : null,
    signal,
    explanation: `Sua crença passou de ${(prior * 100).toFixed(1)}% para ${(posterior * 100).toFixed(1)}% (${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)} pp). ${label.charAt(0).toUpperCase() + label.slice(1)}. Fator de Bayes = razão das likelihoods — quanto maior, mais forte a evidência.`,
  });
});

// ── Nível 2 ───────────────────────────────────────────────────────────────────

router.post("/level2/zscore", (req, res) => {
  const { value, mean, std } = req.body as { value: number; mean: number; std: number };
  if (std <= 0) return res.status(422).json({ error: "Desvio padrão deve ser > 0" });

  const z = (value - mean) / std;
  const pTwoTail = 2 * normalCdf(-Math.abs(z));
  const absZ = Math.abs(z);
  const signal = absZ > 2 ? "negative" : absZ > 1 ? "neutral" : "positive";
  const label = absZ > 3 ? "anomalia severa (> 3σ)" : absZ > 2 ? "anomalia moderada (> 2σ)" : absZ > 1 ? "desvio leve (1–2σ)" : "dentro do normal (< 1σ)";

  res.json({
    z: Math.round(z * 10000) / 10000,
    p_two_tail: Math.round(pTwoTail * 10000) / 10000,
    signal,
    explanation: `Z-score = ${z.toFixed(2)} — ${label}. Há ${(pTwoTail * 100).toFixed(1)}% de chance de um valor tão extremo ocorrer por acaso numa distribuição normal.`,
  });
});

router.post("/level2/confidence-interval", (req, res) => {
  const { mean, std, n, level = 0.95 } = req.body as { mean: number; std: number; n: number; level?: number };
  if (n < 2) return res.status(422).json({ error: "n mínimo = 2 para calcular IC" });
  if (level <= 0 || level >= 1) return res.status(422).json({ error: "Nível de confiança deve estar em (0, 1)" });

  const alpha = 1 - level;
  const se = std / Math.sqrt(n);
  const zCrit = n >= 30 ? normalQuantile(1 - alpha / 2) : tQuantile(1 - alpha / 2, n - 1);
  const margin = zCrit * se;
  const lower = mean - margin;
  const upper = mean + margin;
  const dist = n >= 30 ? "Normal" : `t(df=${n - 1})`;

  res.json({
    lower: Math.round(lower * 10000) / 10000,
    upper: Math.round(upper * 10000) / 10000,
    margin: Math.round(margin * 10000) / 10000,
    se: Math.round(se * 10000) / 10000,
    dist_used: dist,
    level_pct: level * 100,
    signal: "neutral",
    explanation: `IC ${(level * 100).toFixed(0)}%: [${lower.toFixed(4)}, ${upper.toFixed(4)}] usando ${dist}. Atenção: este intervalo descreve a incerteza sobre a estimativa, não a probabilidade do evento.`,
  });
});

router.post("/level2/correlation", (req, res) => {
  const { x, y } = req.body as { x: number[]; y: number[] };
  if (!Array.isArray(x) || !Array.isArray(y) || x.length !== y.length)
    return res.status(422).json({ error: "x e y devem ter o mesmo comprimento" });
  if (x.length < 4) return res.status(422).json({ error: "Correlação requer n >= 4 observações" });

  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  const num = x.reduce((acc, xi, i) => acc + (xi - mx) * (y[i] - my), 0);
  const dx = Math.sqrt(x.reduce((acc, xi) => acc + (xi - mx) ** 2, 0));
  const dy = Math.sqrt(y.reduce((acc, yi) => acc + (yi - my) ** 2, 0));

  if (dx === 0 || dy === 0) return res.status(422).json({ error: "Uma das séries tem variância zero" });

  const r = Math.max(-1, Math.min(1, num / (dx * dy)));
  const tStat = Math.abs(r) < 1 ? r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r) : Infinity;
  const pVal = isFinite(tStat) ? 2 * normalCdf(-Math.abs(tStat)) : 0;
  const absR = Math.abs(r);
  const signal = absR >= 0.7 ? (r > 0 ? "positive" : "negative") : "neutral";
  const label = absR >= 0.7 ? `${r > 0 ? "positiva" : "negativa"} forte` : absR >= 0.4 ? `${r > 0 ? "positiva" : "negativa"} moderada` : "fraca ou inexistente";

  res.json({
    r: Math.round(r * 10000) / 10000,
    r_squared: Math.round(r * r * 10000) / 10000,
    t_stat: isFinite(tStat) ? Math.round(tStat * 10000) / 10000 : null,
    p_value: Math.round(pVal * 10000) / 10000,
    n,
    signal,
    explanation: `r = ${r.toFixed(3)} — correlação ${label} (R² = ${(r * r).toFixed(3)}). p-valor = ${pVal.toFixed(4)} ${pVal < 0.05 ? "(estatisticamente significante)" : "(NÃO significante)"}. Correlação mede apenas associação linear.`,
  });
});

// ── Nível 3 ───────────────────────────────────────────────────────────────────

router.post("/level3/taylor-rule", (req, res) => {
  const { selic_observed, ipca_12m, output_gap_pct } = req.body as { selic_observed: number; ipca_12m: number; output_gap_pct: number };

  const taylorRate = TAYLOR.r_star + ipca_12m + TAYLOR.phi_pi * (ipca_12m - TAYLOR.pi_target) + TAYLOR.phi_y * output_gap_pct;
  const divergence = selic_observed - taylorRate;
  const signal = Math.abs(divergence) <= TAYLOR.divergence_threshold_pp ? "neutral" : divergence > 0 ? "negative" : "positive";
  const label = Math.abs(divergence) <= TAYLOR.divergence_threshold_pp
    ? "alinhada com o modelo"
    : divergence > 0
    ? "contracionista acima do modelo (Selic acima do Taylor)"
    : "expansionista acima do modelo (Selic abaixo do Taylor)";

  res.json({
    selic_observed: Math.round(selic_observed * 100) / 100,
    taylor_implied: Math.round(taylorRate * 100) / 100,
    divergence_pp: Math.round(divergence * 100) / 100,
    signal,
    explanation: `Selic observada: ${selic_observed.toFixed(2)}% a.a. | Taylor implícito: ${taylorRate.toFixed(2)}% a.a. | Desvio: ${divergence >= 0 ? "+" : ""}${divergence.toFixed(2)} pp — ${label}. Desvios persistentes acima de ±1.5 pp historicamente precedem revisão de expectativas de mercado para juros futuros.`,
    inputs: { r_star: TAYLOR.r_star, ipca_12m: Math.round(ipca_12m * 100) / 100, pi_target: TAYLOR.pi_target, output_gap: Math.round(output_gap_pct * 100) / 100 },
  });
});

router.post("/level3/poisson", (req, res) => {
  const { home_attack, home_defense, away_attack, away_defense, league_avg_goals = 1.35, is_home = true } = req.body as {
    home_attack: number; home_defense: number; away_attack: number; away_defense: number; league_avg_goals?: number; is_home?: boolean;
  };

  const homeAdv = is_home ? 1.10 : 1.0;
  const lambdaHome = home_attack * away_defense * league_avg_goals * homeAdv;
  const lambdaAway = away_attack * home_defense * league_avg_goals;

  const maxG = POISSON.max_goals;
  const matrix: Map<string, number> = new Map();

  for (let i = 0; i <= maxG; i++) {
    for (let j = 0; j <= maxG; j++) {
      let p = poissonPmf(i, lambdaHome) * poissonPmf(j, lambdaAway);
      if (POISSON.apply_dc) {
        let tau = 1.0;
        const rho = POISSON.rho;
        if (i === 0 && j === 0) tau = 1 - lambdaHome * lambdaAway * rho;
        else if (i === 1 && j === 0) tau = 1 + lambdaAway * rho;
        else if (i === 0 && j === 1) tau = 1 + lambdaHome * rho;
        else if (i === 1 && j === 1) tau = 1 - rho;
        p *= tau;
      }
      matrix.set(`${i}-${j}`, p);
    }
  }

  const total = Array.from(matrix.values()).reduce((a, b) => a + b, 0);
  let pHome = 0, pDraw = 0, pAway = 0;
  const sorted: Array<[string, number]> = [];
  matrix.forEach((v, k) => {
    const norm = v / total;
    const [i, j] = k.split("-").map(Number);
    if (i > j) pHome += norm;
    else if (i === j) pDraw += norm;
    else pAway += norm;
    sorted.push([k, norm]);
  });
  sorted.sort((a, b) => b[1] - a[1]);
  const topScores = sorted.slice(0, 5).map(([k, p]) => {
    const [i, j] = k.split("-");
    return { score: `${i}x${j}`, probability: Math.round(p * 10000) / 10000 };
  });

  res.json({
    lambda_home: Math.round(lambdaHome * 10000) / 10000,
    lambda_away: Math.round(lambdaAway * 10000) / 10000,
    p_home_win: Math.round(pHome * 10000) / 10000,
    p_draw: Math.round(pDraw * 10000) / 10000,
    p_away_win: Math.round(pAway * 10000) / 10000,
    top_scores: topScores,
    dixon_coles_applied: POISSON.apply_dc,
    signal: "neutral",
    explanation: `λ_casa=${lambdaHome.toFixed(2)}, λ_fora=${lambdaAway.toFixed(2)}. Casa: ${(pHome * 100).toFixed(1)}% | Empate: ${(pDraw * 100).toFixed(1)}% | Fora: ${(pAway * 100).toFixed(1)}%. Poisson modela eventos independentes.`,
  });
});

router.post("/level3/elo", (req, res) => {
  const { rating_a, rating_b, home_advantage = true } = req.body as { rating_a: number; rating_b: number; home_advantage?: boolean };

  const rA = rating_a + (home_advantage ? ELO.home_advantage : 0);
  const pA = 1 / (1 + Math.pow(10, (rating_b - rA) / 400));
  const diff = Math.abs(rating_a - rating_b);
  const signal = diff < 50 ? "neutral" : diff < 150 ? "neutral" : pA > 0.5 ? "positive" : "negative";
  const label = diff < 50 ? "equilíbrio (diferença < 50 pontos)" : diff < 150 ? "leve favorito" : "favorito claro";

  res.json({
    rating_a: Math.round(rating_a * 10) / 10,
    rating_b: Math.round(rating_b * 10) / 10,
    home_advantage_applied: home_advantage,
    p_a_wins: Math.round(pA * 10000) / 10000,
    p_b_wins: Math.round((1 - pA) * 10000) / 10000,
    signal,
    explanation: `Elo A=${rating_a.toFixed(0)} vs B=${rating_b.toFixed(0)} (${home_advantage ? "vantagem de casa aplicada" : "neutro"}). P(A) = ${(pA * 100).toFixed(1)}% — ${label}. Elo é um sistema de ranking, não um modelo causal.`,
  });
});

router.post("/level3/garch", (req, res) => {
  const { returns } = req.body as { returns: number[] };
  if (!Array.isArray(returns) || returns.length < 30)
    return res.status(422).json({ error: "Série muito curta para GARCH (mínimo 30 obs)", signal: "neutral" });

  const lam = 0.94;
  let variance = returns.slice(0, 10).reduce((acc, r) => acc + r * r, 0) / 10;
  for (const r of returns.slice(10)) variance = lam * variance + (1 - lam) * r * r;
  const volDaily = Math.sqrt(variance);
  const volAnnual = volDaily * Math.sqrt(252);
  const signal = volAnnual < 0.15 ? "positive" : volAnnual < 0.35 ? "neutral" : "negative";
  const label = volAnnual < 0.15 ? "baixa" : volAnnual < 0.35 ? "moderada" : volAnnual < 0.60 ? "alta" : "extrema";

  res.json({
    model: "EWMA_stub",
    vol_daily_pct: Math.round(volDaily * 100 * 1000) / 1000,
    vol_annual_pct: Math.round(volAnnual * 100 * 100) / 100,
    signal,
    warning: "GARCH/EWMA modela TAMANHO da variação, não direção. Volatilidade alta não significa queda — significa que a magnitude do próximo movimento será grande.",
    explanation: `Volatilidade estimada: ${(volDaily * 100).toFixed(2)}%/dia | ${(volAnnual * 100).toFixed(1)}%/ano — ${label}. VaR 95% implícito para 1 dia: ±${(1.645 * volDaily * 100).toFixed(2)}%.`,
  });
});

router.post("/level3/enso", (req, res) => {
  const { oni_index } = req.body as { oni_index: number };

  let phase: string, signal: string, label: string, brazil_impact: string;
  if (oni_index >= 0.5) {
    phase = "El Niño"; signal = "negative";
    label = `El Niño (ONI = ${oni_index.toFixed(2)})`;
    brazil_impact = oni_index >= 1.5
      ? "El Niño forte: risco elevado de seca no Norte/Nordeste e chuvas acima da média no Sul. Reservatórios do Nordeste tendem a baixar. Impacto negativo em safras de soja e milho no RS provável."
      : "El Niño moderado: chuvas irregulares no Nordeste, excesso no Sul. Hidrelétricas do SE/CO podem sofrer redução de afluência.";
  } else if (oni_index <= -0.5) {
    phase = "La Niña"; signal = "positive";
    label = `La Niña (ONI = ${oni_index.toFixed(2)})`;
    brazil_impact = "La Niña: chuvas acima da média no Norte e Centro-Oeste. Reservatórios do Sudeste tendem a encher. Favorável à geração hidrelétrica e safra do Centro-Oeste.";
  } else {
    phase = "Neutro"; signal = "neutral";
    label = `Fase neutra (ONI = ${oni_index.toFixed(2)})`;
    brazil_impact = "Fase neutra: sem teleconexão climática dominante. Precipitação segue padrão sazonal normal.";
  }

  res.json({
    oni_index: Math.round(oni_index * 100) / 100,
    phase,
    signal,
    brazil_impact,
    explanation: `${label}. ${brazil_impact} Fonte: NOAA/CPC — Índice ONI baseado na anomalia de TSM na região Niño 3.4.`,
  });
});

router.post("/level3/polling", (req, res) => {
  const { polls } = req.body as { polls: Array<{ date: string; candidate_a_pct: number; candidate_b_pct: number; sample_size?: number }> };
  if (!polls || polls.length === 0) return res.status(422).json({ error: "Forneça pelo menos uma pesquisa" });

  const now = Date.now();
  let totalWeight = 0, sumA = 0, sumB = 0;

  for (const poll of polls) {
    const daysOld = (now - new Date(poll.date).getTime()) / 86400000;
    const decay = Math.exp(-Math.log(2) * daysOld / 30);
    const n = poll.sample_size ?? 1000;
    const w = n * decay;
    sumA += poll.candidate_a_pct * w;
    sumB += poll.candidate_b_pct * w;
    totalWeight += w;
  }

  const avgA = sumA / totalWeight;
  const avgB = sumB / totalWeight;
  const diff = avgA - avgB;
  const signal = Math.abs(diff) < 3 ? "neutral" : diff > 0 ? "positive" : "negative";

  res.json({
    candidate_a_pct: Math.round(avgA * 100) / 100,
    candidate_b_pct: Math.round(avgB * 100) / 100,
    diff_pp: Math.round(diff * 100) / 100,
    n_polls: polls.length,
    signal,
    explanation: `Média ponderada (decaimento 30 dias): A = ${avgA.toFixed(1)}%, B = ${avgB.toFixed(1)}%. Diferença: ${diff >= 0 ? "+" : ""}${diff.toFixed(1)} pp. ${Math.abs(diff) < 3 ? "Dentro da margem de erro — corrida empatada." : `${diff > 0 ? "A" : "B"} lidera com margem ${Math.abs(diff) > 10 ? "expressiva" : "moderada"}.`}`,
  });
});

// ── Nível 4 ───────────────────────────────────────────────────────────────────

router.post("/level4/prospect", (req, res) => {
  const { outcomes, probabilities } = req.body as { outcomes: number[]; probabilities: number[] };
  if (!Array.isArray(outcomes) || outcomes.length !== probabilities?.length)
    return res.status(422).json({ error: "outcomes e probabilities devem ter o mesmo tamanho" });

  function valueFunction(x: number): number {
    return x >= 0 ? Math.pow(x, PROSPECT.alpha) : -PROSPECT.lam * Math.pow(-x, PROSPECT.beta);
  }
  function weightGains(p: number): number {
    if (p <= 0) return 0; if (p >= 1) return 1;
    return Math.exp(-Math.pow(-Math.log(p), PROSPECT.delta));
  }
  function weightLosses(p: number): number {
    if (p <= 0) return 0; if (p >= 1) return 1;
    return Math.exp(-Math.pow(-Math.log(p), PROSPECT.gamma));
  }

  const subjValue = outcomes.reduce((acc, o, i) => {
    const v = valueFunction(o);
    const w = o >= 0 ? weightGains(probabilities[i]) : weightLosses(probabilities[i]);
    return acc + w * v;
  }, 0);
  const evObjective = outcomes.reduce((acc, o, i) => acc + o * probabilities[i], 0);
  const gap = subjValue - evObjective;

  let signal = "neutral", biasDiagnosis: string;
  if (evObjective > 0 && subjValue < 0) {
    signal = "negative";
    biasDiagnosis = "Aversão à perda inverteu a avaliação: o prospecto é objetivamente positivo, mas percebido como negativo.";
  } else if (evObjective < 0 && subjValue > evObjective) {
    signal = "negative";
    biasDiagnosis = "Distorção de probabilidade superestima eventos raros negativos.";
  } else {
    biasDiagnosis = "Avaliação subjetiva aproximadamente alinhada com o valor objetivo.";
  }

  res.json({
    ev_objective: Math.round(evObjective * 10000) / 10000,
    subjective_value: Math.round(subjValue * 10000) / 10000,
    gap: Math.round(gap * 10000) / 10000,
    loss_aversion_lambda: PROSPECT.lam,
    signal,
    bias_diagnosis: biasDiagnosis,
    explanation: `Valor Esperado objetivo: ${evObjective >= 0 ? "+" : ""}${evObjective.toFixed(4)}. Valor subjetivo (Prospect Theory): ${subjValue >= 0 ? "+" : ""}${subjValue.toFixed(4)}. O cérebro avalia perdas com peso λ=${PROSPECT.lam}× maior que ganhos equivalentes.`,
  });
});

router.post("/level4/brier", (req, res) => {
  const { forecasts, outcomes } = req.body as { forecasts: number[]; outcomes: number[] };
  if (!Array.isArray(forecasts) || forecasts.length < 5) return res.status(422).json({ error: "Forneça pelo menos 5 previsões" });
  if (forecasts.some((f) => f < 0 || f > 1)) return res.status(422).json({ error: "Previsões devem estar em [0, 1]" });
  if (outcomes.some((o) => o !== 0 && o !== 1)) return res.status(422).json({ error: "Outcomes devem ser 0 ou 1" });

  const n = forecasts.length;
  const bs = forecasts.reduce((acc, f, i) => acc + (f - outcomes[i]) ** 2, 0) / n;
  const ss = 1 - bs / CALIBRATION.reference_brier;
  const meanOutcome = outcomes.reduce((a, b) => a + b, 0) / n;
  const resolution = forecasts.reduce((acc, f) => acc + (f - meanOutcome) ** 2, 0) / n;
  const reliability = forecasts.reduce((acc, f, i) => acc + (f - outcomes[i]) ** 2 - (f - meanOutcome) ** 2, 0) / n;
  const stable = n >= CALIBRATION.min_n_stable;
  const signal = ss > 0.25 ? "positive" : ss > 0 ? "neutral" : "negative";
  const label = ss > 0.25 ? "calibração acima da média" : ss > 0 ? "calibração marginal" : ss > -0.25 ? "abaixo da referência" : "overconfidence severo";

  res.json({
    brier_score: Math.round(bs * 10000) / 10000,
    skill_score: Math.round(ss * 10000) / 10000,
    resolution: Math.round(resolution * 10000) / 10000,
    reliability: Math.round(reliability * 10000) / 10000,
    n, stable, signal,
    explanation: `Brier Score: ${bs.toFixed(4)} | Skill Score: ${ss >= 0 ? "+" : ""}${ss.toFixed(4)} — ${label}. ${stable ? `n=${n} — resultado estatisticamente estável.` : `⚠️ n=${n} < ${CALIBRATION.min_n_stable}: resultado instável.`}`,
  });
});

router.post("/level4/gambler", (req, res) => {
  const { sequence } = req.body as { sequence: number[] };
  if (!Array.isArray(sequence) || sequence.length < 4)
    return res.status(422).json({ error: "Sequência mínima: 4 eventos", signal: "neutral" });

  const n = sequence.length;
  const nOnes = sequence.filter((s) => s === 1).length;
  const nZeros = n - nOnes;
  const logP = logComb(n, nOnes) + nOnes * Math.log(0.5) + nZeros * Math.log(0.5);
  const pBinomial = Math.exp(logP);

  let maxRun = 1, currentRun = 1;
  for (let i = 1; i < n; i++) {
    if (sequence[i] === sequence[i - 1]) { currentRun++; maxRun = Math.max(maxRun, currentRun); }
    else currentRun = 1;
  }
  let runs = 1;
  for (let i = 1; i < n; i++) { if (sequence[i] !== sequence[i - 1]) runs++; }
  const expectedRuns = (n + 1) / 2;

  const fallacyRisk = maxRun >= 5 ? "alto" : Math.abs(runs - expectedRuns) > expectedRuns * 0.4 ? "moderado" : "baixo";
  const signal = maxRun >= 5 ? "negative" : fallacyRisk === "moderado" ? "neutral" : "positive";

  res.json({
    n, n_ones: nOnes, n_zeros: nZeros,
    p_binomial_exact: Math.round(pBinomial * 1e6) / 1e6,
    max_run: maxRun, n_runs: runs, expected_runs: Math.round(expectedRuns * 10) / 10,
    fallacy_risk: fallacyRisk, signal,
    explanation: `${maxRun >= 5 ? `Run de ${maxRun} eventos idênticos detectado.` : "Sequência analisada."} Falácia do Jogador ocorre quando se acredita que 'agora é a vez' após sequência — mesmo em eventos independentes. Risco: ${fallacyRisk}.`,
  });
});

router.post("/level4/maturity", (req, res) => {
  const { brier_skill_score, overconfidence_idx, gambler_fallacy_risk, n_sessions, loss_aversion_ratio } = req.body as {
    brier_skill_score: number; overconfidence_idx: number; gambler_fallacy_risk: string; n_sessions: number; loss_aversion_ratio: number;
  };

  let score = 0;
  if (brier_skill_score > 0.25) score += 2; else if (brier_skill_score > 0) score += 1;
  if (Math.abs(overconfidence_idx) < 0.05) score += 2; else if (Math.abs(overconfidence_idx) < 0.15) score += 1;
  if (gambler_fallacy_risk === "baixo") score += 1;
  if (loss_aversion_ratio >= 1.8 && loss_aversion_ratio <= 3.0) score += 1;
  if (n_sessions >= 50) score += 1;
  const total = Math.min(score, 6);

  const stages = [
    [0, "Iniciante — decisões majoritariamente intuitivas"],
    [1, "Em desenvolvimento — começa a estruturar análise"],
    [2, "Intermediário — usa modelos, calibração a melhorar"],
    [3, "Avançado — processo consistente, vieses mapeados"],
    [4, "Expert — calibração estável, referência metodológica"],
  ] as const;
  const [stage, label] = total <= 1 ? stages[0] : total <= 2 ? stages[1] : total <= 3 ? stages[2] : total <= 4 ? stages[3] : stages[4];

  const improvements: string[] = [];
  if (brier_skill_score <= 0) improvements.push("Calibração de probabilidade (Brier Score negativo)");
  if (Math.abs(overconfidence_idx) > 0.15) improvements.push("Reduzir overconfidence");
  if (gambler_fallacy_risk === "alto") improvements.push("Independência de eventos — evitar 'perseguição'");
  if (loss_aversion_ratio > 3.5) improvements.push("Aversão à perda excessiva");

  res.json({
    stage, label, score: total, max_score: 6,
    priority_improvements: improvements,
    metrics: { brier_skill_score, overconfidence_idx, gambler_fallacy_risk, loss_aversion_ratio, n_sessions },
    signal: stage >= 3 ? "positive" : stage >= 2 ? "neutral" : "negative",
    explanation: `Perfil de maturidade: Estágio ${stage}/4 — ${label}. Pontuação: ${total}/6. ${improvements.length > 0 ? "Foco: " + improvements.join("; ") : "Manter a consistência do processo analítico."}`,
  });
});

// ── Nível 5 ───────────────────────────────────────────────────────────────────

router.post("/level5/divergence", (req, res) => {
  const { model_probability: mp, market_probability: mkp, model_confidence = 0.5 } = req.body as {
    model_probability: number; market_probability: number; model_confidence?: number;
  };

  const div = mp - mkp;
  const absDiv = Math.abs(div);
  let tier: string, signal: string, label: string, actionNote: string;

  if (absDiv < DIVERGENCE.negligible) {
    tier = "negligible"; signal = "neutral"; label = "alinhamento com o mercado";
    actionNote = "Modelo e mercado concordam. Nenhuma ineficiência detectada.";
  } else if (absDiv < DIVERGENCE.moderate) {
    tier = "moderate"; signal = "neutral"; label = "divergência leve";
    actionNote = "Divergência pequena. Pode refletir dados ainda não precificados — investigue os drivers.";
  } else if (absDiv < DIVERGENCE.strong) {
    tier = "strong"; signal = div > 0 ? "positive" : "negative"; label = "divergência significativa";
    actionNote = "O modelo diverge materialmente do mercado. Verifique se há assimetria de informação.";
  } else if (absDiv < DIVERGENCE.extreme) {
    tier = "extreme_low"; signal = div > 0 ? "positive" : "negative"; label = "divergência forte";
    actionNote = "Divergência elevada. Verifique inputs do modelo — pode haver erro de dado ou evento não modelado.";
  } else {
    tier = "extreme"; signal = "negative"; label = "divergência extrema — suspeita de erro";
    actionNote = "Divergência acima de 25 pp raramente é ineficiência simples. Verifique a fonte dos dados.";
  }

  const direction = div > 0 ? "acima" : "abaixo";
  const educationalNote = tier === "negligible"
    ? "O modelo está alinhado com o mercado. Isso pode significar eficiência ou que ambos cometem o mesmo erro."
    : `Divergência de ${(absDiv * 100).toFixed(1)} pp ${direction}. O modelo sugere que o mercado está ${div > 0 ? "subestimando" : "superestimando"} o evento. ATENÇÃO: divergência não é lucro garantido. Confiança do modelo: ${(model_confidence * 100).toFixed(0)}%.`;

  res.json({
    model_probability: Math.round(mp * 10000) / 10000,
    market_probability: Math.round(mkp * 10000) / 10000,
    divergence: Math.round(div * 10000) / 10000,
    divergence_pct: Math.round(div * 100 * 100) / 100,
    abs_divergence: Math.round(absDiv * 10000) / 10000,
    tier, signal, label, action_note: actionNote,
    educational_note: educationalNote,
    model_confidence: Math.round(model_confidence * 1000) / 1000,
  });
});

router.post("/level5/ensemble", (req, res) => {
  const { model_probabilities, model_skill_scores } = req.body as { model_probabilities: Record<string, number>; model_skill_scores: Record<string, number> };
  if (!model_probabilities || !model_skill_scores)
    return res.status(422).json({ error: "Forneça model_probabilities e model_skill_scores" });

  const validModels: Record<string, { prob: number; ss: number }> = {};
  const excluded: string[] = [];
  for (const name of Object.keys(model_probabilities)) {
    const ss = model_skill_scores[name] ?? 0;
    if (ss > 0) validModels[name] = { prob: model_probabilities[name], ss };
    else excluded.push(name);
  }

  if (Object.keys(validModels).length === 0) {
    const avg = Object.values(model_probabilities).reduce((a, b) => a + b, 0) / Object.keys(model_probabilities).length;
    return res.json({
      ensemble_probability: Math.round(avg * 10000) / 10000,
      method: "simple_mean_fallback",
      warning: "Todos os modelos têm Skill Score ≤ 0. Usando média simples. Resultado de baixa confiança.",
      excluded_models: [],
      weights: Object.fromEntries(Object.keys(model_probabilities).map((k) => [k, Math.round(1 / Object.keys(model_probabilities).length * 10000) / 10000])),
      signal: "negative",
    });
  }

  const totalSS = Object.values(validModels).reduce((a, v) => a + v.ss, 0);
  const weights: Record<string, number> = {};
  for (const name of Object.keys(validModels)) weights[name] = validModels[name].ss / totalSS;

  const ensemble = Object.keys(validModels).reduce((acc, name) => acc + weights[name] * validModels[name].prob, 0);
  const variance = Object.keys(validModels).reduce((acc, name) => acc + weights[name] * (validModels[name].prob - ensemble) ** 2, 0);
  const std = Math.sqrt(variance);

  res.json({
    ensemble_probability: Math.round(ensemble * 10000) / 10000,
    ensemble_std: Math.round(std * 10000) / 10000,
    method: "skill_weighted",
    weights: Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, Math.round(v * 10000) / 10000])),
    excluded_models: excluded,
    n_models_used: Object.keys(validModels).length,
    signal: std < 0.05 ? "positive" : std < 0.12 ? "neutral" : "negative",
    explanation: `Ensemble de ${Object.keys(validModels).length} modelo(s) com pesos por Skill Score. ${excluded.length > 0 ? excluded.length + " modelo(s) excluído(s) por SS ≤ 0. " : ""}P_ensemble = ${(ensemble * 100).toFixed(1)}% ± ${(std * 100).toFixed(1)}%. ${std > 0.12 ? "Dispersão alta — modelos discordam." : "Consenso razoável entre os modelos."}`,
  });
});

export default router;
