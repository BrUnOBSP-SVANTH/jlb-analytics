"""
pipeline.py — JLB Analytics
FastAPI: orquestrador principal e API REST.

Estrutura:
  GET  /health                    — status do serviço
  POST /api/level1/ev             — Valor Esperado
  POST /api/level1/house-edge     — Margem da casa
  POST /api/level1/bayes          — Atualização Bayesiana
  POST /api/level2/zscore         — Z-score
  POST /api/level2/confidence-interval — IC
  POST /api/level2/correlation    — Pearson
  POST /api/level3/taylor-rule    — Regra de Taylor
  POST /api/level3/arima          — Previsão ARIMA (stub)
  POST /api/level3/poisson        — Poisson duplo (futebol)
  POST /api/level3/elo            — Elo Rating
  POST /api/level3/garch          — GARCH volatilidade
  POST /api/level3/enso           — Fase ENSO
  POST /api/level3/polling        — Pesquisas eleitorais
  POST /api/level4/prospect       — Prospect Theory
  POST /api/level4/brier          — Brier Score + Skill Score
  POST /api/level4/gambler        — Diagnóstico falácia do jogador
  POST /api/level4/overconfidence — Índice de overconfidence
  POST /api/level4/maturity       — Perfil de maturidade
  POST /api/level5/divergence     — Divergência modelo vs. mercado
  POST /api/level5/ensemble       — Ensemble multi-modelo

Autenticação: header X-User-Level (1–5) validado pelo Express antes do proxy.
O FastAPI CONFIA no nível enviado pelo Express — não valida token Supabase aqui.
"""

from __future__ import annotations
import os
import time
from typing import Annotated
from datetime import date

try:
    from fastapi import FastAPI, HTTPException, Header, Depends
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field, field_validator
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    raise ImportError(
        "FastAPI não instalado. Execute: pip install fastapi uvicorn pydantic"
    )

import statistics as stats_module
import models as models_module
import behavioral as behavioral_module
import divergence as divergence_module
from config import LEVELS, MODEL_VERSION

# ─── App ─────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="JLB Analytics — Python Models API",
    version=MODEL_VERSION,
    docs_url="/docs",
    redoc_url=None,
)

# CORS: aceita apenas do Express local em produção
_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# ─── Dependência de nível ─────────────────────────────────────────────────────

def require_level(min_level: int):
    def dependency(x_user_level: Annotated[int | None, Header(alias="X-User-Level")] = None):
        level = x_user_level or 1
        if level < min_level:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "level_required",
                    "message": f"Este recurso requer nível {min_level}. Seu nível atual: {level}.",
                    "required": min_level,
                    "current": level,
                },
            )
        return level
    return dependency


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": MODEL_VERSION,
        "timestamp": time.time(),
        "free_max_level": LEVELS.free_max_level,
        "premium_max_level": LEVELS.premium_max_level,
    }


# ─── Schemas de Input ─────────────────────────────────────────────────────────

class EVInput(BaseModel):
    outcomes: list[float] = Field(..., min_length=2, max_length=20)
    probabilities: list[float] = Field(..., min_length=2, max_length=20)

class HouseEdgeInput(BaseModel):
    decimal_odds: list[float] = Field(..., min_length=2, max_length=20)

    @field_validator("decimal_odds")
    @classmethod
    def odds_must_be_above_one(cls, v):
        if any(o <= 1.0 for o in v):
            raise ValueError("Odds decimais devem ser > 1.0")
        return v

class BayesInput(BaseModel):
    prior: float = Field(..., gt=0, lt=1)
    likelihood_given_true: float = Field(..., ge=0, le=1)
    likelihood_given_false: float = Field(..., ge=0, le=1)

class ZScoreInput(BaseModel):
    value: float
    mean: float
    std: float = Field(..., gt=0)

class CIInput(BaseModel):
    mean: float
    std: float = Field(..., gt=0)
    n: int = Field(..., ge=2)
    level: float = Field(0.95, gt=0, lt=1)

class CorrelationInput(BaseModel):
    x: list[float] = Field(..., min_length=4)
    y: list[float] = Field(..., min_length=4)

class TaylorInput(BaseModel):
    selic_observed: float = Field(..., ge=0, le=50)
    ipca_12m: float = Field(..., ge=-5, le=50)
    output_gap_pct: float = Field(..., ge=-20, le=20)

class ArimaInput(BaseModel):
    series: list[float] = Field(..., min_length=10)
    horizon: int = Field(3, ge=1, le=24)

class PoissonInput(BaseModel):
    home_attack: float = Field(..., gt=0)
    home_defense: float = Field(..., gt=0)
    away_attack: float = Field(..., gt=0)
    away_defense: float = Field(..., gt=0)
    league_avg_goals: float = Field(1.35, gt=0)
    is_home: bool = True

class EloInput(BaseModel):
    rating_a: float = Field(..., ge=0)
    rating_b: float = Field(..., ge=0)
    home_advantage: bool = True

class GarchInput(BaseModel):
    returns: list[float] = Field(..., min_length=30)

class EnsoInput(BaseModel):
    oni_index: float = Field(..., ge=-3, le=3)

class PollInput(BaseModel):
    date: str  # ISO format YYYY-MM-DD
    candidate_a_pct: float = Field(..., ge=0, le=100)
    candidate_b_pct: float = Field(..., ge=0, le=100)
    sample_size: int = Field(1000, ge=100)

class PollingInput(BaseModel):
    polls: list[PollInput] = Field(..., min_length=1)

class ProspectInput(BaseModel):
    outcomes: list[float] = Field(..., min_length=2)
    probabilities: list[float] = Field(..., min_length=2)

class BrierInput(BaseModel):
    forecasts: list[float] = Field(..., min_length=5)
    outcomes: list[int] = Field(..., min_length=5)

class GamblerInput(BaseModel):
    sequence: list[int] = Field(..., min_length=4)

class OverconfidenceInput(BaseModel):
    stated_confidences: list[float] = Field(..., min_length=5)
    correct: list[int] = Field(..., min_length=5)

class MaturityInput(BaseModel):
    brier_skill_score: float
    overconfidence_idx: float
    gambler_fallacy_risk: str = Field(..., pattern="^(baixo|moderado|alto)$")
    n_sessions: int = Field(..., ge=0)
    loss_aversion_ratio: float = Field(..., gt=0)

class DivergenceInput(BaseModel):
    model_probability: float = Field(..., ge=0, le=1)
    market_probability: float = Field(..., ge=0, le=1)
    model_confidence: float = Field(0.5, ge=0, le=1)
    context: str = Field("genérico", max_length=50)

class EnsembleInput(BaseModel):
    model_probabilities: dict[str, float]
    model_skill_scores: dict[str, float]


# ─── Endpoints Nível 1 ────────────────────────────────────────────────────────

@app.post("/api/level1/ev")
def endpoint_ev(body: EVInput, level: int = Depends(require_level(1))):
    try:
        return stats_module.expected_value(body.outcomes, body.probabilities)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/level1/house-edge")
def endpoint_house_edge(body: HouseEdgeInput, level: int = Depends(require_level(1))):
    try:
        return stats_module.house_edge(body.decimal_odds)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/level1/bayes")
def endpoint_bayes(body: BayesInput, level: int = Depends(require_level(1))):
    try:
        return stats_module.bayesian_update(
            body.prior, body.likelihood_given_true, body.likelihood_given_false
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


# ─── Endpoints Nível 2 ────────────────────────────────────────────────────────

@app.post("/api/level2/zscore")
def endpoint_zscore(body: ZScoreInput, level: int = Depends(require_level(2))):
    try:
        return stats_module.z_score(body.value, body.mean, body.std)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/level2/confidence-interval")
def endpoint_ci(body: CIInput, level: int = Depends(require_level(2))):
    try:
        return stats_module.confidence_interval(body.mean, body.std, body.n, body.level)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/level2/correlation")
def endpoint_correlation(body: CorrelationInput, level: int = Depends(require_level(2))):
    try:
        return stats_module.pearson_correlation(body.x, body.y)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


# ─── Endpoints Nível 3 ────────────────────────────────────────────────────────

@app.post("/api/level3/taylor-rule")
def endpoint_taylor(body: TaylorInput, level: int = Depends(require_level(3))):
    return models_module.taylor_rule_divergence(
        body.selic_observed, body.ipca_12m, body.output_gap_pct
    )

@app.post("/api/level3/arima")
def endpoint_arima(body: ArimaInput, level: int = Depends(require_level(3))):
    return models_module.arima_forecast_stub(body.series, body.horizon)

@app.post("/api/level3/poisson")
def endpoint_poisson(body: PoissonInput, level: int = Depends(require_level(3))):
    return models_module.poisson_double_match_probabilities(
        body.home_attack, body.home_defense,
        body.away_attack, body.away_defense,
        body.league_avg_goals, body.is_home,
    )

@app.post("/api/level3/elo")
def endpoint_elo(body: EloInput, level: int = Depends(require_level(3))):
    return models_module.elo_win_probability(body.rating_a, body.rating_b, body.home_advantage)

@app.post("/api/level3/garch")
def endpoint_garch(body: GarchInput, level: int = Depends(require_level(3))):
    return models_module.garch_volatility_stub(body.returns)

@app.post("/api/level3/enso")
def endpoint_enso(body: EnsoInput, level: int = Depends(require_level(3))):
    return models_module.enso_phase_classification(body.oni_index)

@app.post("/api/level3/polling")
def endpoint_polling(body: PollingInput, level: int = Depends(require_level(3))):
    polls = [p.model_dump() for p in body.polls]
    for p in polls:
        p["date"] = date.fromisoformat(p["date"])
    try:
        return models_module.polling_average_with_decay(polls)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


# ─── Endpoints Nível 4 ────────────────────────────────────────────────────────

@app.post("/api/level4/prospect")
def endpoint_prospect(body: ProspectInput, level: int = Depends(require_level(4))):
    try:
        return behavioral_module.prospect_theory_value(body.outcomes, body.probabilities)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/level4/brier")
def endpoint_brier(body: BrierInput, level: int = Depends(require_level(4))):
    try:
        return behavioral_module.brier_score_and_skill(body.forecasts, body.outcomes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/level4/gambler")
def endpoint_gambler(body: GamblerInput, level: int = Depends(require_level(4))):
    try:
        return behavioral_module.gambler_fallacy_diagnosis(body.sequence)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/level4/overconfidence")
def endpoint_overconfidence(body: OverconfidenceInput, level: int = Depends(require_level(4))):
    try:
        return behavioral_module.overconfidence_index(body.stated_confidences, body.correct)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/level4/maturity")
def endpoint_maturity(body: MaturityInput, level: int = Depends(require_level(4))):
    return behavioral_module.user_maturity_profile(
        body.brier_skill_score, body.overconfidence_idx,
        body.gambler_fallacy_risk, body.n_sessions, body.loss_aversion_ratio,
    )


# ─── Endpoints Nível 5 ────────────────────────────────────────────────────────

@app.post("/api/level5/divergence")
def endpoint_divergence(body: DivergenceInput, level: int = Depends(require_level(5))):
    try:
        result = divergence_module.compute_divergence(
            body.model_probability, body.market_probability,
            body.model_confidence, body.context,
        )
        return divergence_module.filter_by_level(result, level)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/level5/ensemble")
def endpoint_ensemble(body: EnsembleInput, level: int = Depends(require_level(5))):
    try:
        return divergence_module.skill_weighted_ensemble(
            body.model_probabilities, body.model_skill_scores
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


# ─── Entrypoint ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    try:
        import uvicorn
        port = int(os.environ.get("PYTHON_API_PORT", 8000))
        uvicorn.run("pipeline:app", host="0.0.0.0", port=port, reload=True)
    except ImportError:
        raise ImportError("Execute: pip install uvicorn")
