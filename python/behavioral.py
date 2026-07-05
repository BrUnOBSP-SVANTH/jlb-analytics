"""
behavioral.py — JLB Analytics
Nível 4: Psicologia e Finanças Comportamentais.

Este é o módulo mais educacionalmente valioso do sistema.
A maioria das perdas em mercados preditivos não vem de modelos errados —
vem de decisões tomadas sob viés cognitivo com dados corretos disponíveis.

Implementações baseadas em:
- Kahneman & Tversky (1992) "Advances in Prospect Theory"
- Brier (1950) "Verification of Forecasts Expressed in Terms of Probability"
- De Bondt & Thaler (1985) "Does the Stock Market Overreact?"
- Gilovich, Vallone & Tversky (1985) "The Hot Hand in Basketball"

Crítica de design:
  - Não usamos "behavioral score" único — scores compostos escondem quais
    vieses específicos afetam o usuário e impedem correção direcionada.
  - Cada função diagnóstica retorna o viés específico e o mecanismo correto,
    não apenas "você está errado".
"""

from __future__ import annotations
import math
from typing import Sequence
from config import PROSPECT, CALIBRATION


# ─── Prospect Theory (Kahneman-Tversky) ──────────────────────────────────────

def prospect_theory_value(outcomes: Sequence[float], probabilities: Sequence[float]) -> dict:
    """
    Valor subjetivo segundo a Teoria do Prospecto.

    Função de valor: v(x) = x^α se x ≥ 0, −λ·(−x)^β se x < 0
    Pesos de decisão: w(p) = p^δ / (p^δ + (1−p)^δ)^(1/δ)

    Parâmetros clínicos (Kahneman & Tversky 1992):
      α = β = 0.88 (sensibilidade decrescente)
      λ = 2.25 (perdas pesam 2.25x mais que ganhos equivalentes)
      δ = 0.69 (distorção de probabilidade para ganhos)
      γ = 0.61 (distorção de probabilidade para perdas)

    Por que isso importa: o Valor Esperado racional diz que −R$100 e +R$100
    se cancelam. Prospect Theory diz que a dor de −R$100 equivale psicologicamente
    a um ganho de R$225. Isso explica por que apostadores "perseguem perdas".
    """
    if len(outcomes) != len(probabilities):
        raise ValueError("outcomes e probabilities devem ter o mesmo tamanho")

    def value_function(x: float) -> float:
        if x >= 0:
            return x ** PROSPECT.alpha
        else:
            return -PROSPECT.lam * ((-x) ** PROSPECT.beta)

    def weighting_gains(p: float) -> float:
        """Distorção de probabilidade para o domínio de ganhos (Prelec 1998)."""
        if p <= 0: return 0.0
        if p >= 1: return 1.0
        d = PROSPECT.delta
        return math.exp(-(-math.log(p)) ** d)

    def weighting_losses(p: float) -> float:
        """Distorção de probabilidade para o domínio de perdas."""
        if p <= 0: return 0.0
        if p >= 1: return 1.0
        g = PROSPECT.gamma
        return math.exp(-(-math.log(p)) ** g)

    # Valor subjetivo total
    subjective_value = 0.0
    for o, p in zip(outcomes, probabilities):
        v = value_function(o)
        w = weighting_gains(p) if o >= 0 else weighting_losses(p)
        subjective_value += w * v

    # Valor esperado objetivo para comparação
    ev_objective = sum(o * p for o, p in zip(outcomes, probabilities))

    gap = subjective_value - ev_objective
    loss_outcomes = [o for o in outcomes if o < 0]
    loss_weight_factor = PROSPECT.lam if loss_outcomes else 1.0

    if ev_objective > 0 and subjective_value < 0:
        signal = "negative"
        bias_diagnosis = "Aversão à perda inverteu a avaliação: o prospecto é objetivamente positivo, mas percebido como negativo. Possível rejeição irracional."
    elif ev_objective < 0 and subjective_value > ev_objective:
        signal = "negative"
        bias_diagnosis = "Distorção de probabilidade superestima eventos raros negativos. O prospecto parece menos ruim do que realmente é."
    else:
        signal = "neutral"
        bias_diagnosis = "Avaliação subjetiva aproximadamente alinhada com o valor objetivo."

    return {
        "ev_objective": round(ev_objective, 4),
        "subjective_value": round(subjective_value, 4),
        "gap": round(gap, 4),
        "loss_aversion_lambda": PROSPECT.lam,
        "signal": signal,
        "bias_diagnosis": bias_diagnosis,
        "explanation": (
            f"Valor Esperado objetivo: {ev_objective:+.4f}. "
            f"Valor subjetivo (Prospect Theory): {subjective_value:+.4f}. "
            f"O cérebro avalia perdas com peso λ={PROSPECT.lam}× maior que ganhos equivalentes. "
            "Isso leva à 'perseguição de perdas' — aumentar apostas após sequência negativa "
            "para 'recuperar', mesmo quando EV continua negativo."
        ),
    }


def brier_score_and_skill(
    forecasts: Sequence[float],
    outcomes: Sequence[int],
) -> dict:
    """
    Brier Score: BS = (1/n) Σ(fᵢ − oᵢ)²
    Skill Score: SS = 1 − BS / BS_ref

    BS_ref = 0.25 (preditor constante p=0.5, pior baseline útil para eventos binários)

    SS > 0: melhor que referência
    SS = 0: igual à referência (chutar 50% sempre)
    SS < 0: pior que chutar 50% — diagnóstico de overconfidence severo

    Brier Score penaliza simultaneamente imprecisão E falta de calibração.
    Um forecaster que diz "90% de chance" e erra paga penalidade maior
    do que quem diz "60% de chance" e erra — isso é matematicamente correto.
    """
    if len(forecasts) != len(outcomes):
        raise ValueError("forecasts e outcomes devem ter o mesmo tamanho")
    if not all(0 <= f <= 1 for f in forecasts):
        raise ValueError("Previsões devem estar em [0, 1]")
    if not all(o in (0, 1) for o in outcomes):
        raise ValueError("Outcomes devem ser 0 ou 1")

    n = len(forecasts)
    bs = sum((f - o) ** 2 for f, o in zip(forecasts, outcomes)) / n
    ss = 1 - bs / CALIBRATION.reference_brier

    # Decompõe em componentes: resolução e confiabilidade
    mean_outcome = sum(outcomes) / n
    resolution = sum((f - mean_outcome) ** 2 for f in forecasts) / n
    reliability = sum((f - o) ** 2 - (f - mean_outcome) ** 2 for f, o in zip(forecasts, outcomes)) / n

    is_stable = n >= CALIBRATION.min_n_stable

    if ss > 0.25:
        signal = "positive"
        label = "calibração acima da média"
    elif ss > 0:
        signal = "neutral"
        label = "calibração marginal — melhor que referência, mas fraca"
    elif ss > -0.25:
        signal = "negative"
        label = "abaixo da referência — revisar processo de análise"
    else:
        signal = "negative"
        label = "overconfidence severo — previsões muito confiantes e erradas"

    return {
        "brier_score": round(bs, 4),
        "skill_score": round(ss, 4),
        "resolution": round(resolution, 4),
        "reliability": round(reliability, 4),
        "n": n,
        "stable": is_stable,
        "signal": signal,
        "explanation": (
            f"Brier Score: {bs:.4f} | Skill Score: {ss:+.4f} — {label}. "
            f"{'⚠️ n={n} < {CALIBRATION.min_n_stable}: resultado instável.' if not is_stable else f'n={n} — resultado estatisticamente estável.'} "
            "Resolução alta significa que você discrimina bem entre eventos que vão e não vão ocorrer. "
            "Confiabilidade mede se suas probabilidades declaradas correspondem às frequências reais."
        ),
    }


def gambler_fallacy_diagnosis(
    sequence: Sequence[int],
) -> dict:
    """
    Diagnóstico da Falácia do Jogador.

    Detecta se o usuário crê que eventos passados independentes
    afetam a probabilidade de eventos futuros.

    Em eventos independentes (cara/coroa, roleta), a probabilidade
    de "cara" após 5 "coroas" seguidas é SEMPRE 50% — não 50%+ε.

    Método: calcula a probabilidade binomial de observar esta sequência
    assumindo eventos independentes com p=0.5, e o comprimento de runs.
    """
    if len(sequence) < 4:
        return {"error": "Sequência mínima: 4 eventos", "signal": "neutral"}
    if not all(s in (0, 1) for s in sequence):
        raise ValueError("Sequência deve conter apenas 0s e 1s")

    n = len(sequence)
    n_ones = sum(sequence)
    n_zeros = n - n_ones

    # Probabilidade binomial desta realização (H0: p=0.5)
    # P(X=k|n,p) = C(n,k) × p^k × (1-p)^(n-k)
    log_p = (
        _log_comb(n, n_ones)
        + n_ones * math.log(0.5)
        + n_zeros * math.log(0.5)
    )
    p_binomial = math.exp(log_p)

    # Comprimento do maior run (sequência consecutiva)
    max_run = 1
    current_run = 1
    for i in range(1, n):
        if sequence[i] == sequence[i - 1]:
            current_run += 1
            max_run = max(max_run, current_run)
        else:
            current_run = 1

    # Runs esperados: E[runs] = (n+1)/2 para eventos independentes equiprováveis
    # Aqui calculamos o número real de runs
    runs = 1
    for i in range(1, n):
        if sequence[i] != sequence[i - 1]:
            runs += 1
    expected_runs = (n + 1) / 2

    if max_run >= 5:
        signal = "negative"
        label = f"run de {max_run} eventos idênticos consecutivos detectado"
        fallacy_risk = "alto"
    elif abs(runs - expected_runs) > expected_runs * 0.4:
        signal = "neutral"
        label = "padrão de alternância incomum"
        fallacy_risk = "moderado"
    else:
        signal = "positive"
        label = "sequência compatível com independência"
        fallacy_risk = "baixo"

    return {
        "n": n,
        "n_ones": n_ones,
        "n_zeros": n_zeros,
        "p_binomial_exact": round(p_binomial, 6),
        "max_run": max_run,
        "n_runs": runs,
        "expected_runs": round(expected_runs, 1),
        "fallacy_risk": fallacy_risk,
        "signal": signal,
        "explanation": (
            f"{label.capitalize()}. "
            "A Falácia do Jogador ocorre quando se acredita que 'agora é a vez' "
            "após sequência desfavorável — mesmo em eventos matematicamente independentes. "
            f"Um run de {max_run} é esperado com probabilidade calculável e "
            "NÃO indica que o próximo evento 'deve' ser diferente. "
            "A roleta não tem memória. O dado não tem memória. O mercado tem."
        ),
    }


def overconfidence_index(
    stated_confidences: Sequence[float],
    correct: Sequence[int],
) -> dict:
    """
    Índice de Overconfidence = confiança média declarada − acurácia real.

    Um value positivo indica overconfidence (usuário diz "80%" mas acerta 60%).
    Um value negativo indica underconfidence (raro, geralmente em especialistas técnicos).

    Também calcula a curva de calibração por decil para visualização no frontend.
    """
    if len(stated_confidences) != len(correct):
        raise ValueError("confidences e correct devem ter o mesmo tamanho")
    if not all(0 <= c <= 1 for c in stated_confidences):
        raise ValueError("Confiançãs devem estar em [0, 1]")

    n = len(stated_confidences)
    mean_confidence = sum(stated_confidences) / n
    accuracy = sum(correct) / n
    oi = mean_confidence - accuracy

    # Calibração por decil
    deciles = []
    for d in range(10):
        low, high = d / 10, (d + 1) / 10
        bucket = [(c, o) for c, o in zip(stated_confidences, correct) if low <= c < high]
        if bucket:
            avg_conf = sum(c for c, _ in bucket) / len(bucket)
            avg_acc = sum(o for _, o in bucket) / len(bucket)
            deciles.append({
                "confidence_range": f"{low:.0%}–{high:.0%}",
                "avg_confidence": round(avg_conf, 3),
                "actual_accuracy": round(avg_acc, 3),
                "n": len(bucket),
                "calibration_error": round(avg_conf - avg_acc, 3),
            })

    if oi > 0.15:
        signal = "negative"
        label = "overconfidence severo"
    elif oi > 0.05:
        signal = "negative"
        label = "overconfidence moderado"
    elif oi < -0.05:
        signal = "neutral"
        label = "underconfidence"
    else:
        signal = "positive"
        label = "bem calibrado"

    return {
        "mean_confidence": round(mean_confidence, 4),
        "accuracy": round(accuracy, 4),
        "overconfidence_index": round(oi, 4),
        "n": n,
        "calibration_by_decile": deciles,
        "signal": signal,
        "explanation": (
            f"Você declarou confiança média de {mean_confidence*100:.1f}%, "
            f"mas acertou {accuracy*100:.1f}%. "
            f"Índice de overconfidence: {oi*100:+.1f}% — {label}. "
            "A curva de calibração mostra em quais faixas de confiança o desvio é maior."
        ),
    }


def user_maturity_profile(
    brier_skill_score: float,
    overconfidence_idx: float,
    gambler_fallacy_risk: str,
    n_sessions: int,
    loss_aversion_ratio: float,
) -> dict:
    """
    Perfil de maturidade analítica do usuário — dado de impacto para investidores.

    Combina métricas comportamentais para classificar o estágio do usuário
    e recomendar o foco de melhoria mais urgente.

    Classificações:
      Iniciante (0): alta dependência de intuição
      Em desenvolvimento (1): começa a usar dados, mas com vieses fortes
      Intermediário (2): usa modelos, mas calibração fraca
      Avançado (3): calibrado, ciente dos vieses, processo consistente
      Expert (4): calibração estável, processo documentado, vieses mapeados
    """
    score = 0

    # Brier Skill Score (0-2 pontos)
    if brier_skill_score > 0.25:
        score += 2
    elif brier_skill_score > 0:
        score += 1

    # Overconfidence (0-2 pontos)
    if abs(overconfidence_idx) < 0.05:
        score += 2
    elif abs(overconfidence_idx) < 0.15:
        score += 1

    # Gamblers fallacy (0-1 ponto)
    if gambler_fallacy_risk == "baixo":
        score += 1

    # Loss aversion (0-1 ponto) — próximo de 2.25 é calibrado
    if 1.8 <= loss_aversion_ratio <= 3.0:
        score += 1

    # Número de sessões (maturidade de prática, 0-1 ponto)
    if n_sessions >= 50:
        score += 1

    total = min(score, 6)
    if total <= 1:
        stage, label = 0, "Iniciante — decisões majoritariamente intuitivas"
    elif total <= 2:
        stage, label = 1, "Em desenvolvimento — começa a estruturar análise"
    elif total <= 3:
        stage, label = 2, "Intermediário — usa modelos, calibração a melhorar"
    elif total <= 4:
        stage, label = 3, "Avançado — processo consistente, vieses mapeados"
    else:
        stage, label = 4, "Expert — calibração estável, referência metodológica"

    priority_improvements = []
    if brier_skill_score <= 0:
        priority_improvements.append("Calibração de probabilidade (Brier Score negativo)")
    if abs(overconfidence_idx) > 0.15:
        priority_improvements.append("Reduzir overconfidence — declare menos certeza nas análises")
    if gambler_fallacy_risk == "alto":
        priority_improvements.append("Independência de eventos — evitar 'perseguição' após sequências")
    if loss_aversion_ratio > 3.5:
        priority_improvements.append("Aversão à perda excessiva — revise critérios de saída de posição")

    return {
        "stage": stage,
        "label": label,
        "score": total,
        "max_score": 6,
        "priority_improvements": priority_improvements,
        "metrics": {
            "brier_skill_score": round(brier_skill_score, 4),
            "overconfidence_idx": round(overconfidence_idx, 4),
            "gambler_fallacy_risk": gambler_fallacy_risk,
            "loss_aversion_ratio": round(loss_aversion_ratio, 2),
            "n_sessions": n_sessions,
        },
        "signal": "positive" if stage >= 3 else ("neutral" if stage >= 2 else "negative"),
        "explanation": (
            f"Perfil de maturidade: Estágio {stage}/4 — {label}. "
            f"Pontuação composta: {total}/6. "
            f"{'Foco de melhoria: ' + '; '.join(priority_improvements) if priority_improvements else 'Manter a consistência do processo analítico.'}"
        ),
    }


# ─── Helper ───────────────────────────────────────────────────────────────────

def _log_comb(n: int, k: int) -> float:
    """log(C(n,k)) via função log-gamma (evita overflow)."""
    return math.lgamma(n + 1) - math.lgamma(k + 1) - math.lgamma(n - k + 1)
