-- 009_security_hardening.sql
-- Fecha as brechas apontadas pelos security advisors do Supabase (2026-07-05):
--   1. Views SECURITY DEFINER sobre dados públicos viram security_invoker (lint 0010).
--   2. Views por-usuário sem consumidor no client deixam de ser legíveis pela API pública.
--   3. profiles: colunas de billing (Stripe) viram server-only via privilégios de coluna —
--      antes qualquer visitante lia stripe_customer_id/stripe_subscription_id de perfis públicos.
--   4. profiles: UPDATE restrito às colunas que o app edita — antes um usuário logado podia
--      fazer UPDATE profiles SET plan='premium' na própria linha (premium grátis).
--   5. ai_credits: cliente só lê a própria linha — antes a policy ALL permitia zerar
--      used_this_month ou trocar o próprio plan.
--   6. RPCs SECURITY DEFINER não são mais executáveis por anon/authenticated — antes
--      increment_ai_credits(uuid) permitia queimar a cota de qualquer usuário, e
--      get_digest_recipients() vazava e-mails.
--   7. search_path fixo nas funções (lint 0011).

-- 1. Dados-base já públicos (RLS `using (true)`) ou filtrados pelo RLS do caller
alter view public.leaderboard      set (security_invoker = true);
alter view public.market_history   set (security_invoker = true);
alter view public.ai_track_record  set (security_invoker = true);
-- market_community_forecast e user_calibration continuam SECURITY DEFINER de propósito:
-- agregam a tabela privada `predictions` e expõem apenas estatísticas agregadas.

-- 2. Views sem consumidor no client: somente service_role
revoke select on public.profile_summary  from anon, authenticated;
revoke select on public.user_calibration from anon, authenticated;

-- 3 + 4. profiles: privilégios por coluna
revoke select, insert, update, delete on table public.profiles from anon, authenticated;

grant select (id, username, display_name, bio, public_profile, plan, level,
              skill_score, avg_brier_score, predictions_count, resolved_count, created_at)
  on public.profiles to anon;

grant select (id, username, display_name, bio, public_profile, plan, level,
              max_unlocked_level, total_sessions, skill_score, avg_brier_score,
              brier_score_sum, brier_n, loss_aversion_ratio, gambler_fallacy_index,
              overconfidence_index, ignored_divergence_count, consulted_model_count,
              level_progress, predictions_count, resolved_count,
              email_weekly_digest, email_resolution_alert, created_at, updated_at)
  on public.profiles to authenticated;

grant update (username, display_name, bio, public_profile,
              email_weekly_digest, email_resolution_alert)
  on public.profiles to authenticated;

-- 5. ai_credits: leitura própria apenas; escrita é exclusiva do backend (service key)
drop policy if exists credits_own on public.ai_credits;
create policy credits_select_own on public.ai_credits
  for select using ((select auth.uid()) = user_id);
revoke insert, update, delete on table public.ai_credits from anon, authenticated;

-- 6. Funções nunca executáveis pela API pública (server usa service_role)
revoke execute on function public.increment_ai_credits(uuid) from public, anon, authenticated;
revoke execute on function public.update_profile_stats()     from public, anon, authenticated;
revoke execute on function public.handle_new_user()          from public, anon, authenticated;
revoke execute on function public.handle_updated_at()        from public, anon, authenticated;
revoke execute on function public.reset_monthly_credits()    from public, anon, authenticated;
revoke execute on function public.get_digest_recipients()    from public, anon, authenticated;

-- 7. search_path fixo (lint 0011_function_search_path_mutable)
alter function public.increment_ai_credits(uuid) set search_path = public, pg_temp;
alter function public.update_profile_stats()     set search_path = public, pg_temp;
alter function public.handle_new_user()          set search_path = public, pg_temp;
alter function public.handle_updated_at()        set search_path = public, pg_temp;
alter function public.reset_monthly_credits()    set search_path = public, pg_temp;
alter function public.get_digest_recipients()    set search_path = public, pg_temp;
