-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 033_lista_de_espera.sql
--
-- Auditoria de 14/09/2026, item 21. A página /planos dizia "deixe o seu e-mail
-- e avisamos quando abrir" e não tinha nenhum campo: o botão era um `mailto:`.
-- Em desktop sem cliente de e-mail configurado, o clique não faz NADA visível —
-- a pessoa que quis avisar que pagaria some sem deixar rastro.
--
-- SEM POLICY, de propósito. Mesma postura de `analytics_events`: RLS ligada e
-- nenhuma policy nega tudo para anon e authenticated; quem escreve é o servidor,
-- com a chave de serviço, depois de validar. Uma policy de INSERT para anon
-- transformaria a tabela em caixa de spam aberta.
--
-- E-mail é dado pessoal (LGPD): guardamos só ele, a origem e a data, para um uso
-- só — avisar quando o Premium abrir. A página diz isso ao lado do campo.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lista_de_espera (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL,
  origem     text,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

-- Um cadastro por e-mail: quem clica duas vezes não vira dois avisos.
CREATE UNIQUE INDEX IF NOT EXISTS lista_de_espera_email_uniq
  ON public.lista_de_espera (lower(email));

ALTER TABLE public.lista_de_espera ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lista_de_espera FROM anon, authenticated;
