-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 035_predictions_id_com_prefixo.sql
--
-- Achado de 20/09/2026, percorrendo o site logado com uma conta de teste: a
-- previsão registrada na ficha do mercado gravava o id CRU da plataforma
-- ("1130012"). Quem resolve previsão (`idDeLiquidacao`, em shared/liquidacao.ts)
-- exige o prefixo da fonte — sem ele devolve NULL e a previsão nunca é
-- resolvida. As três previsões do banco estavam assim, incluindo a do fundador,
-- de abril, ainda aberta: a pessoa registra, espera o resultado, e ele não chega.
--
-- O código já grava com prefixo (idCanonicoDeMercado). Aqui ficam as antigas.
--
-- SÓ id inteiramente NUMÉRICO vira `poly-`: é o formato do Polymarket. Ticker do
-- Kalshi tem letras e já vinha prefixado; id de outra forma fica como está —
-- prefixo errado liquidaria a previsão contra o mercado de outra plataforma, que
-- é pior do que não liquidar.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.predictions
   SET market_id = 'poly-' || market_id
 WHERE market_id ~ '^[0-9]+$';
