-- ─────────────────────────────────────────────────────────────────────────────
-- 022_sports_forecasts.sql — track record PROSPECTIVO dos modelos esportivos.
--
-- O backtest (scripts/backtest-sports.mjs) mede o passado, e passado sempre
-- carrega a suspeita de ter sido garimpado. Esta tabela guarda o que não dá para
-- falsificar: a previsão dos modelos (Poisson/Dixon-Coles, Elo e a baseline)
-- gravada ANTES da bola rolar, resolvida depois contra o placar oficial.
--
-- Mesma filosofia do ai_forecasts (previsões de mercado): registrar antes,
-- comparar com o resultado real, mostrar TODAS — inclusive as erradas.
--
-- Leitura PÚBLICA de propósito: é prova auditável. Escrita só pelo backend
-- (service_role), como no hardening da 009.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sports_forecasts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league       text        NOT NULL,              -- ex.: 'bra.1' (Brasileirão Série A)
  match_id     text        NOT NULL,              -- id do evento na fonte (ESPN)
  match_date   timestamptz NOT NULL,              -- horário do jogo
  home_team    text        NOT NULL,
  away_team    text        NOT NULL,
  model        text        NOT NULL CHECK (model IN ('poisson_dc', 'elo', 'baseline')),
  p_home       numeric     NOT NULL CHECK (p_home BETWEEN 0 AND 1),
  p_draw       numeric     NOT NULL CHECK (p_draw BETWEEN 0 AND 1),
  p_away       numeric     NOT NULL CHECK (p_away BETWEEN 0 AND 1),
  created_at   timestamptz NOT NULL DEFAULT now(),-- SEMPRE antes do match_date
  resolved     boolean     NOT NULL DEFAULT false,
  home_goals   int,
  away_goals   int,
  outcome      text        CHECK (outcome IN ('home', 'draw', 'away')),
  brier        numeric,                            -- multiclasse (3 desfechos)
  resolved_at  timestamptz,
  -- 1 previsão por (jogo, modelo): re-rodar o job não duplica nem reescreve o passado.
  UNIQUE (match_id, model)
);

CREATE INDEX IF NOT EXISTS sports_forecasts_pending_idx
  ON public.sports_forecasts (resolved, match_date);
CREATE INDEX IF NOT EXISTS sports_forecasts_league_idx
  ON public.sports_forecasts (league, match_date DESC);

ALTER TABLE public.sports_forecasts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sports_forecasts_public_read" ON public.sports_forecasts;
CREATE POLICY "sports_forecasts_public_read" ON public.sports_forecasts FOR SELECT USING (true);

GRANT SELECT ON public.sports_forecasts TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sports_forecasts FROM anon, authenticated;

-- View agregada: o placar dos modelos, já resolvido. Espelha a ai_track_record.
CREATE OR REPLACE VIEW public.sports_track_record WITH (security_invoker = true) AS
SELECT
  league,
  model,
  COUNT(*)                                        AS total_count,
  COUNT(*) FILTER (WHERE resolved)                AS resolved_count,
  ROUND(AVG(brier) FILTER (WHERE resolved), 4)    AS brier,
  -- Acertou o palpite principal (maior probabilidade = desfecho real)?
  COUNT(*) FILTER (
    WHERE resolved AND outcome = CASE
      WHEN p_home >= p_draw AND p_home >= p_away THEN 'home'
      WHEN p_draw >= p_home AND p_draw >= p_away THEN 'draw'
      ELSE 'away' END
  )                                               AS hit_count
FROM public.sports_forecasts
GROUP BY league, model;

GRANT SELECT ON public.sports_track_record TO anon, authenticated;
