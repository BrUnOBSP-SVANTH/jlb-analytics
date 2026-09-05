-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 005_market_snapshots.sql
-- Snapshots diários de mercados Polymarket/Kalshi/Manifold.
-- Acumula histórico de probabilidade, volume e status por mercado.
-- Com 90 dias de dados → análise de calibração do próprio mercado.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.market_snapshots (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id    text         NOT NULL,
  source       text         NOT NULL CHECK (source IN ('polymarket', 'kalshi', 'manifold')),
  title        text         NOT NULL,
  category     text,
  yes_prob     numeric(5,2) CHECK (yes_prob BETWEEN 0 AND 100),
  volume       numeric(18,2),
  volume_24h   numeric(18,2),
  liquidity    numeric(18,2),
  status       text         NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'resolved')),
  outcome      boolean,
  snap_date    date         NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  snapped_at   timestamptz  NOT NULL DEFAULT now()
);

-- Um snapshot por mercado por dia — índice em coluna date (IMMUTABLE-safe)
CREATE UNIQUE INDEX IF NOT EXISTS market_snapshots_daily_uniq
  ON public.market_snapshots (market_id, source, snap_date);

CREATE INDEX IF NOT EXISTS market_snapshots_market_idx  ON public.market_snapshots (market_id, source);
CREATE INDEX IF NOT EXISTS market_snapshots_snapped_idx ON public.market_snapshots (snapped_at DESC);
CREATE INDEX IF NOT EXISTS market_snapshots_date_idx    ON public.market_snapshots (snap_date DESC);
CREATE INDEX IF NOT EXISTS market_snapshots_category_idx ON public.market_snapshots (category);

-- Leitura pública — dados de mercado não são sensíveis
ALTER TABLE public.market_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "snapshots_public_read" ON public.market_snapshots;
CREATE POLICY "snapshots_public_read"
  ON public.market_snapshots FOR SELECT USING (true);

GRANT SELECT ON public.market_snapshots TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- AI credits: controla consumo de chamadas IA por usuário
-- Free: 30 análises/mês | Premium: ilimitado
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_credits (
  user_id       uuid         PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan          text         NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  used_this_month integer    NOT NULL DEFAULT 0,
  month_reset   date         NOT NULL DEFAULT date_trunc('month', now())::date,
  updated_at    timestamptz  NOT NULL DEFAULT now()
);

-- Trigger que zera contador no início de cada mês
CREATE OR REPLACE FUNCTION public.reset_monthly_credits()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.month_reset < date_trunc('month', now())::date THEN
    NEW.used_this_month := 0;
    NEW.month_reset := date_trunc('month', now())::date;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ai_credits_monthly_reset
  BEFORE UPDATE ON public.ai_credits
  FOR EACH ROW EXECUTE FUNCTION public.reset_monthly_credits();

ALTER TABLE public.ai_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "credits_own" ON public.ai_credits;
CREATE POLICY "credits_own"
  ON public.ai_credits FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.ai_credits TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- AI usage log: cada chamada de IA registrada (auditoria + analytics)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid         REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_address   text,
  endpoint     text         NOT NULL,
  model        text,
  tokens_in    integer      DEFAULT 0,
  tokens_out   integer      DEFAULT 0,
  latency_ms   integer,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_user_idx   ON public.ai_usage (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_ip_idx     ON public.ai_usage (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_ep_idx     ON public.ai_usage (endpoint, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
-- Usuário vê só o próprio histórico; service key acessa tudo
DROP POLICY IF EXISTS "usage_own_read" ON public.ai_usage;
CREATE POLICY "usage_own_read"
  ON public.ai_usage FOR SELECT USING (auth.uid() = user_id);

GRANT SELECT ON public.ai_usage TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- View: histórico de prob de um mercado específico (últimos 90 dias)
-- Útil para sparklines de longo prazo e calibração do mercado.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.market_history AS
SELECT
  market_id,
  source,
  title,
  category,
  yes_prob,
  volume,
  volume_24h,
  status,
  outcome,
  snap_date,
  snapped_at
FROM public.market_snapshots
WHERE snap_date >= (now() AT TIME ZONE 'UTC')::date - 90
ORDER BY market_id, snapped_at DESC;

GRANT SELECT ON public.market_history TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: incrementa créditos de IA de forma atômica (evita race condition)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_ai_credits(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.ai_credits (user_id, used_this_month, plan)
  VALUES (p_user_id, 1, 'free')
  ON CONFLICT (user_id) DO UPDATE
  SET used_this_month = ai_credits.used_this_month + 1,
      updated_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.increment_ai_credits TO authenticated, service_role;
