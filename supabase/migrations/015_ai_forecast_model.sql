-- 015_ai_forecast_model.sql — provedor/modelo que gerou cada previsão da IA.
-- Motivo: com o fallback Anthropic → Gemini (ver server/lib/gemini.ts), o track
-- record público passou a misturar previsões de dois modelos. Registrar qual
-- gerou cada uma mantém a métrica HONESTA ("sem cherry-picking") e permite
-- comparar a calibração de cada provedor.
--
-- Seguro e retrocompatível: coluna nullable, sem default destrutivo. O código
-- (logAiForecast) já grava `model` quando a coluna existe e ignora quando não —
-- então aplicar esta migration é ZERO-downtime e não exige deploy coordenado.

alter table public.ai_forecasts add column if not exists model text;

comment on column public.ai_forecasts.model is
  'Provedor que gerou a previsão: anthropic | gemini. Nulo em previsões anteriores à migration 015.';
