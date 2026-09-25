-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 049_catalogo_persistido.sql
--
-- Auditoria 21/09, DES-02: o catálogo é montado DENTRO do pedido de alguém.
--
-- Medido em 25/09, na produção: a primeira chamada a /api/polymarket/markets
-- depois de o serviço subir levou 10,5s; a segunda, 0,3s. A diferença é o
-- catálogo sendo construído — três páginas de 100 eventos com mercados
-- aninhados, sob 0,1 CPU — enquanto um navegador espera.
--
-- E não é caso raro: o plano grátis do Render dorme depois de 15 minutos sem
-- tráfego, e o site tem cerca de 53 visitantes por mês. Ou seja, QUASE TODO
-- VISITANTE é o primeiro — quase todo mundo paga os 10,5s. O mesmo aperto de
-- CPU é o que faz uma página da fonte estourar o orçamento e o catálogo chegar
-- com 140 mercados em vez de 356.
--
-- A memória do processo não resolve isso: ela nasce vazia junto com o processo,
-- que é exatamente o problema. A última versão boa precisa morar no BANCO, que
-- sobrevive a soneca, deploy e reinício. Mesma lição de `tarefas_execucao`
-- (migração 045) e do orçamento de IA.
--
-- ⚠️ O que se guarda aqui é CÓPIA, nunca verdade. A tela só pode mostrar este
-- conteúdo dizendo de quando ele é — preço de uma hora atrás apresentado como
-- "ao vivo" seria a plataforma quebrando a própria promessa para parecer
-- rápida. Por isso `atualizado_em` não é opcional.
--
-- Uma linha por fonte. Só o servidor lê e escreve.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.catalogo_mercados (
  fonte         text PRIMARY KEY,
  itens         jsonb NOT NULL,
  quantidade    integer NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.catalogo_mercados IS
  'Última versão boa do catálogo de cada fonte (DES-02). Cópia para o arranque frio, nunca fonte de verdade.';
COMMENT ON COLUMN public.catalogo_mercados.atualizado_em IS
  'De quando é esta cópia. A tela precisa dizer isso a quem lê.';

ALTER TABLE public.catalogo_mercados ENABLE ROW LEVEL SECURITY;

-- Sem política para anon/authenticated: só a chave de serviço entra. O catálogo
-- já é público pela rota HTTP, que é onde o cache e o corte acontecem — abrir a
-- tabela daria a qualquer visitante um jeito de baixar 250 KB sem passar por
-- nenhum deles.
REVOKE ALL ON TABLE public.catalogo_mercados FROM PUBLIC;
