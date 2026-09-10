/**
 * useDispensar — a saída única de todo popover do site.
 *
 * O QUE ISTO CONSERTA (NAV-02). A auditoria testou `Escape` em todos os
 * overlays da navegação — mega-menu, painel de alertas, widget de chat — e
 * nenhum fechou. Quem navega por teclado ficava preso: para sair de um menu
 * aberto era preciso achar um ponto vazio da tela e clicar com o mouse. O menu
 * também continuava aberto ao rolar a página, flutuando sobre o conteúdo.
 *
 * Três saídas, porque são três intenções diferentes de "quero sair daqui":
 *   • `Escape`      — a saída de quem usa teclado; é a que faltava
 *   • clique fora   — a saída de quem usa mouse
 *   • rolagem       — sair olhando outra coisa também é sair
 *
 * E, ao fechar por Escape, o foco volta para o gatilho (WCAG 2.4.3): sem isso o
 * leitor de tela é jogado de volta ao começo do documento.
 *
 * A dica de acessibilidade que vem de brinde: `props` devolve `aria-expanded` e
 * `aria-haspopup` já preenchidos, então o botão que abre passa a se anunciar
 * corretamente só por espalhar o objeto.
 */
import { useEffect, useRef, type RefObject } from "react";

interface Opcoes {
  /** Fechar ao rolar a página. Desligue em popover ancorado que acompanha a rolagem. */
  aoRolar?: boolean;
}

export interface DispensarRetorno<T extends HTMLElement> {
  /** Prender no contêiner que envolve gatilho + painel. */
  ref: RefObject<T | null>;
  /** Espalhar no BOTÃO que abre: `<button {...d.props}>`. */
  props: { "aria-expanded": boolean; "aria-haspopup": "menu" };
}

export function useDispensar<T extends HTMLElement = HTMLDivElement>(
  aberto: boolean,
  fechar: () => void,
  { aoRolar = true }: Opcoes = {},
): DispensarRetorno<T> {
  const ref = useRef<T | null>(null);
  // `fechar` costuma ser uma seta nova a cada render; guardar em ref evita
  // re-assinar os três listeners a cada digitação do usuário.
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;

  useEffect(() => {
    if (!aberto) return;

    function foraDoPainel(alvo: EventTarget | null): boolean {
      return !!ref.current && !ref.current.contains(alvo as Node);
    }

    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (foraDoPainel(e.target)) fecharRef.current();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      fecharRef.current();
      // Devolve o foco ao gatilho — o primeiro botão do contêiner.
      const gatilho = ref.current?.querySelector<HTMLElement>("button,[href],[tabindex]");
      gatilho?.focus?.();
    }

    function onScroll() { fecharRef.current(); }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown);
    if (aoRolar) window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll);
    };
  }, [aberto, aoRolar]);

  return { ref, props: { "aria-expanded": aberto, "aria-haspopup": "menu" } };
}

/**
 * O atalho da busca global, escrito como o teclado de quem está lendo (NAV-03).
 *
 * O botão exibia `⌘K` em qualquer sistema — inclusive no Windows, onde o projeto
 * roda. Anunciar um atalho que não existe naquele teclado é pior do que não
 * anunciar nenhum.
 */
export const ehMac = typeof navigator !== "undefined"
  && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");

export const ATALHO_BUSCA = ehMac ? "⌘K" : "Ctrl K";
