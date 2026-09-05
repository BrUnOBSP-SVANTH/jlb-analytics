/**
 * apiFetch — a ÚNICA porta de saída para chamar o nosso servidor.
 *
 * O BUG QUE ISTO CONSERTA (05/09). O usuário logava normalmente, ia usar a
 * análise por IA, e o site pedia login de novo. Logar outra vez não adiantava:
 * pedia de novo. Parecia que a sessão não estava sendo salva.
 *
 * Não era. A sessão estava salva o tempo todo, no navegador. O que faltava era
 * CONTAR AO SERVIDOR: as chamadas de IA usavam `fetch` puro, sem o cabeçalho
 * `Authorization`. Do lado de lá, requisição sem cabeçalho é requisição anônima
 * — e como a IA passou a exigir conta, o servidor respondia 401 e o site abria
 * o modal de login. Sete das nove chamadas de IA estavam assim.
 *
 * Por isso a correção é uma função só, e não sete remendos: o cabeçalho não pode
 * depender de alguém lembrar de escrevê-lo na próxima tela.
 *
 * O token vem de `getSession()`, que renova sozinho quando está perto de vencer
 * — então uma aba aberta o dia inteiro continua identificada.
 */
import { supabase } from "./supabase";

/**
 * O token da sessão atual, ou `null` se não há ninguém logado. Nunca lança: se a
 * consulta falhar, a chamada segue como anônima — que é o comportamento correto
 * para as rotas públicas (mercados, notícias) e gera o 401 honesto nas privadas.
 */
export async function tokenAtual(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * `fetch` para as rotas do nosso servidor, já identificado. Use SEMPRE esta em
 * vez do `fetch` cru em chamadas a `/api/` — as rotas que exigem conta (IA,
 * duelos, push, créditos) respondem 401 sem o cabeçalho, e o sintoma é um pedido
 * de login que não acaba nunca.
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = await tokenAtual();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}
