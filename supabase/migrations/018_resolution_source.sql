-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 018_resolution_source.sql
-- "Comparador entre resultados": procedência da resolução + taxa de acerto.
--
-- (1) Coluna resolution_source: distingue o resultado OFICIAL da plataforma
--     ('settled' — Kalshi result / Polymarket UMA) do inferido por preço extremo
--     ('inferred'). Torna o track record auditável e honesto na UI.
-- (2) View ai_track_record ganha a TAXA DE ACERTO direcional (hit rate) — a
--     métrica intuitiva ("previu >50 e deu SIM = acerto"), da IA e do mercado,
--     mais a contagem de quantas foram resolvidas pelo resultado oficial.
--
-- Seguro e retrocompatível: colunas nullable, sem default destrutivo. O código
-- (patchResolution em aiForecasts.ts) grava resolution_source quando a coluna
-- existe e ignora quando não — aplicar é ZERO-downtime, sem deploy coordenado.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.ai_forecasts add column if not exists resolution_source text;
comment on column public.ai_forecasts.resolution_source is
  'Como foi resolvida: settled = resultado oficial da plataforma (Kalshi result / Polymarket UMA); inferred = inferido de preço extremo. Nulo em previsões anteriores à migration 018.';

-- Mesma procedência no track record do usuário (previsões pessoais).
alter table public.predictions add column if not exists resolution_source text;
comment on column public.predictions.resolution_source is
  'settled = resultado oficial da plataforma; inferred = preço extremo; manual = o próprio usuário marcou. Nulo antes da migration 018.';

-- ─── View: track record da IA (agora com taxa de acerto direcional) ──────────
-- Colunas existentes preservadas na mesma ordem (CREATE OR REPLACE exige isso);
-- as novas são anexadas ao final e lidas de forma defensiva pelo endpoint.
CREATE OR REPLACE VIEW public.ai_track_record AS
SELECT
  COUNT(*) FILTER (WHERE resolved)                           AS resolved_count,
  COUNT(*)                                                   AS total_count,
  ROUND(AVG(brier) FILTER (WHERE resolved), 4)              AS ai_brier,
  ROUND(AVG(market_brier) FILTER (WHERE resolved), 4)       AS market_brier,
  COUNT(*) FILTER (WHERE resolved AND brier < market_brier) AS beat_market_count,
  ROUND(AVG(ABS(edge_pp)), 1)                               AS avg_abs_edge,
  -- Taxa de acerto DIRECIONAL da IA: previu >50 e deu SIM, ou <50 e deu NÃO.
  -- Previsões exatamente em 50 (sem lado) ficam fora do denominador.
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
FROM public.ai_forecasts;

GRANT SELECT ON public.ai_track_record TO anon, authenticated;
