import { Router } from "express";
import { swr, getCache, setCache } from "../lib/cache.ts";
import { fetchWithRetry, fetchJSON } from "../lib/fetcher.ts";
import { parseYesPrice, polyEventUrl, rankOutcomes } from "../lib/marketNormalize.ts";
import type { PolyEvent, PolyMarket } from "../lib/types.ts";
import { log } from "../lib/log.ts";
import { comOrcamento, desambiguarPorPai, limitePedido } from "../lib/marketCatalog.ts";

const router = Router();

router.get("/markets", async (req, res) => {
  const closed = req.query.closed === "true";
  const cacheKey = `polymarket:markets:${closed ? "closed" : "active"}`;
  try {
    // SWR: cache fresco na hora; se venceu, devolve o velho e atualiza em bg.
    const markets = await swr<PolyMarket[]>(cacheKey, closed ? 600 : 90, async () => {
    const toNum = (v: unknown) => (v === undefined || v === null) ? undefined : parseFloat(String(v)) || undefined;

    const eventsUrl = (order: string, limit: number, extra = "") => {
      const base = closed
        ? `https://gamma-api.polymarket.com/events?active=false&closed=true`
        : `https://gamma-api.polymarket.com/events?active=true&closed=false`;
      return `${base}&limit=${limit}&order=${order}&ascending=false&with_nested_markets=true${extra}`;
    };

    // ⚠️ O gamma IGNORA limit > 100: pedir 80, 300 ou 500 devolve no máximo 100
    // eventos. Medido em 31/08. Para ir mais fundo é preciso paginar por `offset`
    // — foi o que travava o catálogo em ~96 mercados por mais que se aumentasse o
    // número pedido. Com 3 páginas chegamos a 300 eventos; o volume 24h médio cai
    // de 182 mil (pág. 1) para ~16 mil (pág. 3), ou seja, ainda é mercado vivo.
    // ⏱️ ORÇAMENTO DE TEMPO. Sem isto a rota espera TODAS as páginas, e em 02/09 ela
    // travou em produção (>120s) enquanto o Kalshi respondia em 0,7s. Não era rede:
    // são 8 páginas de 100 eventos COM mercados aninhados (~2.500 objetos cada) e o
    // plano grátis do Render tem 0,1 CPU — o que aqui leva 4,5s lá leva minutos só
    // de parse. Agora cada página corre contra um relógio e a que não chegar é
    // simplesmente descartada: catálogo menor é ruim, catálogo que nunca carrega é
    // pior. Mesma filosofia do "uma página que falhe não derruba as outras".
    const ORCAMENTO_MS = 12_000;

    const paginas = (order: string, qtd: number, extra = "") =>
      Array.from({ length: qtd }, (_, i) =>
        comOrcamento(fetchWithRetry<PolyEvent[]>(`${eventsUrl(order, 100, extra)}&offset=${i * 100}`), ORCAMENTO_MS));

    // Piscinas por PRAZO. Sem elas o catálogo só tinha mercado que fecha logo por
    // acidente — os que calhassem de estar no topo de volume. O gamma aceita
    // end_date_min/max (é o filtro que o seed da IA já usava), e a oferta é rica:
    // medido em 01/09, a janela de 7 dias devolve 97 eventos COM volume, incluindo
    // "US Open ATP: Dane Sweeny vs Corentin Moutet" com 2,3 mi negociados e jogos
    // de MLB. Nada disso chegava à tela.
    // Duas janelas, como no Kalshi: pedir só a de 30 dias faz a semana sumir,
    // porque o corte de 100 por página cai onde a API quiser dentro da janela.
    const agoraIso = new Date().toISOString();
    const ateIso = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString();
    const janela = (dias: number) => `&end_date_min=${agoraIso}&end_date_max=${ateIso(dias)}`;

    const pools = await Promise.allSettled([
      ...paginas("volume", 3),
      ...paginas("volume_24hr", 2),
      ...(closed ? [] : paginas("volume", 1, "&featured=true")),
      // Só faz sentido para o catálogo ATIVO — em "fechados" prazo não existe.
      ...(closed ? [] : paginas("volume_24hr", 1, janela(7))),
      ...(closed ? [] : paginas("volume", 1, janela(30))),
    ]);

    // Uma página que falhe não derruba as outras — melhor catálogo menor que tela vazia.
    const allEvents: PolyEvent[] = pools.flatMap((p) => (p.status === "fulfilled" && p.value ? p.value : []));

    // Deduplicate events by slug
    const seenEventSlug = new Set<string>();
    const uniqueEvents = allEvents.filter((ev) => {
      if (seenEventSlug.has(ev.slug)) return false;
      seenEventSlug.add(ev.slug);
      return true;
    });

    const now = Date.now();
    // Keep only markets closing in the future (or no endDate = long-running)
    // and not older than 180 days since creation (avoids stale resolved markets)
    const MAX_AGE_DAYS = 180;
    const maxAgeMs = MAX_AGE_DAYS * 86_400_000;

    const isDateFresh = (endDate?: string): boolean => {
      if (!endDate) return true;
      const end = new Date(endDate).getTime();
      if (isNaN(end)) return true;
      if (end < now) return false;
      return true;
    };

    // Regex to detect Polymarket's internal placeholder names (e.g. "Team AM", "Person P")
    const GENERIC_PLACEHOLDER = /\b(Team|Person|Candidate|Player|Country|Party)\s+[A-Z]{1,3}\b/;

    // Build flat market list: 1 market per event (highest-volume nested market)
    const rawMarkets: (PolyMarket & { _vol24h: number; _endMs: number })[] = uniqueEvents.flatMap((ev) => {
      const nested = (ev.markets ?? [])
        .filter((m) => isDateFresh(m.endDate))
        // Skip markets that only have generic placeholder names — real names not yet published
        .filter((m) => !GENERIC_PLACEHOLDER.test(m.question ?? ""))
        // Fidelidade ao mercado: nunca listar como "ao vivo" um mercado que a Polymarket
        // já encerrou/resolveu. Um evento pode estar ativo enquanto um desfecho específico
        // (mercado aninhado) já fechou antes da endDate nominal — era o que dava o falso "9h".
        .filter((m) => m.active !== false && m.closed !== true)
        .map((m) => {
          const endMs = m.endDate ? new Date(m.endDate).getTime() : now + maxAgeMs;
          return {
            id: m.id,
            // Prefer the market question; use event title as fallback for clarity.
            // .trim() porque o Polymarket publica com sobra: "Alaska Governor
            // Election Winner  " vinha com dois espaços no fim, e isso vaza para o
            // card e para o <title> da página de detalhe.
            question: m.question?.trim(),
            groupItemTitle: m.groupItemTitle?.trim(),
            eventTitle: ev.title?.trim(),
            slug: m.slug,
            eventSlug: ev.slug,
            volume: toNum(m.volume) ?? toNum(ev.volume) ?? 0,
            volume24hr: toNum(m.volume24hr) ?? toNum(ev.volume24hr) ?? 0,
            liquidity: toNum(m.liquidity) ?? toNum(ev.liquidity),
            weekPriceChange: m.oneWeekPriceChange,
            featured: ev.featured ?? false,
            category: ev.category ?? ev.tags?.[0]?.label,
            endDate: m.endDate,
            closed: m.closed,
            active: m.active,
            outcomePrices: m.outcomePrices,
            outcomes: m.outcomes,
            clobTokenIds: m.clobTokenIds,
            _vol24h: toNum(m.volume24hr) ?? toNum(ev.volume24hr) ?? 0,
            _endMs: endMs,
          };
        })
        .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));

      // Caso binário: 1 desfecho por evento (o de maior volume). Para eventos
      // multi-resultado (negRisk), junta TODOS os desfechos num só card — cada
      // mercado aninhado é um desfecho e o "Yes" dele é a probabilidade
      // (groupItemTitle = rótulo). Assim mostramos as reais possibilidades, fiel
      // ao Polymarket, em vez de descartar tudo menos o líder.
      if (nested.length === 0) return [];
      const top = nested[0];
      if (ev.negRisk && nested.length > 1) {
        // rankOutcomes garante a invariante de fidelidade: representante = ranked[0].ref
        // (líder de PROBABILIDADE), então id/clobTokenIds/outcomePrices[0] descrevem O
        // MESMO desfecho e o settlement resolve o outcome certo (ver marketNormalize).
        const ranked = rankOutcomes<(typeof nested)[number]>(nested.map((m) => ({ label: m.groupItemTitle ?? m.question ?? "", prob: parseYesPrice(m.outcomePrices), ref: m })));
        if (ranked.length > 2) {
          const lead = ranked[0].ref;
          return [{
            ...lead,
            question: ev.title ?? lead.question,
            eventTitle: ev.title,
            volume: toNum(ev.volume) ?? lead.volume,
            outcomes: JSON.stringify(ranked.map((o) => o.label)),
            outcomePrices: JSON.stringify(ranked.map((o) => o.prob.toFixed(4))),
          }];
        }
      }
      return [top];
    })
    // Additional pass: drop markets with endDate > 365 days out AND zero 24h activity
    .filter((m) => {
      const daysUntilEnd = (m._endMs - now) / 86_400_000;
      if (daysUntilEnd > 365 && (m._vol24h ?? 0) === 0) return false;
      return true;
    });

    // Diversidade por categoria. Subiu de 12 para 30 junto com a paginação: o teto
    // existe para uma categoria em alta não tomar a tela inteira, e 12 fazia sentido
    // quando o catálogo tinha ~96 mercados. Mantido baixo, ele viraria o novo
    // gargalo — cortaria o catálogo ampliado de volta ao tamanho antigo.
    const MAX_PER_CAT = 30;
    const catCount = new Map<string, number>();
    const diverse = rawMarkets.filter((m) => {
      const cat = (m.category ?? "other").toLowerCase();
      const n = catCount.get(cat) ?? 0;
      if (n >= MAX_PER_CAT) return false;
      catCount.set(cat, n + 1);
      return true;
    });

    // Sort final list: mix of relevance signals
    // Score = 55% 24h momentum + 25% total volume + 10% featured + 10% closing soon
    const maxVol24h = Math.max(...diverse.map((m) => m._vol24h ?? 0), 1);
    const maxVol = Math.max(...diverse.map((m) => m.volume ?? 0), 1);
    const sorted = diverse
      .map((m) => {
        // closing soon bonus: markets ending in <30 days get up to +0.10
        const daysLeft = (m._endMs - now) / 86_400_000;
        const urgency = daysLeft <= 0 ? 0 : daysLeft < 30 ? (1 - daysLeft / 30) * 0.10 : 0;
        return {
          ...m,
          _score:
            0.55 * ((m._vol24h ?? 0) / maxVol24h) +
            0.25 * ((m.volume ?? 0) / maxVol) +
            0.10 * (m.featured ? 1 : 0) +
            urgency,
        };
      })
      .sort((a, b) => b._score - a._score)
      .map(({ _vol24h, _endMs, _score, ...rest }) => ({
        ...rest,
        // URL canônica (marketNormalize): só /pt/event/{eventSlug} retorna 200; market.slug
        // e id numérico dão 404 (o "mercado falso"). Sem eventSlug → descartado abaixo.
        externalUrl: polyEventUrl(rest.eventSlug),
      }))
      // Corretor de mercados falsos: sem eventSlug não há página válida no Polymarket —
      // não expomos um mercado cujo link levaria a "página não encontrada".
      .filter((m) => !!m.externalUrl);

    // Pergunta genérica repetida em eventos diferentes. Flagrado pelo doctor em
    // 02/09: "Game 1: Both Teams Slay Baron Nashor?" aparecia 2x — eram DUAS
    // partidas de LoL distintas (Galions x TLN Pirates e Movistar KOI x UCAM), e a
    // pergunta do mercado é a mesma em toda partida da liga. Quem distingue é o
    // título do evento, que já vem no dado e estava sendo ignorado. Prefixamos só
    // quando há colisão, para não poluir o card do mercado que já é específico.
    // No Polymarket o distinguidor vem ANTES ("LoL: A vs B — Game 1: ..."), então
    // o sufixo é o próprio título do evento e o rótulo entra invertido de propósito.
    return desambiguarPorPai(
      sorted,
      { titulo: (m) => m.question, pai: (m) => m.eventSlug ?? m.id, sufixo: (m) => m.eventTitle },
      (m, _t) => ({ ...m, question: `${m.eventTitle} — ${m.question}` }),
    );
    });
    // Corta na RESPOSTA, não dentro do cache: a chave não inclui o limit, então
    // guardar a lista cortada faria o primeiro chamador definir o tamanho para
    // todos. Cacheamos o superconjunto e cada um leva o pedaço que pediu.
    const limit = limitePedido(req.query.limit, 300, 400);
    res.json({ markets: markets.slice(0, limit), source: "live" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error("[Polymarket] error:", msg);
    res.status(502).json({ error: "polymarket_unavailable", message: msg });
  }
});

interface ClobEntry { t: number; p: number }
interface ClobResponse { history: ClobEntry[] }

router.get("/clob-history", async (req, res) => {
  const tokenId = String(req.query.tokenId ?? "").replace(/[^a-zA-Z0-9]/g, "");
  if (!tokenId) return res.status(400).json({ error: "tokenId required" });

  const cacheKey = `clob:${tokenId}`;
  const cached = getCache<ClobEntry[]>(cacheKey);
  if (cached) { res.json({ history: cached, source: "cache" }); return; }

  try {
    const url = `https://clob.polymarket.com/prices-history?market=${tokenId}&interval=all&fidelity=60`;
    const data = await fetchJSON<ClobResponse>(url);
    if (!Array.isArray(data.history)) throw new Error("Invalid CLOB response");
    setCache(cacheKey, data.history, 300);
    res.json({ history: data.history, source: "live" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error(`[CLOB/${tokenId}] error:`, msg);
    res.status(502).json({ error: "clob_unavailable", message: msg });
  }
});

// ── Mercado único (inclui resolvidos) — fallback da tela de detalhe ────────────
// A lista "ao vivo" filtra encerrados; ao abrir um mercado já resolvido, buscamos
// ele aqui para mostrá-lo como "Resolvido" com o desfecho — em vez de "não encontrado".
interface GammaSingleMarket {
  id: string; question?: string; slug?: string; category?: string;
  outcomes?: string; outcomePrices?: string;
  volume?: number | string; volume24hr?: number | string; liquidity?: number | string;
  oneWeekPriceChange?: number; endDate?: string;
  closed?: boolean; active?: boolean; umaResolutionStatus?: string;
}

router.get("/market/:id", async (req, res) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    const m = await swr<GammaSingleMarket | null>(`poly:market:${id}`, 120, async () => {
      const data = await fetchJSON<GammaSingleMarket>(`https://gamma-api.polymarket.com/markets/${id}`);
      return data && data.id ? data : null;
    });
    if (!m) return res.status(404).json({ error: "not_found" });
    const toNum = (v: unknown) => (v == null ? undefined : parseFloat(String(v)) || undefined);
    const resolved = m.closed === true || m.umaResolutionStatus === "resolved";
    // Desfecho vencedor (binário): outcomePrices ["1","0"] = SIM, ["0","1"] = NÃO.
    let resolvedOutcome: string | undefined;
    if (resolved) {
      try {
        const labels = JSON.parse(m.outcomes ?? "[]") as string[];
        const prices = (JSON.parse(m.outcomePrices ?? "[]") as string[]).map(parseFloat);
        const win = prices.findIndex((p) => p >= 0.99);
        if (win >= 0) resolvedOutcome = labels[win] === "Yes" ? "SIM" : labels[win] === "No" ? "NÃO" : labels[win];
      } catch { /* ignore */ }
    }
    res.json({
      id: m.id, question: m.question, slug: m.slug, category: m.category,
      outcomes: m.outcomes, outcomePrices: m.outcomePrices,
      volume: toNum(m.volume), volume24h: toNum(m.volume24hr), liquidity: toNum(m.liquidity),
      weekPriceChange: m.oneWeekPriceChange, endDate: m.endDate,
      closed: m.closed, active: m.active, resolved, resolvedOutcome,
    });
  } catch (err) {
    log.error(`[Polymarket/market/${id}] error:`, err instanceof Error ? err.message : err);
    res.status(502).json({ error: "unavailable" });
  }
});

export default router;
