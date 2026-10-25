/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";
import AnimateIn from "@/components/AnimateIn";
import Reveal from "@/components/motion/Reveal";
import { jaEstaAVista } from "./primeiro-ecra";

/**
 * O que já está no primeiro ecrã quando a página chega não se esconde para
 * voltar a entrar (medido a 18/10: o título dos heróis via-se, desaparecia na
 * hidratação e só voltava aos 1,5–1,9 s no telemóvel). O que está abaixo
 * continua escondido até se rolar.
 */
const caixa = (top: number, height = 40) =>
  ({
    top,
    bottom: top + height,
    height,
    width: 300,
    left: 0,
    right: 300,
    x: 0,
    y: top,
    toJSON() {},
  }) as DOMRect;

class IO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => vi.restoreAllMocks());

describe("primeiro ecrã", () => {
  it("dentro do ecrã conta; abaixo, acima ou sem caixa não", () => {
    const el = document.createElement("div");
    const espia = vi.spyOn(el, "getBoundingClientRect");
    espia.mockReturnValue(caixa(100));
    expect(jaEstaAVista(el)).toBe(true);
    espia.mockReturnValue(caixa(window.innerHeight + 10));
    expect(jaEstaAVista(el)).toBe(false);
    espia.mockReturnValue(caixa(-200));
    expect(jaEstaAVista(el)).toBe(false);
    espia.mockReturnValue({ ...caixa(0, 0), width: 0 } as DOMRect);
    expect(jaEstaAVista(el)).toBe(false);
  });

  it("numa navegação, mede no documento: o scroll da página anterior não esconde o primeiro ecrã", () => {
    // A página nova monta com o scroll ainda na página de onde se veio (aqui,
    // 1500 px abaixo); o router só a leva ao topo depois. Um elemento a 600 px
    // do topo do documento mede -900 px no ecrã — e está no primeiro ecrã.
    const el = document.createElement("div");
    const espia = vi.spyOn(el, "getBoundingClientRect");
    vi.spyOn(window, "scrollY", "get").mockReturnValue(1500);
    espia.mockReturnValue(caixa(600 - 1500));
    expect(jaEstaAVista(el)).toBe(true);
    // O que está abaixo do primeiro ecrã do documento continua escondido.
    espia.mockReturnValue(caixa(window.innerHeight + 300 - 1500));
    expect(jaEstaAVista(el)).toBe(false);
  });

  for (const [nome, Comp] of [
    ["AnimateIn", AnimateIn],
    ["Reveal", Reveal],
  ] as const) {
    it(`${nome}: à vista ao montar fica visível; abaixo fica escondido`, () => {
      vi.stubGlobal("IntersectionObserver", IO);
      const topo = vi
        .spyOn(HTMLElement.prototype, "getBoundingClientRect")
        .mockReturnValue(caixa(120));
      const { container: a } = render(<Comp>topo</Comp>);
      expect((a.firstElementChild as HTMLElement).style.opacity).toBe("");
      topo.mockReturnValue(caixa(window.innerHeight + 200));
      const { container: b } = render(<Comp>abaixo</Comp>);
      expect((b.firstElementChild as HTMLElement).style.opacity).toBe("0");
      vi.unstubAllGlobals();
    });
  }
});
