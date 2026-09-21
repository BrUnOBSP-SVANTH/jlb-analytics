-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 037_cota_por_identidade.sql
--
-- A COTA GRÁTIS PASSA A SER DA PESSOA, NÃO DA CONTA (21/09/2026, pedido do
-- fundador: "temos que resolver isso o quanto antes").
--
-- Com a cota por conta, somar análises custava só criar contas. O cadastro
-- exige confirmar o e-mail, então o caminho barato era uma caixa que recebe
-- por vários endereços: no Gmail, joao+1@, joao+2@ e j.o.a.o@ caem na mesma
-- caixa. O servidor normaliza o e-mail (server/lib/identidadeCota.ts) e manda
-- aqui só o HASH — esta tabela nunca vê o e-mail.
--
-- Premium continua por conta (ai_credits.plan). O saldo grátis é contado em
-- cota_ia_identidade; ai_credits.used_this_month segue como espelho por conta.
--
-- As versões antigas (2 e 1 argumentos) ficam até o código novo estar no ar:
-- trocá-las agora derrubaria o site entre a migração e o deploy.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cota_ia_identidade (
  identidade    text        PRIMARY KEY,           -- sha256 do e-mail normalizado
  usado         integer     NOT NULL DEFAULT 0,
  mes           date        NOT NULL DEFAULT date_trunc('month', now())::date,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (identidade ~ '^[0-9a-f]{64}$')
);

-- Só o servidor lê e escreve. Sem policy: RLS ligada nega tudo para anon e
-- authenticated (mesma postura de lista_de_espera e analytics_events).
ALTER TABLE public.cota_ia_identidade ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cota_ia_identidade FROM anon, authenticated;

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
  INSERT INTO public.ai_credits (user_id, used_this_month, plan, month_reset)
  VALUES (p_user_id, 0, 'free', mes_atual)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT c.plan INTO v_plano FROM public.ai_credits c WHERE c.user_id = p_user_id;

  -- Premium: sem teto. Conta no espelho da conta, para estatística.
  IF v_plano = 'premium' THEN
    UPDATE public.ai_credits c
       SET used_this_month = CASE WHEN c.month_reset < mes_atual THEN 1 ELSE c.used_this_month + 1 END,
           month_reset = mes_atual, updated_at = now()
     WHERE c.user_id = p_user_id
    RETURNING c.used_this_month INTO v_usado;
    RETURN QUERY SELECT true, v_usado, v_plano;
    RETURN;
  END IF;

  -- Grátis: o saldo é da IDENTIDADE. Confere e debita num passo só (a trava da
  -- linha serializa pedidos simultâneos — ver migração 036).
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

CREATE OR REPLACE FUNCTION public.devolver_credito_ia(p_user_id uuid, p_identidade text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.ai_credits
     SET used_this_month = greatest(0, used_this_month - 1), updated_at = now()
   WHERE user_id = p_user_id;
  UPDATE public.cota_ia_identidade
     SET usado = greatest(0, usado - 1), atualizado_em = now()
   WHERE identidade = p_identidade
     AND (SELECT plan FROM public.ai_credits WHERE user_id = p_user_id) IS DISTINCT FROM 'premium';
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_credito_ia(uuid, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.devolver_credito_ia(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_credito_ia(uuid, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.devolver_credito_ia(uuid, text) TO service_role;
