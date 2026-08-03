/**
 * Prefetch de chunks de página no hover.
 * As páginas são lazy (code-split); ao passar o mouse num link do menu, baixamos
 * o código daquela página em segundo plano — o clique abre instantâneo.
 * Os specifiers batem com os de App.tsx (mesmo módulo → mesmo chunk, sem duplicar).
 */
const importers: Record<string, () => Promise<unknown>> = {
  "/apostas": () => import("@/pages/Apostas"),
  "/noticias": () => import("@/pages/Noticias"),
  "/previsao": () => import("@/pages/Previsao"),
  "/dashboard": () => import("@/pages/Dashboard"),
  "/leaderboard": () => import("@/pages/Leaderboard"),
  "/simulador": () => import("@/pages/Simulador"),
  "/calculadoras": () => import("@/pages/Calculadoras"),
  "/portfolio": () => import("@/pages/Portfolio"),
  "/educacao": () => import("@/pages/Educacao"),
  "/briefing": () => import("@/pages/Briefing"),
  "/perfil": () => import("@/pages/Perfil"),
  "/sobre": () => import("@/pages/Sobre"),
};

const done = new Set<string>();

export function prefetchRoute(path?: string): void {
  if (!path) return;
  const key = path.split("?")[0];
  if (done.has(key)) return;
  const fn = importers[key];
  if (!fn) return;
  done.add(key);
  void fn().catch(() => done.delete(key)); // se falhar, permite tentar de novo
}
