-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 043_briefing_do_dia.sql
--
-- Auditoria 21/09, SEG-02. O briefing diário vivia SÓ na memória do processo,
-- com chave pela data UTC. Duas consequências medidas:
--
--  1. cada deploy jogava fora o briefing do dia e a próxima visita pagava a
--     geração de novo — IA, NewsAPI (100 chamadas/dia no plano grátis),
--     Polymarket, Kalshi e BCB;
--  2. a chave virava às 21h de Brasília, porque a data era a de Londres: o
--     "briefing de hoje" trocava no meio da noite de quem lê.
--
-- Agora ele é gravado aqui, uma linha por dia de BRASÍLIA. Sobrevive a deploy,
-- e o dia é o dia daqui.
--
-- Leitura pública: o briefing é conteúdo aberto do site (é o que /briefing
-- mostra a visitante sem conta). Escrita só do servidor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.briefing_do_dia (
  dia        date        PRIMARY KEY,           -- data de Brasília, não UTC
  conteudo   jsonb       NOT NULL,
  modelo     text,                              -- qual provedor respondeu
  criado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.briefing_do_dia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS briefing_leitura_publica ON public.briefing_do_dia;
CREATE POLICY briefing_leitura_publica ON public.briefing_do_dia
  FOR SELECT TO anon, authenticated
  USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.briefing_do_dia FROM anon, authenticated;
