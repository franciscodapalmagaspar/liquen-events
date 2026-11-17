// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { vestirOArrasto } from "./arrasto";

/** Um `dragstart` com um `setDragImage` que regista o que lhe dão. */
function arrasto(setDragImage?: (el: Element, x: number, y: number) => void) {
  const celula = document.createElement("div");
  document.body.appendChild(celula);
  return {
    celula,
    evento: {
      currentTarget: celula,
      dataTransfer: setDragImage ? { setDragImage } : {},
    } as unknown as React.DragEvent,
  };
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("vestirOArrasto", () => {
  it("uma foto arrasta-se a si própria: não se desenha crachá", () => {
    const set = vi.fn();
    vestirOArrasto(arrasto(set).evento, 1);
    expect(set).not.toHaveBeenCalled();
  });

  it("várias fotos levam o crachá com o número, e ele sai do documento a seguir", () => {
    vi.useFakeTimers();
    let fotografado: Element | null = null;
    const set = vi.fn((el: Element) => {
      // A especificação exige o nó NO documento no instante da chamada.
      expect(document.body.contains(el)).toBe(true);
      fotografado = el;
    });
    vestirOArrasto(arrasto(set).evento, 40);
    expect(set).toHaveBeenCalledWith(expect.any(HTMLElement), 12, 12);
    expect(fotografado!.textContent).toBe("40");
    expect(fotografado!.getAttribute("aria-hidden")).toBe("true");
    vi.runAllTimers();
    expect(document.body.contains(fotografado)).toBe(false);
  });

  it("um browser sem `setDragImage` arrasta na mesma, sem crachá e sem erro", () => {
    expect(() => vestirOArrasto(arrasto().evento, 5)).not.toThrow();
    expect(document.body.querySelectorAll("[aria-hidden]")).toHaveLength(0);
  });

  it("um browser que recusa a imagem não deita o arrasto abaixo", () => {
    vi.useFakeTimers();
    const set = vi.fn(() => {
      throw new Error("recusado");
    });
    expect(() => vestirOArrasto(arrasto(set).evento, 3)).not.toThrow();
    vi.runAllTimers();
    expect(document.body.querySelectorAll("[aria-hidden]")).toHaveLength(0);
  });
});
