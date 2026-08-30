-- ─────────────────────────────────────────────────────────────────────────────
-- 025_news_context_flag.sql — o Cérebro melhora a previsão? Passa a ser medível.
--
-- Por que isto importa agora: a decomposição de Murphy mostrou que o erro de
-- CALIBRAÇÃO já é ~zero (0,0037 de 0,2474 de incerteza). O que limita o Brier é
-- DISCRIMINAÇÃO — a capacidade de separar o que acontece do que não acontece. E
-- discriminação vem de INFORMAÇÃO, não de ajuste matemático.
--
-- Nossa aposta de informação é o Cérebro (≈20 mil artigos, com fontes em
-- português que mercados globais subaproveitam). Mas nunca MEDIMOS se ele ajuda:
-- o seed busca o contexto de notícias e não registra se veio algo. Sem esse
-- registro, "o Cérebro é nosso diferencial" é retórica, não fato.
--
-- Com estas colunas, em algumas semanas dá para responder com dado:
--   previsões COM notícia têm Brier melhor que as SEM?
--   e o ganho cresce com a quantidade de contexto?
-- Se a resposta for não, investir em RAG é desperdício — e é melhor saber.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_forecasts
  ADD COLUMN IF NOT EXISTS had_news_context boolean,
  ADD COLUMN IF NOT EXISTS news_context_chars int;

COMMENT ON COLUMN public.ai_forecasts.had_news_context IS
  'O prompt recebeu contexto de notícias do Cérebro? Permite medir se o RAG melhora a discriminação.';
COMMENT ON COLUMN public.ai_forecasts.news_context_chars IS
  'Tamanho do contexto injetado, em caracteres — para ver se mais contexto ajuda ou satura.';
