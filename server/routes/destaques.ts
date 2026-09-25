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
import { descreverPolymarket } from "../../shared/descreverMercado.ts";
import { pctDoKalshi } from "../../shared/precoKalshi.ts";

import type { Destaques, MercadoEmDestaque } from "../../shared/tiposDestaques.ts";

export type { Destaques, MercadoEmDestaque };

const router = Router();

interface PolyBruto {
  id?: string; question?: string; eventTitle?: string;
  outcomes?: string;
  outcomePrices?: string; volume?: number; volume24hr?: number;
  endDate?: string; closed?: boolean; active?: boolean;
}

/**
 * Monta a lista curta. A regra de como o mercado é descrito mora em
 * `shared/descreverMercado.ts` e vale para TODAS as telas (Auditoria 21/09,
 * DAD-01): binário mostra a pergunta; evento agregado mostra o evento e o nome
 * do desfecho junto do número.
 */
export function montarDestaques(
  poly: ReadonlyArray<PolyBruto>,
  totalKalshi: number,
  n = 8,
  agora = Date.now(),
  /** Catálogo real do Polymarket, antes do corte da rota (DES-02). Sem ele, a
   *  home contaria o LIMITE PEDIDO como se fosse o que existe. */
  totalPoly = poly.length,
): Destaques {
  const destaques: MercadoEmDestaque[] = [];
  for (const m of poly) {
    if (destaques.length >= n) break;
    const id = String(m.id ?? "").trim();
    const prob = parsePolyPrices(m.outcomePrices)[0];
    if (!id || prob === undefined || !Number.isFinite(prob)) continue; // sem preço real não vai para a tela
    // ⏰ O RELÓGIO, não só o preço. O corte por preço decidido não pega mercado
    // que venceu empatado, e a vitrine é servida de DOIS caches empilhados (o
    // catálogo por 90s + este por 60s): dá tempo de um mercado fechar enquanto
    // está guardado. Aqui a data é conferida na hora de montar, contra o relógio
    // de agora — prazo vencido não aparece na home nem por dois minutos.
    if (m.closed === true || m.active === false) continue;
    const fim = m.endDate ? new Date(m.endDate).getTime() : NaN;
    if (Number.isFinite(fim) && fim <= agora) continue;
    // Preço já DECIDIDO não é destaque. Na primeira medição (16/09) a fileira
    // abria com "Detroit Tigers vs. Toronto Blue Jays — 100%": um jogo acabado,
    // ocupando a vitrine de uma página que promete "o que o mundo está prevendo".
    // É a mesma régua da lista de divergências (lib/aiForecasts.ts).
    if (prob >= 0.97 || prob <= 0.03) continue;
    // DAD-01/DAD-02: a PERGUNTA é o título, e a probabilidade vem com o nome do
    // desfecho quando não é Sim/Não. Antes a home mostrava o título do evento e
    // um número sozinho ("Brazil Presidential Election 61%").
    const descricao = descreverPolymarket(m);
    const ehSimNao = descricao.tipo === "sim-nao" || descricao.tipo === "escada-de-datas";
    destaques.push({
      id,
      titulo: descricao.titulo || "Mercado preditivo",
      subtitulo: descricao.subtitulo,
      desfecho: ehSimNao ? undefined : descricao.lider?.rotulo,
      prob: ehSimNao ? prob : (descricao.lider?.prob ?? prob),
      volume: m.volume ?? m.volume24hr ?? 0,
    });
  }
  return { destaques, totais: { polymarket: totalPoly, kalshi: totalKalshi } };
}

/**
 * Por quanto tempo esta lista ainda é verdade.
 *
 * Filtrar o vencido ao MONTAR não basta: a resposta fica guardada 60s, e um
 * mercado que fecha nesse meio-tempo continuaria na home. Então o cache morre
 * junto com o primeiro fechamento — nunca depois dele. Piso de 5s para o mercado
 * que está fechando agora não derrubar o cache a cada requisição.
 */
export function ttlDaVitrine(fechamentos: Array<string | undefined>, agora = Date.now(), teto = 60): number {
  const proximos = fechamentos
    .map((f) => (f ? new Date(f).getTime() : NaN))
    .filter((t) => Number.isFinite(t) && t > agora);
  if (proximos.length === 0) return teto;
  return Math.max(5, Math.min(teto, Math.floor((Math.min(...proximos) - agora) / 1000)));
}

const CHAVE = "home:destaques";

router.get("/destaques", async (req, res) => {
  const pronto = getCache<Destaques>(CHAVE);
  if (pronto) return res.json(pronto);

  const base = `http://localhost:${process.env.PORT ?? 3001}`;
  /**
   * ⚠️ `total` vem da rota, e NÃO é `markets.length` (Auditoria 21/09, DES-02).
   *
   * A home escrevia "600+ mercados monitorados" somando os comprimentos das
   * duas listas — que são o LIMITE PEDIDO (300 e 300), não o que existe. O "+"
   * prometia "pelo menos 600" quando 600 era exatamente o teto. Pior: quando
   * uma página da fonte não chegava a tempo, o catálogo vinha com 140 e a home
   * anunciava "440+", um número que se mexia por motivo nenhum do mundo real.
   */
  const pedir = async <T>(caminho: string): Promise<{ itens: T[]; total: number }> => {
    try {
      const r = await fetch(`${base}${caminho}`, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return { itens: [], total: 0 };
      const corpo = (await r.json()) as { markets?: T[]; total?: number };
      const itens = corpo.markets ?? [];
      return { itens, total: typeof corpo.total === "number" ? corpo.total : itens.length };
    } catch { return { itens: [], total: 0 }; }
  };

  const [respPoly, respKalshi] = await Promise.all([
    pedir<PolyBruto>("/api/polymarket/markets?limit=300"),
    pedir<{ yesProb?: number }>("/api/kalshi/markets?limit=300"),
  ]);
  const poly = respPoly.itens;
  const kalshi = respKalshi.itens;

  // Conta só o mercado com preço de verdade: é o que a tela promete
  // ("monitorados"). A proporção dos que têm preço na amostra recebida vale
  // para o catálogo inteiro — é a mesma lista, só cortada.
  const comPreco = kalshi.filter((m) => pctDoKalshi(m.yesProb) !== null).length;
  const totalKalshi = kalshi.length > 0
    ? Math.round(respKalshi.total * (comPreco / kalshi.length))
    : 0;
  const payload = montarDestaques(poly, totalKalshi, Math.min(Number(req.query.n) || 8, 20), Date.now(), respPoly.total);

  // Cache curto: o catálogo por trás já é SWR de 90s, então nada aqui fica velho
  // além do que a própria /mercados mostra — e agora também nunca sobrevive ao
  // fechamento do mercado mais próximo de vencer.
  const porId = new Map(poly.map((m) => [String(m.id ?? "").trim(), m.endDate]));
  const ttl = ttlDaVitrine(payload.destaques.map((d) => porId.get(d.id)));
  if (payload.destaques.length > 0) setCache(CHAVE, payload, ttl);
  res.json(payload);
});

export default router;
