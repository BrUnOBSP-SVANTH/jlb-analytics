/**
 * A análise de mercado, guardada — para não ser paga duas vezes e para haver o
 * que mostrar quando nenhum provedor responde.
 *
 * POR QUE EXISTE (27/09/2026). Um mercado apareceu na tela com a análise de
 * emergência: "a leitura da IA não pôde ser gerada agora". Medindo os três
 * provedores naquele momento — Anthropic sem crédito, Groq em 429, Gemini free
 * no teto do dia. Os três fora ao mesmo tempo.
 *
 * Só que aquele mercado JÁ TINHA SIDO ANALISADO. A análise estava num `Map()`
 * em memória e foi jogada fora no deploy anterior.
 *
 * É o mesmo defeito que o briefing teve, consertado na migração 043 com este
 * texto: "ficava só na memória do processo, então cada deploy — e cada vez que
 * o plano grátis do Render deixava o serviço dormir — jogava fora o do dia e a
 * próxima visita pagava tudo de novo". A análise de mercado nunca recebeu o
 * mesmo conserto, e ela roda centenas de vezes mais que o briefing.
 *
 * O aperto está medido no próprio `marketAnalysis.ts`: ~2.900 tokens por
 * análise contra 200.000/dia de cota gratuita — cerca de 69 análises no dia
 * inteiro. O Render grátis dorme com 15 minutos sem tráfego, então quase todo
 * visitante encontra o processo recém-nascido, de memória vazia, e a cota ia
 * embora refazendo o que já existia.
 *
 * ⚠️ O que mora aqui é CÓPIA, nunca verdade. A análise inteira fala do preço do
 * momento em que foi escrita; servi-la sem dizer de quando é e a que preço foi
 * feita seria pior do que não ter análise nenhuma.
 *
 * Falha de banco nunca derruba a análise: se o Supabase não responder, a tela
 * recebe o conteúdo gerado normalmente — só perdemos a economia daquela vez.
 */
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "../supabaseRest.ts";
import { log } from "../log.ts";

/** Uma análise guardada, com o contexto que a torna legível. */
export interface AnaliseGuardada {
  resultado: Record<string, unknown>;
  /** Preço do mercado quando a leitura foi escrita. */
  precoPct: number;
  /** Quando foi escrita — ISO. */
  criadaEm: string;
  provedor: string | null;
}

const TEMPO_LIMITE = 8_000;

const cabecalhoLeitura = () => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` });

/**
 * A análise EXATA desta faixa de preço — o caminho normal, que substitui a
 * memória perdida na soneca.
 */
export async function lerAnalise(chave: string): Promise<AnaliseGuardada | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/analises_mercado?chave=eq.${encodeURIComponent(chave)}`
      + `&select=resultado,preco_pct,criada_em,provedor&limit=1`,
      { headers: cabecalhoLeitura(), signal: AbortSignal.timeout(TEMPO_LIMITE) },
    );
    if (!r.ok) return null;
    const linhas = await r.json() as Array<{ resultado: Record<string, unknown>; preco_pct: number; criada_em: string; provedor: string | null }>;
    const l = linhas[0];
    return l ? { resultado: l.resultado, precoPct: l.preco_pct, criadaEm: l.criada_em, provedor: l.provedor } : null;
  } catch { return null; }
}

/**
 * A ÚLTIMA análise deste mercado, em qualquer faixa de preço.
 *
 * É o caminho de "todos os provedores fora". Uma leitura de ontem, a outro
 * preço, ainda diz muito mais do que "tente de novo em alguns minutos" — desde
 * que a tela conte de quando ela é. É quem chama que tem essa obrigação.
 */
export async function lerUltimaAnaliseDoMercado(marketId: string): Promise<AnaliseGuardada | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY || !marketId) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/analises_mercado?market_id=eq.${encodeURIComponent(marketId)}`
      + `&select=resultado,preco_pct,criada_em,provedor&order=criada_em.desc&limit=1`,
      { headers: cabecalhoLeitura(), signal: AbortSignal.timeout(TEMPO_LIMITE) },
    );
    if (!r.ok) return null;
    const linhas = await r.json() as Array<{ resultado: Record<string, unknown>; preco_pct: number; criada_em: string; provedor: string | null }>;
    const l = linhas[0];
    return l ? { resultado: l.resultado, precoPct: l.preco_pct, criadaEm: l.criada_em, provedor: l.provedor } : null;
  } catch { return null; }
}

export async function gravarAnalise(dados: {
  chave: string;
  marketId: string;
  fonte: string;
  titulo: string;
  precoPct: number;
  provedor: string | null;
  resultado: Record<string, unknown>;
}): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    // ⚠️ `on_conflict=chave` explícito. Sem ele o PostgREST resolve pela chave
    // primária por dedução e, quando a tabela tem outra coluna única, devolve
    // 23505 em silêncio — foi o INF-02 da auditoria de 21/09, que deixou a
    // segunda síntese do Cérebro de cada dia falhando sem ninguém ver.
    await fetch(`${SUPABASE_URL}/rest/v1/analises_mercado?on_conflict=chave`, {
      method: "POST",
      headers: supaWriteHeaders(),
      body: JSON.stringify([{
        chave: dados.chave,
        market_id: dados.marketId,
        fonte: dados.fonte,
        titulo: dados.titulo.slice(0, 300),
        preco_pct: dados.precoPct,
        provedor: dados.provedor,
        resultado: dados.resultado,
        criada_em: new Date().toISOString(),
      }]),
      signal: AbortSignal.timeout(TEMPO_LIMITE),
    });
  } catch (e) {
    log.warn("analise", `não consegui guardar a análise de ${dados.marketId}: ${String(e)}`);
  }
}

/**
 * Quanto tempo faz, em português, para a tela dizer de quando é a cópia.
 *
 * Vive aqui e não em `shared/formato.ts` porque a régua é outra: o que importa
 * numa análise guardada é se ela ainda descreve o mesmo mundo. "há 3 dias" é a
 * informação; o minuto exato não é.
 */
export function idadeEmPalavras(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "há pouco";
  const min = Math.floor(ms / 60_000);
  if (min < 60) return min <= 1 ? "há poucos minutos" : `há ${min} minutos`;
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? "há 1 hora" : `há ${h} horas`;
  const d = Math.floor(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}
