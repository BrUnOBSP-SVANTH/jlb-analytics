/**
 * supaPaginado — busca TODAS as linhas, e não as primeiras mil.
 *
 * 🔴 O PostgREST tem um teto de linhas por resposta (aqui, 1.000) e ele NÃO é um
 * erro: pedir `limit=5000` devolve 200 OK com 1.000 linhas e mais nada. Quem lê o
 * resultado não tem como perceber — a consulta "funcionou".
 *
 * Descoberto em 03/09 da pior forma: os endpoints de estatística que acabaram de
 * ir ao ar (curva de calibração, por tema, evolução) pediam 5.000 e recebiam
 * 1.000 calados. As porcentagens publicadas saíam de um pedaço da amostra — e,
 * pior, de um pedaço na ordem que o banco resolvesse devolver, que não é
 * aleatória. Num site cuja tese é "publicamos o número honesto", esse é o defeito
 * mais caro possível.
 *
 * É a mesma família de falha silenciosa que já mordeu aqui três vezes: o 502 que
 * o cliente engolia no catch, o erro do supabase-js que vinha no retorno em vez
 * de exceção, e o `${...}` que só interpola se a string for template literal.
 * Todas passam no teste, no tsc e na revisão — e mentem no resultado.
 */
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseRest.ts";

/** Teto por resposta do PostgREST. Pedir mais não adianta; paginar, sim. */
const PAGINA = 1000;

/**
 * Percorre todas as páginas de uma consulta REST.
 *
 * `filtroEOrdem` deve conter os filtros, o `select` e — importante — uma ordem
 * ESTÁVEL. Sem `order`, a paginação por offset pode repetir ou pular linhas,
 * porque o banco não garante a mesma ordem entre as chamadas.
 */
export async function buscarTudo<T>(
  tabela: string,
  filtroEOrdem: string,
  maxPaginas = 20,
): Promise<T[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  const out: T[] = [];
  for (let p = 0; p < maxPaginas; p++) {
    const url = `${SUPABASE_URL}/rest/v1/${tabela}?${filtroEOrdem}&limit=${PAGINA}&offset=${p * PAGINA}`;
    const r = await fetch(url, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) break;
    const linhas = await r.json() as T[];
    if (!Array.isArray(linhas) || linhas.length === 0) break;
    out.push(...linhas);
    // Página incompleta = acabou. Evita uma requisição a mais em todo chamado.
    if (linhas.length < PAGINA) break;
  }
  return out;
}
