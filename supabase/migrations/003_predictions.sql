-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 003_predictions.sql
-- Tabela de previsões dos usuários para auditoria e backtesting.
--
-- Permite ao usuário registrar uma estimativa de probabilidade para qualquer
-- mercado Polymarket, depois marcar o resultado e calcular o Brier Score.
-- Isso constitui o "track record" auditável mencionado na análise de brechas.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.predictions (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Referência ao mercado externo (Polymarket Gamma API market id)
  market_id         text         NOT NULL,
  market_question   text         NOT NULL,

  -- Probabilidades no momento do registro (0-100 escala percentual)
  market_prob       numeric(5,2) NOT NULL CHECK (market_prob BETWEEN 0 AND 100),
  user_prob         numeric(5,2) NOT NULL CHECK (user_prob BETWEEN 0 AND 100),

  -- Edge e Kelly calculados no momento do salvamento
  -- Armazenados para auditoria — user_prob pode mudar de opinião depois
  edge_at_save      numeric(6,2) GENERATED ALWAYS AS (user_prob - market_prob) STORED,
  kelly_fraction    numeric(6,4),  -- calculado no backend

  -- Resolução
  resolved          boolean      NOT NULL DEFAULT false,
  outcome           boolean,      -- TRUE = YES resolveu, FALSE = NO resolveu
  resolution_price  numeric(5,2), -- preço de liquidação do mercado (0 ou 100)

  -- Métrica de calibração
  -- BS = (outcome_01 - user_prob/100)^2, calculado ao resolver
  brier_score       numeric(8,6) GENERATED ALWAYS AS (
    CASE
      WHEN outcome IS NOT NULL THEN
        POWER(CASE WHEN outcome THEN 1.0 ELSE 0.0 END - (user_prob / 100.0), 2)
      ELSE NULL
    END
  ) STORED,

  -- Timestamps
  created_at        timestamptz  NOT NULL DEFAULT now(),
  resolved_at       timestamptz
);

-- ─── Índices ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS predictions_user_idx     ON public.predictions(user_id);
CREATE INDEX IF NOT EXISTS predictions_market_idx   ON public.predictions(market_id);
CREATE INDEX IF NOT EXISTS predictions_resolved_idx ON public.predictions(user_id, resolved)
  WHERE resolved = true;

-- ─── Row Level Security ───────────────────────────────────────────────────
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "predictions_select_own"
  ON public.predictions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "predictions_insert_own"
  ON public.predictions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "predictions_update_own"
  ON public.predictions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "predictions_delete_own"
  ON public.predictions FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Grants ───────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.predictions TO authenticated;

-- ─── View: calibração por usuário ─────────────────────────────────────────
-- Retorna: mean Brier Score, Skill Score e n de previsões resolvidas.
-- Skill Score = 1 - (mean_brier / 0.25) vs. baseline aleatório
CREATE OR REPLACE VIEW public.user_calibration AS
SELECT
  user_id,
  COUNT(*)                                   AS total_predictions,
  COUNT(*) FILTER (WHERE resolved)           AS resolved_count,
  AVG(brier_score)                           AS mean_brier_score,
  1.0 - (AVG(brier_score) / 0.25)            AS skill_score,
  AVG(user_prob - market_prob)               AS mean_edge
FROM public.predictions
GROUP BY user_id;

GRANT SELECT ON public.user_calibration TO authenticated;
