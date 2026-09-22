-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 041_previsao_imutavel.sql
--
-- Auditoria 21/09, SEG-01: dava para FORJAR o ranking público.
--
-- O QUE ESTAVA ABERTO (medido no banco de produção em 22/09):
--   · `authenticated` tinha UPDATE em TODAS as colunas de `predictions` —
--     inclusive `outcome`, `resolved`, `resolution_source`, `resolved_at`,
--     `user_prob`, `market_prob` e `created_at`;
--   · e DELETE nas próprias previsões, inclusive nas já RESOLVIDAS;
--   · e INSERT com a linha já marcada como resolvida e acertada.
--
-- O Leaderboard lê `profiles.avg_brier_score`, recalculado por gatilho a partir
-- dessas linhas. Ou seja: qualquer pessoa logada podia inserir dez previsões já
-- resolvidas com acerto perfeito, apagar as que errou, e aparecer no topo do
-- ranking. É o oposto exato do "sem cherry-picking" que a plataforma vende — e
-- o track record é o único produto que ela tem.
--
-- Em `paper_bets` o buraco era menor (não há política de UPDATE), mas o INSERT
-- aceitava `resolved`, `payout`, `outcome` e `settled_at` escolhidos pelo
-- navegador.
--
-- A REGRA AGORA: a previsão NASCE PENDENTE e não muda mais.
--   · quem resolve é o servidor, com a chave de serviço (job de 6h,
--     `resolveUserPredictions`), contra o settlement oficial;
--   · o usuário pode apagar o que ainda está em aberto — mudar de ideia é
--     legítimo — mas não pode apagar o que já foi resolvido, porque apagar o
--     erro depois do resultado É o cherry-picking;
--   · nenhum UPDATE pelo navegador, de nenhuma coluna.
--
-- ⚠️ POR QUE UM GATILHO, E NÃO SÓ REVOGAR O PRIVILÉGIO DE COLUNA. O cliente é
-- local-first: ele guarda no navegador e sincroniza em lote, mandando a linha
-- INTEIRA (inclusive `resolved` e `outcome`). Revogar o privilégio de coluna
-- faria o PostgREST recusar o lote todo — e a aba que ainda estivesse com o
-- código antigo, depois do deploy, pararia de salvar previsão NENHUMA. O
-- gatilho aceita o que vier e simplesmente ignora o que não cabe ao cliente
-- decidir: ninguém quebra, e nada passa.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Nenhum UPDATE pelo navegador ──────────────────────────────────────────

DROP POLICY IF EXISTS predictions_update_own ON public.predictions;
REVOKE UPDATE ON public.predictions FROM anon, authenticated;
REVOKE UPDATE ON public.paper_bets  FROM anon, authenticated;

-- ── 2. Apagar só o que está em aberto ────────────────────────────────────────
-- `paper_bets` já era assim (paper_bets_delete_own_aberta). `predictions`, não.

DROP POLICY IF EXISTS predictions_delete_own ON public.predictions;
DROP POLICY IF EXISTS predictions_delete_own_pendente ON public.predictions;
CREATE POLICY predictions_delete_own_pendente ON public.predictions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND resolved = false);

-- ── 3. A previsão nasce pendente ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.previsao_nasce_pendente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- O servidor (chave de serviço) é quem resolve, e precisa poder gravar o
  -- resultado. `current_user` é o papel de verdade: o PostgREST faz SET ROLE
  -- para `service_role`, `authenticated` ou `anon` conforme a chave (verificado
  -- em 22/09 contra o banco de produção).
  IF current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.resolved          := false;
  NEW.outcome           := NULL;
  NEW.resolved_at       := NULL;
  NEW.resolution_source := NULL;
  NEW.resolution_price  := NULL;
  -- A data é do servidor, não do relógio de quem manda: `created_at` decide a
  -- ordem do histórico e entra na conta de "previu ANTES do resultado".
  NEW.created_at        := now();
  -- E a linha é sempre de quem está logado (a política já exige isso; aqui é
  -- cinto e suspensório, porque user_id é a chave do ranking).
  NEW.user_id           := COALESCE(auth.uid(), NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_previsao_nasce_pendente ON public.predictions;
CREATE TRIGGER trg_previsao_nasce_pendente
  BEFORE INSERT ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.previsao_nasce_pendente();

-- ── 4. A aposta da banca nasce em aberto ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.aposta_nasce_aberta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.resolved          := false;
  NEW.outcome           := NULL;
  NEW.payout            := NULL;
  NEW.settled_at        := NULL;
  NEW.resolution_source := NULL;
  NEW.created_at        := now();
  NEW.user_id           := COALESCE(auth.uid(), NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aposta_nasce_aberta ON public.paper_bets;
CREATE TRIGGER trg_aposta_nasce_aberta
  BEFORE INSERT ON public.paper_bets
  FOR EACH ROW EXECUTE FUNCTION public.aposta_nasce_aberta();

-- ── 5. A trava é verificável de fora ─────────────────────────────────────────
--
-- O `pnpm doctor` precisa conseguir responder "o buraco do SEG-01 continua
-- fechado?" sem abrir o painel do Supabase. Privilégio de coluna não é visível
-- pelo PostgREST, então a pergunta vira uma função — só para a chave de
-- serviço, porque a resposta é um mapa de onde bater.

CREATE OR REPLACE FUNCTION public.travas_de_escrita()
RETURNS TABLE(item text, aberto boolean, detalhe text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- 1) O navegador voltou a ter UPDATE em alguma coluna?
  SELECT
    cp.table_name || '.update' AS item,
    true AS aberto,
    'authenticated pode alterar: ' || string_agg(cp.column_name, ', ' ORDER BY cp.column_name) AS detalhe
  FROM information_schema.column_privileges cp
  WHERE cp.grantee = 'authenticated' AND cp.table_schema = 'public'
    AND cp.table_name IN ('predictions', 'paper_bets')
    AND cp.privilege_type = 'UPDATE'
  GROUP BY cp.table_name

  UNION ALL

  -- 2) Os gatilhos que forçam a linha a nascer pendente continuam lá?
  SELECT t.nome || '.gatilho', NOT EXISTS (
    SELECT 1 FROM pg_trigger g
    JOIN pg_class rel ON rel.oid = g.tgrelid
    WHERE rel.relname = t.nome AND g.tgname = t.gatilho AND NOT g.tgisinternal
  ), 'gatilho ' || t.gatilho || ' ausente'
  FROM (VALUES
    ('predictions', 'trg_previsao_nasce_pendente'),
    ('paper_bets',  'trg_aposta_nasce_aberta')
  ) AS t(nome, gatilho)

  UNION ALL

  -- 3) Dá para apagar previsão já resolvida? (o cherry-picking)
  SELECT 'predictions.delete_resolvida', NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'predictions' AND cmd = 'DELETE'
      AND qual LIKE '%resolved = false%'
  ), 'a política de DELETE não exige resolved = false';
$$;

REVOKE ALL ON FUNCTION public.travas_de_escrita() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.travas_de_escrita() TO service_role;
