-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 028_paper_bets.sql
-- Banca simulada: apostas fictícias em mercados REAIS.
--
-- O que muda em relação ao que existia. O "Portfólio Simulado" guardava tudo em
-- localStorage (jlb_portfolio_v1): trocou de aparelho, perdeu a banca; limpou o
-- navegador, perdeu a banca. Pior: o P&L era marcado pela variação de preço e
-- NADA nunca resolvia — a pessoa apostava e o resultado jamais chegava.
--
-- Aqui a aposta vira uma linha na conta do usuário, e o servidor a liquida
-- sozinho contra o resultado OFICIAL da plataforma (Kalshi `result`, Polymarket
-- UMA — nunca chute de preço), o mesmo settlement que já julga a IA e as
-- previsões do usuário. Uma fonte de verdade só para "o que aconteceu".
--
-- Colunas de dinheiro em numeric, não float: banca é caixa, e caixa que soma
-- errado no terceiro decimal destrói a confiança no número.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.paper_bets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Identidade do mercado real, no mesmo formato do resto do site
  -- (poly-<id> / kalshi-<ticker>), que é o que o resolvedor oficial entende.
  market_id       text        NOT NULL,
  source          text        NOT NULL CHECK (source IN ('polymarket', 'kalshi')),
  market_question text        NOT NULL,
  external_url    text,
  closes_at       timestamptz,

  -- A aposta. entry_price é SEMPRE a probabilidade do lado SIM, mesmo quando se
  -- apostou no NÃO — mesmo referencial de market_prob nas outras tabelas, para
  -- que os números possam ser comparados entre si sem conversão silenciosa.
  side            text        NOT NULL CHECK (side IN ('sim', 'nao')),
  entry_price     numeric(6,4) NOT NULL CHECK (entry_price > 0 AND entry_price < 1),
  stake           numeric(12,2) NOT NULL CHECK (stake > 0),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- A liquidação. Preenchida só pelo servidor, só com resultado oficial.
  resolved        boolean     NOT NULL DEFAULT false,
  outcome         boolean,                 -- o SIM aconteceu?
  payout          numeric(14,2),           -- quanto voltou para a banca (0 no erro)
  resolution_source text,                  -- 'kalshi_result' | 'polymarket_uma'
  settled_at      timestamptz,

  -- Coerência: ou está aberta e sem nada preenchido, ou resolveu com desfecho e
  -- pagamento. Sem isto, um bug de escrita parcial deixaria a banca somando um
  -- payout sem desfecho, e o saldo mentiria sem nunca dar erro.
  CONSTRAINT paper_bets_liquidacao_coerente CHECK (
    (resolved = false AND outcome IS NULL AND payout IS NULL AND settled_at IS NULL)
    OR
    (resolved = true  AND outcome IS NOT NULL AND payout IS NOT NULL)
  )
);

-- Uma aposta por lado por mercado: a tela mostra a posição, não um extrato de
-- ordens. Sem isto, "apostar de novo" viraria linhas duplicadas e o usuário
-- perderia a noção de quanto tem exposto naquele evento.
CREATE UNIQUE INDEX IF NOT EXISTS paper_bets_uma_por_lado
  ON public.paper_bets (user_id, market_id, side);

-- A consulta da tela: as apostas do usuário, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS paper_bets_user_idx
  ON public.paper_bets (user_id, created_at DESC);

-- A consulta do liquidador: só o que ainda está aberto.
CREATE INDEX IF NOT EXISTS paper_bets_pendentes_idx
  ON public.paper_bets (resolved, created_at)
  WHERE resolved = false;

-- ─── Row Level Security ───────────────────────────────────────────────────
ALTER TABLE public.paper_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "paper_bets_select_own"
  ON public.paper_bets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "paper_bets_insert_own"
  ON public.paper_bets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Apagar só a própria, e só enquanto ABERTA: desfazer aposta já resolvida seria
-- reescrever o histórico — some justamente a perda que a pessoa não gostou.
CREATE POLICY "paper_bets_delete_own_aberta"
  ON public.paper_bets FOR DELETE
  USING (auth.uid() = user_id AND resolved = false);

-- Sem policy de UPDATE para `authenticated`, de propósito: quem liquida é o
-- servidor (service key, que ignora RLS). Se o cliente pudesse dar UPDATE, ele
-- poderia se declarar vencedor — e a banca deixaria de significar qualquer coisa.

-- ─── Grants ───────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, DELETE ON public.paper_bets TO authenticated;
