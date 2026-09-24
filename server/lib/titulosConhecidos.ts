/**
 * Só traduzimos o que está no NOSSO catálogo.
 *
 * O QUE ESTAVA ABERTO (Auditoria 21/09, SEG-06). `/api/translate/lote` aceitava
 * qualquer texto: 40 títulos de até 500 caracteres por chamada, sem login.
 * Dois estragos possíveis, e nenhum precisa de má-fé sofisticada:
 *
 *  · gasto — cada título novo custa uma chamada de IA. O teto diário
 *    (`TETO_TRADUCOES_DIA`) limita o dano, mas quem quisesse podia queimá-lo
 *    inteiro numa tarde, e aí os mercados DE VERDADE ficam em inglês até o dia
 *    seguinte;
 *  · reputação de IP — quando a cadeia de IA falha, o caminho de último recurso
 *    é o endpoint não oficial do Google. Tráfego estranho saindo do nosso
 *    servidor faz o IP ser bloqueado, e aí o site perde a tradução de todo
 *    mundo, sem ninguém entender por quê.
 *
 * A regra agora: o texto tem que estar no catálogo que nós mesmos servimos. É
 * uma verificação de conjunto em memória, custa nada, e fecha o caso — o site
 * só pede tradução do que ele mostra.
 *
 * ⚠️ Comparação NORMALIZADA (sem acento, espaços colapsados, minúsculas): o
 * cliente manda o título depois de passar pelo `normalizarTitulo` e por
 * `.trim()`, e uma diferença de um espaço faria a tradução sumir da tela sem
 * erro nenhum aparecer.
 */

export function chaveDoTitulo(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // tira acento
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

interface MercadoComTitulo {
  question?: string;
  eventTitle?: string;
  title?: string;
  outcomes?: string;
}

/**
 * Monta o conjunto de tudo que a tela pode pedir para traduzir: a pergunta, o
 * título do evento (que virou subtítulo no DAD-01) e os RÓTULOS DOS DESFECHOS —
 * "Alexandria Ocasio-Cortez", "Mais", "Menos" — que também aparecem no card.
 */
export function titulosDoCatalogo(mercados: ReadonlyArray<MercadoComTitulo>): Set<string> {
  const conjunto = new Set<string>();
  for (const m of mercados) {
    for (const t of [m.question, m.eventTitle, m.title]) {
      const chave = chaveDoTitulo(t ?? "");
      if (chave) conjunto.add(chave);
    }
    if (m.outcomes) {
      try {
        for (const rotulo of JSON.parse(m.outcomes) as string[]) {
          const chave = chaveDoTitulo(String(rotulo ?? ""));
          if (chave) conjunto.add(chave);
        }
      } catch { /* formato inesperado: só ignora os rótulos deste */ }
    }
  }
  return conjunto;
}

/**
 * Separa o que pode ser traduzido do que não reconhecemos.
 *
 * ⚠️ FALHA ABERTA quando o catálogo está vazio: logo depois de um deploy o
 * cache ainda não encheu, e recusar tudo deixaria a tela em inglês na hora em
 * que mais gente chega. Catálogo vazio não é sinal de abuso — é sinal de
 * servidor recém-subido.
 */
export function filtrarConhecidos(
  textos: ReadonlyArray<string>,
  conhecidos: Set<string>,
): { aceitos: string[]; recusados: string[] } {
  if (conhecidos.size === 0) return { aceitos: [...textos], recusados: [] };
  const aceitos: string[] = [];
  const recusados: string[] = [];
  for (const t of textos) {
    (conhecidos.has(chaveDoTitulo(t)) ? aceitos : recusados).push(t);
  }
  return { aceitos, recusados };
}
