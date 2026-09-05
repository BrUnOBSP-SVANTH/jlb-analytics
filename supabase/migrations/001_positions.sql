-- ============================================================
-- JLB Analytics — Supabase Migration 001
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Positions table
CREATE TABLE IF NOT EXISTS public.positions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('Renda Fixa', 'Ações', 'ETFs', 'Internacional')),
  invested    numeric(15, 2) NOT NULL CHECK (invested >= 0),
  current     numeric(15, 2) NOT NULL CHECK (current >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER positions_updated_at
  BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 3. Row Level Security — each user sees only their own positions
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own positions" ON public.positions;
CREATE POLICY "Users can view own positions"
  ON public.positions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own positions" ON public.positions;
CREATE POLICY "Users can insert own positions"
  ON public.positions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own positions" ON public.positions;
CREATE POLICY "Users can update own positions"
  ON public.positions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own positions" ON public.positions;
CREATE POLICY "Users can delete own positions"
  ON public.positions FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Index for fast per-user queries
CREATE INDEX IF NOT EXISTS positions_user_id_idx ON public.positions(user_id);

-- ============================================================
-- ENABLE GOOGLE OAUTH (do this in Dashboard > Auth > Providers)
-- 1. Go to https://console.cloud.google.com
-- 2. Create OAuth 2.0 credentials
-- 3. Add your Supabase callback URL as authorized redirect
-- 4. Paste Client ID and Secret in Supabase Auth settings
-- ============================================================
