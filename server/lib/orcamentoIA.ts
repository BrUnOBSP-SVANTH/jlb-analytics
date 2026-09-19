/**
 * Orçamento diário de IA — quanto as tarefas automáticas podem gastar.
 *
 * O QUE ACONTECIA (medido em 18–19/09/2026 no banco de produção).
 *
 * 1. Toda tarefa agendada roda "a cada N horas OU a cada partida do servidor".
 *    E o servidor parte o tempo todo: cada deploy, cada vez que o plano grátis
 *    do Render acorda, e — o pior — cada servidor LOCAL de desenvolvimento e de
 *    teste, que usa as mesmas chaves do `.env` e grava no mesmo Supabase. Em
 *    15/09, entre 22h e 23h, saíram 127 previsões: impossível para quem semeia
 *    de 6 em 6 horas.
 *
 * 2. O backfill de embeddings tinha "teto diário de 800" — mas por EXECUÇÃO. O
 *    Gemini grátis dá 1.000 por dia, e cada partida gastava mais 800. A busca
 *    semântica de quem usa o site (chat, análise) disputava a mesma cota e
 *    perdia. Entram 1.663 notícias/dia: a fila nunca zera, então o backfill
 *    SEMPRE tem trabalho e SEMPRE esgotava a cota.
 *
 * A regra agora: tarefa agendada só roda em produção (ou com JLB_TAREFAS=1), e
 * o gasto do dia é contado NO BANCO — a fonte que sobrevive a reinício,
 * deploy e servidor paralelo. Contador em memória zeraria a cada partida, que
 * é exatamente o problema.
 */
import { ehProducao } from "./urlPublica.ts";
import { SUPABASE_URL, SUPABASE_KEY } from "./supabaseRest.ts";

type Ambiente = Record<string, string | undefined>;

/** Previsões da semeadura por dia. O desenho original: 18 mercados × 4 rodadas. */
export const TETO_PREVISOES_DIA = 80;

/**
 * Embeddings do backfill por dia. O Gemini grátis dá 1.000; os 200 restantes
 * ficam para as buscas ao vivo (chat, análise, contexto da semeadura).
 */
export const TETO_EMBEDDINGS_BACKFILL_DIA = 800;

/**
 * As tarefas agendadas devem rodar AQUI? Em produção, sim. Fora dela, só se
 * pedirem explicitamente — servidor de desenvolvimento e de teste não pode
 * gastar a cota do site nem gravar no banco real sem ninguém perceber.
 */
export function tarefasAgendadasLigadas(env: Ambiente = process.env): boolean {
  return ehProducao(env) || env.JLB_TAREFAS === "1";
}

/** Existe alguma chave de IA? A cadeia é Anthropic → Gemini → Groq: UMA basta. */
export function temAlgumaIA(env: Ambiente = process.env): boolean {
  return !!(env.ANTHROPIC_API_KEY || env.GEMINI_API_KEY || env.GROQ_API_KEY);
}

/** Meia-noite UTC de hoje, em ISO — a virada de cota dos provedores. */
export function inicioDoDiaUTC(agora = Date.now()): string {
  const d = new Date(agora);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/** Quanto ainda cabe hoje. Contagem desconhecida (null) = não arriscar: zero. */
export function restanteDoDia(teto: number, gastoHoje: number | null): number {
  if (gastoHoje === null || !Number.isFinite(gastoHoje)) return 0;
  return Math.max(0, teto - gastoHoje);
}

/**
 * Conta as linhas de `tabela` com `coluna` a partir da meia-noite UTC. Devolve
 * `null` quando não consegue contar — e quem chama trata como "sem orçamento",
 * porque gastar às cegas foi o que esgotou a cota.
 */
export async function contarHoje(tabela: string, coluna: string, agora = Date.now()): Promise<number | null> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${tabela}?${coluna}=gte.${encodeURIComponent(inicioDoDiaUTC(agora))}&select=${coluna}`,
      {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=exact", Range: "0-0" },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!r.ok) return null;
    const total = Number(r.headers.get("content-range")?.split("/")[1]);
    return Number.isFinite(total) ? total : null;
  } catch {
    return null;
  }
}
