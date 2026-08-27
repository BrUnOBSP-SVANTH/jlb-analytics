-- 020_ai_credits_reset_counts_first.sql
-- Corrige off-by-one no reset mensal da cota de IA.
--
-- Antes: increment_ai_credits fazia used_this_month + 1, e o trigger BEFORE UPDATE
-- reset_monthly_credits zerava para 0 quando o mês virava — engolindo a 1ª chamada
-- do mês (o usuário ganhava 1 análise extra: 5 num teto de 4).
--
-- Agora: a própria RPC decide. Se a linha é de um mês antigo, a chamada atual JÁ
-- conta como a 1ª do novo mês (used_this_month = 1) e month_reset vira o mês corrente;
-- senão, incrementa normalmente. O trigger reset_monthly_credits fica como no-op de
-- segurança (month_reset já sai atualizado pela RPC), sem precisar ser removido.
--
-- CREATE OR REPLACE preserva os grants/revokes da 009 (service_role apenas) e o
-- search_path fixo.

create or replace function public.increment_ai_credits(p_user_id uuid)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  insert into public.ai_credits (user_id, used_this_month, plan, month_reset)
  values (p_user_id, 1, 'free', date_trunc('month', now())::date)
  on conflict (user_id) do update
  set used_this_month = case
        when ai_credits.month_reset < date_trunc('month', now())::date then 1
        else ai_credits.used_this_month + 1
      end,
      month_reset = date_trunc('month', now())::date,
      updated_at = now();
$$;
