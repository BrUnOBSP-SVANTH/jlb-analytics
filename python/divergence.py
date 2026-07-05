"""
divergence.py — JLB Analytics
O coração do produto: detecção de divergência entre modelos e mercado.

Filosofia:
  O sistema NUNCA recomenda posição. Ele mostra onde o modelo diverge
  do consenso de mercado e EXPLICA os drivers dessa divergência.
  A decisão é sempre do usuário. O sistema fornece o mapa, não o destino.

Crítica de design:
  - "Consenso multi-modelo" simples (média aritmética) é ingênuo quando
    os modelos têm correlações altas e erros similares. Aqui usamos pesos
    inversamente proporcionais ao erro histórico (skill-weighted ensemble).
  - A nota educacional é obrigatória no output — o frontend não pode
    suprimi-la. Esse é o diferencial regulatório e de posicionamento.
"""

from __future__ import annotations
import math
from typing import Sequence
from config import DIVERGENCE, LEVELS


# ─── Divergência principal ────────────────────────────────────────────────────

def compute_divergence(
    model_probability: float,
    market_probability: float,
    model_confidence: float = 0.5,
    context: str = "genérico",
) -> dict:
    """
    Calcula a divergência entre a probabilidade gerada pelo modelo e
    a probabilidade implícita no mercado preditivo.

    model_probability  : P calculado pelos modelos (0–1)
    market_probability : P precificado pelo mercado (0–1)
    model_confidence   : confiança no modelo (0–1), baseada em histórico de Brier
    context            : segmento (economia, esportes, eleições, etc.)

    Divergência = model_probability − market_probability
    Sinal positivo: modelo mais otimista que o mercado
    Sinal negativo: modelo mais pessimista que o mercado
    """
    if not (0 <= model_probability <= 1 and 0 <= market_probability <= 1):
        raise ValueError("Probabilidades devem estar em [0, 1]")

    div = model_probability - market_probability
    abs_div = abs(div)

    # Classificação da divergência
    if abs_div < DIVERGENCE.negligible:
        tier = "negligible"
        signal = "neutral"
        label = "alinhamento com o mercado"
        action_note = "Modelo e mercado concordam. Nenhuma ineficiência detectada."
    elif abs_div < DIVERGENCE.moderate:
        tier = "moderate"
        signal = "neutral"
        label = "divergência leve"
        action_note = "Divergência pequena. Pode refletir dados ainda não precificados — investigue os drivers."
    elif abs_div < DIVERGENCE.strong:
        tier = "strong"
        signal = "positive" if div > 0 else "negative"
        label = "divergência significativa"
        action_note = "O modelo diverge materialmente do mercado. Verifique se há assimetria de informação ou limitação do modelo."
    elif abs_div < DIVERGENCE.extreme:
        tier = "extreme_low"
        signal = "positive" if div > 0 else "negative"
        label = "divergência forte — risco de erro de modelo"
        action_note = "Divergência elevada. Alta probabilidade de que o modelo ou o mercado esteja capturando informação que o outro não tem. Atenção aos inputs do modelo."
    else:
        tier = "extreme"
        signal = "negative"
        label = "divergência extrema — suspeita de erro ou evento de cauda"
        action_note = "Divergência acima de 25 pp raramente é explicada por ineficiência de mercado simples. Provável: evento não modelado, erro de dado, ou manipulação de mercado."

    # Nota educacional obrigatória (NÃO pode ser suprimida pelo frontend)
    educational_note = _educational_note(tier, div, context, model_confidence)

    return {
        "model_probability": round(model_probability, 4),
        "market_probability": round(market_probability, 4),
        "divergence": round(div, 4),
        "divergence_pct": round(div * 100, 2),
        "abs_divergence": round(abs_div, 4),
        "tier": tier,
        "signal": signal,
        "label": label,
        "action_note": action_note,
        "educational_note": educational_note,
        "model_confidence": round(model_confidence, 3),
    }


def skill_weighted_ensemble(
    model_probabilities: dict[str, float],
    model_skill_scores: dict[str, float],
) -> dict:
    """
    Consenso multi-modelo com pesos por Skill Score histórico.

    Peso do modelo i = max(0, SS_i) / Σ max(0, SS_j)
    Modelos com SS ≤ 0 são excluídos do ensemble (piores que referência).

    Crítica ao ensemble ingênuo:
    Média aritmética assume modelos igualmente bons e independentes.
    Se dois modelos ruins têm alta correlação, a média deles é igualmente
    ruim — você não dobra a informação, você repete o mesmo erro.
    """
    if set(model_probabilities.keys()) != set(model_skill_scores.keys()):
        raise ValueError("Modelos em probabilities e skill_scores devem ser os mesmos")

    # Filtra modelos com SS positivo
    valid_models = {
        name: (prob, model_skill_scores[name])
        for name, prob in model_probabilities.items()
        if model_skill_scores[name] > 0
    }

    excluded_models = [name for name in model_probabilities if model_skill_scores.get(name, 0) <= 0]

    if not valid_models:
        # Fallback: média simples com aviso
        avg = sum(model_probabilities.values()) / len(model_probabilities)
        return {
            "ensemble_probability": round(avg, 4),
            "method": "simple_mean_fallback",
            "warning": "Todos os modelos têm Skill Score ≤ 0. Usando média simples como fallback. Resultado de baixa confiança.",
            "excluded_models": [],
            "weights": {name: round(1/len(model_probabilities), 4) for name in model_probabilities},
            "signal": "negative",
        }

    total_skill = sum(ss for _, ss in valid_models.values())
    weights = {name: ss / total_skill for name, (_, ss) in valid_models.items()}
    ensemble = sum(weights[name] * prob for name, (prob, _) in valid_models.items())

    # Dispersão (incerteza do ensemble)
    variance = sum(
        weights[name] * (prob - ensemble) ** 2
        for name, (prob, _) in valid_models.items()
    )
    std = math.sqrt(variance)

    return {
        "ensemble_probability": round(ensemble, 4),
        "ensemble_std": round(std, 4),
        "method": "skill_weighted",
        "weights": {name: round(w, 4) for name, w in weights.items()},
        "excluded_models": excluded_models,
        "n_models_used": len(valid_models),
        "signal": "positive" if std < 0.05 else ("neutral" if std < 0.12 else "negative"),
        "explanation": (
            f"Ensemble de {len(valid_models)} modelo(s) com pesos por Skill Score. "
            f"{'⚠️ ' + str(len(excluded_models)) + ' modelo(s) excluído(s) por SS ≤ 0. ' if excluded_models else ''}"
            f"P_ensemble = {ensemble*100:.1f}% ± {std*100:.1f}% (dispersão entre modelos). "
            "Dispersão alta indica que os modelos discordam — resultado de baixa confiança."
        ),
    }


def filter_by_level(result: dict, user_level: int) -> dict:
    """
    Filtra o output de divergência pelo nível do usuário.

    Nível 1-2: só mostra a divergência em linguagem simples + nota educacional
    Nível 3: adiciona os inputs do modelo e tier
    Nível 4: adiciona análise comportamental do impacto da divergência
    Nível 5: output completo com ensemble e decomposição de drivers
    """
    if user_level < 1 or user_level > 5:
        raise ValueError("Nível deve estar entre 1 e 5")

    filtered = {
        "divergence_pct": result.get("divergence_pct"),
        "signal": result.get("signal"),
        "label": result.get("label"),
        "educational_note": result.get("educational_note"),  # sempre presente
    }

    if user_level >= 3:
        filtered["model_probability"] = result.get("model_probability")
        filtered["market_probability"] = result.get("market_probability")
        filtered["tier"] = result.get("tier")
        filtered["action_note"] = result.get("action_note")

    if user_level >= 4:
        filtered["model_confidence"] = result.get("model_confidence")
        filtered["behavioral_note"] = _behavioral_note_for_divergence(result)

    if user_level >= 5:
        filtered["divergence"] = result.get("divergence")
        filtered["abs_divergence"] = result.get("abs_divergence")

    return filtered


# ─── Notas educacionais por contexto e tier ────────────────────────────────────

def _educational_note(tier: str, div: float, context: str, confidence: float) -> str:
    """
    Gera nota educacional contextualizada. Esta é a função mais importante
    do produto — o que diferencia o sistema de um simples comparador de odds.
    """
    direction = "acima" if div > 0 else "abaixo"
    direction_detail = (
        "o modelo vê mais chances de ocorrência do que o mercado precifica"
        if div > 0
        else "o modelo vê menos chances de ocorrência do que o mercado precifica"
    )

    if tier == "negligible":
        return (
            "O modelo está alinhado com o mercado. Isso pode significar que toda a "
            "informação disponível já está precificada (mercado eficiente) — ou que "
            "ambos estão cometendo o mesmo erro (modelos falham juntos em eventos extremos)."
        )
    elif tier == "moderate":
        return (
            f"O modelo está {abs(div)*100:.1f} pp {direction} do mercado: {direction_detail}. "
            f"Contexto: {context}. "
            "Divergências pequenas são normais — mercados incorporam informação em ritmos diferentes. "
            "Investigue: há dados recentes não capturados pelo modelo? "
            f"Confiança do modelo: {confidence*100:.0f}%."
        )
    elif tier in ("strong", "extreme_low"):
        return (
            f"Divergência significativa: {abs(div)*100:.1f} pp {direction}. "
            f"O modelo sugere que o mercado está {'subestimando' if div > 0 else 'superestimando'} "
            f"a probabilidade do evento. "
            "ATENÇÃO: divergência não é lucro garantido. "
            "O mercado pode ter acesso a informação que o modelo não tem. "
            "Verifique os inputs do modelo e a qualidade das fontes de dados antes de qualquer decisão. "
            f"Confiança do modelo: {confidence*100:.0f}% (baseada em histórico de calibração)."
        )
    else:  # extreme
        return (
            f"Divergência extrema: {abs(div)*100:.1f} pp. "
            "Em nossa experiência histórica, divergências acima de 25 pp raramente representam "
            "oportunidade — geralmente indicam erro de dado, evento não modelado, ou mercado com "
            "baixa liquidez (facilmente manipulável). "
            "NÃO tome decisões baseado apenas neste sinal. "
            "Verifique a fonte dos dados e considere que o modelo pode estar errado."
        )


def _behavioral_note_for_divergence(result: dict) -> str:
    """Nota comportamental específica para o nível 4 — vieses associados à divergência."""
    tier = result.get("tier", "negligible")
    div = result.get("divergence", 0)

    if tier == "negligible":
        return (
            "Mercado e modelo alinhados. Cuidado com o viés de confirmação: "
            "se você esperava ver uma divergência, a ausência dela também é informação."
        )
    elif div > 0:
        return (
            "O modelo está acima do mercado. Monitore o viés de excesso de confiança no modelo: "
            "quando o modelo 'confirma' o que você quer acreditar, a tentação é aceitar sem questionar. "
            "Pergunte: o que o mercado sabe que o modelo não sabe?"
        )
    else:
        return (
            "O modelo está abaixo do mercado. Cuidado com a falácia do apostador: "
            "se houve sequência de eventos similares recentemente, o mercado pode estar ancorando "
            "no passado em vez de avaliar as probabilidades do presente."
        )
