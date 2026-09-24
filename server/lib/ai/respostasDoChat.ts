/**
 * As respostas que o CHAT gerou — para que o 👍/👎 fale de uma delas.
 *
 * O QUE ESTAVA ABERTO (Auditoria 21/09, SEG-06). `/api/ai/chat/feedback`
 * recebia `question` e `answer` do CLIENTE e gravava os dois no banco, sem
 * login. Ou seja: qualquer pessoa na internet tinha um campo de escrita de
 * 6 KB por requisição no nosso Postgres, e o que ela escrevesse ficaria
 * guardado como se fosse uma conversa real com o Analista JLB.
 *
 * Dois estragos, e o segundo é o pior:
 *  · espaço e custo — 6 vezes por minuto por IP, sem teto de verdade;
 *  · a base que deveria mostrar ONDE A IA ERRA passa a conter texto que a IA
 *    nunca disse. Essa tabela existe para orientar o refino do prompt; envenená-la
 *    é pior do que enchê-la.
 *
 * Agora o servidor guarda por alguns minutos o que ELE respondeu, com um id, e
 * o feedback só aceita esse id. O cliente avalia; quem diz o que foi dito é
 * quem disse.
 *
 * Memória, não banco: são minutos de vida e o custo de perder tudo num deploy é
 * um 👍 não registrado. Guardar no banco para depois apagar seria mais escrita
 * do que o dado vale.
 */
import { randomUUID, createHash } from "node:crypto";

interface RespostaGuardada {
  pergunta: string;
  resposta: string;
  expiraEm: number;
}

/** Quanto tempo a pessoa tem para clicar no 👍/👎 depois de ler. */
const VALIDADE_MS = 15 * 60_000;

/** Teto de respostas guardadas. Acima disso, a mais velha sai. */
const MAXIMO = 500;

const guardadas = new Map<string, RespostaGuardada>();

function limpar(agora: number): void {
  // `Array.from` e não `for…of` direto: o alvo de TS deste projeto não itera
  // Map sem downlevelIteration (mesma pegadinha do translate.ts).
  for (const [id, r] of Array.from(guardadas.entries())) {
    if (r.expiraEm <= agora) guardadas.delete(id);
  }
  // Ainda cheio depois da limpeza: descarta as mais antigas (a Map preserva a
  // ordem de inserção, então as primeiras chaves são as mais velhas).
  while (guardadas.size > MAXIMO) {
    const maisVelha = Array.from(guardadas.keys())[0];
    if (maisVelha === undefined) break;
    guardadas.delete(maisVelha);
  }
}

/** Registra o que o servidor respondeu e devolve o id que o 👍/👎 vai citar. */
export function guardarResposta(pergunta: string, resposta: string, agora = Date.now()): string {
  const id = randomUUID();
  guardadas.set(id, {
    pergunta: pergunta.slice(0, 2_000),
    resposta: resposta.slice(0, 4_000),
    expiraEm: agora + VALIDADE_MS,
  });
  // ⚠️ A poda vem DEPOIS de inserir. Antes ela rodava primeiro, e o teto ficava
  // sempre um acima do valor declarado — o tipo de erro que só aparece quando
  // alguém escreve o teste do limite.
  limpar(agora);
  return id;
}

/** O par (pergunta, resposta) daquele id. `null` se não existe ou venceu. */
export function respostaGuardada(id: unknown, agora = Date.now()): { pergunta: string; resposta: string } | null {
  if (typeof id !== "string" || !id) return null;
  const r = guardadas.get(id);
  if (!r) return null;
  if (r.expiraEm <= agora) { guardadas.delete(id); return null; }
  return { pergunta: r.pergunta, resposta: r.resposta };
}

/**
 * Consome o id: o mesmo 👍 não entra duas vezes.
 *
 * Sem isto, um laço com um id válido repetiria a mesma linha até encher a
 * tabela — trocaria um abuso por outro, mais difícil de ver porque o conteúdo
 * seria legítimo.
 */
export function consumirResposta(id: unknown, agora = Date.now()): { pergunta: string; resposta: string } | null {
  const r = respostaGuardada(id, agora);
  if (r && typeof id === "string") guardadas.delete(id);
  return r;
}

/** Só para teste: começar do zero entre casos. */
export function _limpar(): void { guardadas.clear(); }

/** Quantas estão guardadas agora — usado pelo teste do teto. */
export function _tamanho(): number { return guardadas.size; }

/** Hash curto para log, quando for preciso citar uma resposta sem repeti-la. */
export function marcaDaResposta(texto: string): string {
  return createHash("sha256").update(texto).digest("hex").slice(0, 8);
}
