/**
 * marketCatalog — o que as rotas de mercado fazem IGUAL.
 *
 * Polymarket e Kalshi têm APIs bem diferentes (uma pagina por `offset`, a outra
 * por `cursor`; uma aceita ordenação, a outra não), mas as decisões de vitrine são
 * as mesmas: cortar por tempo, ranquear por volume, desambiguar título repetido e
 * cachear o superconjunto cortando só na resposta.
 *
 * Estava tudo duplicado — a segunda rota copiou a primeira conforme cada problema
 * apareceu. E duplicação de regra já se provou cara aqui: o casamento por
 * substring voltou TRÊS vezes porque a regra estava em três lugares, e a
 * deduplicação por mercado estava copiada quatro vezes em calibrationData.ts.
 * Regra em um lugar só é regra; em quatro é quatro regras que por acaso
 * coincidem hoje.
 */

/**
 * Corre a promessa contra um relógio; quem não chegar vira `null`.
 *
 * Nasceu de um incidente real (02/09): a rota do Polymarket passou a buscar 8
 * páginas e TRAVOU em produção com mais de 120s, enquanto o Kalshi respondia em
 * 0,7s. Não era rede — são ~2.500 objetos por página e o plano grátis do Render
 * tem 0,1 CPU. A rota já tolerava página que FALHA; faltava tolerar página que
 * DEMORA. Catálogo menor é ruim; catálogo que nunca carrega é pior.
 */
export function comOrcamento<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

/**
 * Comparador de vitrine: mais negociado HOJE primeiro; empate (dia parado)
 * desempata pelo volume histórico. É a régua que tirou do ar o catálogo-borra do
 * Kalshi — 85 de 100 mercados sem volume nenhum, "Musk em Marte antes de 2099".
 */
export function porVolume<T extends { volume24h?: number; volume?: number }>(a: T, b: T): number {
  return (b.volume24h ?? 0) - (a.volume24h ?? 0) || (b.volume ?? 0) - (a.volume ?? 0);
}

/**
 * Marca títulos que se repetem entre PAIS diferentes, para o usuário conseguir
 * distinguir dois cards.
 *
 * Os dois casos reais que motivaram, e que são o mesmo problema:
 *  · Kalshi — "Oscar Winner: Best Makeup and Hairstyling" saía 2× porque a API dá
 *    o mesmo título a dois eventos distintos (efeitos visuais e maquiagem);
 *  · Polymarket — "Game 1: Both Teams Slay Baron Nashor?" saía 2× porque a
 *    pergunta é a mesma em toda partida da liga; quem distingue é o evento.
 *
 * Só marca quando há colisão, para não poluir o card que já é específico. E o
 * sufixo vem SEMPRE de dado real (título do evento, série) — nunca de adivinhação:
 * quando a origem publica errado, o certo é sinalizar, não inventar o título bom.
 */
export function desambiguarPorPai<T>(
  itens: T[],
  ler: { titulo: (x: T) => string; pai: (x: T) => string; sufixo: (x: T) => string | undefined },
  aplicar: (x: T, novoTitulo: string) => T,
): T[] {
  const paisPorTitulo = new Map<string, Set<string>>();
  for (const x of itens) {
    const t = ler.titulo(x);
    if (!paisPorTitulo.has(t)) paisPorTitulo.set(t, new Set());
    paisPorTitulo.get(t)!.add(ler.pai(x));
  }
  return itens.map((x) => {
    if ((paisPorTitulo.get(ler.titulo(x))?.size ?? 1) <= 1) return x;
    const suf = ler.sufixo(x);
    return suf ? aplicar(x, `${ler.titulo(x)} — ${suf}`) : x;
  });
}

/**
 * `limit` da requisição, com padrão e teto.
 *
 * ⚠️ O corte tem que acontecer na RESPOSTA, nunca dentro do cache: a chave não
 * inclui o limit, então guardar a lista já cortada fazia o primeiro chamador
 * definir o tamanho para todos — quem pedisse 60 congelava 60 para quem pedisse
 * 300, e o seed da IA, que lê o mesmo cache, herdava o corte.
 */
export function limitePedido(bruto: unknown, padrao: number, teto: number): number {
  const n = parseInt(String(bruto ?? padrao), 10);
  return Math.min(Number.isFinite(n) && n > 0 ? n : padrao, teto);
}
