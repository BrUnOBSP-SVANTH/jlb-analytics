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

/**
 * Nome de time cortado pela origem, completado com dado da própria origem.
 *
 * O Kalshi publica o time abreviado no mercado ("New York G wins") e o confronto
 * inteiro no EVENTO ("NY Giants vs LA Rams"). Quem lê o card vê "New York G" e
 * não sabe se é Giants ou Jets — em 17/09 eram 5 dos 300 mercados do catálogo,
 * todos de futebol americano.
 *
 * A regra da casa é NUNCA inventar o nome que falta. Aqui não se inventa: o nome
 * completo vem do mesmo `GET /events`. A ponte entre as duas formas são as
 * MAIÚSCULAS, que sobrevivem à abreviação — "New York G" e "NY Giants" dão N-Y-G;
 * "Los Angeles R" e "LA Rams" dão L-A-R. Só troca quando a assinatura casa com
 * um lado SÓ do confronto; no empate, fica como o Kalshi publicou.
 */
function maiusculas(s: string): string {
  return (s.match(/[A-Z]/g) ?? []).join("");
}

export function expandirNomeTruncado(titulo: string, tituloDoEvento?: string): string {
  const t = (titulo ?? "").trim();
  if (!t || !tituloDoEvento) return t;

  // Os lados do confronto, como a origem os escreve.
  const lados = tituloDoEvento.split(/\s+(?:vs\.?|v\.|x)\s+/i).map((s) => s.trim()).filter(Boolean);
  if (lados.length < 2) return t;

  // Cada lado pode vir com palavras coladas depois do nome ("LA Rams Pro
  // Football game", do regulamento), então o candidato é o menor PREFIXO de
  // palavras cuja assinatura bate — "LA Rams", não a frase inteira.
  const candidatos = (alvo: string): string[] => {
    const achados = new Set<string>();
    for (const lado of lados) {
      const palavras = lado.split(/\s+/);
      for (let n = 1; n <= palavras.length; n++) {
        const prefixo = palavras.slice(0, n).join(" ");
        if (maiusculas(prefixo) === alvo) { achados.add(prefixo); break; }
      }
    }
    return Array.from(achados);
  };

  // O trecho cortado: nome próprio terminado numa letra solta ("New York G").
  const cortado = /\b([A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)*\s+[A-Z])(?![A-Za-z.])/g;
  return t.replace(cortado, (trecho) => {
    const alvo = maiusculas(trecho);
    if (alvo.length < 2) return trecho;
    const casam = candidatos(alvo);
    return casam.length === 1 && casam[0] !== trecho ? casam[0] : trecho;
  });
}

/**
 * O confronto escondido no regulamento do mercado.
 *
 * Nem todo mercado chega pelo caminho dos EVENTOS (o de curto prazo vem da
 * listagem plana, sem o título do evento junto). Mas o próprio registro traz
 * `rules_primary`: "If New York G wins the NY Giants vs LA Rams Pro Football
 * game…". O confronto está ali, escrito pela origem — serve de contexto para
 * `expandirNomeTruncado` sem custar nenhuma chamada extra de API.
 */
export function confrontoEmTexto(texto?: string): string | undefined {
  if (!texto) return undefined;
  const m = texto.match(
    /\b([A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)*)\s+(?:vs\.?|v\.)\s+([A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)*)/,
  );
  return m ? `${m[1]} vs ${m[2]}` : undefined;
}

/**
 * Glossário de nomes, montado com o que a ORIGEM publicou no mesmo lote.
 *
 * Os mercados de handicap do mesmo jogo não têm o nome inteiro em lugar nenhum:
 * título, regulamento e até o título do evento vêm cortados ("New York G vs
 * Los Angeles R: Spread"). Mas o evento IRMÃO — o do resultado — publica
 * "NY Giants vs LA Rams". Como as duas formas compartilham as maiúsculas
 * (N-Y-G), dá para aprender o nome ali e aplicá-lo aqui.
 *
 * Duas travas contra inventar: forma cortada nunca entra no glossário (ela é o
 * problema, não a resposta), e assinatura que aponta para DOIS nomes diferentes
 * é descartada — na dúvida, fica o que a origem escreveu.
 */
const TERMINA_EM_LETRA_SOLTA = /(?:^|\s)[A-Z]$/;

function ladosDoConfronto(texto: string): string[] {
  return texto.split(/\s+(?:vs\.?|v\.)\s+/i).map((s) => s.trim()).filter(Boolean);
}

export function glossarioDeNomes(contextos: Array<string | undefined>): Map<string, string> {
  const vistos = new Map<string, Set<string>>();
  for (const ctx of contextos) {
    if (!ctx) continue;
    for (const lado of ladosDoConfronto(ctx)) {
      // "Los Angeles R: Spread" → a pontuação não pode esconder a letra solta.
      const palavras = lado.split(/\s+/).map((p) => p.replace(/[^A-Za-z.]+$/, "")).filter(Boolean);
      for (let n = 1; n <= palavras.length; n++) {
        const nome = palavras.slice(0, n).join(" ");
        if (TERMINA_EM_LETRA_SOLTA.test(nome)) continue;
        const sig = maiusculas(nome);
        if (sig.length < 3) continue;
        if (!vistos.has(sig)) vistos.set(sig, new Set());
        vistos.get(sig)!.add(nome);
      }
    }
  }
  const glossario = new Map<string, string>();
  vistos.forEach((nomes, sig) => {
    if (nomes.size === 1) glossario.set(sig, Array.from(nomes)[0]);
  });
  return glossario;
}

/** Aplica o glossário ao título — mesma regra de corte de `expandirNomeTruncado`. */
export function completarComGlossario(titulo: string, glossario: Map<string, string>): string {
  const t = (titulo ?? "").trim();
  if (!t || glossario.size === 0) return t;
  return t.replace(/\b([A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)*\s+[A-Z])(?![A-Za-z.])/g, (trecho) => {
    const nome = glossario.get(maiusculas(trecho));
    return nome && nome !== trecho ? nome : trecho;
  });
}
