import { useEffect, useRef, type RefObject } from "react";
import { getFocusable, trapTab } from "@/lib/focusTrap";

/**
 * Acessibilidade de modais que montam/desmontam (WCAG 2.1.2 / 2.4.3):
 *  - Fecha no Escape.
 *  - RESTAURA o foco ao elemento que abriu o modal quando ele fecha.
 *  - Se `panelRef` for passado: FOCA o primeiro focável ao abrir e PRENDE o Tab
 *    dentro do modal (focus trap) — teclado não escapa para o fundo.
 */
export function useModalA11y(onClose: () => void, panelRef?: RefObject<HTMLElement | null>): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const panel = panelRef?.current ?? null;

    if (panel) {
      const first = getFocusable(panel)[0];
      (first ?? panel).focus();
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key === "Tab" && panel) trapTab(e, panel);
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (trigger && typeof trigger.focus === "function" && document.contains(trigger)) {
        trigger.focus();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
