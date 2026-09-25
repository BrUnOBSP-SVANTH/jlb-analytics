/**
 * userProgress — Sistema de Pontos JLB Analytics
 *
 * Armazenamento: a CONTA é a fonte de verdade (tabela `user_progress` no
 * Supabase, via lib/progressSync.ts — pull no login, push com debounce). O
 * localStorage aqui é cache offline e fonte local enquanto não há sessão.
 * ⚠️ Visitante NÃO logado acumula só no navegador — por design: sem conta, sem nuvem.
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
 *  - visitar continua valendo ponto, mas pouco, e não conclui nada.
 *
 * ⚠️ E NENHUM NÍVEL É TRANCADO (auditoria de 14/09/2026, item 4). Existiam
 * `NIVEIS_PARA_DESTRAVAR`, `isLevelUnlocked` e `faltamParaDestravar`, e com
 * eles telas que anunciavam cadeado — mas nenhuma página de nível checava nada,
 * e /nivel/5 abria para qualquer um. O site dizia três coisas diferentes sobre o
 * que é grátis. Os três símbolos saíram: níveis concluídos são PROGRESSO, não
 * chave. O que o Premium muda é só a cota de IA (ver /planos).
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
 * COMO GANHAR PONTOS — a lista que a tela mostra, montada a partir da REGRA.
 *
 * O QUE ACONTECIA (Auditoria 21/09, APR-01). A tabela do Perfil era uma lista
 * fixa no JSX. Ela prometia "+10 por visitar um novo nível" quando a regra dá
 * +2 — o toast na tela mostrava "+2 pts" logo depois de a tabela prometer 10 —
 * e simplesmente OMITIA "resolver exercício", que vale 10 e é a atividade que
 * o site mais quer que aconteça. Também omitia a vitória em duelo.
 *
 * Duas listas para a mesma verdade divergem; foi o que aconteceu. Agora existe
 * uma só: quem muda `POINTS` muda a tela junto, sem lembrar de nada.
 */
export interface ComoGanharPontos {
  tipo: ActivityType;
  rotulo: string;
  pontos: number;
  limite: string;
}

/** O nome de cada atividade para quem lê — o resto vem de POINTS/DAILY_LIMITS. */
const ROTULO: Record<ActivityType, string> = {
  prediction_made: "Registrar uma previsão",
  prediction_resolved: "Resolver uma previsão",
  calculator_used: "Usar uma calculadora",
  market_analyzed: "Analisar mercado com IA",
  level_visited: "Visitar um novo nível",
  exercise_done: "Resolver um exercício",
  first_login: "Primeiro acesso à plataforma",
  duel_won: "Vencer um duelo de previsão",
};

/** Quando o limite não é diário, é este — e ele também precisa ser verdade. */
const LIMITE_ESPECIAL: Partial<Record<ActivityType, string>> = {
  level_visited: "uma vez por nível",
  exercise_done: "uma vez por exercício",
  first_login: "uma vez",
  duel_won: "uma vez por duelo",
};

export function comoGanharPontos(): ComoGanharPontos[] {
  return (Object.keys(POINTS) as ActivityType[])
    .map((tipo) => ({
      tipo,
      rotulo: ROTULO[tipo],
      pontos: POINTS[tipo],
      limite: LIMITE_ESPECIAL[tipo] ?? (DAILY_LIMITS[tipo] ? `máx ${DAILY_LIMITS[tipo]}/dia` : "sem limite"),
    }))
    // Mais pontos primeiro: a lista passa a dizer o que o site quer que a
    // pessoa faça, em vez de repetir a ordem em que alguém escreveu o objeto.
    .sort((a, b) => b.pontos - a.pontos);
}


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
