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

/**
 * Até 3/11 este ficheiro provava que o Lenis parava com uma camada por cima (a
 * lupa da proposta, a galeria, o menu). A 3/11 ela desligou-o no computador
 * («igual ao telemóvel»), portanto o que se prova agora é o contrário: com rato
 * ou trackpad, o Lenis NUNCA chega a ser criado. A regra das camadas continua
 * provada em `inercia-roda.test.ts` (`haCamadaPorCima`), para o dia em que se
 * volte a ligar.
 */
const construido = vi.fn();
vi.mock("lenis", () => ({
  default: class {
    constructor() {
      construido();
      return lenis;
    }
  },
}));

describe("SmoothScroll — desligado no computador (3/11)", () => {
  it("com rato ou trackpad não cria o Lenis nem prende a roda", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("pointer: fine"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    render(<SmoothScroll />);
    await esperar();
    document.body.style.overflow = "hidden";
    await esperar();
    expect(construido).not.toHaveBeenCalled();
    expect(lenis.stop).not.toHaveBeenCalled();
    expect(lenis.start).not.toHaveBeenCalled();
  });
});
