-- 014_duels.sql — Duelos de Previsão, Fase 1 (pontos, sem dinheiro real)
-- Ver DUELOS.md. Selagem: as previsões (creator_preds/opponent_preds) NUNCA
-- podem vazar para o oponente antes do lock — por isso a tabela NÃO tem
-- policies públicas: todo acesso passa pelo servidor (service key), que
-- sanitiza o que cada lado pode ver. Mesmo padrão de analytics_events.

create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null,
  creator_name text not null default 'Desafiante',
  opponent_id uuid,
  opponent_name text,
  status text not null default 'open' check (status in ('open','active','resolved','cancelled')),
  stake_pts integer not null default 50 check (stake_pts between 10 and 500),
  markets jsonb not null,          -- baralho: [{marketId, source, title, probAtCreate}]
  creator_preds jsonb not null,    -- seladas na criação: [{marketId, prob 1-99}]
  opponent_preds jsonb,            -- seladas no join
  creator_brier numeric,
  opponent_brier numeric,
  resolved_legs integer,
  winner_id uuid,
  created_at timestamptz not null default now(),
  locked_at timestamptz,
  resolved_at timestamptz
);

alter table public.duels enable row level security;
-- (sem policies de propósito — acesso só via service key/servidor)

create index if not exists duels_status_idx  on public.duels (status, created_at desc);
create index if not exists duels_creator_idx on public.duels (creator_id);
create index if not exists duels_opponent_idx on public.duels (opponent_id);
