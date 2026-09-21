-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 038_perfil_para_conta_orfa.sql
--
-- A CONTA DO FUNDADOR NÃO TINHA PERFIL (achado em 21/09/2026).
--
-- Ela foi criada em 05/04, antes do gatilho que cria `profiles` junto com a
-- conta — a de 15/04 já ganhou o dela. `ai_credits.user_id` aponta para
-- `profiles`, então a reserva de crédito (migração 036) falhava na chave
-- estrangeira. Com a trava antiga isso passava em silêncio: ela "deixava passar"
-- quando a gravação dava erro. Com a trava fechando em caso de erro (o certo),
-- a conta mais ativa do site ficou sem IA nenhuma — cada análise recebia "não
-- conseguimos conferir sua cota".
--
-- Duas camadas:
--   1. perfil para toda conta que não tem (hoje, só a do fundador);
--   2. a reserva cria o perfil que faltar antes de gravar a cota — conta órfã
--      nunca mais fica trancada, venha de onde vier.
-- Perfil nasce com os padrões da tabela (plano free, nível 1, zerado).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.profiles (id)
SELECT u.id FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reservar_credito_ia(p_user_id uuid, p_limite integer, p_identidade text)
RETURNS TABLE(reservado boolean, usado integer, plano text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  mes_atual date := date_trunc('month', now())::date;
  v_usado integer;
  v_plano text;
BEGIN
  -- Conta sem perfil (criada antes do gatilho) travava na chave estrangeira.
  INSERT INTO public.profiles (id) VALUES (p_user_id) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.ai_credits (user_id, used_this_month, plan, month_reset)
  VALUES (p_user_id, 0, 'free', mes_atual)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT c.plan INTO v_plano FROM public.ai_credits c WHERE c.user_id = p_user_id;

  IF v_plano = 'premium' THEN
    UPDATE public.ai_credits c
       SET used_this_month = CASE WHEN c.month_reset < mes_atual THEN 1 ELSE c.used_this_month + 1 END,
           month_reset = mes_atual, updated_at = now()
     WHERE c.user_id = p_user_id
    RETURNING c.used_this_month INTO v_usado;
    RETURN QUERY SELECT true, v_usado, v_plano;
    RETURN;
  END IF;

  INSERT INTO public.cota_ia_identidade (identidade, usado, mes)
  VALUES (p_identidade, 0, mes_atual)
  ON CONFLICT (identidade) DO NOTHING;

  UPDATE public.cota_ia_identidade q
     SET usado = CASE WHEN q.mes < mes_atual THEN 1 ELSE q.usado + 1 END,
         mes = mes_atual, atualizado_em = now()
   WHERE q.identidade = p_identidade
     AND (q.mes < mes_atual OR q.usado < p_limite)
  RETURNING q.usado INTO v_usado;

  IF FOUND THEN
    UPDATE public.ai_credits c
       SET used_this_month = CASE WHEN c.month_reset < mes_atual THEN 1 ELSE c.used_this_month + 1 END,
           month_reset = mes_atual, updated_at = now()
     WHERE c.user_id = p_user_id;
    RETURN QUERY SELECT true, v_usado, coalesce(v_plano, 'free');
  ELSE
    RETURN QUERY SELECT false, q.usado, coalesce(v_plano, 'free')
      FROM public.cota_ia_identidade q WHERE q.identidade = p_identidade;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_credito_ia(uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_credito_ia(uuid, integer, text) TO service_role;
