/**
 * De qual plataforma o mercado veio — o nome e a moeda, ditos num lugar só.
 *
 * O QUE ACONTECIA (auditoria de 14/09/2026, itens 5 e 6). Oito lugares escreviam
 * o nome da plataforma com `source === "kalshi" ? "Kalshi" : "Polymarket"`. Com o
 * Manifold na lista de mercados, "tudo que não é Kalshi" virou Polymarket:
 *
 *   · o botão do card do Manifold dizia "Ver no Polymarket" e abria o Manifold;
 *   · a nota do card escrevia "o Polymarket precificou quase certeza";
 *   · a análise de IA de um mercado do Manifold recebia "PLATAFORMA: Polymarket"
 *     no prompt — e a IA escrevia sobre dinheiro em risco onde não há nenhum.
 *
 * E o volume do Manifold saía em "US$". O Manifold negocia MANA, dinheiro de
 * brincadeira que não se saca: "US$ 898 mil no Manifold" diz ao leitor que
 * houve dinheiro de verdade onde houve opinião. É o mesmo tipo de afirmação falsa
 * que o site existe para não fazer.
 *
 * É o defeito do `yesProb > 1` (shared/precoKalshi.ts) de novo: decidir a origem
 * por exclusão em vez de dizer qual é.
 */
import { dolar, magnitude } from "./formato.ts";

export type Plataforma = "polymarket" | "kalshi" | "manifold" | "reddit";

const NOMES: Record<Plataforma, string> = {
  polymarket: "Polymarket",
  kalshi: "Kalshi",
  manifold: "Manifold",
  reddit: "Reddit",
};

/** Nome de exibição. Fonte desconhecida → `null`: quem chama escolhe o texto neutro, não chuta. */
export function nomeDaPlataforma(source: string | null | undefined): string | null {
  // `hasOwn`, e não `in`: "toString" in NOMES é true (herdado de Object).
  return source && Object.hasOwn(NOMES, source) ? NOMES[source as Plataforma] : null;
}

/** "Ver no Kalshi", "Ver no Manifold"… e "Ver na fonte" quando não se sabe qual é. */
export function verNaPlataforma(source: string | null | undefined): string {
  const nome = nomeDaPlataforma(source);
  return nome ? `Ver no ${nome}` : "Ver na fonte";
}

/** O Manifold negocia mana, não dólar — ver o topo do arquivo. */
export function negociaDinheiroReal(source: string | null | undefined): boolean {
  return source === "polymarket" || source === "kalshi";
}

/**
 * Volume na unidade que a plataforma REALMENTE usa: `US$ 898 mil` (Polymarket),
 * `898 mil contratos` (Kalshi) ou `898 mil mana` (Manifold).
 *
 * ⚠️ O KALSHI NÃO PUBLICA VOLUME EM DINHEIRO (Auditoria 21/09, UXP-02). O campo
 * é `volume_fp` e conta CONTRATOS — a própria API separa as duas coisas pelo
 * sufixo: `_dollars` é dinheiro, `_fp` é contagem. Nós líamos `volume_fp` e
 * escrevíamos "US$" na frente.
 *
 * Não é detalhe de rótulo. Medido em 24/09 no mercado
 * KXTTELITEMATCH-26SEP241605SJAJMI-SJA: `volume_fp` = 1.497,43 — fracionário, o
 * que por si só denuncia que não é dinheiro — com `last_price_dollars` = 0,01.
 * O site publicava "US$ 1.497" onde o negociado foi da ordem de US$ 15. E o
 * volume é justamente o número que usamos para dizer quais mercados merecem
 * atenção, no site e no prompt da IA.
 *
 * Por que não converter para dólar: o valor negociado é contratos × preço MÉDIO
 * de execução, e esse preço a API não dá. Multiplicar pelo último preço seria
 * inventar um número. "1,5 mil contratos" é verdade e continua comparável entre
 * mercados do Kalshi.
 */
export function volumeNaMoeda(v: number | null | undefined, source: string | null | undefined): string {
  if (source === "kalshi") {
    const corpo = magnitude(v);
    return corpo === "—" ? corpo : `${corpo} ${Math.abs(Number(v)) === 1 ? "contrato" : "contratos"}`;
  }
  if (source === "manifold") {
    const corpo = magnitude(v);
    return corpo === "—" ? corpo : `${corpo} mana`;
  }
  return dolar(v);
}

/**
 * As fontes que o site acompanha ao vivo — a lista, num lugar só.
 *
 * Auditoria de 14/09, item 19: cinco textos, nenhum com as quatro. O selo do
 * hero dizia "Polymarket · Kalshi · Reddit", a estatística ao lado dizia
 * "5 fontes", /mercados esquecia o Reddit e o tour esquecia o Manifold.
 * São QUATRO, e os contadores dos filtros provam: Polymarket, Kalshi e Manifold
 * precificam; o Reddit é discussão, não preço — por isso aparece com o papel dele.
 */
export const FONTES_AO_VIVO = ["Polymarket", "Kalshi", "Manifold", "Reddit"] as const;

/** Quantas fontes, escrito por extenso onde o número aparece na tela. */
export const QUANTAS_FONTES = FONTES_AO_VIVO.length;

/** "Polymarket, Kalshi, Manifold e Reddit" */
export const FONTES_EM_TEXTO =
  `${FONTES_AO_VIVO.slice(0, -1).join(", ")} e ${FONTES_AO_VIVO[FONTES_AO_VIVO.length - 1]}`;
