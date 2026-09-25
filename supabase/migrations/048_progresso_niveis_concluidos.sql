-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 048_progresso_niveis_concluidos.sql
--
-- Auditoria 21/09, APR-01: a trilha não sobrevivia à troca de aparelho.
--
-- Desde a auditoria de 14/09 (NVL-01), "nível concluído" deixou de significar
-- "abriu a página" e passou a significar "resolveu um exercício dele". Essa
-- informação vive em `UserProgress.levelsCompleted` — e nunca subiu para a
-- nuvem: a tabela não tinha a coluna e o `pushProgress` não a enviava.
--
-- O efeito não era só "não sincroniza". `mergeProgress` monta o objeto a partir
-- dos campos que conhece, e como não conhecia este, o campo voltava `undefined`
-- — ou seja, CADA PULL APAGAVA a trilha do aparelho que sincronizou. Quem
-- entrasse na conta no celular depois de estudar no computador não só não via o
-- avanço: perdia o avanço que tinha ali. É a definição de "salvo na sua conta"
-- funcionando ao contrário, e num produto cuja promessa é medir o seu progresso.
--
-- `jsonb` com default `[]`, como `activities` e `one_time_done` ao lado: conta
-- pequena (no máximo cinco números), lida junto no mesmo SELECT.
--
-- A RLS de `user_progress` já existe e não muda: cada pessoa lê e escreve só a
-- própria linha. Coluna nova herda a política da tabela.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS levels_completed jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.user_progress.levels_completed IS
  'Níveis com pelo menos um exercício resolvido (APR-01). Abrir a página não conta.';
