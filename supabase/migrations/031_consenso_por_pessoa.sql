-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 031_consenso_por_pessoa.sql
-- O k-anonimato do "consenso da comunidade" contava linhas, não pessoas.
--
-- A migration 026 manteve market_community_forecast como SECURITY DEFINER (de
-- propósito: é o único jeito de agregar previsões de todos com a tabela sob RLS)
-- e fechou um vazamento com HAVING count(*) >= 3 — abaixo de 3 participantes o
-- agregado É a previsão de alguém.
--
-- DOIS DEFEITOS NESSA VIEW, provados em 14/09/2026 rodando a lógica antiga e a
-- nova sobre linhas de teste inline (consulta só de leitura, sem tocar dados):
--
-- 1. count(*) CONTA PREVISÕES, NÃO PESSOAS. Uma pessoa que registrasse o mesmo
--    mercado três vezes — o botão sempre permitiu, e desde a 030 atualizar gera
--    versão datada — cumpria o mínimo sozinha. Resultado medido:
--        n_forecasters 3 · mediana 18 · mínimo 17 · máximo 21
--    eram as três versões de UM usuário. A proteção da 026 nunca funcionou.
--
-- 2. AGRUPA SÓ POR market_id. Desde a 030, previsão sobre UM desfecho chega à
--    tabela. Num mercado de 12 times, a mediana misturava Barcelona (19%), Aston
--    Villa (2%) e previsões do mercado inteiro (55%) num "consenso" de 19% que
--    não quer dizer nada — publicado como opinião da comunidade.
--
-- A CORREÇÃO:
--   · uma linha por pessoa: a previsão MAIS RECENTE de cada usuário no mercado
--     (DISTINCT ON user_id, market_id ORDER BY created_at DESC). Assim
--     n_forecasters passa a ser o que o nome diz, e o HAVING >= 3 volta a exigir
--     três PESSOAS;
--   · só previsões do mercado inteiro (outcome_id IS NULL). Consenso por
--     desfecho é outro recurso, e não existe ainda — melhor nenhum número do que
--     um número misturado.
--
-- Colunas, nomes e tipos idênticos aos da 026: CREATE OR REPLACE funciona e o
-- cliente (useMarketDetail.ts) não muda. Continua SECURITY DEFINER, pelo mesmo
-- motivo da 026.
--
-- De quebra, as permissões de escrita que o Supabase dá por padrão a anon e
-- authenticated saem da view. Uma view com GROUP BY não aceita escrita no
-- Postgres, então elas nunca funcionaram — mas permissão que ninguém deveria
-- ter não fica lá esperando uma versão da view que aceite.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.market_community_forecast AS
  WITH ultima AS (
    SELECT DISTINCT ON (user_id, market_id) market_id, user_id, user_prob
    FROM public.predictions
    WHERE resolved = false AND outcome_id IS NULL
    ORDER BY user_id, market_id, created_at DESC
  )
  SELECT market_id,
    count(*)::integer AS n_forecasters,
    round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (user_prob::double precision))::numeric, 1) AS median_prob,
    round(avg(user_prob), 1) AS mean_prob,
    round(stddev(user_prob), 1) AS std_prob,
    round(min(user_prob), 1) AS min_prob,
    round(max(user_prob), 1) AS max_prob
  FROM ultima
  GROUP BY market_id
  HAVING count(*) >= 3;

COMMENT ON VIEW public.market_community_forecast IS
  'Consenso da comunidade: a previsão mais recente de CADA PESSOA, só do mercado inteiro (sem desfecho). SECURITY DEFINER é intencional (agrega além do RLS); o HAVING >= 3 exige três pessoas, e não três linhas (031).';

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.market_community_forecast FROM anon, authenticated;
