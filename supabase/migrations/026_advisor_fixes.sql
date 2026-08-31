-- ─────────────────────────────────────────────────────────────────────────────
-- 026_advisor_fixes.sql — achados dos advisors do Supabase (31/08/2026)
--
-- Rodamos pela primeira vez o linter oficial de segurança e performance do
-- Supabase. Três achados acionáveis, todos abaixo. Os demais foram avaliados e
-- NÃO corrigidos de propósito (justificativa no fim do arquivo).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. PRIVACIDADE: o "consenso da comunidade" vazava previsão individual ────
--
-- market_community_forecast é SECURITY DEFINER de PROPÓSITO: é assim que ela
-- agrega as previsões de todos sem expor as linhas individuais (a tabela
-- predictions tem RLS restringindo cada um à própria previsão). Trocar para
-- security_invoker, como o advisor sugere por padrão, QUEBRARIA o recurso —
-- cada usuário veria só a si mesmo num "consenso".
--
-- Mas ao inspecionar o retorno real apareceu um problema que o advisor não
-- descreve: com POUCOS participantes, o agregado É o dado individual.
--   market 561975 → n_forecasters: 1, mediana 17,0, min 17,0, max 17,0
-- Ou seja, qualquer pessoa consultando a view lia a previsão exata (17%) de um
-- usuário específico — exatamente o que o RLS da tabela existe para impedir.
--
-- Correção: k-anonimato. Só há "consenso" a partir de 3 participantes; abaixo
-- disso a linha simplesmente não existe. Mantém SECURITY DEFINER (necessário
-- para agregar) e fecha o vazamento.
CREATE OR REPLACE VIEW public.market_community_forecast AS
  SELECT market_id,
    count(*)::integer AS n_forecasters,
    round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (user_prob::double precision))::numeric, 1) AS median_prob,
    round(avg(user_prob), 1) AS mean_prob,
    round(stddev(user_prob), 1) AS std_prob,
    round(min(user_prob), 1) AS min_prob,
    round(max(user_prob), 1) AS max_prob
  FROM predictions
  WHERE resolved = false
  GROUP BY market_id
  HAVING count(*) >= 3;

COMMENT ON VIEW public.market_community_forecast IS
  'Consenso da comunidade. SECURITY DEFINER é intencional (agrega além do RLS); o HAVING >= 3 impede que o agregado revele a previsão de um indivíduo.';

-- ── 2. SEGURANÇA: search_path mutável na função do RAG ──────────────────────
-- A 009 fixou o search_path de todas as funções da época; match_cerebro_articles
-- nasceu depois (016) e ficou de fora. search_path mutável permite que um schema
-- malicioso no path sequestre a resolução de nomes dentro da função.
-- Recriada IDÊNTICA, só somando o SET search_path.
CREATE OR REPLACE FUNCTION public.match_cerebro_articles(
  query_embedding vector,
  match_count integer DEFAULT 5,
  min_similarity double precision DEFAULT 0.35
)
RETURNS TABLE(id uuid, slug text, title text, source text, category text, url text,
              summary text, published_at timestamp with time zone, similarity double precision)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
  SELECT a.id, a.slug, a.title, a.source, a.category, a.url, a.summary, a.published_at,
         1 - (a.embedding <=> query_embedding) AS similarity
  FROM public.cerebro_articles a
  WHERE a.status = 'active'
    AND a.embedding IS NOT NULL
    AND 1 - (a.embedding <=> query_embedding) >= min_similarity
  ORDER BY a.embedding <=> query_embedding
  LIMIT match_count;
$function$;

-- ── 3. PERFORMANCE: RLS de user_progress reavaliava auth.uid() por LINHA ─────
-- Mesmo problema que a 010 corrigiu nas outras tabelas; user_progress nasceu
-- depois (017) e repetiu o padrão antigo. Com (select auth.uid()) o Postgres
-- avalia UMA vez (InitPlan) em vez de uma vez por linha. Comportamento idêntico.
DROP POLICY IF EXISTS user_progress_select_own ON public.user_progress;
CREATE POLICY user_progress_select_own ON public.user_progress
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS user_progress_insert_own ON public.user_progress;
CREATE POLICY user_progress_insert_own ON public.user_progress
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS user_progress_update_own ON public.user_progress;
CREATE POLICY user_progress_update_own ON public.user_progress
  FOR UPDATE USING ((select auth.uid()) = user_id)
           WITH CHECK ((select auth.uid()) = user_id);

-- ── Avaliados e NÃO corrigidos (com motivo) ─────────────────────────────────
-- • "RLS enabled, no policy" em analytics_events, chat_feedback, duels,
--   push_subscriptions: é o estado DESEJADO. Sem policy, o cliente não lê nada
--   (fail-closed) e só o backend (service_role) escreve. Criar policy aqui
--   ABRIRIA acesso, não fecharia.
-- • "extension vector in public": mover o pgvector de schema quebraria as
--   referências existentes (coluna embedding, operadores <=>) por um ganho
--   apenas organizacional. Risco > benefício.
-- • Índices "não usados" e FKs sem índice em chat_feedback/push_subscriptions:
--   as tabelas têm ~0 linhas porque o site ainda não tem usuários. "Não usado"
--   aqui significa "sem tráfego", não "inútil" — remover agora seria decidir
--   com base na ausência de público, não em evidência de uso.
-- • "Leaked password protection" (HaveIBeenPwned): é chave de painel, não SQL —
--   ação do fundador no dashboard do Supabase. Vale ligar: é grátis e bloqueia
--   senhas já vazadas em outros sites.
