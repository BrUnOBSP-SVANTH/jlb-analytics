/**
 * O endereço de saída de cada plataforma — um lugar só, para os dois lados.
 *
 * ESTE ARQUIVO EXISTE PORQUE O MESMO BUG VOLTOU (2026-09-26).
 *
 * Em agosto, o link para abrir o mercado na plataforma dava "página não
 * encontrada". A causa era a URL montada à mão em cinco lugares diferentes; o
 * conserto centralizou a montagem NO SERVIDOR (`externalUrl` no DTO) e deixou
 * cópias de reserva no cliente. Verificado na época, 8 de 8 abriam.
 *
 * Um mês depois, o fundador reportou de novo: "clica no link e aparece página
 * não encontrada". Medido em 26/09, com oito slugs que EXISTEM e estão abertos:
 *
 *     https://polymarket.com/pt/event/{slug}  → 404   (8 de 8)
 *     https://polymarket.com/event/{slug}     → 200   (8 de 8)
 *
 * O Polymarket removeu as rotas de idioma. Nem a home `/pt` existe mais. Ou
 * seja: TODO link de saída do Polymarket estava quebrado, e a verificação que
 * provou o conserto em agosto era uma foto — ela não continuou valendo.
 *
 * Duas lições viraram código:
 *
 *  1. a montagem mora AQUI, em `shared/`, e ninguém mais escreve
 *     "polymarket.com" no meio de um componente. Da última vez o endereço
 *     estava em seis arquivos, e por isso a correção precisou ser feita seis
 *     vezes — e as cópias do cliente ficaram para trás;
 *  2. formato de URL de terceiro é dado externo, não constante. Ele muda sem
 *     avisar e falha em silêncio, porque quem clica sai do site e não volta
 *     para reclamar. Por isso o `pnpm doctor` passou a ABRIR uma amostra dos
 *     links de verdade a cada rodada — ver scripts/doctor.
 */

/** A capa de cada plataforma. Reserva para quando não há mercado específico. */
export const HOME_POLYMARKET = "https://polymarket.com";
export const HOME_KALSHI = "https://kalshi.com";

/**
 * Página do EVENTO no Polymarket.
 *
 * ⚠️ É o slug do EVENTO (`ev.slug`), nunca o do mercado (`market.slug`) nem o id
 * numérico — esses dois dão 404. Um evento de vários desfechos tem um eventSlug
 * e vários market.slug.
 *
 * `undefined` sem slug: link que levaria a 404 não deve existir. Quem chama
 * decide entre esconder o botão ou mandar para a capa.
 */
export function urlDoEventoPoly(eventSlug?: string | null): string | undefined {
  const slug = (eventSlug ?? "").trim();
  return slug ? `${HOME_POLYMARKET}/event/${slug}` : undefined;
}

/**
 * Página do evento no Kalshi: `/markets/{série}/{evento}`, em MINÚSCULAS.
 *
 * ⚠️ Maiúscula dá 404 — foi a causa do mesmo sintoma do lado do Kalshi. A URL
 * completa deles tem três partes (com o título da série no meio), mas o formato
 * de duas partes é aceito e redirecionado, então não precisamos buscar o título.
 *
 * ⚠️ O kalshi.com responde 429 a requisição automatizada, inclusive com
 * User-Agent de navegador: este formato não dá para conferir por HTTP daqui. Foi
 * verificado no navegador, por uma pessoa.
 */
export function urlDoEventoKalshi(seriesTicker?: string | null, eventTicker?: string | null): string | undefined {
  const serie = (seriesTicker ?? "").trim().toLowerCase();
  const evento = (eventTicker ?? "").trim().toLowerCase();
  return serie && evento ? `${HOME_KALSHI}/markets/${serie}/${evento}` : undefined;
}
