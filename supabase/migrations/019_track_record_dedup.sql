-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 019_track_record_dedup.sql
-- Taxa de acerto REAL: cada MERCADO conta UMA vez.
--
-- O gargalo: o seed re-prevê o mesmo mercado em dias diferentes (cada
-- (market_id, forecast_date) é uma linha). Quando o mercado liquida, TODAS as
-- linhas dele resolvem — então 1 mercado real (ex.: "Strait of Hormuz", previsto
-- 6 dias seguidos) contava 6× na taxa de acerto E no Brier. Isso INFLA/DEFLA os
-- números com repetição correlacionada, não com amostra de verdade.
--
-- Correção: a view passa a agregar sobre UMA linha por market_id — a previsão
-- mais ANTIGA (feita mais longe da resolução, a mais honesta como "aposta"). As
-- colunas e a ordem são idênticas à 018 (CREATE OR REPLACE exige), só muda o FROM.
-- Mantém security_invoker = true (senão reverteria o hardening da 009).
--
-- ⚠️ NOTA sobre a definição de "acerto" (hit_count): continua DIRECIONAL vs 50%
--    (previu >50 e deu SIM = acerto). Isso mede o LADO, não o EDGE vs o mercado —
--    dizer 42% num mercado a 6% que deu NÃO conta como "acerto" aqui, embora a IA
--    tenha divergido MUITO pra cima. Para a régua "a IA bate o mercado", o sinal
--    honesto é o Brier (ai_brier vs market_brier), já presente. Trocar a definição
--    de hit para "vs mercado" é uma decisão à parte (não feita aqui de propósito).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.ai_track_record WITH (security_invoker = true) AS
WITH one_per_market AS (
  -- 1 linha por mercado: a previsão mais antiga (desempate por created_at).
  SELECT DISTINCT ON (market_id) *
  FROM public.ai_forecasts
  ORDER BY market_id, forecast_date ASC, created_at ASC
)
SELECT
  COUNT(*) FILTER (WHERE resolved)                           AS resolved_count,
  COUNT(*)                                                   AS total_count,
  ROUND(AVG(brier) FILTER (WHERE resolved), 4)              AS ai_brier,
  ROUND(AVG(market_brier) FILTER (WHERE resolved), 4)       AS market_brier,
  COUNT(*) FILTER (WHERE resolved AND brier < market_brier) AS beat_market_count,
  ROUND(AVG(ABS(edge_pp)), 1)                               AS avg_abs_edge,
  -- Taxa de acerto DIRECIONAL da IA (vs 50): previu >50 e deu SIM, ou <50 e deu NÃO.
  COUNT(*) FILTER (
    WHERE resolved AND ai_fair_value <> 50 AND ((ai_fair_value > 50) = outcome)
  )                                                          AS hit_count,
  COUNT(*) FILTER (WHERE resolved AND ai_fair_value <> 50)   AS directional_count,
  -- Idem para o MERCADO no momento do registro (baseline honesto de comparação).
  COUNT(*) FILTER (
    WHERE resolved AND market_prob <> 50 AND ((market_prob > 50) = outcome)
  )                                                          AS market_hit_count,
  COUNT(*) FILTER (WHERE resolved AND market_prob <> 50)     AS market_directional_count,
  -- Quantas das resolvidas vieram do resultado OFICIAL (não de preço inferido).
  COUNT(*) FILTER (WHERE resolved AND resolution_source = 'settled') AS settled_count
FROM one_per_market;

GRANT SELECT ON public.ai_track_record TO anon, authenticated;
