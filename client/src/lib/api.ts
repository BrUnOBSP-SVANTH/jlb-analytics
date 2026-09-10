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

/**
 * buscarJson — GET com deduplicação de requisição EM VOO e cache curto.
 *
 * O QUE ISTO CONSERTA (TRV-01). A auditoria contou 52 chamadas de API por
 * carregamento de página. Boa parte não era excesso de dado: era o MESMO dado
 * pedido várias vezes, porque cada componente busca o que precisa sem saber dos
 * vizinhos. Na página do Track Record, quatro blocos diferentes pedem
 * `/api/ai/track-record` — e os quatro montam ao mesmo tempo, então nem o cache
 * do navegador ajuda: as quatro requisições saem juntas.
 *
 * A regra aqui é simples e resolve a classe inteira: se já existe uma chamada
 * PARA A MESMA URL em andamento, o segundo pedinte recebe a mesma promessa em
 * vez de abrir outra conexão. E o resultado fica guardado por um tempo curto,
 * para o componente que monta logo depois não recomeçar tudo.
 *
 * Não substitui `apiFetch` (que resolve identidade) nem cache de servidor (que
 * resolve custo). Resolve outra coisa: a mesma tela pedindo a mesma coisa N
 * vezes no mesmo segundo.
 */
const emVoo = new Map<string, Promise<unknown>>();
const guardado = new Map<string, { valor: unknown; ate: number }>();

/** Curto de propósito: é para colapsar a montagem da tela, não para servir dado velho. */
const TTL_PADRAO_MS = 30_000;

export async function buscarJson<T>(url: string, ttlMs = TTL_PADRAO_MS): Promise<T> {
  const agora = Date.now();

  const cache = guardado.get(url);
  if (cache && cache.ate > agora) return cache.valor as T;

  const andando = emVoo.get(url);
  if (andando) return andando as Promise<T>;

  const promessa = (async () => {
    try {
      const r = await apiFetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const dados = await r.json() as T;
      guardado.set(url, { valor: dados, ate: Date.now() + ttlMs });
      return dados;
    } finally {
      // Sai do mapa de "em voo" mesmo em erro — senão uma falha de rede
      // envenenaria a URL para o resto da sessão.
      emVoo.delete(url);
    }
  })();

  emVoo.set(url, promessa);
  return promessa;
}

/** Esquece o que está guardado (ex.: depois de uma ação que muda o dado). */
export function esquecerCache(prefixo?: string): void {
  if (!prefixo) { guardado.clear(); return; }
  guardado.forEach((_v, chave) => {
    if (chave.startsWith(prefixo)) guardado.delete(chave);
  });
}
