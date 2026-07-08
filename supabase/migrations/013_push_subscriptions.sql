-- 013_push_subscriptions.sql
-- Assinaturas Web Push para alertas de watchlist — o usuário recebe
-- notificação nativa quando um mercado salvo move ≥3pp, mesmo com o
-- site fechado. RLS ligado SEM policies: só o backend (service key).

create table if not exists public.push_subscriptions (
  endpoint      text primary key,
  keys          jsonb not null,          -- { p256dh, auth }
  watchlist_ids text[] not null default '{}',
  user_id       uuid references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
