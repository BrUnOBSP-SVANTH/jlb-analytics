-- 011_chat_feedback.sql
-- Avaliação 👍/👎 das respostas do Analista JLB (widget de chat).
-- Fecha o loop de qualidade: dá base real para refinar o prompt/RAG.
-- RLS ligado SEM policies públicas — apenas o backend (service key) escreve/lê.

create table if not exists public.chat_feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id) on delete set null,
  question   text not null,
  answer     text not null,
  rating     smallint not null check (rating in (-1, 1)),
  created_at timestamptz not null default now()
);

alter table public.chat_feedback enable row level security;

create index if not exists chat_feedback_created_idx
  on public.chat_feedback (created_at desc);
