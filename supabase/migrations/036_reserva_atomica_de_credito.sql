-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 036_reserva_atomica_de_credito.sql
--
-- A COTA GRÁTIS ERA FURÁVEL COM PEDIDOS SIMULTÂNEOS (medido em 21/09/2026).
--
-- O middleware (server/middleware/aiCredits.ts) CONFERIA o saldo antes da
-- análise e só DEBITAVA depois que ela terminava — de 5 a 25 segundos depois,
-- o tempo da IA responder. Nesse intervalo, todo pedido lia o MESMO saldo e
-- passava. Teste com o middleware real: com 3 de 4 usadas, 5 pedidos ao mesmo
-- tempo passaram os 5 (saldo foi a 8); com a cota zerada, 6 passaram os 6. Não
-- precisa de script: duas abas clicando "Analisar" juntas já bastam.
--
-- O conserto é inverter a ordem: RESERVAR antes, num passo só — o UPDATE só
-- acontece se ainda houver saldo, e o Postgres serializa as reservas
-- concorrentes pela trava da linha (reavalia o WHERE depois de esperar a trava).
-- E DEVOLVER quando não houve geração de verdade: acerto de cache e erro não
-- cobram, como já era a regra (cobrança justa com 4 por mês).
--
-- Mês novo: a reserva já grava o mês corrente, então `reset_monthly_credits`
-- (BEFORE UPDATE) fica inerte — mesmo padrão de `increment_ai_credits`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reservar_credito_ia(p_user_id uuid, p_limite integer)
RETURNS TABLE(reservado boolean, usado integer, plano text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  mes date := date_trunc('month', now())::date;
  v_usado integer;
  v_plano text;
BEGIN
  -- Primeira análise da vida da conta: a linha nasce aqui.
  INSERT INTO public.ai_credits (user_id, used_this_month, plan, month_reset)
  VALUES (p_user_id, 0, 'free', mes)
  ON CONFLICT (user_id) DO NOTHING;

  -- Confere E debita num passo só. Premium não tem teto; mês antigo zera.
  UPDATE public.ai_credits c
     SET used_this_month = CASE WHEN c.month_reset < mes THEN 1 ELSE c.used_this_month + 1 END,
         month_reset     = mes,
         updated_at      = now()
   WHERE c.user_id = p_user_id
     AND (c.plan = 'premium' OR c.month_reset < mes OR c.used_this_month < p_limite)
  RETURNING c.used_this_month, c.plan INTO v_usado, v_plano;

  IF FOUND THEN
    RETURN QUERY SELECT true, v_usado, v_plano;
  ELSE
    RETURN QUERY SELECT false, c.used_this_month, c.plan FROM public.ai_credits c WHERE c.user_id = p_user_id;
  END IF;
END;
$$;

-- Devolve a reserva de quem não gerou nada (cache ou erro). Nunca abaixo de zero.
CREATE OR REPLACE FUNCTION public.devolver_credito_ia(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.ai_credits
     SET used_this_month = greatest(0, used_this_month - 1),
         updated_at      = now()
   WHERE user_id = p_user_id;
$$;

-- Só o servidor (chave de serviço) chama. Recebem o id do usuário como
-- parâmetro: expostas ao público, deixariam qualquer um gastar — ou devolver —
-- a cota de OUTRA pessoa.
REVOKE ALL ON FUNCTION public.reservar_credito_ia(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.devolver_credito_ia(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_credito_ia(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.devolver_credito_ia(uuid) TO service_role;

-- Higiene achada na mesma revisão: sobrou TRUNCATE para anon/authenticated
-- (padrão do Supabase). A API REST não expõe TRUNCATE, mas privilégio que
-- ninguém usa é privilégio que alguém pode vir a usar.
REVOKE TRUNCATE ON public.ai_credits FROM anon, authenticated;
