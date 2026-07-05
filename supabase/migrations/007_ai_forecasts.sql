-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 007_ai_forecasts.sql
-- Log das previsões (fair value) que a IA gera ao analisar mercados.
-- Alimenta o Track Record da IA e a view "Onde a JLB discorda".
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_forecasts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id     text NOT NULL,
  source        text NOT NULL,
  title         text NOT NULL,
  category      text,
  market_prob   numeric NOT NULL CHECK (market_prob >= 0 AND market_prob <= 100),
  ai_fair_value numeric NOT NULL CHECK (ai_fair_value >= 0 AND ai_fair_value <= 100),
  edge_pp       numeric GENERATED ALWAYS AS (ai_fair_value - market_prob) STORED,
  confidence    text DEFAULT 'media',
  created_at    timestamptz NOT NULL DEFAULT now(),
  forecast_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  resolved      boolean NOT NULL DEFAULT false,
  outcome       boolean,
  brier         numeric GENERATED ALWAYS AS (
                  CASE WHEN outcome IS NOT NULL
                    THEN power((CASE WHEN outcome THEN 1.0 ELSE 0.0 END) - (ai_fair_value / 100.0), 2)
                    ELSE NULL END) STORED,
  market_brier  numeric GENERATED ALWAYS AS (
                  CASE WHEN outcome IS NOT NULL
                    THEN power((CASE WHEN outcome THEN 1.0 ELSE 0.0 END) - (market_prob / 100.0), 2)
                    ELSE NULL END) STORED,
  resolved_at   timestamptz
);

-- Uma previsão por mercado por dia (evita ruído de re-análises)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_forecasts_unique
  ON public.ai_forecasts (market_id, source, forecast_date);
CREATE INDEX IF NOT EXISTS idx_ai_forecasts_edge
  ON public.ai_forecasts (created_at DESC) WHERE resolved = false;

ALTER TABLE public.ai_forecasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_forecasts_public_read" ON public.ai_forecasts;
CREATE POLICY "ai_forecasts_public_read" ON public.ai_forecasts FOR SELECT USING (true);

-- View agregada: track record da IA (Brier da IA vs Brier do mercado)
CREATE OR REPLACE VIEW public.ai_track_record AS
SELECT
  COUNT(*) FILTER (WHERE resolved)                           AS resolved_count,
  COUNT(*)                                                   AS total_count,
  ROUND(AVG(brier) FILTER (WHERE resolved), 4)              AS ai_brier,
  ROUND(AVG(market_brier) FILTER (WHERE resolved), 4)       AS market_brier,
  COUNT(*) FILTER (WHERE resolved AND brier < market_brier) AS beat_market_count,
  ROUND(AVG(ABS(edge_pp)), 1)                               AS avg_abs_edge
FROM public.ai_forecasts;

GRANT SELECT ON public.ai_track_record TO anon, authenticated;
GRANT SELECT ON public.ai_forecasts TO anon, authenticated;
