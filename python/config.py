"""
config.py — JLB Analytics
Fonte única de verdade para todos os parâmetros do sistema.
Nenhum valor numérico hardcoded fora deste arquivo.

Princípio: se um threshold muda, muda aqui e reflete em todo o sistema.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Final

# ─── Versão do modelo ─────────────────────────────────────────────────────────
MODEL_VERSION: Final = "1.0.0"


# ─── Parâmetros de Kahneman-Tversky (Prospect Theory) ────────────────────────
# α e β: curvatura da função de valor (sensibilidade decrescente)
# λ: coeficiente de aversão à perda
# δ e γ: distorção de probabilidade
# Fonte: Kahneman & Tversky (1992), "Advances in Prospect Theory"
@dataclass(frozen=True)
class ProspectTheoryParams:
    alpha: float = 0.88    # curvatura no domínio de ganhos
    beta: float = 0.88     # curvatura no domínio de perdas
    lam: float = 2.25      # lambda — aversão à perda (λ > 1 = perda pesa mais)
    delta: float = 0.69    # distorção de probabilidade (ganhos)
    gamma: float = 0.61    # distorção de probabilidade (perdas)


# ─── Parâmetros de divergência modelo vs. mercado ─────────────────────────────
@dataclass(frozen=True)
class DivergenceThresholds:
    # Divergência abaixo deste valor: mercado e modelo estão de acordo
    negligible: float = 0.03      # 3 pp
    # Divergência moderada: vale investigar os drivers
    moderate: float = 0.08        # 8 pp
    # Divergência forte: sinal educacional de ineficiência do mercado
    strong: float = 0.15          # 15 pp
    # Divergência extrema: provável ruído ou evento de cauda não modelado
    extreme: float = 0.25         # 25 pp


# ─── Parâmetros de calibração (Brier Score) ───────────────────────────────────
@dataclass(frozen=True)
class CalibrationParams:
    # Baseline de referência: preditor constante p=0.5 para eventos binários
    # Brier Score da referência = 0.25 (máximo para p ∈ {0,1})
    reference_brier: float = 0.25
    # Número mínimo de previsões para Skill Score ser considerado estável
    min_n_stable: int = 30
    # Janela de decaimento temporal para pesos de calibração (dias)
    decay_halflife_days: float = 30.0


# ─── ARIMA / SARIMA ───────────────────────────────────────────────────────────
@dataclass(frozen=True)
class ArimaConfig:
    # Ordens máximas para seleção automática via AIC
    max_p: int = 5
    max_d: int = 2
    max_q: int = 5
    # Número de passos à frente para previsão
    forecast_horizon: int = 12
    # Nível de confiança para intervalo de predição
    confidence_level: float = 0.95
    # Número mínimo de observações para ajuste confiável
    min_obs: int = 36


# ─── VAR (Vetores Autorregressivos) ───────────────────────────────────────────
@dataclass(frozen=True)
class VarConfig:
    max_lags: int = 8
    ic: str = "aic"           # critério de seleção de lag: 'aic' ou 'bic'
    forecast_horizon: int = 4  # trimestres à frente
    min_obs: int = 40


# ─── Regra de Taylor ─────────────────────────────────────────────────────────
# iₜ = r* + πₜ + 0.5(πₜ − π*) + 0.5(yₜ − y*)
@dataclass(frozen=True)
class TaylorRuleParams:
    r_star: float = 2.0          # taxa real de equilíbrio estimada (% a.a.)
    pi_target: float = 3.0       # meta de inflação do Banco Central (% a.a.)
    phi_pi: float = 0.5          # peso no desvio de inflação
    phi_y: float = 0.5           # peso no hiato do produto
    # Quando |Selic observada − Taylor implícita| > este valor, sinaliza
    divergence_threshold_pp: float = 1.5


# ─── Poisson duplo (Dixon-Coles) ─────────────────────────────────────────────
@dataclass(frozen=True)
class PoissonConfig:
    # Fator de decaimento exponencial para jogos mais antigos
    # Peso do jogo i = exp(-xi * dias_desde_jogo_i)
    # xi = ln(2) / half_life → jogos com half_life dias pesam 50%
    time_decay_halflife_days: float = 45.0
    # Número mínimo de jogos por time para ajuste confiável
    min_games: int = 10
    # Correção Dixon-Coles para placares baixos (0-0, 1-0, 0-1, 1-1)
    apply_dixon_coles_correction: bool = True
    rho: float = -0.13  # parâmetro de correlação D-C (estimado na literatura)
    # Máximo de gols modelados por distribuição de Poisson
    max_goals: int = 10


# ─── Elo Rating ───────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class EloConfig:
    # K-factor base: sensibilidade do rating às atualizações
    k_base: float = 32.0
    # Rating inicial para times sem histórico
    initial_rating: float = 1500.0
    # Fator de home advantage em pontos de Elo
    home_advantage: float = 65.0
    # Multiplicador K para jogos de campeonato (mais importantes)
    tournament_k_multiplier: float = 1.5


# ─── GARCH(1,1) ───────────────────────────────────────────────────────────────
# AVISO: GARCH modela volatilidade (tamanho), NÃO direção de preço.
# Usar para comunicar risco, não para prever retorno.
@dataclass(frozen=True)
class GarchConfig:
    p: int = 1
    q: int = 1
    dist: str = "studentst"    # t de Student captura caudas pesadas melhor que Normal
    forecast_horizon: int = 5  # dias à frente
    annualize_factor: int = 252  # dias úteis/ano


# ─── ENSO / Teleconexões climáticas ───────────────────────────────────────────
@dataclass(frozen=True)
class EnsoConfig:
    # Índice ONI (Oceanic Niño Index): média 3 meses SST anomalia na região Niño 3.4
    el_nino_threshold: float = 0.5    # ONI ≥ +0.5 por 5 meses = El Niño
    la_nina_threshold: float = -0.5   # ONI ≤ -0.5 por 5 meses = La Niña
    neutral_band: float = 0.4         # |ONI| < 0.4 = neutro seguro


# ─── Detecção de viral (Z-score sobre resíduo STL) ────────────────────────────
@dataclass(frozen=True)
class ViralDetectionConfig:
    # Z-score do resíduo após decomposição STL
    # z > threshold → pico anômalo de menções
    z_threshold: float = 3.0
    # Janela de suavização do resíduo (horas) para reduzir falsos positivos
    smoothing_window_hours: int = 6


# ─── Markov (transições eleitorais) ───────────────────────────────────────────
@dataclass(frozen=True)
class MarkovConfig:
    # Estados do eleitorado: 0=oposição, 1=indeciso, 2=governo
    n_states: int = 3
    # Número mínimo de ciclos eleitorais para matriz de transição estável
    min_cycles: int = 3


# ─── Níveis de usuário e acesso ───────────────────────────────────────────────
@dataclass(frozen=True)
class LevelConfig:
    free_max_level: int = 2     # usuário free chega até nível 2
    premium_max_level: int = 5  # premium tem acesso completo

    # Confiança mínima no quiz para desbloquear o próximo nível
    min_quiz_score: float = 0.70  # 70% de acerto


# ─── Instâncias globais (singleton por módulo) ────────────────────────────────
PROSPECT   = ProspectTheoryParams()
DIVERGENCE = DivergenceThresholds()
CALIBRATION = CalibrationParams()
ARIMA_CFG  = ArimaConfig()
VAR_CFG    = VarConfig()
TAYLOR     = TaylorRuleParams()
POISSON    = PoissonConfig()
ELO        = EloConfig()
GARCH_CFG  = GarchConfig()
ENSO_CFG   = EnsoConfig()
VIRAL      = ViralDetectionConfig()
MARKOV     = MarkovConfig()
LEVELS     = LevelConfig()
