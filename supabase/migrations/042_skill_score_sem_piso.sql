-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 042_skill_score_sem_piso.sql
--
-- 🔴 QUEM ERRA MUITO NUNCA TEM A PREVISÃO RESOLVIDA.
--
-- Achado em 22/09 pelo `scripts/provar-travas.mjs`, enquanto ele testava outra
-- coisa. O roteiro de teste registrava uma previsão ruim de propósito (99% num
-- desfecho que não aconteceu, com o mercado em 50%) e o banco recusava a
-- resolução com `23514` — violação de CHECK.
--
-- A conta:
--   Brier do usuário = (0,99 − 0)²  = 0,9801
--   Brier do mercado = (0,50 − 0)²  = 0,25
--   skill = 1 − 0,9801/0,25         = −2,9204
--
-- E `profiles_skill_score_check` exigia `skill_score >= -1`. O gatilho que
-- recalcula o perfil estourava, e o UPDATE que resolvia a previsão ia junto:
-- a linha ficava `resolved=false` PARA SEMPRE, e o job de 6 horas tentava de
-- novo, e falhava de novo, em silêncio.
--
-- Quem isso atingia? Exatamente quem mais precisa da plataforma: o usuário que
-- ainda erra feio comparado ao mercado. O bom previsor nunca esbarrava nisso.
--
-- ⚠️ A RESTRIÇÃO É QUE ESTAVA ERRADA, não a conta. Brier Skill Score vale
-- (−∞, 1] por definição: 1 é a perfeição, 0 é empatar com a baseline, e não há
-- piso — errar pode ser arbitrariamente ruim. O cliente já calculava assim
-- (`skillScore` em client/src/lib/predictions.ts, sem piso); era só o banco que
-- recusava o próprio número do sistema.
--
-- O teto de 1 fica: acima disso seria erro de cálculo, não desempenho.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_skill_score_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_skill_score_check
  CHECK (skill_score IS NULL OR skill_score <= 1);
