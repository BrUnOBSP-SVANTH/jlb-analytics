-- 012_analytics_events.sql
-- Telemetria first-party mínima (LGPD-friendly): sem IP, sem user-agent,
-- sem cookies — só evento + rota + anon_id aleatório do localStorage.
-- RLS ligado SEM policies: apenas o backend (service key) escreve/lê.

create table if not exists public.analytics_events (
  id         bigint generated always as identity primary key,
  event      text not null,
  path       text,
  anon_id    uuid,
  user_id    uuid,
  meta       jsonb,
  created_at timestamptz not null default now()
);

alter table public.analytics_events enable row level security;

create index if not exists analytics_events_event_time_idx
  on public.analytics_events (event, created_at desc);
