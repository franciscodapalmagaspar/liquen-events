// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { attach } from "./liquid-glass";

/**
 * O `transitionrun` BORBULHA. Os botões dentro de uma superfície de vidro têm
 * transições de cor no `hover`, e cada passagem do rato subia até ao vidro e
 * arrancava um `track(900)` — 900 ms de `requestAnimationFrame` a remedir uma
 * superfície que não mudou de forma. Só conta a transição DO PRÓPRIO vidro.
 */
afterEach(() => vi.unstubAllGlobals());

function comMotor() {
  vi.stubGlobal("CSS", { supports: () => true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  const raf = vi.fn(() => 1);
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  return raf;
}

describe("o vidro só acompanha as SUAS transições", () => {
  it("a transição de um botão lá dentro não arranca o track()", () => {
    const raf = comMotor();
    const el = document.createElement("div");
    const botao = document.createElement("button");
    el.appendChild(botao);
    document.body.appendChild(el);
    const vidro = attach(el, { live: true });
    raf.mockClear();

    botao.dispatchEvent(new Event("transitionrun", { bubbles: true }));
    expect(raf).not.toHaveBeenCalled();

    el.dispatchEvent(new Event("transitionrun", { bubbles: true }));
    expect(raf).toHaveBeenCalled();
    vidro.destroy();
    el.remove();
  });
});
