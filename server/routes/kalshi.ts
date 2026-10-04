import { Router } from "express";
import { swr, getCache } from "../lib/cache.ts";
import { lerCatalogo, salvarCatalogo } from "../lib/catalogoPersistido.ts";
import { fetchWithRetry } from "../lib/fetcher.ts";
import { kalshiMarketUrl, kalshiYesProb, kalshiTemPrecoReal } from "../lib/marketNormalize.ts";
import type { KalshiEventsResponse, KalshiMarket, KalshiEvent, KalshiNestedMarket } from "../lib/types.ts";
import { log } from "../lib/log.ts";
import { organizarOpcoes, tipoPeloStrike, prefixoComumDosRotulos, type TipoDeGrupo } from "../lib/eventoAgregado.ts";
import { comOrcamento, porVolume, desambiguarPorPai, desambiguarTitulosIguais, limitePedido, normalizarTitulo, tituloLimpo, expandirNomeTruncado, confrontoEmTexto, glossarioDeNomes, completarComGlossario } from "../lib/marketCatalog.ts";

const router = Router();

/** Páginas de 200 eventos varridas antes de ranquear. 10 cobre ~2.000 eventos
 *  em ~3,5s — fundo suficiente para os líderes de volume aparecerem. */
const PAGINAS_KALSHI = 10;

/** Tamanho do superconjunto cacheado — o corte por `limit` acontece na resposta. */
const TETO_KALSHI = 300;

/**
 * Teto de tempo para montar o catálogo. Flagrado em 02/09: com o cache frio a
 * produção TRAVOU (>90s) enquanto o mesmo código local respondia em 0,4s — são 10
 * páginas sequenciais mais duas janelas de 1.000 mercados, e o plano grátis do
 * Render tem 0,1 CPU. Mesmo remédio já aplicado ao Polymarket: em vez de esperar
 * tudo, para no prazo e ranqueia o que chegou. Catálogo menor é ruim; catálogo que
 * nunca carrega é pior.
 */
const ORCAMENTO_MS = 20_000;

// A regra de título mora em lib/marketCatalog.ts — o briefing monta a própria
// lista direto da API e precisa da MESMA regra, senão "Will  become President of
// the United States before 2045?" volta a aparecer por outro caminho.
export { tituloLimpo } from "../lib/marketCatalog.ts";

/** Vagas reservadas para mercado que resolve logo — ver `fetchCurtoPrazo`. */
const COTA_CURTO_PRAZO = 60;
const DIAS_CURTO_PRAZO = 30;
/** Parte da cota reservada para a SEMANA. Sem esta sub-reserva o tênis do US Open
 *  (441 mil de volume) engolia as 60 vagas e os jogos de sábado (5 mil) sumiam:
 *  dentro do curto prazo a diferença de volume é grande do mesmo jeito. */
const COTA_ATE_7_DIAS = 20;

/** O rótulo do desfecho ("Greed", "Fear", "10 or more") viaja junto com o
 *  mercado até a lista final: é o que permite desambiguar dois cards de mesmo
 *  título no último passo, quando já não se sabe por qual caminho eles vieram. */
interface KalshiMercadoPlano {
  ticker?: string; event_ticker?: string; title?: string; yes_sub_title?: string;
  rules_primary?: string;
  /** "structured" (jogo), "between" (faixa), "greater"/"less" (limiar) — ver `tipoPeloStrike`. */
  strike_type?: string; floor_strike?: number;
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
    comOrcamento(fetchWithRetry<{ markets?: KalshiMercadoPlano[] }>(
      `https://api.elections.kalshi.com/trade-api/v2/markets?status=open&min_close_ts=${agora}`
      + `&max_close_ts=${agora + dias * 86_400}&limit=1000`,
      { "Accept": "application/json" },
    ), ORCAMENTO_MS)));

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

/**
 * O card de um evento de VÁRIAS opções no Kalshi — ou `null` se nada sobrar.
 *
 * `id` de cada opção = o TICKER do mercado dela. É o identificador estável e o
 * que a previsão registrada guarda: rótulo de time ou candidato muda ("Barça" →
 * "Barcelona") e levaria o histórico junto. Ordem e corte vêm de
 * `organizarOpcoes` (lib/eventoAgregado.ts), a mesma regra do Polymarket.
 */
function cardDoGrupoKalshi(
  mapeados: KalshiMarket[],
  crus: ReadonlyArray<{ yes_sub_title?: string; title?: string; close_time?: string; floor_strike?: number }>,
  tipo: TipoDeGrupo,
  tituloDoEvento?: string,
  /** Opções abertas que ficaram fora por NÃO TEREM PREÇO confiável. Não vão para
   *  a lista (preço inventado é pior que nenhum), mas entram no "e mais N":
   *  existem no Kalshi, e sumir com elas calado era o defeito. */
  semPreco = 0,
): KalshiMarket | null {
  const opcoes = mapeados.map((m, i) => ({
    rotulo: crus[i].yes_sub_title ?? crus[i].title ?? m.ticker,
    prob: m.yesProb / 100,
    idDoMercado: m.ticker,
    token: "",
    ordemNaFonte: typeof crus[i].floor_strike === "number" ? crus[i].floor_strike : null,
    fimMs: crus[i].close_time ? Date.parse(crus[i].close_time!) : null,
    ref: i,
  }));
  const { lista, ocultas } = organizarOpcoes(opcoes, tipo);
  if (lista.length === 0) return null;
  const rep = mapeados[lista[0].ref];
  const soma = (f: "volume" | "volume24h") => mapeados.reduce((s, m) => s + (m[f] ?? 0), 0);
  // Na escada o evento dura até o ÚLTIMO degrau.
  const fim = tipo === "independentes"
    ? mapeados.map((m) => m.closeTime).filter(Boolean).sort().at(-1) ?? rep.closeTime
    : rep.closeTime;
  // "Ken Paxton, 1+ pts", "Ken Paxton, 3+ pts"… → título "… — Ken Paxton" e
  // rótulos "1+ pts", "3+ pts" (ver `prefixoComumDosRotulos`).
  const prefixo = prefixoComumDosRotulos(opcoes.map((o) => o.rotulo));
  const base = normalizarTitulo(tituloDoEvento ?? rep.title);
  return {
    ...rep,
    title: prefixo && !base.toLowerCase().includes(prefixo.toLowerCase()) ? `${base} — ${prefixo}` : base,
    rotuloDesfecho: undefined,
    volume: soma("volume"),
    volume24h: soma("volume24h"),
    closeTime: fim,
    // Variação é de UMA opção: na escada seria a do prazo mais curto fingindo ser o evento.
    prevYesProb: tipo === "independentes" ? undefined : rep.prevYesProb,
    outcomes: lista.map((o) => ({
      id: o.idDoMercado,
      label: prefixo ? o.rotulo.trim().slice(prefixo.length).replace(/^,\s*/, "") : o.rotulo,
      prob: o.prob,
    })),
    tipoDeGrupo: tipo,
    opcoesOcultas: ocultas + Math.max(0, semPreco),
  };
}

/**
 * O EVENTO COMPLETO dos mercados que chegaram sem ele (a lista plana de curto
 * prazo), com todas as opções.
 *
 * Por que buscar (03/10/2026, medido na varredura do catálogo contra a fonte):
 *  · a lista plana só traz o que fecha em até 30 dias E já teve negócio. "Quando
 *    o tráfego em Hormuz volta ao normal?" chegava com 1 das 9 datas, e o card
 *    não tinha como saber das outras 8 — 57 eventos assim, calados;
 *  · o título do MERCADO às vezes já traz a opção ("Will exactly 0 people be
 *    pardoned…"), e o do evento é a pergunta ("How many people will Trump
 *    pardon?");
 *  · a flag `mutually_exclusive` é a verdade que `tipoPeloStrike` só aproxima.
 *
 * Os mercados (preços) valem só para ESTA montagem — guardar seria servir preço
 * velho. Título e flag ficam em `metaDeEvento`, porque não mudam: se a próxima
 * busca falhar, o card ao menos tem o título certo.
 */
const metaDeEvento = new Map<string, { titulo?: string; exclusivo: boolean }>();
async function eventosCompletos(tickers: ReadonlyArray<string>): Promise<Map<string, KalshiEvent>> {
  const desta = new Map<string, KalshiEvent>();
  const todos = Array.from(new Set(tickers)).filter(Boolean);
  const DE_CADA_VEZ = 8;
  // Orçamento do LOTE inteiro, não de cada pedido: 60 eventos com um teto de
  // 20 s cada podiam segurar a montagem por minutos se o Kalshi engasgasse. O
  // que não chegar a tempo fica com o que a lista plana trouxe.
  const prazo = Date.now() + 8_000;
  for (let i = 0; i < todos.length && Date.now() < prazo; i += DE_CADA_VEZ) {
    await Promise.allSettled(todos.slice(i, i + DE_CADA_VEZ).map(async (t) => {
      const r = await comOrcamento(fetchWithRetry<{ event?: KalshiEvent; markets?: KalshiNestedMarket[] }>(
        `https://api.elections.kalshi.com/trade-api/v2/events/${encodeURIComponent(t)}?with_nested_markets=true`,
        { "Accept": "application/json" },
      ), 4_000);
      if (!r?.event) return;
      const ev: KalshiEvent = { ...r.event, markets: r.event.markets ?? r.markets ?? [] };
      desta.set(t, ev);
      metaDeEvento.set(t, { titulo: ev.title, exclusivo: !!ev.mutually_exclusive });
    }));
  }
  return desta;
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
async function fetchRankedEvents(maxPaginas: number, prazoFinal = Date.now() + ORCAMENTO_MS): Promise<KalshiEvent[]> {
  const base = "https://api.elections.kalshi.com/trade-api/v2/events";
  const acc: KalshiEvent[] = [];
  let cursor = "";
  for (let i = 0; i < maxPaginas; i++) {
    // A paginação é sequencial (depende do cursor da página anterior), então o
    // orçamento é do LAÇO, não de cada chamada: assim que estoura, ranqueia o que
    // já veio em vez de continuar somando latência.
    if (Date.now() > prazoFinal) {
      log.warn(`[Kalshi] orçamento esgotado na página ${i + 1} — ranqueando ${acc.length} eventos`);
      break;
    }
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

/**
 * Monta o catálogo do Kalshi a partir da fonte.
 *
 * Extraída de dentro da rota (Auditoria 21/09, DES-02) para poder rodar FORA
 * de um pedido — quando a resposta já saiu da cópia guardada e a montagem vai
 * para segundo plano. O conteúdo é o mesmo de antes, linha por linha.
 *
 * É a montagem mais cara do site: ~4s a frio, porque pagina cerca de 2.000
 * eventos para ranquear por volume (a API do Kalshi não aceita ordenação).
 */
async function montarCatalogoKalshi(): Promise<KalshiMarket[]> {
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
          // O Kalshi abrevia o time no mercado ("New York G wins") e escreve o
          // confronto inteiro no evento — completar por ali usa dado da origem.
          title: normalizarTitulo(expandirNomeTruncado(tituloDistinto(m, ev, irmaos), ev.title)),
          rotuloDesfecho: tituloLimpo(m.yes_sub_title),
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
        const abertasDoEvento = (ev.markets ?? []).filter((m) => !m.status || m.status === "active");
        const active = abertasDoEvento
          // Sem cotação não vai para a tela: `kalshiYesProb` devolveria 50% e isso
          // é número inventado exibido como preço de mercado.
          .filter((m) => kalshiTemPrecoReal(m.yes_bid_dollars, m.yes_ask_dollars, m.last_price_dollars));
        if (active.length === 0) return [];

        // Evento de VÁRIAS opções → 1 card com todas (03/10/2026). Antes só o
        // mutuamente exclusivo com 3+ agrupava; o resto virava UM CARD POR OPÇÃO
        // e o corte por volume ficava com as mais negociadas — "Quando o tráfego
        // em Hormuz volta ao normal?" aparecia com 1 das 9 datas. A regra de
        // ordem e de corte é a mesma do Polymarket (lib/eventoAgregado.ts).
        // Conta as ABERTAS, não só as com preço: num jogo de 3 opções em que só
        // uma tem preço confiável, o card solto escondia as outras duas caladas;
        // agrupado, ele mostra a uma e diz "e mais 2".
        if (abertasDoEvento.length >= 2) {
          const card = cardDoGrupoKalshi(
            active.map((m) => toMarket(m, ev, active.length)),
            active,
            ev.mutually_exclusive ? "exclusivos" : "independentes",
            ev.title,
            abertasDoEvento.length - active.length,
          );
          if (card) return [card];
        }
        return active.map((m) => toMarket(m, ev, active.length));
      })
        // Ranquear os EVENTOS não bastava: um evento se abre em vários mercados, e
        // um só com escada de faixas ("ao menos 25%", "ao menos 30%"…) tomava as
        // vagas seguintes com volume 1. Ordenar também no nível do mercado garante
        // que os 40 exibidos sejam os 40 mais negociados, não os vizinhos dos mais
        // negociados. Card agrupado entra com o volume somado do evento, então
        // concorre em pé de igualdade.
        .sort(porVolume);

      // ── Mistura as duas piscinas, com VAGAS RESERVADAS ────────────────────
      // Reserva em vez de bônus na pontuação: a diferença de volume é de ordens de
      // grandeza (861 mil da eleição de 2028 contra 55 mil do jogo de sábado), então
      // qualquer bônus somado à nota seria engolido. Reservar vagas é o único jeito
      // de o curto prazo sobreviver ao lado de um campeão de volume — mesmo padrão
      // que a tela já usa para não deixar uma fonte sufocar as outras.
      // O EVENTO que já veio pelo caminho dos eventos não volta por aqui. Agrupado,
      // as opções irmãs não têm o ticker do card e entrariam como cards soltos ao
      // lado do grupo — o mesmo evento duas vezes, de dois jeitos.
      const eventosJaTem = new Set(longoPrazo.map((m) => m.eventTicker));
      const tickersJaTem = new Set(longoPrazo.map((m) => m.ticker));
      const exclusivoPorEvento = new Map(events.map((ev) => [ev.event_ticker, !!ev.mutually_exclusive]));
      // Sub-reserva: primeiro os que fecham em ATÉ 7 DIAS (por volume entre eles),
      // depois o resto da cota com os demais. Sem isso a semana nunca aparece.
      const dentroDe = (m: KalshiMercadoPlano, dias: number) =>
        new Date(m.close_time ?? 0).getTime() - Date.now() <= dias * 86_400_000;
      const disponiveis = curtoPrazo.filter((m) => !tickersJaTem.has(m.ticker!) && !eventosJaTem.has(m.event_ticker ?? ""));
      // Uma UNIDADE por evento, na ordem da piscina (o mais negociado primeiro):
      // a escada de faixas do SpaceX ("How many launches…", 5 mercados) e a do
      // Bitcoin da hora chegam por aqui, não pelo caminho dos eventos.
      const porEvento = new Map<string, KalshiMercadoPlano[]>();
      for (const m of disponiveis) {
        const k = m.event_ticker ?? m.ticker!;
        if (!porEvento.has(k)) porEvento.set(k, []);
        porEvento.get(k)!.push(m);
      }
      const unidades = Array.from(porEvento.values());
      const daSemana = unidades.filter((u) => u.some((m) => dentroDe(m, 7))).slice(0, COTA_ATE_7_DIAS);
      const naSemana = new Set(daSemana);
      const escolhidas = [...daSemana, ...unidades.filter((u) => !naSemana.has(u))].slice(0, COTA_CURTO_PRAZO);
      const completos = await eventosCompletos(escolhidas.map((u) => u[0].event_ticker ?? ""));
      const curtos = escolhidas
        .flatMap((u): KalshiMarket[] => {
          const cards = u.map((m) => cartaoPlano(m, u.length));
          const ev = u[0].event_ticker ?? "";
          // Com o evento completo, o card nasce dele — todas as opções abertas,
          // com o título e a flag do evento — exatamente como no longo prazo.
          const completo = completos.get(ev);
          if (completo) {
            const abertasDoEvento = (completo.markets ?? []).filter((m) => !m.status || m.status === "active");
            const abertas = abertasDoEvento
              .filter((m) => kalshiTemPrecoReal(m.yes_bid_dollars, m.yes_ask_dollars, m.last_price_dollars));
            if (abertasDoEvento.length >= 2 && abertas.length >= 1) {
              const card = cardDoGrupoKalshi(
                abertas.map((m) => toMarket(m, completo, abertas.length)),
                abertas,
                completo.mutually_exclusive ? "exclusivos" : "independentes",
                completo.title,
                abertasDoEvento.length - abertas.length,
              );
              if (card) return [card];
            }
          }
          if (u.length < 2) return cards;
          const meta = metaDeEvento.get(ev);
          // Sem o evento, só se agrupa se os irmãos tiverem o MESMO título — senão
          // o título de um deles traz a opção dele e mentiria sobre o grupo. Aí
          // ficam os cards separados, cada um com o seu rótulo, como antes.
          const titulos = new Set(u.map((m) => tituloLimpo(m.title) ?? ""));
          if (!meta?.titulo && titulos.size > 1) return cards;
          const tipo: TipoDeGrupo = meta
            ? (meta.exclusivo ? "exclusivos" : "independentes")
            : exclusivoPorEvento.has(ev)
              ? (exclusivoPorEvento.get(ev) ? "exclusivos" : "independentes")
              : tipoPeloStrike(u.map((m) => m.strike_type));
          const titulo = meta?.titulo ?? expandirNomeTruncado(
            tituloLimpo(u[0].title) ?? u[0].ticker!, confrontoEmTexto(u[0].rules_primary));
          const card = cardDoGrupoKalshi(cards, u, tipo, titulo);
          return card ? [card] : cards;
        })
        .slice(0, COTA_CURTO_PRAZO);

      function cartaoPlano(m: KalshiMercadoPlano, irmaos: number): KalshiMarket {
          const serie = String(m.event_ticker ?? m.ticker).split("-")[0];
          return {
            ticker: m.ticker!,
            eventTicker: m.event_ticker ?? m.ticker!,
            seriesTicker: serie,
            externalUrl: kalshiMarketUrl(serie, m.event_ticker ?? m.ticker!),
            title: (() => {
              const base = tituloLimpo(m.title) ?? tituloLimpo(m.yes_sub_title) ?? m.ticker!;
              const rotulo = tituloLimpo(m.yes_sub_title);
              const comp = (t: string) => expandirNomeTruncado(t, confrontoEmTexto(m.rules_primary));
              // Sem o evento junto (esta piscina vem da listagem plana), o confronto
              // sai do próprio regulamento do mercado. Nada é inventado.
              if (irmaos < 2 || !rotulo) return comp(base);
              return comp(base.toLowerCase().includes(rotulo.toLowerCase()) ? base : `${base} — ${rotulo}`);
            })(),
            rotuloDesfecho: tituloLimpo(m.yes_sub_title),
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
      }

      const juntos = [...curtos, ...longoPrazo].slice(0, TETO_KALSHI);

      // Último recurso para o nome cortado: o mercado de HANDICAP não tem o time
      // inteiro em registro nenhum ("New York G vs Los Angeles R: Spread" até no
      // título do evento) — mas o evento IRMÃO, o do resultado, publica
      // "NY Giants vs LA Rams". O glossário aprende com o lote todo e só aplica
      // quando a assinatura de maiúsculas aponta para um nome só.
      // ⚠️ `curtoPrazo` inteiro, não `disponiveis`: este último já tirou os
      // mercados que vieram pelo caminho dos eventos, e são justamente os do
      // RESULTADO do jogo que trazem o nome bom no regulamento ("NY Giants vs
      // LA Rams"). Aprender só no que sobrou deixava o handicap cortado — medido
      // em 18/09: 1 título em 150 resistia exatamente por isso.
      const glossario = glossarioDeNomes([
        ...events.map((ev) => ev.title),
        ...curtoPrazo.map((m) => confrontoEmTexto(m.rules_primary)),
      ]);
      const comNomes = juntos.map((m) => ({ ...m, title: completarComGlossario(m.title, glossario) }));

      // Última desambiguação: dois EVENTOS DIFERENTES com o título idêntico.
      // Não é escada de faixas e não é bug nosso — a API do Kalshi devolve o mesmo
      // título para KXOSCARVIS (efeitos visuais) e KXOSCARMAH (maquiagem), ambos
      // como "Oscar Winner: Best Makeup and Hairstyling". Corrigir o título seria
      // ADIVINHAR a partir do ticker, e inventar dado é o que este projeto não faz.
      // Então marcamos com a série — feio, mas verdadeiro e clicável — em vez de
      // exibir dois cards idênticos, que parecem defeito e não deixam escolher.
      const porPai = desambiguarPorPai(
        comNomes,
        { titulo: (m) => m.title, pai: (m) => m.eventTicker, sufixo: (m) => m.seriesTicker },
        (m, titulo) => ({ ...m, title: titulo }),
      );
      // Rede de segurança: título ainda repetido depois de tudo — dois desfechos
      // do MESMO evento, que a desambiguação por pai não cobre e que os dois
      // caminhos de montagem não enxergam (cada um só vê os irmãos da sua busca).
      // Aqui a lista final existe inteira, que é onde o invariante pode ser
      // realmente garantido.
      const catalogo = desambiguarTitulosIguais(
        porPai,
        { titulo: (m) => m.title, rotulo: (m) => m.rotuloDesfecho },
        (m, titulo) => ({ ...m, title: titulo }),
      );

      // Guarda a versão boa para o próximo arranque frio (DES-02). `void`: se o
      // banco estiver fora, a rota não pode atrasar nem falhar por isso.
      void salvarCatalogo("kalshi", catalogo);
      return catalogo;
}

router.get("/markets", async (req, res) => {
  // Teto 300 (era 100) e padrão 150 (era 40). O catálogo vivo do Kalshi comporta:
  // dos ~2.000 eventos varridos, 379 têm volume em 24h. Com 40 o site mostrava uma
  // fração mínima do que existe.
  const limit = limitePedido(req.query.limit, 150, TETO_KALSHI);
  try {
    /**
     * ARRANQUE FRIO (Auditoria 21/09, DES-02) — ver o gêmeo em polymarket.ts.
     * Aqui dói mais: a montagem do Kalshi leva ~4s a frio porque pagina cerca de
     * 2.000 eventos para ranquear por volume. Com a memória vazia, servimos a
     * última versão boa e mandamos a montagem para segundo plano, dizendo na
     * resposta que é cópia e de quando ela é.
     */
    if (!getCache<KalshiMarket[]>("kalshi:markets")) {
      const copia = await lerCatalogo<KalshiMarket>("kalshi");
      if (copia) {
        res.json({
          markets: copia.itens.slice(0, limit),
          total: copia.itens.length,
          source: "arquivo",
          atualizadoEm: copia.atualizadoEm,
        });
        void swr<KalshiMarket[]>("kalshi:markets", 120, montarCatalogoKalshi).catch(() => {});
        return;
      }
    }
    // SWR: serve cache fresco na hora; se venceu, devolve o velho e atualiza em bg.
    const markets = await swr<KalshiMarket[]>("kalshi:markets", 120, montarCatalogoKalshi);
    // Corta DEPOIS do cache, não dentro dele. A chave (`kalshi:markets`) não inclui
    // o limit, então guardar a lista já cortada fazia o primeiro chamador definir o
    // tamanho para todos: quem pedisse 60 congelava 60 para quem pedisse 200 — e o
    // seed da IA, que lê esse mesmo cache, herdava o corte. Cacheamos o superconjunto.
    // `total` = catálogo real antes do corte — ver o gêmeo em polymarket.ts.
    res.json({ markets: markets.slice(0, limit), total: markets.length, source: "live" });
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
    /** As duas metades da regra de resolução — ver GET /regra/:ticker. */
    rules_primary?: string; rules_secondary?: string;
  };
}

/**
 * A REGRA DE RESOLUÇÃO deste mercado (Auditoria 21/09, UXP-02).
 * Ver o gêmeo em routes/polymarket.ts para o porquê de ser endpoint próprio.
 *
 * No Kalshi vem em duas partes e as DUAS importam: a primária diz o que faz o
 * mercado pagar; a secundária trata do que dá errado — adiamento, cancelamento,
 * fonte oficial indisponível. É justamente a parte que decide o dinheiro quando
 * o mundo não colabora.
 */
router.get("/regra/:ticker", async (req, res) => {
  const ticker = String(req.params.ticker).replace(/[^A-Za-z0-9_-]/g, "");
  if (!ticker) return res.status(400).json({ error: "ticker required" });
  try {
    const m = await swr<{ rules_primary?: string; rules_secondary?: string } | null>(
      `kalshi:regra:${ticker}`, 900, async () => {
        const d = await fetchWithRetry<KalshiSingleResp>(
          `https://api.elections.kalshi.com/trade-api/v2/markets/${ticker}`, { "Accept": "application/json" });
        return d?.market ?? null;
      });
    const regra = (m?.rules_primary ?? "").trim();
    res.json({ regra: regra || null, regraSecundaria: (m?.rules_secondary ?? "").trim() || null });
  } catch (err) {
    log.error(`[Kalshi/regra/${ticker}] error:`, err instanceof Error ? err.message : err);
    res.status(502).json({ error: "unavailable" });
  }
});

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
