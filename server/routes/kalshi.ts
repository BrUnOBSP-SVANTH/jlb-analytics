import { Router } from "express";
import { swr } from "../lib/cache.ts";
import { fetchWithRetry } from "../lib/fetcher.ts";
import { kalshiMarketUrl, kalshiYesProb, kalshiTemPrecoReal } from "../lib/marketNormalize.ts";
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

/** Vagas reservadas para mercado que resolve logo — ver `fetchCurtoPrazo`. */
const COTA_CURTO_PRAZO = 60;
const DIAS_CURTO_PRAZO = 30;
/** Parte da cota reservada para a SEMANA. Sem esta sub-reserva o tênis do US Open
 *  (441 mil de volume) engolia as 60 vagas e os jogos de sábado (5 mil) sumiam:
 *  dentro do curto prazo a diferença de volume é grande do mesmo jeito. */
const COTA_ATE_7_DIAS = 20;

interface KalshiMercadoPlano {
  ticker?: string; event_ticker?: string; title?: string; yes_sub_title?: string;
  yes_bid_dollars?: string; yes_ask_dollars?: string; last_price_dollars?: string;
  previous_price_dollars?: string; volume_fp?: string; volume_24h_fp?: string;
  open_interest_fp?: string; liquidity_dollars?: string; close_time?: string; status?: string;
}

/**
 * Segunda piscina: mercados que RESOLVEM LOGO.
 *
 * Por que precisa existir. Ranquear por volume consertou o catálogo morto, mas
 * criou outro problema: os campeões de volume do Kalshi são as eleições de 2028,
 * então a mediana de prazo do que exibíamos foi para 481 DIAS e sobrou UM único
 * mercado fechando em 7 dias (o Polymarket tinha 30). Mercado que resolve daqui a
 * um ano e meio não ensina nada e não alimenta track record.
 *
 * Por que não bastou ajustar a ordenação. A causa é mais funda: varremos as 10
 * primeiras páginas de uma lista SEM ORDEM, e nesse recorte de 2.000 eventos só
 * existem 11 fechando em 7 dias. Não é escassez do Kalshi — é viés da amostra.
 *
 * Por que uma rota diferente. `/events` IGNORA min_close_ts/max_close_ts (testado:
 * a mediana de prazo não muda). Só `/markets` filtra por data — é a mesma via que
 * o seed da IA já usava para achar jogo da semana, e é por isso que a IA previa
 * "Ohio St. x Texas" (55 mil de volume) enquanto o site não exibia esse mercado.
 */
async function fetchCurtoPrazo(): Promise<KalshiMercadoPlano[]> {
  const agora = Math.floor(Date.now() / 1000);
  const vol = (m: KalshiMercadoPlano, campo: "volume_24h_fp" | "volume_fp") => parseFloat(m[campo] ?? "0") || 0;

  // ⚠️ DUAS janelas, não uma. O `limit=1000` corta na ordem arbitrária da API, e
  // medimos o efeito: pedindo 30 dias, os 1.000 devolvidos caem TODOS na faixa de
  // 15-30 dias e a semana some. Pedindo 7 dias explicitamente aparecem 61 mercados
  // com volume (os jogos do fim de semana) que a consulta de 30 dias nunca mostra.
  // A janela estreita força a API a olhar onde queremos.
  const janelas = [7, DIAS_CURTO_PRAZO];
  const resultados = await Promise.allSettled(janelas.map((dias) =>
    fetchWithRetry<{ markets?: KalshiMercadoPlano[] }>(
      `https://api.elections.kalshi.com/trade-api/v2/markets?status=open&min_close_ts=${agora}`
      + `&max_close_ts=${agora + dias * 86_400}&limit=1000`,
      { "Accept": "application/json" },
    )));

  const porTicker = new Map<string, KalshiMercadoPlano>();
  for (const r of resultados) {
    if (r.status !== "fulfilled") {
      log.warn("[Kalshi] uma janela de curto prazo falhou — seguindo com as demais");
      continue;
    }
    for (const m of r.value?.markets ?? []) {
      // Piso do seed: preço sem volume é cotação de formador de mercado, não preço
      // que alguém pagou.
      if (!m.ticker || vol(m, "volume_fp") <= 0) continue;
      // Idem: preço inventado não entra no catálogo.
      if (!kalshiTemPrecoReal(m.yes_bid_dollars, m.yes_ask_dollars, m.last_price_dollars)) continue;
      // Ticker agregado (negRisk) e título-lista "yes X, yes Y" não são mercado
      // navegável — mesma regra que o seed já aplica em parseShortDatedKalshi.
      if (/MULTIGAME|CROSSCATEGORY|MULTI/i.test(m.ticker)) continue;
      if (/,\s*(yes|no)\s/i.test(m.title ?? "")) continue;
      porTicker.set(m.ticker, m);
    }
  }
  return Array.from(porTicker.values())
    .sort((a, b) => vol(b, "volume_24h_fp") - vol(a, "volume_24h_fp") || vol(b, "volume_fp") - vol(a, "volume_fp"));
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
      // As duas piscinas em paralelo: a varredura ranqueada (pega o alto volume,
      // majoritariamente longo prazo) e a busca explicita por quem resolve logo.
      const [events, curtoPrazo] = await Promise.all([
        fetchRankedEvents(PAGINAS_KALSHI),
        fetchCurtoPrazo(),
      ]);

      /**
       * Título que DISTINGUE um mercado dos irmãos do mesmo evento.
       *
       * Escada de faixas compartilha o título: os 5 mercados de
       * "How many launches will SpaceX have in Sep 2026?" chegavam à tela como
       * CINCO CARDS IDÊNTICOS marcando 9%, 77%, 23%, 46% e 3% — sem nenhuma forma
       * de o usuário saber qual é qual. Parece defeito nosso e é inutilizável.
       * O rótulo que separa (`yes_sub_title` = "10 or more") vem na API e estava
       * sendo descartado. Só entra quando o evento tem irmãos E o título ainda não
       * contém o rótulo, para não poluir mercado binário comum.
       */
      const tituloDistinto = (m: KalshiNestedMarket, ev: KalshiEvent, irmaos: number): string => {
        const base = tituloLimpo(m.title) ?? tituloLimpo(ev.title) ?? m.ticker;
        const rotulo = tituloLimpo(m.yes_sub_title);
        if (irmaos < 2 || !rotulo) return base;
        if (base.toLowerCase().includes(rotulo.toLowerCase())) return base;
        return `${base} — ${rotulo}`;
      };

      // Um mercado aninhado do Kalshi → nosso formato normalizado.
      const toMarket = (m: KalshiNestedMarket, ev: KalshiEvent, irmaos = 1): KalshiMarket => {
        const seriesTicker = ev.series_ticker ?? ev.event_ticker;
        return {
          ticker: m.ticker,
          eventTicker: ev.event_ticker,
          seriesTicker,
          externalUrl: kalshiMarketUrl(seriesTicker, ev.event_ticker),
          // Espaço duplo denuncia interpolação vazia NA ORIGEM: o Kalshi publicou
          // "Will  become President of the United States" — sem o nome. Preferimos
          // o título do evento nesse caso; se nem ele existir, o ticker, que é feio
          // mas verdadeiro. Nunca inventar o nome que falta. E `tituloDistinto`
          // ainda acrescenta o rótulo da faixa quando o evento tem irmãos.
          title: tituloDistinto(m, ev, irmaos),
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

      const longoPrazo = events.flatMap((ev) => {
        // Fidelidade ao mercado: só o que está realmente aberto. Kalshi marca o status como
        // "closed"/"settled"/"finalized"/"determined" quando o mercado encerra/resolve.
        const active = (ev.markets ?? [])
          .filter((m) => !m.status || m.status === "active")
          // Sem cotação não vai para a tela: `kalshiYesProb` devolveria 50% e isso
          // é número inventado exibido como preço de mercado.
          .filter((m) => kalshiTemPrecoReal(m.yes_bid_dollars, m.yes_ask_dollars, m.last_price_dollars));
        if (active.length === 0) return [];

        // Multi-resultado: evento mutuamente exclusivo com >2 desfechos → 1 card agrupado,
        // cada desfecho com sua prob (yes_sub_title = rótulo). Fiel ao Kalshi, como no Polymarket.
        if (ev.mutually_exclusive && active.length > 2) {
          const mapped = active.map((m) => toMarket(m, ev, active.length));
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
        return active.map((m) => toMarket(m, ev, active.length));
      })
        // Ranquear os EVENTOS não bastava: um evento se abre em vários mercados, e
        // um só com escada de faixas ("ao menos 25%", "ao menos 30%"…) tomava as
        // vagas seguintes com volume 1. Ordenar também no nível do mercado garante
        // que os 40 exibidos sejam os 40 mais negociados, não os vizinhos dos mais
        // negociados. Card agrupado entra com o volume somado do evento, então
        // concorre em pé de igualdade.
        .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0) || b.volume - a.volume);

      // ── Mistura as duas piscinas, com VAGAS RESERVADAS ────────────────────
      // Reserva em vez de bônus na pontuação: a diferença de volume é de ordens de
      // grandeza (861 mil da eleição de 2028 contra 55 mil do jogo de sábado), então
      // qualquer bônus somado à nota seria engolido. Reservar vagas é o único jeito
      // de o curto prazo sobreviver ao lado de um campeão de volume — mesmo padrão
      // que a tela já usa para não deixar uma fonte sufocar as outras.
      const jaTem = new Set(longoPrazo.map((m) => m.ticker));
      // Sub-reserva: primeiro os que fecham em ATÉ 7 DIAS (por volume entre eles),
      // depois o resto da cota com os demais. Sem isso a semana nunca aparece.
      const dentroDe = (m: KalshiMercadoPlano, dias: number) =>
        new Date(m.close_time ?? 0).getTime() - Date.now() <= dias * 86_400_000;
      const disponiveis = curtoPrazo.filter((m) => !jaTem.has(m.ticker!));
      // Quantos irmãos cada evento tem DENTRO desta piscina — a escada de faixas do
      // SpaceX ("How many launches…", 5 mercados) chega por aqui, não pelo caminho
      // dos eventos, então precisa da mesma desambiguação.
      const irmaosPorEvento = new Map<string, number>();
      for (const m of disponiveis) {
        const k = m.event_ticker ?? m.ticker!;
        irmaosPorEvento.set(k, (irmaosPorEvento.get(k) ?? 0) + 1);
      }
      const daSemana = disponiveis.filter((m) => dentroDe(m, 7)).slice(0, COTA_ATE_7_DIAS);
      const naSemana = new Set(daSemana.map((m) => m.ticker));
      const curtos = [...daSemana, ...disponiveis.filter((m) => !naSemana.has(m.ticker))]
        .slice(0, COTA_CURTO_PRAZO)
        .map((m) => {
          const serie = String(m.event_ticker ?? m.ticker).split("-")[0];
          return {
            ticker: m.ticker!,
            eventTicker: m.event_ticker ?? m.ticker!,
            seriesTicker: serie,
            externalUrl: kalshiMarketUrl(serie, m.event_ticker ?? m.ticker!),
            title: (() => {
              const base = tituloLimpo(m.title) ?? tituloLimpo(m.yes_sub_title) ?? m.ticker!;
              const rotulo = tituloLimpo(m.yes_sub_title);
              const irmaos = irmaosPorEvento.get(m.event_ticker ?? m.ticker!) ?? 1;
              if (irmaos < 2 || !rotulo) return base;
              return base.toLowerCase().includes(rotulo.toLowerCase()) ? base : `${base} — ${rotulo}`;
            })(),
            yesProb: kalshiYesProb(m.yes_bid_dollars, m.yes_ask_dollars, m.last_price_dollars),
            prevYesProb: m.previous_price_dollars
              ? parseFloat((parseFloat(m.previous_price_dollars) * 100).toFixed(1))
              : undefined,
            volume: Math.round(parseFloat(m.volume_fp ?? "0")),
            volume24h: Math.round(parseFloat(m.volume_24h_fp ?? "0")),
            openInterest: Math.round(parseFloat(m.open_interest_fp ?? "0")),
            liquidity: parseFloat(m.liquidity_dollars ?? "0"),
            closeTime: m.close_time,
            // `/markets` não devolve categoria (só `/events` devolve). Fica indefinida
            // de propósito: o cliente cai no título para classificar, que é honesto —
            // inventar categoria aqui seria pior que não ter.
            category: undefined,
            status: m.status,
          };
        });

      const juntos = [...curtos, ...longoPrazo].slice(0, TETO_KALSHI);

      // Última desambiguação: dois EVENTOS DIFERENTES com o título idêntico.
      // Não é escada de faixas e não é bug nosso — a API do Kalshi devolve o mesmo
      // título para KXOSCARVIS (efeitos visuais) e KXOSCARMAH (maquiagem), ambos
      // como "Oscar Winner: Best Makeup and Hairstyling". Corrigir o título seria
      // ADIVINHAR a partir do ticker, e inventar dado é o que este projeto não faz.
      // Então marcamos com a série — feio, mas verdadeiro e clicável — em vez de
      // exibir dois cards idênticos, que parecem defeito e não deixam escolher.
      const porTitulo = new Map<string, Set<string>>();
      for (const m of juntos) {
        if (!porTitulo.has(m.title)) porTitulo.set(m.title, new Set());
        porTitulo.get(m.title)!.add(m.eventTicker);
      }
      return juntos.map((m) =>
        (porTitulo.get(m.title)?.size ?? 1) > 1 ? { ...m, title: `${m.title} (${m.seriesTicker})` } : m);
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
