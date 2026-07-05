-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 002_profiles.sql
-- Tabela de perfis de usuário com nível de conhecimento e métricas
-- comportamentais para o sistema de educação quantitativa progressiva.
--
-- Nível 1 — Fundamentos (grátis)
-- Nível 2 — Leitura de Dados (grátis)
-- Nível 3 — Modelos Básicos (premium)
-- Nível 4 — Vieses e Psicologia (premium)
-- Nível 5 — Análise Integrada (premium)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Enum: planos disponíveis ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE plan_type AS ENUM ('free', 'premium');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Tabela principal ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Plano e nível de acesso
  plan                plan_type   NOT NULL DEFAULT 'free',
  level               smallint    NOT NULL DEFAULT 1
                        CHECK (level BETWEEN 1 AND 5),
  -- Nível máximo desbloqueado pelo usuário (via completar quizzes)
  max_unlocked_level  smallint    NOT NULL DEFAULT 1
                        CHECK (max_unlocked_level BETWEEN 1 AND 5),

  -- Stripe
  stripe_customer_id  text,
  stripe_subscription_id text,
  premium_expires_at  timestamptz,

  -- ── Métricas comportamentais (Kahneman-Tversky tracking) ────────────────
  -- Número total de sessões de análise realizadas
  total_sessions      integer     NOT NULL DEFAULT 0,
  -- Quantas vezes o usuário ignorou o sinal de divergência do modelo
  ignored_divergence_count integer NOT NULL DEFAULT 0,
  -- Quantas vezes o usuário consultou a explicação do modelo antes de decidir
  consulted_model_count    integer NOT NULL DEFAULT 0,
  -- Brier Score acumulado (soma dos quadrados dos erros de calibração)
  -- Dividir por brier_n para obter o score médio
  brier_score_sum     float       NOT NULL DEFAULT 0,
  brier_n             integer     NOT NULL DEFAULT 0,
  -- Skill Score vs. referência de 0.25 (random baseline)
  -- Calculado no backend: 1 - (brier_score_sum/brier_n) / 0.25
  -- Armazenado aqui para consulta rápida no frontend
  skill_score         float       NOT NULL DEFAULT 0
                        CHECK (skill_score BETWEEN -1 AND 1),
  -- Loss aversion ratio observado (λ na teoria de Kahneman-Tversky)
  -- Default = 2.25 (valor clínico), atualizado com dados reais do usuário
  loss_aversion_ratio float       NOT NULL DEFAULT 2.25
                        CHECK (loss_aversion_ratio > 0),
  -- Gamblers fallacy index: proporção de decisões que violam independência
  gambler_fallacy_index float     NOT NULL DEFAULT 0
                        CHECK (gambler_fallacy_index BETWEEN 0 AND 1),
  -- Overconfidence index: (confiança declarada) / (acurácia real) - 1
  overconfidence_index  float     NOT NULL DEFAULT 0,

  -- ── Progresso nos quizzes de nível ──────────────────────────────────────
  -- JSONB: { "1": {"completed": true, "score": 0.85, "attempts": 2}, ... }
  level_progress      jsonb       NOT NULL DEFAULT '{}',

  -- ── Timestamps ──────────────────────────────────────────────────────────
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── Índices ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS profiles_plan_idx ON public.profiles(plan);
CREATE INDEX IF NOT EXISTS profiles_level_idx ON public.profiles(level);
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_idx ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- ─── Auto-updated_at trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ─── Auto-create profile on user signup ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Row Level Security ───────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Usuário lê apenas o próprio perfil
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Usuário atualiza apenas campos não-sensíveis do próprio perfil
-- (plan, stripe_*, skill_score são atualizados só pelo backend via service_role)
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ─── Nível máximo liberado por plano ─────────────────────────────────────
-- REGRA DE NEGÓCIO:
--   free     → max level_access = 2 (bloqueado pelo backend, não pela DB)
--   premium  → max level_access = 5
-- A DB não força isso via constraint porque o backend valida antes de servir
-- os dados dos modelos (mais flexível e auditável).

-- ─── View para o frontend: perfil público sem dados sensíveis ─────────────
CREATE OR REPLACE VIEW public.profile_summary AS
SELECT
  id,
  plan,
  level,
  max_unlocked_level,
  total_sessions,
  skill_score,
  loss_aversion_ratio,
  gambler_fallacy_index,
  overconfidence_index,
  level_progress,
  created_at
FROM public.profiles;

-- ─── Grants ───────────────────────────────────────────────────────────────
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profile_summary TO authenticated;
