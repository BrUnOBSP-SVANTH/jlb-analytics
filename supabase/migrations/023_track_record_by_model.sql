-- ─────────────────────────────────────────────────────────────────────────────
-- 023_track_record_by_model.sql — o track record FATIADO POR PROVEDOR.
--
-- Por que existe: o número público ("nossa IA acerta X%") virou ambíguo. Hoje ele
-- é, na prática, 100% Gemini Flash Lite — o modelo de FALLBACK — porque a
-- Anthropic está sem crédito (336 de 340 resolvidas são do Gemini, 0 do Claude).
-- Com a entrada do Groq como 3º nível, seriam TRÊS níveis de qualidade somados
-- num número só, sem ninguém conseguir separar.
--
-- Esta view resolve isso mostrando cada provedor em separado. Mesma regra de
-- deduplicação da ai_track_record (019: 1 linha por mercado, a previsão mais
-- antiga) — assim as partes somam exatamente o todo, sem discrepância entre a
-- manchete e o detalhe.
--
-- security_invoker + leitura pública: é prova auditável, como as demais.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.ai_track_record_by_model WITH (security_invoker = true) AS
WITH one_per_market AS (
  SELECT DISTINCT ON (market_id) *
  FROM public.ai_forecasts
  ORDER BY market_id, forecast_date ASC, created_at ASC
)
SELECT
  COALESCE(model, 'desconhecido')                            AS model,
  COUNT(*)                                                   AS total_count,
  COUNT(*) FILTER (WHERE resolved)                           AS resolved_count,
  ROUND(AVG(brier) FILTER (WHERE resolved), 4)               AS ai_brier,
  ROUND(AVG(market_brier) FILTER (WHERE resolved), 4)        AS market_brier,
  -- Acerto DIRECIONAL (vs 50), mesma definição da view principal.
  COUNT(*) FILTER (
    WHERE resolved AND ai_fair_value <> 50 AND ((ai_fair_value > 50) = outcome)
  )                                                          AS hit_count,
  COUNT(*) FILTER (WHERE resolved AND ai_fair_value <> 50)    AS directional_count,
  COUNT(*) FILTER (WHERE resolved AND resolution_source = 'settled') AS settled_count
FROM one_per_market
GROUP BY 1;

GRANT SELECT ON public.ai_track_record_by_model TO anon, authenticated;
