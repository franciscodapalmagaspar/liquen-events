// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useEntradaEmVideoVisivel } from "./useEntradaEmVideoVisivel";

/**
 * Por cima do vídeo da entrada a barra de cookies não é vidro (29/10, 9/11:
 * «o site no PC está a travar»). Este gancho é o que o diz.
 */
type Chamada = (e: { isIntersecting: boolean }[]) => void;
let avisar: Chamada = () => {};

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function comObservador() {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: Chamada) {
        avisar = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
}

describe("o vídeo da entrada está no ecrã?", () => {
  it("numa página sem vídeo, não", () => {
    comObservador();
    const { result } = renderHook(() => useEntradaEmVideoVisivel("/privacidade"));
    expect(result.current).toBe(false);
  });

  it("com o vídeo à vista, sim; quando sai do ecrã, não", () => {
    comObservador();
    const entrada = document.createElement("div");
    entrada.setAttribute("data-entrada", "");
    document.body.appendChild(entrada);
    const { result } = renderHook(() => useEntradaEmVideoVisivel("/"));
    expect(result.current).toBe(true);
    act(() => avisar([{ isIntersecting: true }]));
    expect(result.current).toBe(true);
    act(() => avisar([{ isIntersecting: false }]));
    expect(result.current).toBe(false);
  });

  it("sem IntersectionObserver fica do lado barato: sem vidro", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const entrada = document.createElement("div");
    entrada.setAttribute("data-entrada", "");
    document.body.appendChild(entrada);
    const { result } = renderHook(() => useEntradaEmVideoVisivel("/"));
    expect(result.current).toBe(true);
  });
});
