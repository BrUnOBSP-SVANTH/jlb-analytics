/**
 * A última versão boa do catálogo, guardada fora do processo.
 *
 * O QUE ISTO CONSERTA (Auditoria 21/09, DES-02). O catálogo é montado DENTRO do
 * pedido de alguém. Medido em 25/09 na produção: a primeira chamada a
 * `/api/polymarket/markets` depois de o serviço subir levou **10,5s**; a
 * segunda, 0,3s. A diferença inteira é a montagem — três páginas de 100 eventos
 * com mercados aninhados, sob 0,1 CPU — com um navegador esperando.
 *
 * E quase todo visitante paga isso: o plano grátis do Render dorme depois de 15
 * minutos sem tráfego, e o site recebe cerca de 53 visitantes por mês. Não
 * existe "segundo visitante" com frequência suficiente para o cache de memória
 * significar alguma coisa.
 *
 * ⚠️ O QUE ESTÁ AQUI É CÓPIA, NUNCA VERDADE. Servir preço de uma hora atrás como
 * "ao vivo" seria a plataforma quebrar a própria promessa para parecer rápida —
 * e este site existe justamente para não fazer isso. Por isso `lerCatalogo`
 * devolve SEMPRE o `atualizadoEm` junto, e quem serve tem que dizer de quando é.
 *
 * Falha em silêncio de propósito: sem Supabase configurado, ou com a tabela
 * fora, o servidor continua montando o catálogo como antes. Isto é aceleração,
 * não dependência.
 */
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "./supabaseRest.ts";
import { log } from "./log.ts";

export type FonteDeCatalogo = "polymarket" | "kalshi";

export interface CatalogoGuardado<T> {
  itens: T[];
  /** ISO. Quem serve isto PRECISA dizer de quando é. */
  atualizadoEm: string;
}

/**
 * Acima disto a cópia não serve nem como ponte: mercado fecha, preço anda, e o
 * atalho deixaria de ser "rápido e honesto" para virar "errado e rápido".
 * Seis horas é a folga que cobre uma noite inteira de serviço dormindo sem
 * atravessar um dia de mercado.
 */
export const VALIDADE_DA_COPIA_MS = 6 * 60 * 60 * 1000;

function configurado(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

/** Guarda a versão recém-montada. Nunca lança: falhar aqui não pode derrubar a rota. */
export async function salvarCatalogo<T>(fonte: FonteDeCatalogo, itens: ReadonlyArray<T>): Promise<void> {
  if (!configurado() || itens.length === 0) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/catalogo_mercados?on_conflict=fonte`, {
      method: "POST",
      headers: { ...supaWriteHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        fonte,
        itens,
        quantidade: itens.length,
        atualizado_em: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) log.warn("catalogo", `não guardou ${fonte}: HTTP ${r.status}`);
  } catch (e) {
    log.warn("catalogo", `não guardou ${fonte}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Lê a cópia, se existir e ainda estiver dentro da validade.
 * `null` quando não há nada utilizável — e aí a rota monta do zero, como antes.
 */
export async function lerCatalogo<T>(fonte: FonteDeCatalogo, agora = Date.now()): Promise<CatalogoGuardado<T> | null> {
  if (!configurado()) return null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/catalogo_mercados?fonte=eq.${encodeURIComponent(fonte)}&select=itens,atualizado_em`;
    const r = await fetch(url, { headers: supaWriteHeaders(), signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const linhas = await r.json() as Array<{ itens: T[]; atualizado_em: string }>;
    const linha = linhas[0];
    if (!linha || !Array.isArray(linha.itens) || linha.itens.length === 0) return null;
    if (!copiaUtilizavel(linha.atualizado_em, agora)) return null;
    return { itens: linha.itens, atualizadoEm: linha.atualizado_em };
  } catch {
    return null;
  }
}

/** A cópia ainda serve? Separado para o teste poder cobrar a régua sem rede. */
export function copiaUtilizavel(atualizadoEm: string | null | undefined, agora = Date.now()): boolean {
  if (!atualizadoEm) return false;
  const t = new Date(atualizadoEm).getTime();
  if (!Number.isFinite(t)) return false;
  // Data no FUTURO é relógio errado em algum lugar, não cópia fresca.
  if (t > agora + 60_000) return false;
  return agora - t <= VALIDADE_DA_COPIA_MS;
}
