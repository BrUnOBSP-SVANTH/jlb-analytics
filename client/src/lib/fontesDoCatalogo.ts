/**
 * Quando uma fonte não responde, a tela precisa DIZER isso.
 *
 * A /mercados carrega Reddit, Polymarket, Kalshi e Manifold com
 * `Promise.allSettled`: fonte que falha vira lista vazia e a página segue como
 * se nada tivesse acontecido. O resultado medido em 17/09: o filtro "Manifold"
 * levava a uma lista vazia com a explicação errada ("algumas categorias ficam
 * vazias por horas"), enquanto o subtítulo continuava prometendo as três
 * bolsas. Prometer fonte que não respondeu é o oposto da tese da plataforma.
 *
 * As regras de texto moram aqui, puras, para poderem ser testadas sem navegador.
 */

export type FonteMercado = "reddit" | "polymarket" | "kalshi" | "manifold";

export const NOME_DA_FONTE: Record<FonteMercado, string> = {
  reddit: "Reddit",
  polymarket: "Polymarket",
  kalshi: "Kalshi",
  manifold: "Manifold",
};

/** As três bolsas que o subtítulo promete. O Reddit é conversa, não preço. */
export const BOLSAS: readonly FonteMercado[] = ["polymarket", "kalshi", "manifold"];

/** "A, B e C" — a vírgula serial não existe em português. */
export function listar(nomes: string[]): string {
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** Quais fontes não trouxeram nada nesta rodada (falharam ou vieram vazias). */
export function fontesSemResposta(contagens: Partial<Record<FonteMercado, number>>): FonteMercado[] {
  return (Object.keys(NOME_DA_FONTE) as FonteMercado[]).filter((f) => !contagens[f]);
}

/**
 * O subtítulo da tela, contando só quem respondeu — e nomeando quem faltou.
 * Antes da primeira carga (`fora` desconhecido) promete as três, que é o normal.
 */
export function fraseDasFontes(fora: FonteMercado[]): string {
  const ativas = BOLSAS.filter((f) => !fora.includes(f));
  const ausentes = BOLSAS.filter((f) => fora.includes(f));
  const nomesAusentes = ausentes.map((f) => NOME_DA_FONTE[f]);

  if (ativas.length === 0) {
    return "Nenhuma das bolsas respondeu agora. Estamos tentando de novo — nada aqui é estimativa nossa.";
  }

  const principal =
    `O que ${listar(ativas.map((f) => NOME_DA_FONTE[f]))} ` +
    `${ativas.length > 1 ? "estão" : "está"} precificando agora, com a nossa leitura ao lado.`;

  if (ausentes.length === 0) return principal;
  return `${principal} ${listar(nomesAusentes)} ${ausentes.length > 1 ? "não responderam" : "não respondeu"} nesta atualização.`;
}

/** O que a lista vazia deve explicar: fonte fora do ar ou recorte sem mercado. */
export function motivoDaListaVazia(
  filtro: FonteMercado | "all",
  fora: FonteMercado[],
): { titulo: string; detalhe: string; fonteFora: boolean } {
  if (filtro !== "all" && fora.includes(filtro)) {
    return {
      fonteFora: true,
      titulo: `${NOME_DA_FONTE[filtro]} não respondeu agora`,
      detalhe:
        "Não é filtro seu: a fonte ficou fora nesta atualização e nós não inventamos os mercados dela. " +
        "As outras continuam ao vivo — e tentamos de novo na próxima rodada.",
    };
  }
  return {
    fonteFora: false,
    titulo: "Nenhum mercado com este filtro agora",
    detalhe: "Isso acontece: as fontes têm coberturas diferentes e algumas categorias ficam vazias por horas.",
  };
}
