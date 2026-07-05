// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, fireEvent, cleanup } from "@testing-library/react";
import { useModalA11y } from "./useModalA11y";

afterEach(() => cleanup());

describe("useModalA11y", () => {
  it("chama onClose ao pressionar Escape", () => {
    const onClose = vi.fn();
    renderHook(() => useModalA11y(onClose));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("não chama onClose em outras teclas", () => {
    const onClose = vi.fn();
    renderHook(() => useModalA11y(onClose));
    fireEvent.keyDown(document, { key: "Enter" });
    fireEvent.keyDown(document, { key: "a" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("restaura o foco ao elemento que abriu o modal quando desmonta", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = renderHook(() => useModalA11y(() => {}));

    // simula o foco indo para dentro do modal
    const inside = document.createElement("button");
    document.body.appendChild(inside);
    inside.focus();
    expect(document.activeElement).toBe(inside);

    unmount();
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
    inside.remove();
  });

  it("remove o listener de teclado ao desmontar (sem vazamento)", () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useModalA11y(onClose));
    unmount();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
