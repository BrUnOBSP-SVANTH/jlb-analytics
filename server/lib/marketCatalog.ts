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
 * REDE DE SEGURANÇA: nenhum card pode compartilhar título com outro.
 *
 * `desambiguarPorPai` resolve o caso "mesmo título, pais DIFERENTES". Este
 * resolve o oposto, que ele não cobre: mesmo título e MESMO pai — dois desfechos
 * do mesmo evento. Flagrado em 09/09: "Fear & Greed Index on Oct 2, 2026?"
 * aparecia duas vezes, uma para "Greed" (23,5%) e outra para "Fear" (34%), sem
 * nada na tela que dissesse qual era qual. O usuário vê dois cards idênticos com
 * números diferentes e conclui, com razão, que o site está quebrado.
 *
 * A desambiguação já existia nos dois caminhos que montam o catálogo do Kalshi,
 * e ainda assim escapou: cada caminho só enxerga os irmãos da SUA busca, e estes
 * dois vieram por caminhos distintos. Por isso a rede fica AQUI, onde a lista
 * final existe — o invariante é sobre a lista inteira, então tem que ser
 * verificado sobre a lista inteira.
 *
 * Sem rótulo disponível, deixa como está: acrescentar um código feio ao título
 * seria trocar um problema por outro, e o duplicado sem rótulo é raro.
 */
export function desambiguarTitulosIguais<T>(
  itens: T[],
  ler: { titulo: (x: T) => string; rotulo: (x: T) => string | undefined },
  aplicar: (x: T, novoTitulo: string) => T,
): T[] {
  const vezes = new Map<string, number>();
  for (const x of itens) {
    const t = ler.titulo(x);
    vezes.set(t, (vezes.get(t) ?? 0) + 1);
  }
  return itens.map((x) => {
    const t = ler.titulo(x);
    if ((vezes.get(t) ?? 1) <= 1) return x;
    const rot = ler.rotulo(x);
    if (!rot) return x;
    // Já contém o rótulo? Repetir viraria "Fear & Greed — Fear — Fear".
    if (t.toLowerCase().includes(rot.toLowerCase())) return x;
    return aplicar(x, `${t} — ${rot}`);
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

/**
 * Limpa o título do mercado uma vez, no ingest (MKT-11, ANL-02).
 *
 * O QUE A AUDITORIA VIU. Nos cards apareciam títulos assim:
 *
 *   "$LAPTOP FDV above ___ one day after launch?"
 *   "Bitcoin above ___ on September 9?: 80,000"
 *
 * O `___` é o buraco que a plataforma de origem deixa para o valor, e o valor
 * vem depois dos dois-pontos, no sufixo. Nenhuma das duas metades faz sentido
 * sozinha, e o leitor vê um formulário em branco.
 *
 * Pior: o MESMO mercado aparecia com títulos diferentes em telas diferentes —
 * "LAPTOP FDV above $1B one day after launch?" em /noticias e o `___` em
 * /apostas — porque cada tela normalizava do seu jeito, quando normalizava. Por
 * isso isto mora no servidor e roda uma vez: a tela recebe o título já pronto.
 */
export function normalizarTitulo(titulo: string): string {
  let t = (titulo ?? "").trim();
  if (!t) return t;

  // "Pergunta com ___?: 80,000" → o sufixo é o valor que preenche o buraco.
  const doisPontos = t.lastIndexOf(":");
  if (doisPontos > 0 && t.includes("_")) {
    const sufixo = t.slice(doisPontos + 1).trim();
    const corpo = t.slice(0, doisPontos).trim();
    // Só quando o sufixo é de fato um VALOR (número, com ou sem símbolo).
    // "Fed Decision: what happens" não é preenchimento de lacuna.
    if (sufixo && /^[$R\s]*[\d.,]+[KMB%]?$/i.test(sufixo)) {
      t = corpo.replace(/_{2,}/g, sufixo);
    }
  }

  // Sobrou lacuna sem valor: some com ela em vez de mostrar o buraco.
  t = t.replace(/\s*_{2,}\s*/g, " ").replace(/\s{2,}/g, " ").trim();

  // Sufixo de valor sem lacuna nenhuma no corpo continua sendo desambiguação
  // legítima ("Bitcoin above X on Sep 9?: 80,000" com o X já preenchido) — por
  // isso não removemos dois-pontos em geral, só o que virou lacuna.
  return t;
}
