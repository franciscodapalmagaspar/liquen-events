// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DragEvent } from "react";
import { vestirOArrasto } from "./arrasto";

function arrasto(setDragImage?: (el: Element, x: number, y: number) => void) {
  const celula = document.createElement("div");
  return {
    currentTarget: celula,
    dataTransfer: setDragImage ? { setDragImage } : {},
  } as unknown as DragEvent;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("vestirOArrasto — o crachá do número", () => {
  it("uma foto só arrasta-se a si própria: não se desenha nada", () => {
    const set = vi.fn();
    vestirOArrasto(arrasto(set), 1);
    vestirOArrasto(arrasto(set), 0);
    expect(set).not.toHaveBeenCalled();
    expect(document.body.children).toHaveLength(0);
  });

  it("várias: o crachá diz quantas, está no documento quando é fotografado, e sai a seguir", () => {
    vi.useFakeTimers();
    let noDocumento = false;
    let texto = "";
    const set = vi.fn((el: Element) => {
      noDocumento = document.body.contains(el);
      texto = el.textContent ?? "";
    });
    vestirOArrasto(arrasto(set), 40);
    expect(set).toHaveBeenCalledTimes(1);
    expect(noDocumento).toBe(true);
    expect(texto).toBe("40");
    expect(document.body.querySelector('[aria-hidden="true"]')).not.toBeNull();
    vi.runAllTimers();
    expect(document.body.children).toHaveLength(0);
  });

  it("sem setDragImage, ou um browser que o recusa, o arrasto segue sem crachá e sem erro", () => {
    vi.useFakeTimers();
    expect(() => vestirOArrasto(arrasto(), 5)).not.toThrow();
    expect(document.body.children).toHaveLength(0);
    const recusa = vi.fn(() => {
      throw new Error("não");
    });
    expect(() => vestirOArrasto(arrasto(recusa), 5)).not.toThrow();
    vi.runAllTimers();
    expect(document.body.children).toHaveLength(0);
  });
});
