/**
 * GET /api/mercados/destaques — o pouco que a home precisa.
 *
 * O QUE ACONTECIA (medido em 16/09/2026, no build de produção). A home baixava o
 * CATÁLOGO INTEIRO — `/api/polymarket/markets?limit=300` (89,6 KB) e
 * `/api/kalshi/markets?limit=300` (25,8 KB) — para desenhar oito cards e
 * escrever "600+ mercados monitorados". São 115 KB dos 452 KB da página, no
 * celular de quem ainda não decidiu se fica. O catálogo continua servindo
 * /mercados, que é quem realmente precisa dele.
 *
 * O servidor monta a lista curta a partir do MESMO cache que serve o catálogo
 * (chamada interna, sem ida extra às plataformas) e guarda o resultado pronto
 * por 60s — a home não paga por visitante.
 */
import { Router } from "express";
import { getCache, setCache } from "../lib/cache.ts";
import { parsePolyPrices } from "../lib/aiForecasts.ts";
import { pctDoKalshi } from "../../shared/precoKalshi.ts";

import type { Destaques, MercadoEmDestaque } from "../../shared/tiposDestaques.ts";

export type { Destaques, MercadoEmDestaque };

const router = Router();

interface PolyBruto {
  id?: string; question?: string; eventTitle?: string;
  outcomePrices?: string; volume?: number; volume24hr?: number;
}

/**
 * Monta a lista curta. É a MESMA regra de título que o card usava no cliente: o
 * título do evento manda quando diz mais que a pergunta (num mercado agrupado a
 * pergunta é do desfecho líder e sozinha engana).
 */
export function montarDestaques(poly: ReadonlyArray<PolyBruto>, totalKalshi: number, n = 8): Destaques {
  const destaques: MercadoEmDestaque[] = [];
  for (const m of poly) {
    if (destaques.length >= n) break;
    const id = String(m.id ?? "").trim();
    const prob = parsePolyPrices(m.outcomePrices)[0];
    if (!id || prob === undefined || !Number.isFinite(prob)) continue; // sem preço real não vai para a tela
    // Preço já DECIDIDO não é destaque. Na primeira medição (16/09) a fileira
    // abria com "Detroit Tigers vs. Toronto Blue Jays — 100%": um jogo acabado,
    // ocupando a vitrine de uma página que promete "o que o mundo está prevendo".
    // É a mesma régua da lista de divergências (lib/aiForecasts.ts).
    if (prob >= 0.97 || prob <= 0.03) continue;
    const eventoDizMais = !!m.eventTitle && m.eventTitle.length > 10 && m.eventTitle !== m.question;
    destaques.push({
      id,
      titulo: (eventoDizMais ? m.eventTitle : m.question) ?? "Mercado preditivo",
      prob,
      volume: m.volume ?? m.volume24hr ?? 0,
    });
  }
  return { destaques, totais: { polymarket: poly.length, kalshi: totalKalshi } };
}

const CHAVE = "home:destaques";

router.get("/destaques", async (req, res) => {
  const pronto = getCache<Destaques>(CHAVE);
  if (pronto) return res.json(pronto);

  const base = `http://localhost:${process.env.PORT ?? 3001}`;
  const pedir = async <T>(caminho: string): Promise<T[]> => {
    try {
      const r = await fetch(`${base}${caminho}`, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return [];
      return ((await r.json()) as { markets?: T[] }).markets ?? [];
    } catch { return []; }
  };

  const [poly, kalshi] = await Promise.all([
    pedir<PolyBruto>("/api/polymarket/markets?limit=300"),
    pedir<{ yesProb?: number }>("/api/kalshi/markets?limit=300"),
  ]);

  // Conta só o mercado com preço de verdade: é o que a tela promete ("monitorados").
  const totalKalshi = kalshi.filter((m) => pctDoKalshi(m.yesProb) !== null).length;
  const payload = montarDestaques(poly, totalKalshi, Math.min(Number(req.query.n) || 8, 20));

  // Cache curto: o catálogo por trás já é SWR de 90s, então nada aqui fica velho
  // além do que a própria /mercados mostra.
  if (payload.destaques.length > 0) setCache(CHAVE, payload, 60);
  res.json(payload);
});

export default router;
