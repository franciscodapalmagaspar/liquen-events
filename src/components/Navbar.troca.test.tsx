// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import Navbar from "./Navbar";
import { LocaleProvider } from "./LocaleProvider";
import { getDictionary, pickChromeDict } from "@/lib/i18n";

/**
 * Ela (25/10): «clarão claro ao mudar de página — ATENÇÃO, isto continua no
 * site online, pelo menos no mobile, principalmente na parte de serviços e
 * carrego para ver um serviço específico».
 *
 * Filmado no site publicado: em /servicos, descida até ao cartão, a barra está
 * no estado descido (fundo claro). Ao tocar num serviço, a página nova chega
 * ao topo e a barra levava 500 ms a esbater-se de claro para transparente por
 * cima da fotografia escura. Agora passa logo, sem transição.
 */
let caminho = "/servicos";
vi.mock("next/navigation", () => ({
  usePathname: () => caminho,
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
}));

const dicionario = await getDictionary("pt");
let fila: FrameRequestCallback[] = [];
const correrFotogramas = () => {
  for (let i = 0; i < 4; i += 1) {
    const agora = fila;
    fila = [];
    act(() => agora.forEach((f) => f(0)));
  }
};

beforeEach(() => {
  caminho = "/servicos";
  fila = [];
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => fila.push(f));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const barra = () => screen.getAllByRole("navigation")[0] as HTMLElement;
const arvore = () => (
  <LocaleProvider locale="pt" dict={pickChromeDict(dicionario)}>
    <Navbar />
  </LocaleProvider>
);

describe("a barra ao mudar de página", () => {
  it("de uma página descida para um serviço: transparente no mesmo fotograma, sem esbater", () => {
    const scroll = vi.spyOn(window, "scrollY", "get").mockReturnValue(1500);
    const { rerender } = render(arvore());
    correrFotogramas();
    expect(barra().className).toContain("bg-surface/95");

    // O router leva a página nova ao topo.
    caminho = "/servicos/casamentos";
    scroll.mockReturnValue(0);
    rerender(arvore());
    expect(barra().className).toContain("bg-transparent");
    expect(barra().className).not.toContain("bg-surface/95");
    expect(barra().className).toContain("!transition-none");

    // Dois fotogramas depois, as transições voltam e o estado fica o certo.
    correrFotogramas();
    expect(barra().className).not.toContain("!transition-none");
    expect(barra().className).toContain("bg-transparent");
  });

  it("voltar atrás para uma página descida: fica no estado descido, sem esbater", () => {
    const scroll = vi.spyOn(window, "scrollY", "get").mockReturnValue(0);
    const { rerender } = render(arvore());
    correrFotogramas();
    expect(barra().className).toContain("bg-transparent");

    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));
    caminho = "/sobre";
    scroll.mockReturnValue(900);
    rerender(arvore());
    correrFotogramas();
    expect(barra().className).toContain("bg-surface/95");
  });
});
