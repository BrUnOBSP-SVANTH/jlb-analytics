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

interface Pendente { texto: string; resolver: (v: string | null) => void }

let fila: Pendente[] = [];
let agendado: ReturnType<typeof setTimeout> | null = null;

async function despachar() {
  agendado = null;
  const lote = fila;
  fila = [];
  if (lote.length === 0) return;

  const textos = Array.from(new Set(lote.map((p) => p.texto))).slice(0, LOTE_MAX);

  try {
    const r = await fetch("/api/translate/lote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ textos }),
    });
    const dados = r.ok ? (await r.json() as { traducoes?: Record<string, string> }) : null;
    const mapa = dados?.traducoes ?? {};
    for (const p of lote) {
      const t = mapa[p.texto] ?? null;
      memoria.set(p.texto, t);
      p.resolver(t);
    }
  } catch {
    // Falha de rede não vira título duplicado nem card travado: sem tradução, o
    // card mostra o original e segue. E NÃO guardamos o `null` na memória — a
    // próxima montagem tenta de novo.
    for (const p of lote) p.resolver(null);
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
