-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 006_profiles_social.sql
-- Campos sociais do perfil (username, bio, perfil público) + estatísticas
-- agregadas + views de Leaderboard e Consenso da comunidade.
-- Idempotente: seguro re-executar.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username           text UNIQUE,
  ADD COLUMN IF NOT EXISTS display_name       text,
  ADD COLUMN IF NOT EXISTS bio                text,
  ADD COLUMN IF NOT EXISTS public_profile     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS predictions_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resolved_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_brier_score    double precision;

CREATE INDEX IF NOT EXISTS idx_profiles_leaderboard
  ON public.profiles (avg_brier_score ASC NULLS LAST, resolved_count DESC)
  WHERE public_profile = true;

-- Leitura pública de perfis marcados como públicos (e o próprio usuário sempre)
DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;
CREATE POLICY "profiles_public_read"
  ON public.profiles FOR SELECT
  USING (public_profile = true OR auth.uid() = id);

-- View: Leaderboard público de calibração
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  p.id,
  COALESCE(p.username, CONCAT('forecaster_', LEFT(p.id::text, 6))) AS username,
  p.display_name,
  p.avg_brier_score,
  p.predictions_count,
  p.resolved_count,
  p.skill_score,
  p.plan,
  p.created_at
FROM public.profiles p
WHERE p.public_profile = true
  AND p.resolved_count >= 1
ORDER BY p.avg_brier_score ASC NULLS LAST;

-- View: Consenso da comunidade por mercado (mediana das previsões abertas)
CREATE OR REPLACE VIEW public.market_community_forecast AS
SELECT
  market_id,
  COUNT(*)::integer AS n_forecasters,
  ROUND(CAST(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY user_prob) AS numeric), 1) AS median_prob,
  ROUND(CAST(AVG(user_prob) AS numeric), 1)    AS mean_prob,
  ROUND(CAST(STDDEV(user_prob) AS numeric), 1) AS std_prob,
  ROUND(CAST(MIN(user_prob) AS numeric), 1)    AS min_prob,
  ROUND(CAST(MAX(user_prob) AS numeric), 1)    AS max_prob
FROM public.predictions
WHERE resolved = false
GROUP BY market_id;

GRANT SELECT ON public.leaderboard TO anon, authenticated;
GRANT SELECT ON public.market_community_forecast TO anon, authenticated;

-- Trigger: mantém predictions_count / resolved_count / avg_brier / skill atualizados
CREATE OR REPLACE FUNCTION public.update_profile_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.profiles
  SET
    predictions_count = (SELECT COUNT(*) FROM public.predictions WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)),
    resolved_count    = (SELECT COUNT(*) FROM public.predictions WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) AND resolved = true AND brier_score IS NOT NULL),
    avg_brier_score   = (SELECT AVG(brier_score) FROM public.predictions WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) AND brier_score IS NOT NULL),
    skill_score       = CASE
      WHEN (SELECT AVG(brier_score) FROM public.predictions WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) AND brier_score IS NOT NULL) IS NOT NULL
      THEN 1.0 - (SELECT AVG(brier_score) FROM public.predictions WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) AND brier_score IS NOT NULL) / 0.25
      ELSE 0 END,
    updated_at = now()
  WHERE id = COALESCE(NEW.user_id, OLD.user_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_update_profile_stats ON public.predictions;
CREATE TRIGGER trg_update_profile_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.update_profile_stats();
