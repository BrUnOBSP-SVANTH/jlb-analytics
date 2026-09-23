-- ─────────────────────────────────────────────────────────────────────────────
-- JLB Analytics — 046_travas_so_para_o_servidor.sql
--
-- 🔴 CONSERTO DE UM ERRO MEU, do mesmo dia (migration 041).
--
-- A 041 criou `travas_de_escrita()` — a função que responde "o buraco do SEG-01
-- continua fechado?" — e escreveu no próprio comentário: "só para a chave de
-- serviço, porque a resposta é um mapa de onde bater". Ela revogava assim:
--
--     REVOKE ALL ON FUNCTION public.travas_de_escrita() FROM anon, authenticated;
--
-- E isso NÃO FAZ O QUE PARECE. No Postgres, função nasce com `EXECUTE` para
-- `PUBLIC`, e `anon`/`authenticated` herdam desse grant. Revogar dos papéis
-- nominalmente não tira o de PUBLIC — a função continuou aberta. Verificado em
-- 23/09 com a chave anônima: HTTP 200, a lista inteira.
--
-- Quem achou foi o advisor do próprio Supabase
-- (`anon_security_definer_function_executable`). Nenhum teste meu pegou, porque
-- todos liam o ARQUIVO da migration — e o arquivo dizia a intenção certa.
-- Privilégio é estado do BANCO: para checar, pergunte ao banco.
--
-- ⚠️ Toda função SECURITY DEFINER daqui em diante: REVOKE de PUBLIC primeiro,
-- depois GRANT para quem deve. `consenso_da_comunidade` (044) já faz assim, e é
-- por isso que ela ficou correta.
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.travas_de_escrita() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.travas_de_escrita() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.travas_de_escrita() TO service_role;
