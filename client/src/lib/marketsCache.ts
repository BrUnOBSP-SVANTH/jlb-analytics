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

interface RespostaDoCatalogo { markets?: unknown[]; source?: string; atualizadoEm?: string }

/** De onde veio a última resposta de cada fonte — ver `procedenciaDoCatalogo`. */
export interface ProcedenciaDoCatalogo {
  /** `true` quando o servidor serviu a cópia guardada, não a montagem ao vivo. */
  deArquivo: boolean;
  /** ISO de quando a cópia foi feita. `null` quando o dado é ao vivo. */
  atualizadoEm: string | null;
}

const procedencia = new Map<MarketSource, ProcedenciaDoCatalogo>();

/**
 * A cópia mais VELHA entre as fontes que responderam de arquivo, ou `null` se
 * está tudo ao vivo.
 *
 * A mais velha, e não a mais nova: se uma fonte está ao vivo e a outra é de uma
 * hora atrás, a tela não pode se apresentar como atualizada. O número que vale
 * para quem lê é o pior dos dois.
 */
export function procedenciaDoCatalogo(): ProcedenciaDoCatalogo | null {
  let pior: ProcedenciaDoCatalogo | null = null;
  for (const p of Array.from(procedencia.values())) {
    if (!p.deArquivo || !p.atualizadoEm) continue;
    if (!pior || (pior.atualizadoEm && p.atualizadoEm < pior.atualizadoEm)) pior = p;
  }
  return pior;
}

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
    .then((r) => (r.ok ? r.json() as Promise<RespostaDoCatalogo> : { markets: [] }))
    .then((j) => {
      const arr = j.markets ?? [];
      // De onde veio ESTA resposta (DES-02). Quando o servidor acorda frio, ele
      // entrega a última versão boa guardada no banco e diz `source: "arquivo"`.
      // A tela PRECISA saber disso: escrever "atualizado agora" em cima de dado
      // de uma hora atrás seria a plataforma mentir para parecer rápida.
      procedencia.set(source, {
        deArquivo: j.source === "arquivo",
        atualizadoEm: typeof j.atualizadoEm === "string" ? j.atualizadoEm : null,
      });
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
