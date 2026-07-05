"""
statistics.py — JLB Analytics
Nível 1 e 2: funções puras de estatística e probabilidade.

Critério de inclusão: só entra o que tem derivação matemática fechada
e interpretação direta para o usuário. Sem wrappers decorativos.

Cada função retorna um dict com:
  - value: resultado numérico principal
  - signal: 'positive' | 'negative' | 'neutral' (para cor no frontend)
  - explanation: texto educacional em PT-BR
"""

from __future__ import annotations
import math
from typing import Sequence
from config import CALIBRATION, DIVERGENCE, PROSPECT


# ─── Nível 1: Fundamentos ─────────────────────────────────────────────────────


def expected_value(
    outcomes: Sequence[float],
    probabilities: Sequence[float],
) -> dict:
    """
    Valor Esperado: E[X] = Σ pᵢ · xᵢ

    Parâmetros
    ----------
    outcomes      : payoffs em unidade monetária (positivo = ganho, negativo = perda)
    probabilities : probabilidades associadas. Devem somar 1.0 ± 0.001.

    Crítica de uso incorreto:
    EV é uma média assintótica — só converge com n grande. Para n pequeno,
    a variância domina. Nunca use EV isolado para decisão em eventos únicos.
    Apresente sempre junto com o desvio padrão.
    """
    if len(outcomes) != len(probabilities):
        raise ValueError("outcomes e probabilities devem ter o mesmo tamanho")
    if abs(sum(probabilities) - 1.0) > 0.001:
        raise ValueError(f"Probabilidades somam {sum(probabilities):.4f}, esperado 1.0")
    if any(p < 0 or p > 1 for p in probabilities):
        raise ValueError("Probabilidades devem estar em [0, 1]")

    ev = sum(o * p for o, p in zip(outcomes, probabilities))
    variance = sum(p * (o - ev) ** 2 for o, p in zip(outcomes, probabilities))
    std = math.sqrt(variance)

    if ev > 0:
        signal = "positive"
        label = "positivo — matematicamente favorável"
    elif ev < 0:
        signal = "negative"
        label = "negativo — matematicamente desfavorável"
    else:
        signal = "neutral"
        label = "neutro — jogo justo"

    return {
        "value": round(ev, 4),
        "std": round(std, 4),
        "signal": signal,
        "explanation": (
            f"Valor Esperado = {ev:+.4f} ({label}). "
            f"Desvio padrão = {std:.4f}. "
            "Atenção: EV só é um bom guia com muitas repetições. "
            "Em eventos únicos, o risco (desvio padrão) é tão importante quanto a média."
        ),
    }


def house_edge(decimal_odds: Sequence[float]) -> dict:
    """
    Margem da casa (overround / vig).

    Para cada odd decimal, a probabilidade implícita é 1/odd.
    A soma Σ(1/oddᵢ) > 1 é o overround. A margem é overround − 1.

    Parâmetros
    ----------
    decimal_odds : lista de odds decimais para todos os resultados de um evento.
                   Ex: [2.10, 3.50, 3.20] para vitória/empate/derrota.

    Crítica: muitos usuários confundem probabilidade implícita com probabilidade
    real. A casa embute a margem dividindo a probabilidade implícita pelo overround
    — isso comprime todas as probabilidades sistematicamente.
    """
    if any(o <= 1.0 for o in decimal_odds):
        raise ValueError("Odds decimais devem ser > 1.0")

    implied_probs = [1.0 / o for o in decimal_odds]
    overround = sum(implied_probs)
    margin = overround - 1.0

    # Probabilidades "reais" estimadas após remover a margem
    fair_probs = [p / overround for p in implied_probs]

    if margin < 0.04:
        signal = "positive"
        label = "baixa — mercado eficiente"
    elif margin < 0.08:
        signal = "neutral"
        label = "moderada"
    else:
        signal = "negative"
        label = "alta — mercado desfavorável ao apostador"

    return {
        "overround": round(overround, 6),
        "margin_pct": round(margin * 100, 3),
        "implied_probs": [round(p, 4) for p in implied_probs],
        "fair_probs": [round(p, 4) for p in fair_probs],
        "signal": signal,
        "explanation": (
            f"Margem da casa: {margin*100:.2f}% ({label}). "
            f"A cada R$100 apostados neste mercado, a casa retém em média R${margin*100:.2f} "
            "antes do resultado. As probabilidades 'justas' (sem margem) estão em fair_probs."
        ),
    }


def bayesian_update(prior: float, likelihood_given_true: float, likelihood_given_false: float) -> dict:
    """
    Atualização Bayesiana: P(H|E) = P(E|H)·P(H) / P(E)

    Parâmetros
    ----------
    prior                  : P(H) — crença inicial no evento
    likelihood_given_true  : P(E|H) — prob. de observar a evidência se H é verdadeiro
    likelihood_given_false : P(E|¬H) — prob. de observar a evidência se H é falso

    Importante: o resultado é sensível ao prior. Priors extremos (0.01 ou 0.99)
    precisam de evidência muito forte para mover a agulha — isso é matematicamente
    correto e pedagogicamente valioso mostrar ao usuário.
    """
    if not (0 < prior < 1):
        raise ValueError("Prior deve estar em (0, 1) exclusivo")
    if not (0 <= likelihood_given_true <= 1 and 0 <= likelihood_given_false <= 1):
        raise ValueError("Likelihoods devem estar em [0, 1]")

    # Teorema de Bayes
    p_evidence = likelihood_given_true * prior + likelihood_given_false * (1 - prior)
    if p_evidence == 0:
        raise ValueError("P(E) = 0 — evidência impossível dados os parâmetros")

    posterior = (likelihood_given_true * prior) / p_evidence
    delta = posterior - prior

    if abs(delta) < 0.02:
        signal = "neutral"
        label = "evidência fraca — crença pouco alterada"
    elif delta > 0:
        signal = "positive"
        label = "evidência favorável — aumenta a crença no evento"
    else:
        signal = "negative"
        label = "evidência contrária — reduz a crença no evento"

    return {
        "prior": round(prior, 4),
        "posterior": round(posterior, 4),
        "delta": round(delta, 4),
        "bayes_factor": round(likelihood_given_true / likelihood_given_false, 4)
            if likelihood_given_false > 0 else float("inf"),
        "signal": signal,
        "explanation": (
            f"Sua crença passou de {prior*100:.1f}% para {posterior*100:.1f}% "
            f"({delta*100:+.1f} pp). {label.capitalize()}. "
            "Fator de Bayes = razão das likelihoods — quanto maior, mais forte a evidência."
        ),
    }


# ─── Nível 2: Estatística Descritiva ─────────────────────────────────────────


def z_score(value: float, mean: float, std: float) -> dict:
    """
    Z-score: z = (x − μ) / σ

    Usado para detectar valores anômalos em séries históricas.
    No contexto do sistema: identifica se uma probabilidade de mercado
    está estatisticamente fora do padrão histórico.
    """
    if std <= 0:
        raise ValueError("Desvio padrão deve ser > 0")

    z = (value - mean) / std
    # Probabilidade de caudas usando aproximação de Zelen-Severo (1964)
    # para |z| comum — evita dependência de scipy
    abs_z = abs(z)
    p_one_tail = _standard_normal_cdf(-abs_z)
    p_two_tail = 2 * p_one_tail

    if abs_z > 3.0:
        signal = "negative"
        label = "anomalia severa (> 3σ)"
    elif abs_z > 2.0:
        signal = "negative"
        label = "anomalia moderada (> 2σ)"
    elif abs_z > 1.0:
        signal = "neutral"
        label = "desvio leve (1–2σ)"
    else:
        signal = "positive"
        label = "dentro do normal (< 1σ)"

    return {
        "z": round(z, 4),
        "p_two_tail": round(p_two_tail, 4),
        "signal": signal,
        "explanation": (
            f"Z-score = {z:.2f} — {label}. "
            f"Há {p_two_tail*100:.1f}% de chance de um valor tão extremo "
            "ocorrer por acaso numa distribuição normal."
        ),
    }


def confidence_interval(mean: float, std: float, n: int, level: float = 0.95) -> dict:
    """
    Intervalo de Confiança para a média (distribuição t de Student para n < 30,
    Normal para n ≥ 30).

    CI = x̄ ± t_(α/2, n-1) · (σ / √n)

    Crítica pedagógica importante: IC de 95% NÃO significa "95% de chance de o
    valor verdadeiro estar neste intervalo". Significa que, repetido o experimento
    muitas vezes, 95% dos intervalos construídos desta forma conteriam o parâmetro.
    Esta distinção é sistematicamente ignorada por jornalistas e apostadores.
    """
    if n < 2:
        raise ValueError("n mínimo = 2 para calcular IC")
    if not (0 < level < 1):
        raise ValueError("Nível de confiança deve estar em (0, 1)")

    alpha = 1 - level
    se = std / math.sqrt(n)

    # Valor crítico: t de Student para n < 30, Normal para n >= 30
    if n >= 30:
        z_crit = _normal_quantile(1 - alpha / 2)
        dist_used = "Normal"
    else:
        z_crit = _t_quantile_approx(1 - alpha / 2, df=n - 1)
        dist_used = f"t(df={n-1})"

    margin = z_crit * se
    lower = mean - margin
    upper = mean + margin

    return {
        "lower": round(lower, 4),
        "upper": round(upper, 4),
        "margin": round(margin, 4),
        "se": round(se, 4),
        "dist_used": dist_used,
        "level_pct": level * 100,
        "signal": "neutral",
        "explanation": (
            f"IC {level*100:.0f}%: [{lower:.4f}, {upper:.4f}] usando {dist_used}. "
            "Atenção: este intervalo descreve a incerteza sobre a estimativa, "
            "não a probabilidade do evento. Evite interpretar como 'o resultado "
            f"estará entre {lower:.2f} e {upper:.2f} com {level*100:.0f}% de certeza'."
        ),
    }


def pearson_correlation(x: Sequence[float], y: Sequence[float]) -> dict:
    """
    Correlação de Pearson: r = Σ(xᵢ−x̄)(yᵢ−ȳ) / [√Σ(xᵢ−x̄)² · √Σ(yᵢ−ȳ)²]

    Correlação mede associação LINEAR. Para relações não-lineares,
    use Spearman (rankbaseado). Para causalidade, use nenhum dos dois —
    correlação não implica causalidade.
    """
    if len(x) != len(y):
        raise ValueError("x e y devem ter o mesmo comprimento")
    n = len(x)
    if n < 4:
        raise ValueError("Correlação requer n >= 4 observações")

    mx, my = sum(x) / n, sum(y) / n
    num = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    dx = math.sqrt(sum((xi - mx) ** 2 for xi in x))
    dy = math.sqrt(sum((yi - my) ** 2 for yi in y))

    if dx == 0 or dy == 0:
        raise ValueError("Uma das séries tem variância zero — correlação indefinida")

    r = num / (dx * dy)
    r = max(-1.0, min(1.0, r))  # clamp por erros de ponto flutuante

    # Teste t para H0: r = 0
    if abs(r) < 1.0:
        t_stat = r * math.sqrt(n - 2) / math.sqrt(1 - r ** 2)
        p_val = 2 * _standard_normal_cdf(-abs(t_stat))  # aproximação para n>30
    else:
        t_stat = float("inf")
        p_val = 0.0

    if abs(r) >= 0.7:
        signal = "positive" if r > 0 else "negative"
        label = f"{'positiva' if r > 0 else 'negativa'} forte"
    elif abs(r) >= 0.4:
        signal = "neutral"
        label = f"{'positiva' if r > 0 else 'negativa'} moderada"
    else:
        signal = "neutral"
        label = "fraca ou inexistente"

    return {
        "r": round(r, 4),
        "r_squared": round(r ** 2, 4),
        "t_stat": round(t_stat, 4),
        "p_value": round(p_val, 4),
        "n": n,
        "signal": signal,
        "explanation": (
            f"r = {r:.3f} — correlação {label} (R² = {r**2:.3f}). "
            f"p-valor = {p_val:.4f} {'(estatisticamente significante)' if p_val < 0.05 else '(NÃO significante)'}. "
            "Correlação mede apenas associação linear. "
            "Séries temporais não-estacionárias geram correlações espúrias — "
            "verifique se as séries são estacionárias antes de interpretar."
        ),
    }


# ─── Helpers matemáticos (sem dependências externas) ─────────────────────────
# Implementações fechadas para evitar dependência de scipy em ambientes leves.

def _standard_normal_cdf(z: float) -> float:
    """CDF da Normal padrão usando aproximação de Abramowitz & Stegun (1964) §26.2.17."""
    return 0.5 * math.erfc(-z / math.sqrt(2))


def _normal_quantile(p: float) -> float:
    """Quantil da Normal padrão via inversão numérica com algoritmo de Beasley-Springer-Moro."""
    if p <= 0 or p >= 1:
        raise ValueError("p deve estar em (0, 1)")
    # Aproximação racional — erro < 4.5e-4 para p ∈ (0.005, 0.995)
    r = p if p < 0.5 else 1 - p
    t = math.sqrt(-2 * math.log(r))
    c0, c1, c2 = 2.515517, 0.802853, 0.010328
    d1, d2, d3 = 1.432788, 0.189269, 0.001308
    num = c0 + c1 * t + c2 * t * t
    den = 1 + d1 * t + d2 * t * t + d3 * t * t * t
    x = t - num / den
    return x if p >= 0.5 else -x


def _t_quantile_approx(p: float, df: int) -> float:
    """Aproximação do quantil t de Student (Cornish-Fisher para df >= 3)."""
    if df >= 30:
        return _normal_quantile(p)
    z = _normal_quantile(p)
    # Correção de Cornish-Fisher para df pequeno
    correction = (z ** 3 + z) / (4 * df)
    return z + correction
