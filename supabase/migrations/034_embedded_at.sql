-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 034_embedded_at.sql
--
-- Orçamento diário de embeddings (19/09/2026). O backfill tinha "teto diário de
-- 800" — mas por EXECUÇÃO, e o servidor parte várias vezes por dia (deploy,
-- Render acordando, servidores de teste). O Gemini grátis dá 1.000 por dia, e
-- cada partida gastava mais 800: a busca semântica de quem usa o site ficava
-- sem cota. Medido no dia: 14.714 artigos sem vetor, 1.663 novos por dia.
--
-- Contar "quanto já foi hoje" precisa de uma data que sobreviva a reinício. Um
-- contador em memória zeraria a cada partida, que é justamente o problema.
-- Esta coluna é essa data: o backfill a preenche junto com o vetor.
--
-- Artigos vetorizados antes desta migração ficam com NULL — a contagem começa
-- do zero hoje, o que só pode errar para MENOS gasto, nunca para mais.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.cerebro_articles
  ADD COLUMN IF NOT EXISTS embedded_at timestamptz;

-- A contagem do dia filtra por esta coluna a cada rodada do backfill.
CREATE INDEX IF NOT EXISTS cerebro_articles_embedded_at_idx
  ON public.cerebro_articles (embedded_at)
  WHERE embedded_at IS NOT NULL;
