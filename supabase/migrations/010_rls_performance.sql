-- 010_rls_performance.sql
-- Performance advisors (2026-07-05):
--   1. auth_rls_initplan: `auth.uid()` re-avaliado POR LINHA nas policies.
--      `(select auth.uid())` deixa o planner avaliar uma vez por query.
--   2. profiles_select_own era redundante — profiles_public_read já cobre
--      `auth.uid() = id` (multiple_permissive_policies).
--   3. Índice duplicado em market_snapshots (daily_uniq ≡ constraint _key).

-- 1. positions
alter policy "Users can view own positions"   on public.positions using ((select auth.uid()) = user_id);
alter policy "Users can insert own positions" on public.positions with check ((select auth.uid()) = user_id);
alter policy "Users can update own positions" on public.positions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "Users can delete own positions" on public.positions using ((select auth.uid()) = user_id);

-- predictions
alter policy predictions_select_own on public.predictions using ((select auth.uid()) = user_id);
alter policy predictions_insert_own on public.predictions with check ((select auth.uid()) = user_id);
alter policy predictions_update_own on public.predictions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy predictions_delete_own on public.predictions using ((select auth.uid()) = user_id);

-- ai_usage
alter policy usage_own_read on public.ai_usage using ((select auth.uid()) = user_id);

-- profiles
alter policy profiles_public_read on public.profiles using ((public_profile = true) or ((select auth.uid()) = id));
alter policy profiles_update_own  on public.profiles using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- 2. Redundante: profiles_public_read já inclui a leitura da própria linha
drop policy if exists profiles_select_own on public.profiles;

-- 3. Índice duplicado (a UNIQUE constraint market_source_date_key já indexa)
drop index if exists public.market_snapshots_daily_uniq;
