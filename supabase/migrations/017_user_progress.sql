-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 017_user_progress.sql
-- Sincronização do progresso/gamificação do usuário entre dispositivos.
--
-- Antes, pontos, conquistas (marcos únicos) e feed de atividade viviam só em
-- localStorage (jlb_progress_v1): quem trocava de aparelho via 0 pts, feed
-- vazio e níveis 4/5 como "bloqueados" mesmo com as previsões restauradas.
-- Esta tabela persiste o progresso na conta. Espelha o padrão de RLS/grants de
-- 003_predictions.sql. O cliente (progressSync.ts) faz pull no login + push
-- (debounced) ao ganhar pontos, com merge: pontos = maior valor, marcos =
-- união, feed = 200 mais recentes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_progress (
  user_id       uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,

  total_points  integer     NOT NULL DEFAULT 0 CHECK (total_points >= 0),

  -- Feed de atividade (últimas ~200) e marcos únicos já concedidos.
  -- jsonb para espelhar o formato do cliente sem uma tabela por atividade.
  activities    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  one_time_done jsonb       NOT NULL DEFAULT '[]'::jsonb,

  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_progress_select_own" ON public.user_progress;
CREATE POLICY "user_progress_select_own"
  ON public.user_progress FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_progress_insert_own" ON public.user_progress;
CREATE POLICY "user_progress_insert_own"
  ON public.user_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_progress_update_own" ON public.user_progress;
CREATE POLICY "user_progress_update_own"
  ON public.user_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── Grants ───────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON public.user_progress TO authenticated;
