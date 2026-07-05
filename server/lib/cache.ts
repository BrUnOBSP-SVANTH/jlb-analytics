interface CacheEntry<T> { data: T; expiresAt: number }

export const cache = new Map<string, CacheEntry<unknown>>();
const rateLimitWindows = new Map<string, number[]>();

export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (rateLimitWindows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return true;
  hits.push(now);
  rateLimitWindows.set(key, hits);
  return false;
}

export function getCache<T>(key: string): T | null {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data;
}

export function setCache<T>(key: string, data: T, ttlSeconds: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// ── Stale-while-revalidate + dedup de requisições em voo ──────────────────────
// Serve o dado FRESCO se dentro do TTL; se estiver "velho mas ainda servível"
// (até staleSeconds após expirar), devolve o velho NA HORA e atualiza em segundo
// plano; se totalmente expirado, busca. Requisições concorrentes ao mesmo key
// compartilham UMA promise (sem stampede). Elimina os "picos de lentidão" quando
// o cache vence — padrão que Polymarket/Kalshi usam para parecerem instantâneos.
const inflight = new Map<string, Promise<unknown>>();

function refresh<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fetcher()
    .then((data) => { setCache(key, data, ttlSeconds); return data; })
    .finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

export async function swr<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
  staleSeconds = ttlSeconds * 20,
): Promise<T> {
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  const now = Date.now();

  if (entry && now < entry.expiresAt) return entry.data;            // fresco
  if (entry && now < entry.expiresAt + staleSeconds * 1000) {
    void refresh(key, ttlSeconds, fetcher).catch(() => { /* mantém o velho */ });
    return entry.data;                                              // velho + refresh bg
  }
  return refresh(key, ttlSeconds, fetcher);                         // expirado/ausente
}
