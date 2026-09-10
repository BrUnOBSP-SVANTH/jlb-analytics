/**
 * userProgress — Sistema de Pontos JLB Analytics
 *
 * Armazenamento: a CONTA é a fonte de verdade (tabela `user_progress` no
 * Supabase, via lib/progressSync.ts — pull no login, push com debounce). O
 * localStorage aqui é cache offline e fonte local enquanto não há sessão.
 * ⚠️ Visitante NÃO logado acumula só no navegador — por design: sem conta, sem nuvem.
 * Pontos desbloqueiam níveis 4 e 5 — sem pagamento.
 *
 * ⚠️ MUDANÇA DE REGRA (auditoria de 09/09/2026 — NVL-01, DSH-01, PRF-02).
 *
 * A progressão premiava CLIQUE, não aprendizado. `level_visited` valia 10 pontos
 * e os níveis 4 e 5 abriam com 50 e 100 pontos: visitar as cinco aulas somava 50
 * sem ler uma linha, e mais alguns cliques somavam 100. O Dashboard derivava o
 * nível só dos pontos e anunciava **"Todos os níveis concluídos"** para quem
 * tinha 0 previsões resolvidas — com a conquista "Visitou o Nível 1" ainda
 * bloqueada na mesma tela (as duas coisas não podiam ser verdade juntas).
 *
 * Num produto de educação, dizer que a pessoa concluiu o que ela não fez é
 * mentir para ela sobre a única coisa que ela veio buscar aqui.
 *
 * A regra agora:
 *  - um nível conta como concluído quando um EXERCÍCIO dele foi resolvido
 *    (`levelsCompleted`), não quando a página foi aberta;
 *  - visitar continua valendo ponto, mas pouco, e não desbloqueia nada;
 *  - níveis 4 e 5 abrem por níveis concluídos, não por saldo de pontos.
 *
 * Atividades que geram pontos (com limites diários):
 *  - prediction_made      → +5  (máx 3/dia)
 *  - prediction_resolved  → +5  (máx 3/dia)
 *  - exercise_done        → +10 (uma vez por nível)
 *  - calculator_used      → +2  (máx 5/dia)
 *  - market_analyzed      → +3  (máx 3/dia)
 *  - level_visited        → +2  (uma vez por nível)
 *  - first_login          → +10 (uma vez)
 */

export type ActivityType =
  | "prediction_made"
  | "prediction_resolved"
  | "calculator_used"
  | "market_analyzed"
  | "level_visited"
  | "exercise_done"
  | "first_login"
  | "duel_won";

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  label: string;
  points: number;
  timestamp: string;
}

export interface UserProgress {
  totalPoints: number;
  activities: ActivityEntry[];
  /** ISO date string → activity type → count that day */
  dailyCounts: Record<string, Record<string, number>>;
  /** Which one-time milestones were already awarded */
  oneTimeDone: string[];
  /**
   * Níveis com pelo menos UM exercício resolvido. É o que significa "concluído"
   * — abrir a página não é. Opcional no tipo porque progresso gravado antes
   * desta mudança não tem o campo; `loadProgress` preenche.
   */
  levelsCompleted?: number[];
}

const KEY = "jlb_progress_v1";

const POINTS: Record<ActivityType, number> = {
  prediction_made: 5,
  prediction_resolved: 5,
  calculator_used: 2,
  market_analyzed: 3,
  // Visitar continua valendo alguma coisa (é o primeiro passo), mas deixou de
  // valer o mesmo que resolver um exercício — era o que fazia clicar em cinco
  // páginas somar tanto quanto estudar.
  level_visited: 2,
  exercise_done: 10,
  first_login: 10,
  duel_won: 25, // vitória em duelo de previsão (one-time por duelo, ver DUELOS.md)
};

const DAILY_LIMITS: Partial<Record<ActivityType, number>> = {
  prediction_made: 3,
  prediction_resolved: 3,
  calculator_used: 5,
  market_analyzed: 3,
};

/**
 * Quantos níveis ANTERIORES precisam estar concluídos para o nível abrir.
 *
 * Trocou o limiar de pontos: com pontos, o nível 5 abria para quem nunca tinha
 * resolvido um exercício. Agora a chave é a mesma coisa que o Dashboard chama de
 * "concluído", então a tela e o cadeado nunca discordam.
 */
export const NIVEIS_PARA_DESTRAVAR: Record<number, number> = {
  4: 3,
  5: 4,
};

// ── Storage ───────────────────────────────────────────────────────────────────

export function loadProgress(): UserProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as UserProgress;
    // Progresso gravado antes da mudança de regra não tem o campo. Preencher
    // com lista vazia (e não inferir dos pontos) é a leitura honesta: quem
    // acumulou ponto clicando não resolveu exercício nenhum.
    if (!Array.isArray(p.levelsCompleted)) p.levelsCompleted = [];
    return p;
  } catch { return empty(); }
}

function empty(): UserProgress {
  return { totalPoints: 0, activities: [], dailyCounts: {}, oneTimeDone: [], levelsCompleted: [] };
}

function persist(p: UserProgress): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* quota exceeded — ignore */ }
}

/** Sobrescreve o progresso local. Usado pela camada de sync (progressSync) ao
 *  mesclar o estado da nuvem com o local. */
export function saveProgress(p: UserProgress): void {
  persist(p);
}

// ── Core ──────────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface AwardResult {
  progress: UserProgress;
  /** Points earned in this call (0 if blocked by limit or one-time guard). */
  earned: number;
}

/**
 * Awards points for an activity.
 * Returns { progress, earned } — `earned` is 0 when blocked by daily limit or one-time guard.
 * Also dispatches a "jlb:points" CustomEvent on window so UI can react reactively.
 *
 * Pass `oneTimeKey` for milestones that should only fire once (e.g. "level_visited_3").
 */
export function awardPoints(
  type: ActivityType,
  label: string,
  oneTimeKey?: string,
): AwardResult {
  const p = loadProgress();

  // One-time guard
  if (oneTimeKey) {
    if (p.oneTimeDone.includes(oneTimeKey)) return { progress: p, earned: 0 };
    p.oneTimeDone.push(oneTimeKey);
  }

  // Daily limit guard
  const limit = DAILY_LIMITS[type];
  if (limit !== undefined) {
    const today = todayKey();
    p.dailyCounts[today] ??= {};
    const current = p.dailyCounts[today][type] ?? 0;
    if (current >= limit) return { progress: p, earned: 0 };
    p.dailyCounts[today][type] = current + 1;
  }

  const pts = POINTS[type];
  const entry: ActivityEntry = {
    id: crypto.randomUUID(),
    type,
    label,
    points: pts,
    timestamp: new Date().toISOString(),
  };

  p.totalPoints += pts;
  p.activities.unshift(entry);

  // Keep only last 200 activities (display purposes)
  if (p.activities.length > 200) p.activities = p.activities.slice(0, 200);

  // Prune daily counts older than 3 days
  const cutoff = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  for (const key of Object.keys(p.dailyCounts)) {
    if (key < cutoff) delete p.dailyCounts[key];
  }

  persist(p);

  // Notify UI components (badge update + toast)
  try {
    window.dispatchEvent(
      new CustomEvent("jlb:points", { detail: { earned: pts, label, type } }),
    );
  } catch { /* SSR or test environment — ignore */ }

  return { progress: p, earned: pts };
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Os níveis com pelo menos um exercício resolvido, em ordem. */
export function niveisConcluidos(): number[] {
  return [...(loadProgress().levelsCompleted ?? [])].sort((a, b) => a - b);
}

export function isLevelUnlocked(level: number): boolean {
  const exigidos = NIVEIS_PARA_DESTRAVAR[level];
  if (!exigidos) return true; // níveis 1, 2 e 3 são sempre abertos
  return niveisConcluidos().length >= exigidos;
}

/** Quantos níveis ainda faltam concluir para destravar este. */
export function faltamParaDestravar(level: number): number {
  const exigidos = NIVEIS_PARA_DESTRAVAR[level] ?? 0;
  return Math.max(0, exigidos - niveisConcluidos().length);
}

/**
 * Marca um nível como concluído — chamada quando um EXERCÍCIO é resolvido.
 *
 * Idempotente: resolver o segundo exercício do mesmo nível não dá ponto de novo,
 * porque a régua é "chegou até aqui", não "quantas vezes clicou".
 */
export function concluirNivel(level: number, rotulo: string): void {
  if (level < 1 || level > 5) return;
  const p = loadProgress();
  const feitos = p.levelsCompleted ?? [];
  if (feitos.includes(level)) return;
  p.levelsCompleted = [...feitos, level];
  persist(p);
  awardPoints("exercise_done", rotulo, `exercise_done_${level}`);
}

/** Returns today's usage count for a given activity type. */
export function dailyUsage(type: ActivityType): number {
  const p = loadProgress();
  return p.dailyCounts[todayKey()]?.[type] ?? 0;
}

export function canEarnToday(type: ActivityType): boolean {
  const limit = DAILY_LIMITS[type];
  if (!limit) return true;
  return dailyUsage(type) < limit;
}
