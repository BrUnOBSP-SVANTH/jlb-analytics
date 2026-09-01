/**
 * marketsCache — camada de dados compartilhada (JLB Analytics)
 *
 * Problema que resolve: 7 telas buscavam /api/polymarket e /api/kalshi de forma
 * independente, refazendo o fetch a cada navegação. Aqui há UM cache em memória
 * com TTL + deduplicação de requisições em voo — todas as telas compartilham a
 * mesma resposta, e navegar entre páginas fica instantâneo.
 *
 * Sempre busca o superset (limit=300); os chamadores fatiam/filtram conforme
 * a necessidade. Isso permite que uma só resposta sirva a todos os limites.
 *
 * O superset subiu de 200 para 300 em 31/08 junto com a abertura dos limites do
 * servidor. Ele precisa ser >= a maior cota pedida por qualquer tela, senão vira
 * um teto invisível: a tela pede 150 do Kalshi e recebe menos sem erro nenhum.
 */

export type MarketSource = "polymarket" | "kalshi";

interface CacheEntry<T> { data: T[]; ts: number }

const TTL_MS = 60_000; // 60s — alinhado ao cache do servidor (90s)
const cache = new Map<MarketSource, CacheEntry<unknown>>();
const inflight = new Map<MarketSource, Promise<unknown[]>>();

/**
 * Retorna os mercados de uma fonte, usando cache compartilhado.
 * - Cache válido (<60s): retorna imediato, sem rede.
 * - Requisição já em voo: o chamador aguarda a mesma promise (sem stampede).
 * - Caso contrário: busca o superset (limit=300) e cacheia.
 */
export async function getMarkets<T = Record<string, unknown>>(source: MarketSource): Promise<T[]> {
  const now = Date.now();
  const cached = cache.get(source);
  if (cached && now - cached.ts < TTL_MS) return cached.data as T[];

  const existing = inflight.get(source);
  if (existing) return existing as Promise<T[]>;

  const p = fetch(`/api/${source}/markets?limit=300`)
    .then((r) => (r.ok ? r.json() as Promise<{ markets?: unknown[] }> : { markets: [] }))
    .then((j) => {
      const arr = j.markets ?? [];
      cache.set(source, { data: arr, ts: Date.now() });
      inflight.delete(source);
      return arr;
    })
    .catch((e) => {
      inflight.delete(source);
      throw e;
    });

  inflight.set(source, p);
  return p as Promise<T[]>;
}

/** Busca ambas as fontes em paralelo, tolerante a falhas. */
export async function getAllMarkets<P = Record<string, unknown>, K = Record<string, unknown>>(): Promise<{ polymarket: P[]; kalshi: K[] }> {
  const [poly, kalshi] = await Promise.allSettled([getMarkets<P>("polymarket"), getMarkets<K>("kalshi")]);
  return {
    polymarket: poly.status === "fulfilled" ? poly.value : [],
    kalshi: kalshi.status === "fulfilled" ? kalshi.value : [],
  };
}

/** Invalida o cache (force refresh) — opcionalmente de uma fonte só. */
export function invalidateMarkets(source?: MarketSource): void {
  if (source) { cache.delete(source); inflight.delete(source); }
  else { cache.clear(); inflight.clear(); }
}
