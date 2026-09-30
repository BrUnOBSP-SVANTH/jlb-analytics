// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { abrirTutorial, EVENTO_TUTORIAL, type DetalheTutorial } from "./tutorial";

describe("client/src/lib/tutorial", () => {
  it("dispara evento global jlb:tutorial com detalhes", () => {
    const handler = vi.fn();
    window.addEventListener(EVENTO_TUTORIAL, handler);

    abrirTutorial({ capituloId: "calculadoras" });

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent<DetalheTutorial>;
    expect(event.detail.capituloId).toBe("calculadoras");

    window.removeEventListener(EVENTO_TUTORIAL, handler);
  });

  it("dispara com objeto vazio por padrão quando chamado sem argumentos", () => {
    const handler = vi.fn();
    window.addEventListener(EVENTO_TUTORIAL, handler);

    abrirTutorial();

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0][0] as CustomEvent<DetalheTutorial>;
    expect(event.detail).toEqual({});

    window.removeEventListener(EVENTO_TUTORIAL, handler);
  });
});
