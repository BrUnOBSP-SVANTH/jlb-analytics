-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 030_predictions_desfecho.sql
-- Previsão sobre UM desfecho de um mercado com vários.
--
-- O PROBLEMA. A Calculadora de Edge tratava todo mercado como SIM/NÃO. Num
-- mercado de 12 times (Champions 2027, poly-2772176), uma estimativa de 19% não
-- dizia 19% DE QUÊ, e a previsão nascia órfã: impossível pontuar com Brier,
-- impossível mostrar no track record — ninguém sabia se era o Barcelona ou o
-- Aston Villa. Com o desfecho gravado, cada previsão vira um evento binário
-- próprio ("Barcelona campeão? sim/não"), e o brier_score gerado (003) passa a
-- valer para ela sem mudar nada.
--
-- AS COLUNAS:
--   outcome_id    identificador ESTÁVEL da fonte — token CLOB (Polymarket) ou
--                 ticker (Kalshi). Nunca o rótulo: nome de time muda e levaria
--                 o histórico junto.
--   outcome_label retrato do nome no momento do registro, para leitura humana.
--   Ambas nulas = mercado binário, como todas as linhas anteriores.
--
-- O QUE FICOU DE FORA, DE PROPÓSITO. A spec pedia também ev, kelly_full,
-- kelly_half e edge_pp gravados. São funções PURAS de market_prob e user_prob,
-- que a tabela já guarda (client/src/lib/edge.ts). Valor derivado gravado à
-- parte é o padrão que produziu os críticos da auditoria de 09/09: nasce igual
-- à fórmula e diverge dela no dia em que a fórmula muda.
--
-- Seguro e retrocompatível: colunas nullable, sem default, sem backfill. O
-- cliente (predictionsSync.ts) grava as colunas quando existem e as tira do
-- envio quando não — aplicar é zero-downtime, sem deploy coordenado.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.predictions add column if not exists outcome_id text;
alter table public.predictions add column if not exists outcome_label text;

comment on column public.predictions.outcome_id is
  'Mercado com vários desfechos: id estável do desfecho analisado (token CLOB no Polymarket, ticker no Kalshi). Nulo em mercado binário.';
comment on column public.predictions.outcome_label is
  'Nome do desfecho no momento do registro (ex.: Barcelona). Só leitura humana — a identidade é outcome_id.';

-- Várias versões DATADAS por desfecho são permitidas (atualizar a estimativa não
-- reescreve a anterior — calibração se mede pelo que se disse quando se disse),
-- então o índice é de busca, não único.
create index if not exists predictions_user_market_outcome_idx
  on public.predictions (user_id, market_id, outcome_id);
