// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

const lenis = {
  stop: vi.fn(),
  start: vi.fn(),
  destroy: vi.fn(),
  scrollTo: vi.fn(),
  isStopped: false,
};
vi.mock("lenis", () => ({
  default: class {
    constructor() {
      return lenis;
    }
  },
}));
vi.mock("@/lib/depois-de-carregar", () => ({
  depoisDeCarregar: (fn: () => void) => (fn(), () => {}),
}));
vi.mock("@/lib/motion/useReducedMotion", () => ({ prefersReducedMotion: () => false }));

import SmoothScroll from "./SmoothScroll";

/** O `import("lenis")` e o observador resolvem noutras voltas do ciclo. */
const esperar = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.body.removeAttribute("style");
  delete document.body.dataset.menuOpen;
});

describe("SmoothScroll — pára enquanto há uma camada por cima", () => {
  it("o corpo trancado (a lupa da proposta, a galeria) pára o Lenis, e destrancado volta", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("pointer: fine"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    render(<SmoothScroll />);
    await esperar();
    lenis.stop.mockClear();
    lenis.start.mockClear();
    document.body.style.overflow = "hidden";
    await esperar();
    expect(lenis.stop).toHaveBeenCalled();
    document.body.style.overflow = "";
    await esperar();
    expect(lenis.start).toHaveBeenCalled();
  });

  it("o menu aberto (`data-menu-open`) também o pára", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("pointer: fine"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    render(<SmoothScroll />);
    await esperar();
    lenis.stop.mockClear();
    document.body.dataset.menuOpen = "true";
    await esperar();
    expect(lenis.stop).toHaveBeenCalled();
  });
});
