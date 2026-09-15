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

/** Volume na moeda da plataforma: `US$ 898 mil` (Polymarket, Kalshi) ou `898 mil mana` (Manifold). */
export function volumeNaMoeda(v: number | null | undefined, source: string | null | undefined): string {
  if (source === "manifold") {
    const corpo = magnitude(v);
    return corpo === "—" ? corpo : `${corpo} mana`;
  }
  return dolar(v);
}
