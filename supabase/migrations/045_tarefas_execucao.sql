-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 045_tarefas_execucao.sql
--
-- Auditoria 21/09, INF-03: as tarefas recomeçavam a cada deploy.
--
-- Os crons de `server/index.ts` são `setTimeout(...)` a partir do BOOT, e o boot
-- acontece muito mais do que se imagina: cada deploy, e cada vez que o plano
-- grátis do Render deixa o serviço dormir e acordar. Com isso a coleta do
-- Cérebro disparava 30 s depois de cada subida (e levava 429 do Reddit), o seed
-- da IA rodava a cada partida, e a previsão esportiva também.
--
-- A memória do processo não serve para decidir isso — ela nasce vazia junto com
-- o processo, que é exatamente o problema. A última execução precisa morar no
-- BANCO, que é o que sobrevive a reinício, deploy e servidor paralelo. Mesma
-- lição que o orçamento de IA já tinha aprendido (lib/orcamentoIA.ts).
--
-- Só o servidor lê e escreve.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tarefas_execucao (
  nome             text        PRIMARY KEY,
  ultima_execucao  timestamptz NOT NULL DEFAULT now(),
  resultado        text,                      -- 'ok' | 'erro' | 'pulou'
  detalhe          text
);

ALTER TABLE public.tarefas_execucao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tarefas_execucao FROM anon, authenticated;
