/**
 * Tradução de títulos de mercado — uma chamada para a lista inteira.
 *
 * O QUE ISTO CONSERTA (TRV-01, MKT-01, ANL-04).
 *
 * A auditoria mediu 52 chamadas de API por carregamento de página. `/api/translate`
 * sozinha respondia por 20 delas, uma por card, com até 4,0 s de espera — e é o
 * principal motivo de a tela de detalhe de mercado ficar em branco por nove
 * segundos. Cada card pedia a sua tradução, sem saber dos vizinhos.
 *
 * Aqui os pedidos que chegam na mesma janela viram UMA requisição. Não é
 * micro-otimização: vinte requisições em série contra um endpoint que fala com
 * um tradutor externo é a diferença entre a lista aparecer traduzida e a lista
 * aparecer em inglês porque o usuário já rolou a página.
 *
 * Duas regras herdadas do servidor, e as duas importam:
 *   · tradução que FALHOU devolve `null` — não devolve o original fingindo;
 *   · tradução IDÊNTICA ao original também devolve `null`.
 *
 * A segunda é o achado crítico dos cards: `/api/translate` devolvia o original
 * quando falhava, o card achava que tinha recebido tradução e desenhava o mesmo
 * título de novo, em itálico dourado. Todo card do site mostrava o título duas
 * vezes.
 */

/** Janela de agrupamento. Curta o bastante para ninguém perceber. */
const JANELA_MS = 60;

/** Teto por requisição — o mesmo do servidor. */
const LOTE_MAX = 40;

/** O que já sabemos, por sessão. `null` = tentamos e não há tradução útil. */
const memoria = new Map<string, string | null>();

/** Só para o teste: cada caso precisa começar sem o que o anterior aprendeu. */
export function _limparMemoria(): void { memoria.clear(); }

interface Pendente { texto: string; resolver: (v: string | null) => void }

let fila: Pendente[] = [];
let agendado: ReturnType<typeof setTimeout> | null = null;

/**
 * Uma requisição. `falhou` distingue "o servidor respondeu que não há tradução"
 * de "não deu para perguntar" — e a diferença importa: a primeira a gente
 * guarda, a segunda tem que ser tentada de novo na próxima montagem.
 */
async function pedirLote(
  textos: string[],
): Promise<{ mapa: Record<string, string>; pendentes: string[]; falhou: boolean }> {
  try {
    const r = await fetch("/api/translate/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textos }),
    });
    if (!r.ok) return { mapa: {}, pendentes: [], falhou: true };
    const dados = await r.json() as { traducoes?: Record<string, string>; pendentes?: string[] };
    return { mapa: dados.traducoes ?? {}, pendentes: dados.pendentes ?? [], falhou: false };
  } catch {
    return { mapa: {}, pendentes: [], falhou: true };
  }
}

/** Parte a lista em pedaços do tamanho que o servidor aceita. */
export function emLotes<T>(itens: T[], tamanho = LOTE_MAX): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

async function despachar() {
  agendado = null;
  const lote = fila;
  fila = [];
  if (lote.length === 0) return;

  // ⚠️ AQUI MORAVA O DEFEITO (Auditoria 21/09, DAD-05). Era
  // `.slice(0, LOTE_MAX)`: os títulos além do 40º ficavam de fora da requisição,
  // mas o laço de baixo resolvia TODOS com `mapa[p.texto] ?? null` e guardava
  // esse `null` na memória. Resultado: o 41º título em diante nunca era
  // traduzido na sessão — nem rolando a página, nem voltando à tela. E era
  // silencioso: a lista visível tem 40 cards, então só quem rolava via o inglês.
  // Agora o excedente vira OUTRA requisição em vez de virar `null`.
  const textos = Array.from(new Set(lote.map((p) => p.texto)));
  const pedacos = emLotes(textos);

  const respostas = await Promise.all(pedacos.map(pedirLote));
  const mapa: Record<string, string> = Object.assign({}, ...respostas.map((r) => r.mapa));
  // Lote que não chegou ao servidor não conta como "não tem tradução": o card
  // mostra o original e segue, mas nada é guardado, então a próxima montagem
  // tenta de novo. Um lote quebrado também não pode apagar os que deram certo —
  // por isso cada um é pedido e tratado por conta própria.
  const semResposta = new Set(pedacos.filter((_, i) => respostas[i].falhou).flat());
  // Título que o servidor está traduzindo AGORA (em segundo plano) também não
  // vira `null` guardado: ele fica pronto em segundos, e gravar "não tem" aqui
  // o deixaria em inglês até a pessoa recarregar a página.
  const emTraducao = new Set(respostas.flatMap((r) => r.pendentes));

  for (const p of lote) {
    const t = mapa[p.texto] ?? null;
    if (!semResposta.has(p.texto) && !emTraducao.has(p.texto)) memoria.set(p.texto, t);
    p.resolver(t);
  }
}

/**
 * Devolve a tradução em pt-BR, ou `null` quando não há tradução útil.
 *
 * `null` significa "mostre só o original" — nunca "mostre o original duas vezes".
 */
export function traduzir(texto: string): Promise<string | null> {
  const limpo = texto.trim();
  if (!limpo) return Promise.resolve(null);
  if (memoria.has(limpo)) return Promise.resolve(memoria.get(limpo)!);

  return new Promise((resolver) => {
    fila.push({ texto: limpo, resolver });
    if (!agendado) agendado = setTimeout(() => { void despachar(); }, JANELA_MS);
  });
}

/**
 * Heurística barata: o texto já está em português?
 *
 * Serve para não gastar chamada com o que já está na língua certa. Erra para o
 * lado seguro: na dúvida, traduz — e se a tradução voltar igual ao original, a
 * regra do `null` cuida do resto.
 */
const PALAVRAS_PT = new Set([
  "do", "da", "de", "no", "na", "em", "com", "que", "por", "uma", "um",
  "são", "vai", "para", "quem", "será", "até", "dos", "das", "ou", "e",
]);

export function pareceEmPortugues(texto: string): boolean {
  const palavras = texto.toLowerCase().split(/\s+/);
  return palavras.filter((p) => PALAVRAS_PT.has(p)).length >= 2;
}
