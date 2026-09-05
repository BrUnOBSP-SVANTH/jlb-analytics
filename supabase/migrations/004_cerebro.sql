-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 004_cerebro.sql
-- Cerebro: base de conhecimento alimentada por RSS + Reddit.
--
-- cerebro_articles  — artigos brutos ingeridos via rss_collector.py
-- cerebro_analysis  — sínteses wiki geradas por IA a partir dos artigos
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── cerebro_articles ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cerebro_articles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text        UNIQUE NOT NULL,              -- hash determinístico da URL
  title        text        NOT NULL,
  source       text        NOT NULL,                     -- nome do feed / subreddit
  category     text        NOT NULL DEFAULT 'geral',     -- esportes, macro, cripto…
  url          text,
  summary      text,                                     -- parágrafo gerado pelo rss_collector
  tags         text[]      NOT NULL DEFAULT '{}',
  published_at timestamptz,
  ingested_at  timestamptz NOT NULL DEFAULT now(),
  status       text        NOT NULL DEFAULT 'active'     -- active | archived | removed
    CHECK (status IN ('active', 'archived', 'removed')),

  -- Coluna de busca full-text em português
  fts tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(summary, '')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(array_to_string(tags, ' '), '')), 'C')
  ) STORED
);

CREATE INDEX IF NOT EXISTS cerebro_articles_fts_idx
  ON public.cerebro_articles USING GIN(fts);

CREATE INDEX IF NOT EXISTS cerebro_articles_published_idx
  ON public.cerebro_articles(published_at DESC);

CREATE INDEX IF NOT EXISTS cerebro_articles_source_idx
  ON public.cerebro_articles(source);

CREATE INDEX IF NOT EXISTS cerebro_articles_category_idx
  ON public.cerebro_articles(category);

-- ─── cerebro_analysis ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cerebro_analysis (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text        UNIQUE NOT NULL,
  title        text        NOT NULL,
  wiki_type    text        NOT NULL DEFAULT 'synthesis'
    CHECK (wiki_type IN ('source', 'synthesis', 'concept', 'entity', 'question')),
  domains      text[]      NOT NULL DEFAULT '{}',
  tags         text[]      NOT NULL DEFAULT '{}',
  content      text        NOT NULL,
  sources_used text[]      NOT NULL DEFAULT '{}',
  status       text        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'draft')),
  wiki_date    date,
  synced_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cerebro_analysis_domains_idx
  ON public.cerebro_analysis USING GIN(domains);

CREATE INDEX IF NOT EXISTS cerebro_analysis_wiki_type_idx
  ON public.cerebro_analysis(wiki_type);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Artigos e análises são leitura pública (sem autenticação obrigatória).
-- Escrita apenas via service_role (rss_collector.py usa SUPABASE_SERVICE_KEY).

ALTER TABLE public.cerebro_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cerebro_articles_public_read" ON public.cerebro_articles;
CREATE POLICY "cerebro_articles_public_read"
  ON public.cerebro_articles FOR SELECT
  USING (status = 'active');

ALTER TABLE public.cerebro_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cerebro_analysis_public_read" ON public.cerebro_analysis;
CREATE POLICY "cerebro_analysis_public_read"
  ON public.cerebro_analysis FOR SELECT
  USING (status = 'active');

-- ─── Grants ───────────────────────────────────────────────────────────────────
GRANT SELECT ON public.cerebro_articles TO anon, authenticated;
GRANT SELECT ON public.cerebro_analysis TO anon, authenticated;
