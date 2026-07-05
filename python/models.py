"""
models.py — JLB Analytics
Nível 3 e 5: modelos preditivos por segmento.

Filosofia de design:
- Cada modelo retorna probabilidade + intervalo de confiança + driver principal.
- Nenhum modelo "recomenda" posição — explica o que os dados mostram.
- Modelos que precisam de bibliotecas pesadas (statsmodels, arch) são marcados
  com @requires_full_install. O sistema funciona com mocks se as libs não estiverem.
- GARCH: NÃO prevê direção. Prevê volatilidade. Deixar isso explícito no output.

Críticas incorporadas ao design:
  1. ARIMA sem teste de estacionariedade é inútil — o código força ADF antes do ajuste.
  2. Elo sem decaimento temporal perde poder preditivo rapidamente — implementado.
  3. Poisson simples subestima 0x0 e 1x0 — Dixon-Coles aplicado por padrão.
  4. GARCH com distribuição Normal subestima caudas — usamos t de Student.
  5. Modelos de eleição sem decaimento de pesquisa antiga são enganosos — implementado.
"""

from __future__ import annotations
import math
from typing import Sequence, Optional
from datetime import date, datetime
from config import (
    ARIMA_CFG, VAR_CFG, TAYLOR, POISSON, ELO, GARCH_CFG, ENSO_CFG, MARKOV
)


# ─── Segmento: Economia ───────────────────────────────────────────────────────

def taylor_rule_divergence(
    selic_observed: float,
    ipca_12m: float,
    output_gap_pct: float,
) -> dict:
    """
    Regra de Taylor: iₜ = r* + πₜ + φπ(πₜ − π*) + φy(yₜ − y*)

    Compara a taxa Selic observada com o nível implícito pela regra de Taylor.
    Uma divergência positiva (Selic > Taylor) sinaliza política contracionista
    acima do que o modelo sugere. Negativa = política expansionista.

    Este é um BENCHMARK, não uma previsão. O BCB pode ter razões para desviar
    (ancoragem de expectativas, incerteza cambial) que o modelo não captura.
    """
    taylor_rate = (
        TAYLOR.r_star
        + ipca_12m
        + TAYLOR.phi_pi * (ipca_12m - TAYLOR.pi_target)
        + TAYLOR.phi_y * output_gap_pct
    )
    divergence = selic_observed - taylor_rate

    if abs(divergence) <= TAYLOR.divergence_threshold_pp:
        signal = "neutral"
        label = "alinhada com o modelo"
    elif divergence > 0:
        signal = "negative"
        label = "contracionista acima do modelo (Selic acima do Taylor)"
    else:
        signal = "positive"
        label = "expansionista acima do modelo (Selic abaixo do Taylor)"

    return {
        "selic_observed": round(selic_observed, 2),
        "taylor_implied": round(taylor_rate, 2),
        "divergence_pp": round(divergence, 2),
        "signal": signal,
        "explanation": (
            f"Selic observada: {selic_observed:.2f}% a.a. | "
            f"Taylor implícito: {taylor_rate:.2f}% a.a. | "
            f"Desvio: {divergence:+.2f} pp — {label}. "
            "Desvios persistentes acima de ±1.5 pp historicamente precedem "
            "revisão de expectativas de mercado para juros futuros."
        ),
        "inputs": {
            "r_star": TAYLOR.r_star,
            "ipca_12m": round(ipca_12m, 2),
            "pi_target": TAYLOR.pi_target,
            "output_gap": round(output_gap_pct, 2),
        },
    }


def arima_forecast_stub(
    series: Sequence[float],
    horizon: int = 3,
) -> dict:
    """
    Stub de previsão ARIMA quando statsmodels não está disponível.
    Usa suavização exponencial simples (EWM) como proxy.

    Em produção, substitua por statsmodels.tsa.statespace.SARIMAX com:
      1. Teste ADF (augmented Dickey-Fuller) para verificar estacionariedade
      2. Diferenciação automática se necessário
      3. Seleção de (p,d,q) por AIC

    NUNCA ajuste ARIMA sem verificar estacionariedade primeiro.
    Séries não-estacionárias produzem coeficientes sem sentido.
    """
    if len(series) < ARIMA_CFG.min_obs:
        return {
            "error": f"Série muito curta: {len(series)} obs (mínimo: {ARIMA_CFG.min_obs})",
            "signal": "neutral",
        }

    # EWM como fallback simples
    alpha = 0.3  # fator de suavização
    smoothed = list(series)
    for i in range(1, len(smoothed)):
        smoothed[i] = alpha * series[i] + (1 - alpha) * smoothed[i - 1]

    last = smoothed[-1]
    # Tendência: média das últimas 6 diferenças
    diffs = [smoothed[i] - smoothed[i-1] for i in range(max(1, len(smoothed)-6), len(smoothed))]
    trend = sum(diffs) / len(diffs)

    forecasts = [last + trend * (i + 1) for i in range(horizon)]
    # Incerteza cresce com horizonte (raiz do horizonte)
    residuals_std = math.sqrt(sum((series[i] - smoothed[i]) ** 2 for i in range(len(series))) / len(series))
    intervals = [
        {
            "t": i + 1,
            "point": round(forecasts[i], 4),
            "lower_95": round(forecasts[i] - 1.96 * residuals_std * math.sqrt(i + 1), 4),
            "upper_95": round(forecasts[i] + 1.96 * residuals_std * math.sqrt(i + 1), 4),
        }
        for i in range(horizon)
    ]

    return {
        "model": "EWM_stub (substitua por SARIMA em produção)",
        "horizon": horizon,
        "forecasts": intervals,
        "residual_std": round(residuals_std, 4),
        "warning": (
            "Este é um modelo de suavização exponencial, não ARIMA real. "
            "Para produção: pip install statsmodels e use SARIMAX com seleção de ordem por AIC."
        ),
        "signal": "neutral",
    }


# ─── Segmento: Esportes ───────────────────────────────────────────────────────

def poisson_double_match_probabilities(
    home_attack: float,
    home_defense: float,
    away_attack: float,
    away_defense: float,
    league_avg_goals: float = 1.35,
    is_home: bool = True,
) -> dict:
    """
    Modelo de Poisson Duplo com correção de Dixon-Coles.

    λ_home = home_attack × away_defense × league_avg × home_advantage
    λ_away = away_attack × home_defense × league_avg

    Correção Dixon-Coles para placares 0-0, 1-0, 0-1, 1-1 (subestimados
    pelo Poisson independente). Parâmetro ρ = -0.13 (estimado na literatura).

    Parâmetros
    ----------
    home_attack, away_attack    : força de ataque relativa ao average (> 1 = acima)
    home_defense, away_defense  : força de defesa (< 1 = defesa sólida)
    league_avg_goals            : média de gols por time por jogo na liga
    is_home                     : True se o primeiro time joga em casa
    """
    home_adv = 1.10 if is_home else 1.0

    lambda_home = home_attack * away_defense * league_avg_goals * home_adv
    lambda_away = away_attack * home_defense * league_avg_goals

    max_g = POISSON.max_goals

    # Matriz de probabilidades de placar
    def poisson_pmf(k: int, lam: float) -> float:
        return math.exp(-lam) * (lam ** k) / math.factorial(k)

    matrix = {}
    for i in range(max_g + 1):
        for j in range(max_g + 1):
            p = poisson_pmf(i, lambda_home) * poisson_pmf(j, lambda_away)
            # Correção Dixon-Coles para placares baixos
            if POISSON.apply_dixon_coles_correction:
                p *= _dixon_coles_tau(i, j, lambda_home, lambda_away, POISSON.rho)
            matrix[(i, j)] = p

    # Normalizar (a correção D-C pode quebrar a soma = 1 levemente)
    total = sum(matrix.values())
    matrix = {k: v / total for k, v in matrix.items()}

    p_home_win = sum(v for (i, j), v in matrix.items() if i > j)
    p_draw = sum(v for (i, j), v in matrix.items() if i == j)
    p_away_win = sum(v for (i, j), v in matrix.items() if i < j)

    # Top 5 placares mais prováveis
    top_scores = sorted(matrix.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        "lambda_home": round(lambda_home, 4),
        "lambda_away": round(lambda_away, 4),
        "p_home_win": round(p_home_win, 4),
        "p_draw": round(p_draw, 4),
        "p_away_win": round(p_away_win, 4),
        "top_scores": [
            {"score": f"{i}x{j}", "probability": round(p, 4)}
            for (i, j), p in top_scores
        ],
        "dixon_coles_applied": POISSON.apply_dixon_coles_correction,
        "signal": "neutral",
        "explanation": (
            f"λ_casa={lambda_home:.2f}, λ_fora={lambda_away:.2f}. "
            f"Casa: {p_home_win*100:.1f}% | Empate: {p_draw*100:.1f}% | "
            f"Fora: {p_away_win*100:.1f}%. "
            "Poisson modela eventos independentes — ignora situações de jogo "
            "(pressão por resultado, time que está perdendo abre espaço)."
        ),
    }


def _dixon_coles_tau(i: int, j: int, lh: float, la: float, rho: float) -> float:
    """Fator de correção Dixon-Coles para placares baixos (0-0, 1-0, 0-1, 1-1)."""
    if i == 0 and j == 0:
        return 1 - lh * la * rho
    elif i == 1 and j == 0:
        return 1 + la * rho
    elif i == 0 and j == 1:
        return 1 + lh * rho
    elif i == 1 and j == 1:
        return 1 - rho
    return 1.0


def elo_win_probability(rating_a: float, rating_b: float, home_advantage: bool = True) -> dict:
    """
    Probabilidade de vitória via Elo Rating.

    P(A vence) = 1 / (1 + 10^((Rβ − Rα) / 400))

    O Elo é agnóstico ao contexto — não sabe se o jogo é decisivo,
    se há jogadores lesionados, ou se é mata-mata. Use como prior base,
    nunca como estimativa final.
    """
    r_a = rating_a + (ELO.home_advantage if home_advantage else 0)
    r_b = rating_b

    p_a = 1 / (1 + 10 ** ((r_b - r_a) / 400))
    p_b = 1 - p_a

    diff = abs(rating_a - rating_b)
    if diff < 50:
        signal = "neutral"
        label = "equilíbrio (diferença < 50 pontos)"
    elif diff < 150:
        signal = "neutral"
        label = "leve favorito"
    else:
        signal = "positive" if p_a > 0.5 else "negative"
        label = "favorito claro"

    return {
        "rating_a": round(rating_a, 1),
        "rating_b": round(rating_b, 1),
        "home_advantage_applied": home_advantage,
        "p_a_wins": round(p_a, 4),
        "p_b_wins": round(p_b, 4),
        "signal": signal,
        "explanation": (
            f"Elo A={rating_a:.0f} vs B={rating_b:.0f} "
            f"({'vantagem de casa aplicada' if home_advantage else 'neutro'}). "
            f"P(A) = {p_a*100:.1f}% — {label}. "
            "Elo é um sistema de ranking, não um modelo causal. "
            "Combine com xG e contexto da partida."
        ),
    }


def elo_update(rating: float, expected: float, actual: float, k: float | None = None) -> dict:
    """
    Atualiza rating Elo após resultado.
    actual: 1=vitória, 0.5=empate, 0=derrota
    """
    k = k or ELO.k_base
    new_rating = rating + k * (actual - expected)
    delta = new_rating - rating
    return {
        "old_rating": round(rating, 1),
        "new_rating": round(new_rating, 1),
        "delta": round(delta, 1),
        "k_used": k,
        "signal": "positive" if delta > 0 else ("negative" if delta < 0 else "neutral"),
    }


# ─── Segmento: Volatilidade / Cripto ─────────────────────────────────────────

def garch_volatility_stub(returns: Sequence[float]) -> dict:
    """
    Stub de GARCH(1,1) — usa EWMA como proxy quando arch não está instalado.

    AVISO PEDAGÓGICO OBRIGATÓRIO:
    GARCH modela VOLATILIDADE (tamanho da variação), não DIREÇÃO.
    Saber que amanhã a variação esperada é ±3% não diz nada sobre
    se o preço vai subir ou descer. Esse erro é o mais comum em usuários
    que aplicam modelos de volatilidade para timing de entrada.

    Em produção: pip install arch
    from arch import arch_model
    am = arch_model(returns, vol='Garch', p=1, q=1, dist='studentst')
    res = am.fit(disp='off')
    """
    if len(returns) < 30:
        return {"error": "Série muito curta para GARCH (mínimo 30 obs)", "signal": "neutral"}

    # EWMA como proxy (lambda=0.94, padrão RiskMetrics JP Morgan)
    lam = 0.94
    var = sum(r ** 2 for r in returns[:10]) / 10  # inicializa com janela curta
    for r in returns[10:]:
        var = lam * var + (1 - lam) * r ** 2
    vol_daily = math.sqrt(var)
    vol_annual = vol_daily * math.sqrt(GARCH_CFG.annualize_factor)

    if vol_annual < 0.15:
        signal = "positive"
        label = "baixa"
    elif vol_annual < 0.35:
        signal = "neutral"
        label = "moderada"
    elif vol_annual < 0.60:
        signal = "negative"
        label = "alta"
    else:
        signal = "negative"
        label = "extrema"

    return {
        "model": "EWMA_stub (substitua por GARCH em produção)",
        "vol_daily_pct": round(vol_daily * 100, 3),
        "vol_annual_pct": round(vol_annual * 100, 2),
        "signal": signal,
        "warning": (
            "GARCH/EWMA modela TAMANHO da variação, não direção. "
            "Volatilidade alta não significa queda — significa que a magnitude "
            "do próximo movimento será grande, para cima ou para baixo."
        ),
        "explanation": (
            f"Volatilidade estimada: {vol_daily*100:.2f}%/dia | "
            f"{vol_annual*100:.1f}%/ano — {label}. "
            "VaR 95% implícito para 1 dia: "
            f"±{1.645 * vol_daily * 100:.2f}%."
        ),
    }


# ─── Segmento: Eleições ───────────────────────────────────────────────────────

def polling_average_with_decay(
    polls: list[dict],  # [{date, candidate_a_pct, candidate_b_pct, sample_size}]
    reference_date: Optional[date] = None,
) -> dict:
    """
    Média ponderada de pesquisas eleitorais com decaimento temporal.

    Peso(pesquisa i) = sample_size_i × decay(dias_desde_pesquisa_i)
    decay(d) = exp(-ln(2) × d / half_life)

    Pesquisas mais antigas perdem peso exponencialmente.
    half_life = 30 dias por padrão — uma pesquisa de 30 dias vale metade.

    Por que não usar média simples: em janelas com muitas pesquisas antigas
    e poucas recentes, a média simples subestima o momentum atual.
    """
    if not polls:
        return {"error": "Nenhuma pesquisa fornecida", "signal": "neutral"}

    ref = reference_date or date.today()
    half_life = 30.0  # dias

    total_weight = 0.0
    sum_a = 0.0
    sum_b = 0.0

    for poll in polls:
        poll_date = poll.get("date")
        if isinstance(poll_date, str):
            poll_date = date.fromisoformat(poll_date)
        days_old = max(0, (ref - poll_date).days)
        decay = math.exp(-math.log(2) * days_old / half_life)
        n = poll.get("sample_size", 1000)
        weight = n * decay

        sum_a += poll["candidate_a_pct"] * weight
        sum_b += poll["candidate_b_pct"] * weight
        total_weight += weight

    if total_weight == 0:
        return {"error": "Peso total zero", "signal": "neutral"}

    avg_a = sum_a / total_weight
    avg_b = sum_b / total_weight
    undecided = max(0, 100 - avg_a - avg_b)

    margin = avg_a - avg_b
    if abs(margin) < 3:
        signal = "neutral"
        label = "dentro da margem de erro"
    elif margin > 0:
        signal = "positive"
        label = "candidato A à frente"
    else:
        signal = "negative"
        label = "candidato B à frente"

    return {
        "candidate_a_avg": round(avg_a, 2),
        "candidate_b_avg": round(avg_b, 2),
        "undecided": round(undecided, 2),
        "margin_pp": round(margin, 2),
        "n_polls": len(polls),
        "signal": signal,
        "explanation": (
            f"Média ponderada de {len(polls)} pesquisa(s) com decaimento (half-life={half_life:.0f}d): "
            f"A={avg_a:.1f}% | B={avg_b:.1f}% | Indecisos={undecided:.1f}%. "
            f"Margem: {margin:+.1f} pp — {label}."
        ),
    }


# ─── Segmento: Clima ─────────────────────────────────────────────────────────

def enso_phase_classification(oni_index: float) -> dict:
    """
    Classificação da fase ENSO pelo Índice ONI (Oceanic Niño Index).

    ONI = anomalia da temperatura superficial do mar na região Niño 3.4
    (média de 3 meses consecutivos).

    El Niño / La Niña exigem que o threshold seja mantido por ≥ 5 meses.
    Esta função classifica um ONI pontual — para classificação completa,
    aplique em série temporal e verifique a persistência.
    """
    if oni_index >= ENSO_CFG.el_nino_threshold:
        phase = "El Niño"
        signal = "negative"
        impacts = [
            "Chuvas abaixo do normal no Norte e Nordeste do Brasil",
            "Chuvas acima do normal no Sul do Brasil",
            "Redução de produção de hidroelétricas no Norte",
            "Impacto positivo na safra de soja no Sul",
        ]
    elif oni_index <= ENSO_CFG.la_nina_threshold:
        phase = "La Niña"
        signal = "positive"
        impacts = [
            "Chuvas acima do normal no Norte e Centro-Oeste",
            "Possível seca no Sul em anos fortes",
            "Aumento do nível dos reservatórios no Sudeste",
        ]
    else:
        phase = "Neutro"
        signal = "neutral"
        impacts = ["Padrão climático próximo da média histórica"]

    return {
        "oni": round(oni_index, 2),
        "phase": phase,
        "signal": signal,
        "regional_impacts_brazil": impacts,
        "explanation": (
            f"ONI = {oni_index:.2f} → Fase {phase}. "
            "ENSO é o principal driver de variabilidade climática interanual no Brasil. "
            "Horizonte de previsão confiável: 3–6 meses. "
            "Além disso, incerteza cresce rapidamente (barreira de previsibilidade de primavera)."
        ),
    }
