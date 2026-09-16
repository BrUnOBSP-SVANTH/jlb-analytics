-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 032_rls_e_indices_de_fk.sql
--
-- Auditoria de 14/09/2026, item 22 (avisos do Supabase).
--
-- 1) As três policies de `paper_bets` chamavam `auth.uid()` SEM `select`, e o
--    Postgres reavalia a função LINHA A LINHA. Com `(select auth.uid())` ela
--    vira um InitPlan: uma avaliação por consulta. A regra de acesso é
--    exatamente a mesma — só a nota do plano muda.
--
-- 2) Duas chaves estrangeiras para `auth.users` sem índice de cobertura. Sem
--    ele, "meus feedbacks" e "minhas inscrições de push" varrem a tabela, e é a
--    mesma coluna que o Postgres precisa checar ao apagar um usuário.
--
-- NÃO entram aqui (e o porquê):
--  · `market_community_forecast` com SECURITY DEFINER é DELIBERADO (026/031): a
--    view existe para publicar o consenso agregado sem expor a previsão de cada
--    pessoa. Trocar para invoker devolveria zero linha a visitante anônimo.
--  · A extensão `vector` no schema public: mover exige reescrever o search_path
--    de tudo que usa embedding, com risco de derrubar a busca do Cérebro, para
--    ganho organizacional. Fica registrado, não feito.
--  · Os 12 índices "nunca usados": são de telas de baixo tráfego (leaderboard,
--    cota de IA). Índice sem uso custa escrita, não leitura — e derrubá-los
--    agora é apostar que a consulta nunca vai acontecer.
--  · "RLS habilitada sem policy" em analytics_events, chat_feedback, duels e
--    push_subscriptions é a POSTURA PRETENDIDA, não um esquecimento: nenhuma
--    delas é lida pelo navegador (conferido — só server/routes/*.ts as tocam,
--    com a chave de serviço), e RLS sem policy nega tudo para anon e
--    authenticated. Criar policy aqui seria ABRIR o que hoje está fechado.
--  · Proteção contra senha vazada (HaveIBeenPwned) é um interruptor do painel
--    do Supabase (Authentication → Password), não SQL — fica para o fundador.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "paper_bets_select_own" ON public.paper_bets;
CREATE POLICY "paper_bets_select_own" ON public.paper_bets
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "paper_bets_insert_own" ON public.paper_bets;
CREATE POLICY "paper_bets_insert_own" ON public.paper_bets
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "paper_bets_delete_own_aberta" ON public.paper_bets;
CREATE POLICY "paper_bets_delete_own_aberta" ON public.paper_bets
  FOR DELETE USING ((select auth.uid()) = user_id AND resolved = false);

CREATE INDEX IF NOT EXISTS chat_feedback_user_idx       ON public.chat_feedback (user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx  ON public.push_subscriptions (user_id);
