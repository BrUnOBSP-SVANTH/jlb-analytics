-- ─────────────────────────────────────────────────────────────────────────────
-- 024_bold_forecast_shadow.sql — o experimento da divergência.
--
-- O problema que isto vai responder: hoje a IA COPIA o mercado por projeto. O
-- prompt do seed manda "fique a ±3pp do preço", e a medição confirma que ela
-- obedece — não existe UMA previsão resolvida com desvio >= 3pp. Consequência:
-- ela empata com o mercado (skill ~0) e nunca poderia superá-lo.
--
-- Mas soltar a coleira às cegas seria repetir um erro já cometido: antes do
-- guardrail a IA alucinava desvios enormes (42% onde o mercado dizia 6%) e o
-- Brier era PIOR. Ou seja: nem copiar, nem divergir por divergir.
--
-- Este experimento grava, em paralelo, uma estimativa CEGA: o modelo não vê o
-- preço do mercado e estima do zero (base rate + notícias do Cérebro, nosso ativo
-- real com fontes em português que mercados globais subaproveitam). Ver o preço
-- ANCORA o julgamento — a 1ª versão mostrava o preço e o modelo respondia "sem
-- motivo para divergir" em tudo. Cego, ele forma opinião própria: às vezes
-- coincide com o mercado (concordância genuína), às vezes não.
--
-- Nada disso é exibido nem entra no track record público. Depois de N resoluções
-- teremos, pela primeira vez, a resposta empírica: divergir paga? onde?
--
--   ai_fair_value_bold   estimativa CEGA (não viu o preço, sem trava de ±3pp)
--   bold_rationale       o raciocínio — permite auditar se era análise ou invenção
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_forecasts
  ADD COLUMN IF NOT EXISTS ai_fair_value_bold numeric,
  ADD COLUMN IF NOT EXISTS bold_rationale     text;

COMMENT ON COLUMN public.ai_forecasts.ai_fair_value_bold IS
  'Shadow do experimento de divergência: estimativa livre da trava de ±3pp, exigindo motivo concreto. Não exibida.';
COMMENT ON COLUMN public.ai_forecasts.bold_rationale IS
  'Motivo alegado para divergir — para auditar se era informação real ou racionalização.';
