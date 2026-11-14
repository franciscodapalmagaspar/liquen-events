// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useToqueLongo } from "./adaptativo";

/**
 * O toque longo do back office (auditoria do telemóvel, 14/11): o Safari do
 * iPhone não dispara `contextmenu`, e os menus só lá viviam. O gesto inteiro
 * mede-se no browser (`e2e/o-iphone-com-barras.spec.ts`); aqui prendem-se as
 * regras que um browser emulado não deixa ver uma a uma.
 */

function evento(tipo: string, x = 100, y = 100, alvo: Element = document.body) {
  const nativo = new Event(tipo);
  return {
    pointerType: "touch",
    clientX: x,
    clientY: y,
    target: alvo,
    nativeEvent: nativo,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.PointerEvent<HTMLElement>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useToqueLongo", () => {
  it("dispara aos 550 ms no sítio do dedo, e engole o clique que vem a seguir", () => {
    const { result } = renderHook(() => useToqueLongo());
    const aoDisparar = vi.fn();
    const h = result.current(aoDisparar);
    act(() => h.onPointerDown(evento("pointerdown", 40, 60)));
    act(() => void vi.advanceTimersByTime(549));
    expect(aoDisparar).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(2));
    expect(aoDisparar).toHaveBeenCalledWith({ x: 40, y: 60 }, document.body);
    h.onPointerUp();
    const clique = new MouseEvent("click", { bubbles: true, cancelable: true });
    const visto = vi.fn();
    document.body.addEventListener("click", visto);
    document.body.dispatchEvent(clique);
    expect(visto).not.toHaveBeenCalled();
    expect(clique.defaultPrevented).toBe(true);
    // E só UM: o toque seguinte clica como sempre.
    act(() => h.onPointerDown(evento("pointerdown")));
    h.onPointerUp();
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(visto).toHaveBeenCalledTimes(1);
    document.body.removeEventListener("click", visto);
  });

  it("o toque curto não dispara nem engole o clique", () => {
    const { result } = renderHook(() => useToqueLongo());
    const aoDisparar = vi.fn();
    const h = result.current(aoDisparar);
    act(() => h.onPointerDown(evento("pointerdown")));
    act(() => void vi.advanceTimersByTime(200));
    h.onPointerUp();
    act(() => void vi.advanceTimersByTime(1000));
    expect(aoDisparar).not.toHaveBeenCalled();
    const visto = vi.fn();
    document.body.addEventListener("click", visto);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(visto).toHaveBeenCalledTimes(1);
    document.body.removeEventListener("click", visto);
  });

  it("o dedo que se mexe mais de 10 px, ou a página que desliza, cancelam", () => {
    const { result } = renderHook(() => useToqueLongo());
    const aoDisparar = vi.fn();
    const h = result.current(aoDisparar);
    act(() => h.onPointerDown(evento("pointerdown", 100, 100)));
    h.onPointerMove(evento("pointermove", 100, 112));
    act(() => void vi.advanceTimersByTime(1000));
    expect(aoDisparar).not.toHaveBeenCalled();

    act(() => h.onPointerDown(evento("pointerdown", 100, 100)));
    window.dispatchEvent(new Event("scroll"));
    act(() => void vi.advanceTimersByTime(1000));
    expect(aoDisparar).not.toHaveBeenCalled();
  });

  it("com rato não dispara; o botão direito segue para o menu de sempre", () => {
    const { result } = renderHook(() => useToqueLongo());
    const aoDisparar = vi.fn();
    const doRato = vi.fn();
    const h = result.current(aoDisparar, doRato);
    const e = { ...evento("pointerdown"), pointerType: "mouse" } as React.PointerEvent<HTMLElement>;
    act(() => h.onPointerDown(e));
    act(() => void vi.advanceTimersByTime(1000));
    expect(aoDisparar).not.toHaveBeenCalled();
    h.onContextMenu(evento("contextmenu") as unknown as React.MouseEvent<HTMLElement>);
    expect(doRato).toHaveBeenCalledTimes(1);
  });

  it("num campo de texto não dispara (é onde o dedo põe o cursor)", () => {
    const { result } = renderHook(() => useToqueLongo());
    const aoDisparar = vi.fn();
    const campo = document.createElement("input");
    act(() => result.current(aoDisparar).onPointerDown(evento("pointerdown", 1, 1, campo)));
    act(() => void vi.advanceTimersByTime(1000));
    expect(aoDisparar).not.toHaveBeenCalled();
  });

  it("o alvo de dentro reclama o toque: o de fora não abre o seu menu por cima", () => {
    const { result: dentro } = renderHook(() => useToqueLongo());
    const { result: fora } = renderHook(() => useToqueLongo());
    const doChip = vi.fn();
    const doDia = vi.fn();
    const e = evento("pointerdown");
    act(() => dentro.current(doChip).onPointerDown(e));
    act(() => fora.current(doDia).onPointerDown(e)); // o mesmo evento, a borbulhar
    act(() => void vi.advanceTimersByTime(1000));
    expect(doChip).toHaveBeenCalledTimes(1);
    expect(doDia).not.toHaveBeenCalled();
  });

  it("quando o browser manda `contextmenu` (Android), o menu abre UMA vez", () => {
    const { result } = renderHook(() => useToqueLongo());
    const aoDisparar = vi.fn();
    const doRato = vi.fn();
    const h = result.current(aoDisparar, doRato);
    act(() => h.onPointerDown(evento("pointerdown")));
    act(() => void vi.advanceTimersByTime(500));
    h.onContextMenu(evento("contextmenu") as unknown as React.MouseEvent<HTMLElement>);
    act(() => void vi.advanceTimersByTime(1000));
    expect(aoDisparar).toHaveBeenCalledTimes(1);
    expect(doRato).not.toHaveBeenCalled();
  });

  it("sem clique depois do toque longo (o iOS nem sempre o manda), o toque seguinte NOUTRO alvo clica", () => {
    const { result: a } = renderHook(() => useToqueLongo());
    const { result: b } = renderHook(() => useToqueLongo());
    const ha = a.current(vi.fn());
    act(() => ha.onPointerDown(evento("pointerdown")));
    act(() => void vi.advanceTimersByTime(600));
    ha.onPointerUp();
    // Nenhum clique chegou. O dedo pousa noutro alvo (o `pointerdown` do browser
    // passa pela janela antes de chegar ao React).
    window.dispatchEvent(new Event("pointerdown"));
    const hb = b.current(vi.fn());
    act(() => hb.onPointerDown(evento("pointerdown")));
    hb.onPointerUp();
    const visto = vi.fn();
    document.body.addEventListener("click", visto);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(visto).toHaveBeenCalledTimes(1);
    document.body.removeEventListener("click", visto);
  });

  it("quem diz que não era com ele (`false`) não engole o clique", () => {
    const { result } = renderHook(() => useToqueLongo());
    const h = result.current(() => false);
    act(() => h.onPointerDown(evento("pointerdown")));
    act(() => void vi.advanceTimersByTime(1000));
    h.onPointerUp();
    const visto = vi.fn();
    document.body.addEventListener("click", visto);
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(visto).toHaveBeenCalledTimes(1);
    document.body.removeEventListener("click", visto);
  });
});
