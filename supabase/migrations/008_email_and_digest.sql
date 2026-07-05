-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 008_email_and_digest.sql
-- Preferências de email (opt-in) + RPC de destinatários do resumo semanal +
-- constraint nomeada de snapshots (necessária para upsert on_conflict).
-- ─────────────────────────────────────────────────────────────────────────────

-- Constraint nomeada para o upsert de market_snapshots (POST on_conflict)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'market_snapshots_market_source_date_key'
  ) THEN
    ALTER TABLE public.market_snapshots
      ADD CONSTRAINT market_snapshots_market_source_date_key
      UNIQUE (market_id, source, snap_date);
  END IF;
END $$;

-- Preferências de email (opt-in, default desligado por consentimento — LGPD)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email_weekly_digest    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_resolution_alert boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_digest_sent_at    timestamptz;

-- RPC restrita ao service role: emails dos inscritos no digest (há 6+ dias sem receber)
CREATE OR REPLACE FUNCTION public.get_digest_recipients()
RETURNS TABLE (user_id uuid, email text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT p.id, u.email
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.email_weekly_digest = true
    AND u.email IS NOT NULL
    AND (p.last_digest_sent_at IS NULL OR p.last_digest_sent_at < now() - interval '6 days');
$$;

REVOKE ALL ON FUNCTION public.get_digest_recipients() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_digest_recipients() TO service_role;
