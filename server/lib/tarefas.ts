/**
 * Quando cada tarefa agendada rodou pela última vez — no BANCO, não na memória.
 *
 * POR QUE EXISTE (Auditoria 21/09, INF-03). Os crons são `setTimeout` a partir
 * do BOOT, e o boot acontece muito mais do que parece: cada deploy, e cada vez
 * que o plano grátis do Render deixa o serviço dormir e acordar. Resultado
 * medido: a coleta do Cérebro disparava 30 s depois de CADA subida (levando 429
 * do Reddit), o seed da IA rodava a cada partida e a previsão esportiva também.
 *
 * Um contador em memória não resolveria: ele nasce vazio junto com o processo,
 * que é precisamente o problema. É a mesma lição de `lib/orcamentoIA.ts`, onde
 * o gasto do dia teve que ir para o banco pelo mesmo motivo.
 *
 * ⚠️ FALHA ABERTA, de propósito. Se o banco não responder, `deveRodar` devolve
 * `true` e a tarefa roda. O contrário — não conseguir ler e por isso não rodar
 * — deixaria o site sem coleta, sem síntese e sem previsão por causa de uma
 * consulta que falhou, e ninguém perceberia: o sintoma seria a ausência de
 * dado novo, que é justamente o que o alarme de frescor demora a mostrar. Pular
 * por engano custa uma rodada; parar de rodar custa o produto.
 */
import { SUPABASE_URL, SUPABASE_KEY, supaWriteHeaders } from "./supabaseRest.ts";
import { log } from "./log.ts";

export interface ExecucaoDeTarefa {
  nome: string;
  ultimaExecucao: string | null;
  resultado: string | null;
  detalhe: string | null;
}

/**
 * Já passou tempo suficiente desde a última vez?
 *
 * Função pura, para a regra ficar testável sem banco: é ela que decide se um
 * deploy no meio do intervalo dispara a tarefa de novo ou não.
 */
export function passouODoIntervalo(
  ultimaExecucao: string | null | undefined,
  intervaloMs: number,
  agora = Date.now(),
): boolean {
  if (!ultimaExecucao) return true;                    // nunca rodou
  const quando = new Date(ultimaExecucao).getTime();
  if (!Number.isFinite(quando)) return true;           // data ilegível: melhor rodar
  return agora - quando >= intervaloMs;
}

async function lerUltima(nome: string): Promise<string | null | undefined> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return undefined;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/tarefas_execucao?nome=eq.${encodeURIComponent(nome)}&select=ultima_execucao&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(8_000) },
    );
    if (!r.ok) return undefined;
    const linhas = await r.json() as Array<{ ultima_execucao: string }>;
    return linhas[0]?.ultima_execucao ?? null;
  } catch { return undefined; }
}

/** Registra que a tarefa rodou agora. Falha aqui nunca derruba a tarefa. */
export async function registrarExecucao(nome: string, resultado: "ok" | "erro", detalhe?: string): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/tarefas_execucao?on_conflict=nome`, {
      method: "POST",
      headers: supaWriteHeaders(),
      body: JSON.stringify([{ nome, ultima_execucao: new Date().toISOString(), resultado, detalhe: detalhe?.slice(0, 300) ?? null }]),
      signal: AbortSignal.timeout(8_000),
    });
  } catch (e) {
    log.warn("tarefas", `não consegui registrar a execução de ${nome}: ${String(e)}`);
  }
}

/**
 * Roda a tarefa se ela não rodou dentro do intervalo. Devolve se rodou.
 *
 * É este invólucro que faz um deploy no meio do intervalo NÃO disparar tudo de
 * novo — e é ele que grava a última execução, para o `/api/health/data` poder
 * dizer se alguma parou.
 */
export async function rodarSeVencida(
  nome: string,
  intervaloMs: number,
  tarefa: () => Promise<unknown>,
): Promise<boolean> {
  const ultima = await lerUltima(nome);
  if (ultima !== undefined && !passouODoIntervalo(ultima, intervaloMs)) {
    log.info(`[tarefa] ${nome}: pulou — rodou em ${ultima}`);
    return false;
  }
  try {
    await tarefa();
    await registrarExecucao(nome, "ok");
    return true;
  } catch (e) {
    // A execução é registrada mesmo no erro: sem isso, uma tarefa que falha
    // seria tentada a cada boot, que é o laço que este achado veio cortar.
    await registrarExecucao(nome, "erro", String(e instanceof Error ? e.message : e));
    log.error(`[tarefa] ${nome} falhou:`, e);
    return true;
  }
}

/** O que o `/api/health/data` mostra: a última execução de cada tarefa. */
export async function execucoesDasTarefas(): Promise<ExecucaoDeTarefa[]> {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/tarefas_execucao?select=*&order=nome`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) return [];
    const linhas = await r.json() as Array<{ nome: string; ultima_execucao: string; resultado: string | null; detalhe: string | null }>;
    return linhas.map((l) => ({
      nome: l.nome, ultimaExecucao: l.ultima_execucao, resultado: l.resultado, detalhe: l.detalhe,
    }));
  } catch { return []; }
}

/**
 * Está atrasada? Régua com folga de 50% sobre o intervalo.
 *
 * Uma tarefa de 6 em 6 horas que rodou há 6h01 não está com problema — o plano
 * grátis dorme, o relógio escorrega. Só vira alarme depois de 9h. Alarme que
 * dispara à toa ensina a ignorar alarme.
 */
export function estaAtrasada(ultimaExecucao: string | null, intervaloMs: number, agora = Date.now()): boolean {
  if (!ultimaExecucao) return false;      // nunca rodou não é atraso: é tarefa nova
  const quando = new Date(ultimaExecucao).getTime();
  if (!Number.isFinite(quando)) return false;
  return agora - quando > intervaloMs * 1.5;
}
