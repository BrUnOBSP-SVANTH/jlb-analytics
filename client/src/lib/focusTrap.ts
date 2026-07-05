/**
 * Utilitários de focus trap reutilizáveis (a11y de overlays/modais).
 * Compartilhado por useModalA11y (modais que montam/desmontam) e pelo
 * CommandPalette (sempre montado, trap ligado ao estado `open`).
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Elementos focáveis e VISÍVEIS dentro de um painel. */
export function getFocusable(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
}

/**
 * Prende o Tab dentro do painel (chame quando `e.key === "Tab"`):
 * ao chegar no fim, volta ao início; com Shift, o inverso; se o foco escapou
 * do painel, traz de volta.
 */
export function trapTab(e: KeyboardEvent, panel: HTMLElement): void {
  const items = getFocusable(panel);
  if (items.length === 0) { e.preventDefault(); return; }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!panel.contains(active as Node)) { e.preventDefault(); first.focus(); return; }
  if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
}
