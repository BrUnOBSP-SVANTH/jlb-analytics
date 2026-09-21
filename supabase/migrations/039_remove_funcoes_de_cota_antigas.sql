-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 039_remove_funcoes_de_cota_antigas.sql
--
-- Limpeza depois de a cota por pessoa (037/038) estar no ar (21/09/2026):
--  · increment_ai_credits(uuid)        — debitava DEPOIS da análise; foi o que
--                                         deixou pedidos simultâneos furarem a cota;
--  · reservar_credito_ia(uuid, int)    — reserva por CONTA (036);
--  · devolver_credito_ia(uuid)         — devolução por conta (036).
-- Nenhum código as chama mais. Função SECURITY DEFINER sem uso é superfície a
-- mais: se um dia alguém liberasse o EXECUTE por engano, a porta estaria lá.
-- Ficam as versões com identidade (uuid, int, text) e (uuid, text).
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.increment_ai_credits(uuid);
DROP FUNCTION IF EXISTS public.reservar_credito_ia(uuid, integer);
DROP FUNCTION IF EXISTS public.devolver_credito_ia(uuid);
