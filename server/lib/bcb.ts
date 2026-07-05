import { getCache, setCache } from "./cache.ts";
import { fetchJSON } from "./fetcher.ts";

interface BcbEntry { data: string; valor: string }

export async function fetchBcbSerie(serie: number): Promise<number | null> {
  const cacheKey = `bcb:${serie}`;
  const cached = getCache<number>(cacheKey);
  if (cached !== null) return cached;
  try {
    const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${serie}/dados/ultimos/1?formato=json`;
    const data = await fetchJSON<BcbEntry[]>(url);
    const value = parseFloat(data[0]?.valor?.replace(",", ".") ?? "0");
    setCache(cacheKey, value, 3600);
    return value;
  } catch { return null; }
}
