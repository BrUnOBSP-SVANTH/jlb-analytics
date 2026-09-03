interface CacheEntry<T> { data: T; expiresAt: number }

export const cache = new Map<string, CacheEntry<unknown>>();
const rateLimitWindows = new Map<string, number[]>();

/**
 * ⚠️ OS DOIS MAPAS ACIMA CRESCIAM PARA SEMPRE.
 *
 * `cache` só apagava uma entrada quando alguém a LIA depois de vencida — chave
 * escrita e nunca mais lida ficava presa até o processo reiniciar. E várias chaves
 * vêm de texto arbitrário (`article-crossref:${título}`, `reddit-ctx:${título}`,
 * `rag-embed:${consulta}`), então o conjunto de chaves é ilimitado por natureza.
 *
 * `rateLimitWindows` era pior: a chave é `ação:${ip}`, ou seja, cada visitante
 * único deixava uma entrada permanente. Num site público isso é cada pessoa e
 * cada robô que já passou.
 *
 * Não dava sintoma em desenvolvimento (processo vive minutos) e é justamente o
 * tipo de defeito que só aparece depois de dias no ar — a produção roda 24/7 num
 * plano com 512MB. Daí a faxina periódica e o teto de tamanho abaixo.
 */
const MAX_ENTRADAS = 5_000;
const FAXINA_MS = 10 * 60_000;

/** Remove o que já venceu e, se ainda estiver grande, os mais antigos. */
export function limparCache(agora = Date.now()): { expiradas: number; despejadas: number } {
  let expiradas = 0;
  for (const [k, e] of Array.from(cache.entries())) {
    if (agora > e.expiresAt) { cache.delete(k); expiradas++; }
  }
  // O Map do JS preserva a ordem de inserção: os primeiros são os mais antigos.
  let despejadas = 0;
  if (cache.size > MAX_ENTRADAS) {
    const sobra = cache.size - MAX_ENTRADAS;
    for (const k of Array.from(cache.keys())) {
      cache.delete(k); despejadas++;
      if (despejadas >= sobra) break;
    }
  }
  // Janelas de rate limit sem nenhum acesso recente não precisam existir.
  for (const [k, hits] of Array.from(rateLimitWindows.entries())) {
    if (hits.length === 0 || agora - hits[hits.length - 1] > 60 * 60_000) rateLimitWindows.delete(k);
  }
  return { expiradas, despejadas };
}

// `unref()` para a faxina não segurar o processo vivo em testes/scripts.
const faxina = setInterval(() => { limparCache(); }, FAXINA_MS);
if (typeof faxina.unref === "function") faxina.unref();

export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (rateLimitWindows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) return true;
  hits.push(now);
  rateLimitWindows.set(key, hits);
  return false;
}

/** Só para teste e diagnóstico — quantas entradas cada mapa guarda. */
export function tamanhoCache(): { cache: number; rateLimit: number } {
  return { cache: cache.size, rateLimit: rateLimitWindows.size };
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
