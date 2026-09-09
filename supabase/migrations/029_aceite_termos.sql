-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 029_aceite_termos.sql
-- Registro do aceite dos Termos de Uso no cadastro.
--
-- POR QUE GRAVAR, E NÃO SÓ EXIGIR O CLIQUE. Uma caixa marcada que não deixa
-- rastro não prova nada: seis meses depois, com os termos já alterados duas
-- vezes, ninguém consegue dizer O QUE aquela pessoa aceitou. Por isso guardamos
-- a VERSÃO do texto junto com a data — é a versão que dá sentido ao aceite.
--
-- As duas colunas ficam em `profiles` porque o aceite é um atributo da conta, e
-- não um evento com vida própria: a pessoa aceita uma versão por vez, e o que
-- importa é a última. Se um dia for preciso o histórico completo (auditoria
-- formal), aí sim vira tabela — mas inventar a tabela agora seria construir para
-- um problema que ainda não existe.
--
-- Contas ANTIGAS ficam com NULL, e isso é correto: elas realmente não aceitaram
-- esta versão. NULL é a verdade; preencher com a data de criação seria fabricar
-- um aceite que nunca aconteceu.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS termos_aceitos_em      timestamptz,
  ADD COLUMN IF NOT EXISTS termos_versao_aceita   text;

COMMENT ON COLUMN public.profiles.termos_aceitos_em IS
  'Quando o usuário aceitou os Termos. NULL = conta anterior à exigência, ou aceite ainda não registrado.';
COMMENT ON COLUMN public.profiles.termos_versao_aceita IS
  'Qual VERSÃO dos Termos foi aceita (ex.: 2026-09-09). Sem isto, o aceite não prova nada depois que o texto muda.';

-- Quem já aceitou a versão vigente — a consulta de qualquer verificação futura.
CREATE INDEX IF NOT EXISTS profiles_termos_versao_idx
  ON public.profiles (termos_versao_aceita)
  WHERE termos_versao_aceita IS NOT NULL;

-- ─── Grants ───────────────────────────────────────────────────────────────
-- `profiles` tem privilégios POR COLUNA (ver o hardening de 05/07): conceder no
-- nível da tabela abriria colunas que o usuário não pode escrever, como `plan`.
-- O update só pode tocar as duas colunas do aceite, e a policy de RLS já
-- existente limita à própria linha.
GRANT UPDATE (termos_aceitos_em, termos_versao_aceita) ON public.profiles TO authenticated;
