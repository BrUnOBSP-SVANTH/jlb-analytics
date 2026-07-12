import { getCache, setCache } from "./cache.ts";
import { fetchJSON } from "./fetcher.ts";

// ⚠️ Mapa de séries SGS/BCB — use as ANUALIZADAS quando o número for exibido
// ou entrar em prompt como taxa anual (bug histórico: série 11 é % AO DIA e
// aparecia como "Selic 0.05% a.a." no site e nos prompts de IA):
//   432   Meta Selic (Copom) — % a.a.     ← "a Selic"
//   4389  CDI anualizado base 252 — % a.a.
//   13522 IPCA acumulado 12 meses — %     ← "a inflação"
//   1     USD/BRL · 21619 EUR/BRL
//   11    Selic diária (% a.d.) · 12 CDI diário (% a.d.) · 433 IPCA mensal (%)
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
