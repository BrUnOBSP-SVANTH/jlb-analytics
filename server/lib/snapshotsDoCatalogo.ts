/**
 * O arquivo diário de preços grava o que a tela MOSTRA — não uma lista paralela.
 *
 * O QUE ACONTECIA (auditoria de 14/09/2026, item 7). O coletor Python
 * (python/market_snapshots.py) grava os 100 eventos de maior volume do
 * Polymarket. O catálogo que o site serve (routes/polymarket.ts) junta até nove
 * páginas: volume, volume 24h, destaques e as janelas de prazo de 7 e 30 dias.
 * Das 40 primeiras entradas do catálogo, 17 não tinham um único registro — e
 * eram justamente os mercados que fecham logo ou que só estão em alta hoje, os
 * que mais se abrem. O detalhe mostrava "sem histórico" ao lado de um card com
 * "−16 pp na semana".
 *
 * Copiar a seleção de nove páginas para o Python seria criar a segunda regra
 * que vai divergir da primeira — foi assim que o buraco nasceu. Aqui a lista é
 * a mesma que o navegador recebe: a rota do catálogo, pelo mesmo endereço e
 * limite que o cliente usa (lib/marketsCache.ts), então também aquece o cache.
 *
 * SÓ POLYMARKET. No catálogo do Kalshi um mercado sem negócio recebe 50
 * (`kalshiYesProb`), indistinguível de um 50 real — gravar isso inventaria
 * histórico. O Kalshi continua com o coletor Python.
 */
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "./supabaseRest.ts";
import { log } from "./log.ts";

export interface LinhaSnapshot {
  market_id: string;
  source: "polymarket";
  title: string;
  category: string | null;
  yes_prob: number;
  volume: number | null;
  volume_24h: number | null;
  liquidity: number | null;
  status: "open";
}

interface ItemCatalogoPoly {
  id?: string; question?: string; eventTitle?: string; category?: string;
  outcomePrices?: string; volume?: number; volume24hr?: number; liquidity?: number;
}

const numeroOuNulo = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;

/** Catálogo → linhas da tabela. Sem preço real, sem linha: nada de 50 inventado. */
export function linhasDoCatalogo(itens: ReadonlyArray<ItemCatalogoPoly>): LinhaSnapshot[] {
  const vistas = new Map<string, LinhaSnapshot>();
  for (const m of itens) {
    const id = String(m.id ?? "").trim();
    const titulo = (m.question || m.eventTitle || "").trim();
    if (!id || !titulo) continue;
    let p: number;
    try { p = parseFloat((JSON.parse(m.outcomePrices ?? "[]") as string[])[0]); } catch { continue; }
    if (!Number.isFinite(p) || p < 0 || p > 1) continue;
    // O Postgres recusa o lote inteiro se o mesmo (market_id, dia) vier duas vezes.
    if (vistas.has(id)) continue;
    vistas.set(id, {
      market_id: id,
      source: "polymarket",
      title: titulo.slice(0, 500),
      category: m.category ?? null,
      yes_prob: Math.round(p * 10_000) / 100, // numeric(5,2), 0–100 — a escala do coletor Python
      volume: numeroOuNulo(m.volume),
      volume_24h: numeroOuNulo(m.volume24hr),
      liquidity: numeroOuNulo(m.liquidity),
      status: "open",
    });
  }
  return Array.from(vistas.values());
}

/** Busca o catálogo na própria rota e grava o dia. Devolve quantas linhas gravou. */
export async function gravarSnapshotsDoCatalogo(baseUrl: string): Promise<number> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return 0;
  let itens: ItemCatalogoPoly[];
  try {
    // Mesmo limite do cliente: é a lista que a tela recebe.
    const r = await fetch(`${baseUrl}/api/polymarket/markets?limit=300`, { signal: AbortSignal.timeout(180_000) });
    if (!r.ok) { log.warn(`[snapshots/catálogo] catálogo respondeu HTTP ${r.status}`); return 0; }
    itens = ((await r.json()) as { markets?: ItemCatalogoPoly[] }).markets ?? [];
  } catch (e) {
    log.warn(`[snapshots/catálogo] catálogo indisponível: ${e instanceof Error ? e.message : String(e)}`);
    return 0;
  }

  const linhas = linhasDoCatalogo(itens);
  let gravadas = 0;
  for (let i = 0; i < linhas.length; i += 200) {
    const lote = linhas.slice(i, i + 200);
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/market_snapshots?on_conflict=market_id,source,snap_date`, {
        method: "POST", headers: supaWriteHeaders(), body: JSON.stringify(lote), signal: AbortSignal.timeout(30_000),
      });
      if (r.ok) gravadas += lote.length;
      else log.warn(`[snapshots/catálogo] lote recusado (HTTP ${r.status}): ${(await r.text().catch(() => "")).slice(0, 200)}`);
    } catch (e) {
      log.warn(`[snapshots/catálogo] lote falhou: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  log.info(`[snapshots/catálogo] ${gravadas} de ${itens.length} mercados do catálogo gravados`);
  return gravadas;
}
