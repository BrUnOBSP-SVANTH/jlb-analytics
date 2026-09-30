/**
 * tutorial.ts — controle global do modal de vídeo tutorial do JLB Analytics.
 *
 * POR QUE VIA EVENTO GLOBAL (`jlb:tutorial`):
 * O vídeo tutorial precisa ser disparado de múltiplos pontos:
 *  - Na Navbar (menu Aprender)
 *  - No OnboardingTour (convite em vídeo na primeira visita)
 *  - No Footer (rodapé)
 *  - No CommandPalette (Ctrl+K)
 *  - Por parâmetro de URL (?tutorial=1)
 *
 * O evento desacopla os botões da UI do modal: quem quer abrir só chama
 * `abrirTutorial()`, e o `<TutorialModal/>` montado no topo da App responde.
 */

export interface DetalheTutorial {
  capituloId?: string;
  autoPlay?: boolean;
}

export const EVENTO_TUTORIAL = "jlb:tutorial";

export function abrirTutorial(detalhe: DetalheTutorial = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DetalheTutorial>(EVENTO_TUTORIAL, { detail: detalhe }));
}
