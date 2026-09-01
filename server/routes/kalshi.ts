import { Router } from "express";
import { swr } from "../lib/cache.ts";
import { fetchWithRetry } from "../lib/fetcher.ts";
import { kalshiMarketUrl, kalshiYesProb } from "../lib/marketNormalize.ts";
import type { KalshiEventsResponse, KalshiMarket, KalshiEvent, KalshiNestedMarket } from "../lib/types.ts";
import { log } from "../lib/log.ts";

const router = Router();

/** Páginas de 200 eventos varridas antes de ranquear. 10 cobre ~2.000 eventos
 *  em ~3,5s — fundo suficiente para os líderes de volume aparecerem. */
const PAGINAS_KALSHI = 10;

/** Tamanho do superconjunto cacheado — o corte por `limit` acontece na resposta. */
const TETO_KALSHI = 300;

/**
 * Descarta título com buraco de interpolação e normaliza o espaçamento.
 * Devolve `undefined` para o chamador cair na próxima alternativa.
 */
export function tituloLimpo(t?: string): string | undefined {
  if (!t) return undefined;
  const s = t.trim();                      // apara PRIMEIRO: sobra nas bordas é inofensiva
  if (!s) return undefined;
  if (/\s{2,}/.test(s)) return undefined;  // buraco INTERNO: "Will  become President" — falta o nome
  return s;
}

/** Volume negociado em 24h somado nos mercados do evento — a régua de "vivo". */
function volume24hDoEvento(ev: KalshiEvent): number {
  return (ev.markets ?? []).reduce((s, m) => s + Math.round(parseFloat(m.volume_24h_fp ?? "0")), 0);
}

/** Volume total (histórico) — critério de desempate quando ninguém negociou hoje. */
function volumeTotalDoEvento(ev: KalshiEvent): number {
  return (ev.markets ?? []).reduce((s, m) => s + Math.round(parseFloat(m.volume_fp ?? "0")), 0);
}

/**
 * Varre várias páginas de eventos abertos e devolve do mais negociado ao menos.
 *
 * Tolerante a falha no meio: se a página 3 cair, ranqueia o que já veio em vez de
 * derrubar a resposta inteira — mercado desatualizado é ruim, tela vazia é pior.
 */
async function fetchRankedEvents(maxPaginas: number): Promise<KalshiEvent[]> {
  const base = "https://api.elections.kalshi.com/trade-api/v2/events";
  const acc: KalshiEvent[] = [];
  let cursor = "";
  for (let i = 0; i < maxPaginas; i++) {
    const url = `${base}?limit=200&status=open&with_nested_markets=true${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    let data: KalshiEventsResponse;
    try {
      data = await fetchWithRetry<KalshiEventsResponse>(url, { "Accept": "application/json" });
    } catch (err) {
      log.warn(`[Kalshi] página ${i + 1} falhou, ranqueando ${acc.length} eventos já obtidos:`,
        err instanceof Error ? err.message : err);
      break;
    }
    const pagina = data.events ?? [];
    acc.push(...pagina);
    cursor = data.cursor ?? "";
    if (!cursor || pagina.length === 0) break;
  }
  // Mais negociado hoje primeiro; empate (dia parado) desempata pelo histórico.
  return acc.sort((a, b) =>
    volume24hDoEvento(b) - volume24hDoEvento(a) || volumeTotalDoEvento(b) - volumeTotalDoEvento(a));
}

router.get("/markets", async (req, res) => {
  // Teto 300 (era 100) e padrão 150 (era 40). O catálogo vivo do Kalshi comporta:
  // dos ~2.000 eventos varridos, 379 têm volume em 24h. Com 40 o site mostrava uma
  // fração mínima do que existe.
  const limit = Math.min(parseInt(String(req.query.limit ?? "150"), 10) || 150, 300);
  try {
    // SWR: serve cache fresco na hora; se venceu, devolve o velho e atualiza em bg.
    const markets = await swr<KalshiMarket[]>("kalshi:markets", 120, async () => {
      // ⚠️ PAGINAR E RANQUEAR, não pegar os primeiros. A API do Kalshi devolve os
      // eventos em ordem própria (nem volume, nem data) e NÃO aceita ordenação.
      // Pedir `?limit=40` direto trazia literalmente a borra do catálogo: em
      // 31/08 os 40 mercados do site eram "Musk em Marte antes de 2099" (fecha em
      // 73 anos), "Quem será o próximo Papa" (43 anos), TODOS fechando a mais de
      // 2 anos, 33 dos 40 com volume ZERO em 24h. Eram mercados reais, mas
      // mortos — e enquanto isso a Kalshi de verdade (indicação democrata de
      // 2028, 861 mil em 24h; próximo porta-voz do Trump, 206 mil) não aparecia.
      // O Polymarket nunca teve esse problema porque a rota dele já pede
      // `order=volume`. Aqui a ordenação tem que ser nossa.
      //
      // Custo medido: 10 páginas × 200 = 2.000 eventos em ~3,5s, e o SWR serve o
      // cache velho enquanto atualiza — só a primeira carga fria espera.
      const events = await fetchRankedEvents(PAGINAS_KALSHI);

      // Um mercado aninhado do Kalshi → nosso formato normalizado.
      const toMarket = (m: KalshiNestedMarket, ev: KalshiEvent): KalshiMarket => {
        const seriesTicker = ev.series_ticker ?? ev.event_ticker;
        return {
          ticker: m.ticker,
          eventTicker: ev.event_ticker,
          seriesTicker,
          externalUrl: kalshiMarketUrl(seriesTicker, ev.event_ticker),
          // Espaço duplo denuncia interpolação vazia NA ORIGEM: o Kalshi publicou
          // "Will  become President of the United States" — sem o nome. Preferimos
          // o título do evento nesse caso; se nem ele existir, o ticker, que é feio
          // mas verdadeiro. Nunca inventar o nome que falta.
          title: tituloLimpo(m.title) ?? tituloLimpo(ev.title) ?? m.ticker,
          yesProb: kalshiYesProb(m.yes_bid_dollars, m.yes_ask_dollars, m.last_price_dollars),
          prevYesProb: m.previous_price_dollars
            ? parseFloat((parseFloat(m.previous_price_dollars) * 100).toFixed(1))
            : undefined,
          volume: Math.round(parseFloat(m.volume_fp ?? "0")),
          volume24h: Math.round(parseFloat(m.volume_24h_fp ?? "0")),
          openInterest: Math.round(parseFloat(m.open_interest_fp ?? "0")),
          liquidity: parseFloat(m.liquidity_dollars ?? "0"),
          closeTime: m.close_time,
          category: ev.category,
          status: m.status,
        };
      };

      return events.flatMap((ev) => {
        // Fidelidade ao mercado: só o que está realmente aberto. Kalshi marca o status como
        // "closed"/"settled"/"finalized"/"determined" quando o mercado encerra/resolve.
        const active = (ev.markets ?? []).filter((m) => !m.status || m.status === "active");
        if (active.length === 0) return [];

        // Multi-resultado: evento mutuamente exclusivo com >2 desfechos → 1 card agrupado,
        // cada desfecho com sua prob (yes_sub_title = rótulo). Fiel ao Kalshi, como no Polymarket.
        if (ev.mutually_exclusive && active.length > 2) {
          const mapped = active.map((m) => toMarket(m, ev));
          const outcomes = active
            .map((m, i) => ({ label: m.yes_sub_title ?? m.title ?? m.ticker, prob: mapped[i].yesProb / 100 }))
            .filter((o) => o.label && o.prob > 0.005)
            .sort((a, b) => b.prob - a.prob)
            .slice(0, 12);
          if (outcomes.length > 2) {
            const topIdx = mapped.reduce((best, m, i) => (m.yesProb > mapped[best].yesProb ? i : best), 0);
            const sum = (f: "volume" | "volume24h") => mapped.reduce((s, m) => s + (m[f] ?? 0), 0);
            return [{
              ...mapped[topIdx],           // representante = mercado do desfecho líder (ticker p/ navegação)
              title: ev.title ?? mapped[topIdx].title,
              volume: sum("volume"),
              volume24h: sum("volume24h"),
              outcomes,
            }];
          }
        }
        return active.map((m) => toMarket(m, ev));
      })
        // Ranquear os EVENTOS não bastava: um evento se abre em vários mercados, e
        // um só com escada de faixas ("ao menos 25%", "ao menos 30%"…) tomava as
        // vagas seguintes com volume 1. Ordenar também no nível do mercado garante
        // que os 40 exibidos sejam os 40 mais negociados, não os vizinhos dos mais
        // negociados. Card agrupado entra com o volume somado do evento, então
        // concorre em pé de igualdade.
        .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0) || b.volume - a.volume)
        .slice(0, TETO_KALSHI);
    });
    // Corta DEPOIS do cache, não dentro dele. A chave (`kalshi:markets`) não inclui
    // o limit, então guardar a lista já cortada fazia o primeiro chamador definir o
    // tamanho para todos: quem pedisse 60 congelava 60 para quem pedisse 200 — e o
    // seed da IA, que lê esse mesmo cache, herdava o corte. Cacheamos o superconjunto.
    res.json({ markets: markets.slice(0, limit), source: "live" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error("[Kalshi] error:", msg);
    res.status(502).json({ error: "kalshi_unavailable", message: msg });
  }
});

// ── Mercado único (inclui resolvidos) — fallback da tela de detalhe ────────────
interface KalshiSingleResp {
  market?: {
    ticker: string; title?: string; yes_sub_title?: string;
    yes_bid_dollars?: string; yes_ask_dollars?: string; last_price_dollars?: string;
    volume_fp?: string; volume_24h_fp?: string; open_interest_fp?: string;
    liquidity_dollars?: string; close_time?: string; category?: string;
    status?: string; result?: string;
  };
}

router.get("/market/:ticker", async (req, res) => {
  const ticker = String(req.params.ticker).replace(/[^A-Za-z0-9_-]/g, "");
  if (!ticker) return res.status(400).json({ error: "ticker required" });
  try {
    const m = await swr<KalshiSingleResp["market"] | null>(`kalshi:market:${ticker}`, 120, async () => {
      const data = await fetchWithRetry<KalshiSingleResp>(
        `https://api.elections.kalshi.com/trade-api/v2/markets/${ticker}`, { "Accept": "application/json" });
      return data?.market?.ticker ? data.market : null;
    });
    if (!m) return res.status(404).json({ error: "not_found" });
    const yesProb = kalshiYesProb(m.yes_bid_dollars, m.yes_ask_dollars, m.last_price_dollars);
    const resolved = !!m.status && m.status !== "active";
    const resolvedOutcome = m.result === "yes" ? "SIM" : m.result === "no" ? "NÃO" : undefined;
    res.json({
      ticker: m.ticker, title: m.title ?? m.yes_sub_title ?? m.ticker,
      yesProb, volume: Math.round(parseFloat(m.volume_fp ?? "0")),
      volume24h: Math.round(parseFloat(m.volume_24h_fp ?? "0")),
      openInterest: Math.round(parseFloat(m.open_interest_fp ?? "0")),
      liquidity: parseFloat(m.liquidity_dollars ?? "0"),
      closeTime: m.close_time, category: m.category, status: m.status,
      resolved, resolvedOutcome,
    });
  } catch (err) {
    log.error(`[Kalshi/market/${ticker}] error:`, err instanceof Error ? err.message : err);
    res.status(502).json({ error: "unavailable" });
  }
});

export default router;
