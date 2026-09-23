-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 044_consenso_k_anonimo.sql
--
-- Auditoria 21/09, SEG-05: o "consenso da comunidade" publicava a previsão
-- INDIVIDUAL de cada pessoa.
--
-- A view `market_community_forecast` agregava a partir de 3 pessoas e devolvia
-- `min_prob`, `median_prob` e `max_prob`. Com exatamente três, esses três
-- números SÃO as três previsões — em ordem. Não é uma estatística do grupo: é a
-- lista de quem previu o quê, com outro nome. E `predictions` tem política de
-- SELECT restrita ao dono justamente para isso não acontecer; a view, sendo
-- SECURITY DEFINER, passava por cima dela.
--
-- Duas mudanças:
--   · o piso sobe de 3 para 5 pessoas, e min/max só aparecem a partir de 10.
--     Com 5, saber contagem, média, mediana e desvio ainda deixa as previsões
--     individuais indeterminadas; com min e max, não deixaria;
--   · vira FUNÇÃO com colunas explícitas, em vez de view aberta com `SELECT *`.
--     Uma view aberta entrega toda coluna que alguém acrescentar amanhã sem
--     pensar nisso; a função entrega o que está escrito nela.
--
-- A view continua existindo para não quebrar nada que a consulte, mas o `anon`
-- perde o SELECT direto: quem pergunta, pergunta pela função.
--
-- ⚠️ Com o público atual (uma conta), o consenso vai deixar de aparecer. Isso é
-- o k-anonimato funcionando, não um defeito: "o que a comunidade acha" com três
-- pessoas nunca foi consenso — era a opinião de três pessoas identificáveis.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.consenso_da_comunidade(p_market_id text)
RETURNS TABLE (
  n_forecasters integer,
  median_prob   numeric,
  mean_prob     numeric,
  std_prob      numeric,
  min_prob      numeric,
  max_prob      numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ultima AS (
    SELECT DISTINCT ON (p.user_id) p.user_id, p.user_prob
      FROM predictions p
     WHERE p.market_id = p_market_id
       AND p.resolved = false
       AND p.outcome_id IS NULL
     ORDER BY p.user_id, p.created_at DESC
  ),
  agregado AS (
    SELECT count(*)::integer AS n,
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY user_prob::double precision))::numeric, 1) AS mediana,
           round(avg(user_prob), 1)    AS media,
           round(stddev(user_prob), 1) AS desvio,
           round(min(user_prob), 1)    AS minimo,
           round(max(user_prob), 1)    AS maximo
      FROM ultima
  )
  SELECT n, mediana, media, desvio,
         -- Extremos só com gente suficiente para eles não apontarem ninguém.
         CASE WHEN n >= 10 THEN minimo END,
         CASE WHEN n >= 10 THEN maximo END
    FROM agregado
   WHERE n >= 5;
$$;

REVOKE ALL ON FUNCTION public.consenso_da_comunidade(text) FROM public;
GRANT EXECUTE ON FUNCTION public.consenso_da_comunidade(text) TO anon, authenticated, service_role;

-- Ninguém mais lê a view direto: ela entregava min/max sem piso.
REVOKE SELECT ON public.market_community_forecast FROM anon, authenticated;

COMMENT ON FUNCTION public.consenso_da_comunidade(text) IS
  'Consenso da comunidade com k-anonimato: mínimo de 5 previsores, min/max só a partir de 10 (SEG-05).';
