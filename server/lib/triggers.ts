// ── Registro de gatilhos de cron ─────────────────────────────────────────────
// Deixa rotas dispararem jobs definidos no index.ts (o spawn de Python vive lá
// porque a resolução de caminho via import.meta.url só é estável no entrypoint
// após o bundle do esbuild). Evita import circular rota→index.

type Job = () => Promise<void>;

let snapshotJob: Job | null = null;

export function registerSnapshotJob(fn: Job): void { snapshotJob = fn; }

/** null = servidor ainda não registrou o job (boot incompleto). */
export function triggerSnapshotJob(): Promise<void> | null {
  return snapshotJob ? snapshotJob() : null;
}
