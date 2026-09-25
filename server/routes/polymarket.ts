import { Router } from "express";
import { swr, getCache, setCache } from "../lib/cache.ts";
import { lerCatalogo, salvarCatalogo } from "../lib/catalogoPersistido.ts";
import { fetchWithRetry, fetchJSON } from "../lib/fetcher.ts";
import { parseYesPrice, polyEventUrl, rankOutcomes } from "../lib/marketNormalize.ts";
import type { PolyEvent, PolyMarket } from "../lib/types.ts";
import { log } from "../lib/log.ts";
import { comOrcamento, desambiguarPorPai, limitePedido, normalizarTitulo } from "../lib/marketCatalog.ts";
import { montarCardDoEvento } from "../lib/eventoAgregado.ts";

const router = Router();

/**
 * Monta o catálogo do Polymarket a partir da fonte.
 *
 * Extraída de dentro da rota (Auditoria 21/09, DES-02) para poder ser chamada
 * também FORA de um pedido — quando a resposta já saiu da cópia guardada e a
 * montagem vai para segundo plano. O conteúdo é o mesmo de antes, linha por
 * linha; o que mudou é quem pode chamar.
 */
async function montarCatalogoPoly(closed: boolean): Promise<PolyMarket[]> {
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
            // Normalizado UMA vez, aqui: o `___` que aparecia no card e o
            // mesmo mercado com títulos diferentes em telas diferentes
            // (MKT-11, ANL-02) vinham de cada tela limpar do seu jeito.
            question: normalizarTitulo(m.question ?? ""),
            groupItemTitle: m.groupItemTitle?.trim(),
            // `eventTitle` também passa pela normalização: é ELE que a tela
            // mostra quando difere da pergunta (ver `displayTitle` em
            // lib/trending.ts), e foi por aqui que o `___` continuou aparecendo
            // no card mesmo com a pergunta já limpa.
            eventTitle: normalizarTitulo(ev.title ?? ""),
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
        // rankOutcomes ordena por PROBABILIDADE e corta o ruído. A ordem dele é a
        // ordem das quatro listas paralelas do card — por construção, não por
        // coincidência. O representante (`ranked[0].ref`) ainda empresta os campos
        // que o card precisa (prazo, categoria, slug), mas NÃO empresta mais o id:
        // desde o DAD-03 quem dá identidade ao card é o evento, e quem liquida um
        // desfecho é o mercado dele, em `outcomeMarketIds`.
        const ranked = rankOutcomes<(typeof nested)[number]>(nested.map((m) => ({ label: m.groupItemTitle ?? m.question ?? "", prob: parseYesPrice(m.outcomePrices), ref: m })));
        if (ranked.length > 2) {
          const lead = ranked[0].ref;
          // A identidade do card e as quatro listas paralelas moram em
          // `lib/eventoAgregado.ts` — função pura, testada, porque é ali que o
          // card deixa de trocar de dono quando o líder muda (DAD-03).
          const card = montarCardDoEvento(String(ev.id), ranked.map((o) => ({
            rotulo: o.label,
            prob: o.prob,
            idDoMercado: String(o.ref.id ?? ""),
            token: (() => {
              try {
                const ids = JSON.parse(String(o.ref.clobTokenIds ?? "[]")) as string[];
                return ids[0] ?? "";
              } catch { return ""; }
            })(),
          })));
          return [{
            ...lead,
            ...card,
            question: normalizarTitulo(ev.title ?? lead.question ?? ""),
            eventTitle: normalizarTitulo(ev.title ?? ""),
            volume: toNum(ev.volume) ?? lead.volume,
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
    const catalogo = desambiguarPorPai(
      sorted,
      { titulo: (m) => m.question, pai: (m) => m.eventSlug ?? m.id, sufixo: (m) => m.eventTitle },
      (m, _t) => ({ ...m, question: `${m.eventTitle} — ${m.question}` }),
    );

    // Guarda a versão boa para o próximo arranque frio (DES-02). `void`: se o
    // banco estiver fora, a rota não pode nem atrasar nem falhar por causa
    // disso — é aceleração, não dependência. Só o catálogo ABERTO vale a pena:
    // o de mercados fechados é consultado raramente e vive 10 minutos no cache.
    if (!closed) void salvarCatalogo("polymarket", catalogo);
    return catalogo;
}

router.get("/markets", async (req, res) => {
  const closed = req.query.closed === "true";
  const cacheKey = `polymarket:markets:${closed ? "closed" : "active"}`;
  try {
    /**
     * ARRANQUE FRIO (Auditoria 21/09, DES-02).
     *
     * Medido em 25/09 na produção: a PRIMEIRA chamada depois de o serviço subir
     * levou 10,5s; a segunda, 0,3s. A diferença é este builder rodando com um
     * navegador esperando. E quase todo visitante é o primeiro — o plano grátis
     * do Render dorme em 15 minutos e o site recebe ~53 pessoas por mês.
     *
     * Então, quando a memória está vazia, servimos a última versão boa guardada
     * no banco e mandamos a montagem para segundo plano. A resposta sai com
     * `source: "arquivo"` e `atualizadoEm`: cópia servida sem dizer que é cópia
     * seria a plataforma parecer rápida às custas de ser honesta.
     */
    if (!closed && !getCache<PolyMarket[]>(cacheKey)) {
      const copia = await lerCatalogo<PolyMarket>("polymarket");
      if (copia) {
        const limiteDaCopia = limitePedido(req.query.limit, 300, 400);
        res.json({
          markets: copia.itens.slice(0, limiteDaCopia).map(paraLista),
          total: copia.itens.length,
          source: "arquivo",
          atualizadoEm: copia.atualizadoEm,
        });
        // Monta agora, para quem chegar em seguida — e para a própria cópia.
        void swr<PolyMarket[]>(cacheKey, 90, () => montarCatalogoPoly(closed)).catch(() => {});
        return;
      }
    }
    // SWR: cache fresco na hora; se venceu, devolve o velho e atualiza em bg.
    const markets = await swr<PolyMarket[]>(cacheKey, closed ? 600 : 90, () => montarCatalogoPoly(closed));
    // Corta na RESPOSTA, não dentro do cache: a chave não inclui o limit, então
    // guardar a lista cortada faria o primeiro chamador definir o tamanho para
    // todos. Cacheamos o superconjunto e cada um leva o pedaço que pediu.
    const limit = limitePedido(req.query.limit, 300, 400);
    // `total` é o tamanho REAL do catálogo, antes do corte (Auditoria 21/09,
    // DES-02). A home contava `markets.length` para dizer "600+ mercados
    // monitorados", e esse comprimento é o LIMITE PEDIDO, não o que existe —
    // 300 + 300. O "+" prometia "pelo menos 600" quando 600 era o teto, e o
    // número se mexia quando uma página da fonte não chegava a tempo.
    res.json({ markets: markets.slice(0, limit).map(paraLista), total: markets.length, source: "live" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    log.error("[Polymarket] error:", msg);
    res.status(502).json({ error: "polymarket_unavailable", message: msg });
  }
});

/**
 * A LISTA manda só o que a lista desenha.
 *
 * Medido em 16/09/2026 nos 300 mercados do catálogo (307 KB crus, 72,6 KB em
 * brotli): `outcomeTokens` sozinho eram 53 KB crus / ~20 KB comprimidos — e
 * nenhum card o lê. Ele existe para o gráfico "como cada um chegou aqui" da TELA
 * DE DETALHE, que abre um mercado por vez. `clobTokenIds` vinha com os dois
 * tokens (SIM e NÃO) e todo consumidor usa só o primeiro.
 *
 * O cache continua guardando o objeto inteiro: quem precisa do resto pede em
 * `/api/polymarket/desfechos/:id`. ⚠️ O primeiro token e o primeiro preço
 * precisam descrever o MESMO desfecho (ver `rankOutcomes` em marketNormalize):
 * por isso encolhe para o PRIMEIRO, nunca para outro.
 *
 * `outcomeMarketIds` FICA, e a diferença é o preço: medido em 22/09 nos mesmos
 * 300 mercados, manter os ids custa 9,7 KB crus (230,4 → 240,1 KB) contra os 53
 * KB dos tokens — são 92 cards agregados com ids de 6 dígitos, não tokens de 78.
 * E sem eles a banca simulada não sabe QUAL mercado liquida a aposta feita num
 * card de evento, que é metade do DAD-03.
 */
function paraLista(m: PolyMarket): PolyMarket {
  const { outcomeTokens: _fora, ...resto } = m as PolyMarket & { outcomeTokens?: string };
  void _fora;
  let clobTokenIds = resto.clobTokenIds;
  try {
    const ids = JSON.parse(String(clobTokenIds ?? "[]")) as string[];
    if (ids.length > 1) clobTokenIds = JSON.stringify([ids[0]]);
  } catch { /* formato inesperado: manda como veio */ }
  return { ...resto, clobTokenIds };
}

/**
 * GET /api/polymarket/desfechos/:id — os desfechos de UM mercado agrupado.
 *
 * Sai do mesmo cache que serve o catálogo (sem ida extra ao Polymarket). É o que
 * a tela de detalhe pede quando o mercado tem mais de dois desfechos — e o que
 * permitiu tirar 20 KB comprimidos de toda carga da lista.
 */
router.get("/desfechos/:id", (req, res) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, "");
  const cache = getCache<Array<PolyMarket & { outcomeTokens?: string; outcomeMarketIds?: string }>>("polymarket:markets:active") ?? [];
  const m = cache.find((x) => x.id === id || x.slug === id);
  if (!m) return res.status(404).json({ error: "market_not_found" });
  res.json({
    outcomes: m.outcomes ?? null,
    outcomePrices: m.outcomePrices ?? null,
    outcomeTokens: m.outcomeTokens ?? null,
    // O id do MERCADO de cada desfecho: é ele que liquida a previsão (DAD-03).
    outcomeMarketIds: m.outcomeMarketIds ?? null,
  });
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

/**
 * Histórico de preço EM LOTE (TRV-01).
 *
 * A auditoria contou 52 chamadas de API por carregamento de página, com
 * `clob-history` entre as piores: 11 chamadas de até 3,5 s, uma por minigráfico
 * de card. Cada card pedia a sua sem saber dos vizinhos, e o resultado é uma
 * lista que fica sem gráfico nenhum enquanto a fila anda.
 *
 * Uma chamada com N tokens resolve a tela inteira. As buscas saem em paralelo
 * aqui dentro e cada uma continua caindo no mesmo cache de 5 minutos — o que
 * muda é o número de idas e voltas do navegador, que é o que o usuário sente.
 *
 * Token que falhar volta como lista vazia em vez de derrubar o lote: um
 * minigráfico ausente é aceitável, doze ausentes por causa de um não são.
 */
router.post("/clob-history/lote", async (req, res) => {
  const bruto = (req.body as { tokenIds?: unknown })?.tokenIds;
  if (!Array.isArray(bruto)) return res.status(400).json({ error: "tokenIds required" });

  // Teto de 30: é mais que a lista visível, e acima disso a chamada demora mais
  // que as individuais que ela veio substituir.
  const tokens = Array.from(new Set(
    bruto.map((t) => String(t ?? "").replace(/[^a-zA-Z0-9]/g, "")).filter(Boolean),
  )).slice(0, 30);

  const historicos: Record<string, ClobEntry[]> = {};

  await Promise.all(tokens.map(async (tokenId) => {
    const cacheKey = `clob:${tokenId}`;
    const cached = getCache<ClobEntry[]>(cacheKey);
    if (cached) { historicos[tokenId] = cached; return; }
    try {
      const url = `https://clob.polymarket.com/prices-history?market=${tokenId}&interval=all&fidelity=60`;
      const data = await fetchJSON<ClobResponse>(url);
      if (!Array.isArray(data.history)) throw new Error("Invalid CLOB response");
      setCache(cacheKey, data.history, 300);
      historicos[tokenId] = data.history;
    } catch {
      // Silencioso de propósito: um token sem histórico é comum (mercado novo),
      // e logar 30 avisos por carregamento afogaria o log de verdade.
      historicos[tokenId] = [];
    }
  }));

  res.json({ historicos });
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

/**
 * A REGRA DE RESOLUÇÃO deste mercado (Auditoria 21/09, UXP-02).
 *
 * A tela mostrava preço, prazo, volume e análise — e não mostrava o que decide
 * o resultado. É a informação que separa a aposta que a pessoa acha que está
 * fazendo da que existe: "Xi deixa o poder" resolve por remoção do cargo, não
 * por renúncia anunciada; jogo adiado além de 48h vira cancelamento no Kalshi.
 *
 * Endpoint PRÓPRIO e não campo do catálogo: são 600 a 2.000 caracteres por
 * mercado, e o catálogo carrega 300 de uma vez — entraria como 180KB que
 * ninguém lê na lista. Aqui é uma ida só, quando alguém abre o mercado.
 *
 * `ev-<n>` é card de evento montado por nós: a regra mora no evento, e é a
 * mesma dos desfechos (conferido no evento 30829, 128 mercados).
 */
router.get("/regra/:id", async (req, res) => {
  const id = String(req.params.id).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id) return res.status(400).json({ error: "id required" });
  const evento = /^ev-(\d+)$/.exec(id);
  try {
    const dado = await swr<{ description?: string; resolutionSource?: string } | null>(
      `poly:regra:${id}`, 900, async () => {
        const url = evento
          ? `https://gamma-api.polymarket.com/events/${evento[1]}`
          : `https://gamma-api.polymarket.com/markets/${id}`;
        try {
          return await fetchJSON<{ description?: string; resolutionSource?: string }>(url) ?? null;
        } catch (e) {
          // 404 é resposta, não falha: o mercado não existe (ou saiu do ar) e a
          // tela simplesmente não mostra a seção. Só erro de verdade vira 502 —
          // "a fonte não respondeu" e "a fonte não tem" são coisas diferentes, e
          // misturar as duas é como a tela passa a mentir por omissão.
          if (e instanceof Error && /HTTP 404/.test(e.message)) return {};
          throw e;
        }
      });
    const regra = (dado?.description ?? "").trim();
    // Sem regra publicada a tela não inventa nem esconde: ela diz que a fonte
    // não publicou. Por isso 200 com `regra: null`, e não 404.
    res.json({ regra: regra || null, fonteDaRegra: (dado?.resolutionSource ?? "").trim() || null });
  } catch (err) {
    log.error(`[Polymarket/regra/${id}] error:`, err instanceof Error ? err.message : err);
    res.status(502).json({ error: "unavailable" });
  }
});

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
