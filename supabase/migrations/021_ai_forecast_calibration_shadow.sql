-- 021_ai_forecast_calibration_shadow.sql
-- Shadow do loop de calibração por categoria (server/lib/ai/calibration.ts).
--
-- Grava, EM PARALELO ao ai_fair_value cru, o fair value após o de-viés por
-- categoria (gated: só corrige onde há viés real e amostra). NÃO é exibido ao
-- usuário nem entra no track record público — serve só para MEDIR, nas resoluções
-- NOVAS, se a calibração melhora o Brier de verdade antes de flipar para ao vivo.
--
-- Backtest leave-one-out sobre 294 resolvidos já deu Brier 0,1220 vs 0,1294 cru
-- (skill +5,4% vs mercado). O shadow confirma isso em dado fresco, out-of-sample.

alter table public.ai_forecasts
  add column if not exists ai_fair_value_calibrated numeric;

comment on column public.ai_forecasts.ai_fair_value_calibrated is
  'Shadow do loop de calibração: fair value após de-viés por categoria. Não exibido; mede o ganho antes do go-live.';
