-- ─────────────────────────────────────────────────────────────────────────────
-- 027_bold_prompt_version.sql — versiona o prompt do experimento cego.
--
-- ⚠️ Esta alteração JÁ ESTÁ no banco: foi aplicada em 30/08/2026 direto, sem
-- arquivo (registrada lá como "bold_prompt_version"). O arquivo existe para o
-- repositório voltar a descrever o banco por inteiro — quem recriasse o banco a
-- partir das migrations ficaria sem a coluna e a medição do experimento quebraria
-- em silêncio. Idempotente (IF NOT EXISTS), então rodar de novo é inofensivo.
--
-- Por que a coluna existe: o prompt v1 do experimento cego não explicava a
-- convenção do título, e o modelo respondia a pergunta ERRADA ("o jogo vai
-- acontecer?" em vez de "o time A vence?"), gerando desvios de ~38pp que mediam
-- um bug, não a hipótese. As linhas v1 foram MARCADAS em vez de apagadas: o erro
-- fica no registro, e a régua (/api/ai/bold-status) filtra bold_prompt_v >= 2.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ai_forecasts
  ADD COLUMN IF NOT EXISTS bold_prompt_v smallint;

COMMENT ON COLUMN public.ai_forecasts.bold_prompt_v IS
  'Versão do prompt cego. v1 = defeituoso (sem convenção de leitura do título). v2 = com a convenção. Analisar SOMENTE v2.';

-- Linhas antigas são v1 por definição (só o prompt v1 existia quando foram criadas).
UPDATE public.ai_forecasts
   SET bold_prompt_v = 1
 WHERE ai_fair_value_bold IS NOT NULL AND bold_prompt_v IS NULL;
