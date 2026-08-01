-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 016_cerebro_embeddings.sql
-- RAG semântico do Cerebro: embeddings (pgvector) além do FTS por palavra-chave.
--
-- Adiciona uma coluna de vetor aos artigos, um índice HNSW e uma RPC de busca
-- por similaridade de cosseno. Depois de aplicar ISTO, rode o backfill
-- (POST /api/ai/embed-cerebro) para gerar os vetores dos artigos existentes.
-- Enquanto a coluna estiver vazia, o Cerebro segue no FTS (fallback gracioso).
--
-- Dimensão 768 = gemini-embedding-001 com outputDimensionality:768 (o padrão de
-- 3072 estoura o limite de índice do pgvector). Distância de cosseno → não
-- precisa normalizar os vetores.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Extensão pgvector (no Supabase costuma viver no schema `extensions`).
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) Coluna de embedding nos artigos (NULL até o backfill preencher).
ALTER TABLE public.cerebro_articles
  ADD COLUMN IF NOT EXISTS embedding vector(768);

-- 3) Índice ANN (HNSW, cosseno). Só indexa linhas já embedadas.
CREATE INDEX IF NOT EXISTS cerebro_articles_embedding_idx
  ON public.cerebro_articles USING hnsw (embedding vector_cosine_ops);

-- 4) Busca por similaridade — usada pela busca híbrida do servidor.
--    Retorna os artigos ativos mais próximos da query, com similaridade 0..1.
CREATE OR REPLACE FUNCTION public.match_cerebro_articles(
  query_embedding vector(768),
  match_count     int   DEFAULT 5,
  min_similarity  float DEFAULT 0.35
)
RETURNS TABLE (
  id uuid, slug text, title text, source text, category text,
  url text, summary text, published_at timestamptz, similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT a.id, a.slug, a.title, a.source, a.category, a.url, a.summary, a.published_at,
         1 - (a.embedding <=> query_embedding) AS similarity
  FROM public.cerebro_articles a
  WHERE a.status = 'active'
    AND a.embedding IS NOT NULL
    AND 1 - (a.embedding <=> query_embedding) >= min_similarity
  ORDER BY a.embedding <=> query_embedding
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.match_cerebro_articles(vector, int, float)
  TO anon, authenticated, service_role;
