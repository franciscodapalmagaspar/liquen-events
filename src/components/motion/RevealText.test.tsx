// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const carregado = vi.fn();
vi.mock("@/lib/motion/gsap", () => {
  carregado();
  return {
    gsap: {
      context: (fn: () => void) => (fn(), { revert: () => undefined }),
      from: vi.fn(() => ({ play: vi.fn(), progress: vi.fn() })),
    },
    SplitText: { create: vi.fn() },
    ease: { out: "expo.out" },
    dur: { reveal: 0.75 },
    stagger: { linhas: 0.09 },
  };
});

// O `prefersReducedMotion` guarda a MediaQueryList da primeira chamada: aqui
// diz-se directamente o que o aparelho pediu.
let reduzido = false;
vi.mock("@/lib/motion/useReducedMotion", () => ({ prefersReducedMotion: () => reduzido }));

import RevealText from "./RevealText";

afterEach(async () => {
  const { SplitText } = await import("@/lib/motion/gsap");
  (SplitText.create as ReturnType<typeof vi.fn>).mockClear();
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  carregado.mockClear();
  reduzido = false;
});

/** O GSAP só se pede depois do `load` e num instante livre (no jsdom, um
 * `setTimeout` de 200 ms), e o `import()` resolve noutra volta: espera-se. */
const esperar = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 300));
  });

describe("RevealText — o título linha a linha", () => {
  it("o servidor manda o título inteiro e visível (sem JavaScript lê-se tudo)", () => {
    const html = renderToStaticMarkup(
      <RevealText className="titulo">
        Um título <br /> em duas linhas
      </RevealText>,
    );
    expect(html).toBe('<h2 class="titulo">Um título <br/> em duas linhas</h2>');
    expect(html).not.toMatch(/opacity|transform|hidden/);
  });

  it("com «reduzir movimento» nem sequer pede o GSAP", async () => {
    reduzido = true;
    const { container } = render(<RevealText>Título</RevealText>);
    await esperar();
    const { SplitText } = await import("@/lib/motion/gsap");
    expect(SplitText.create).not.toHaveBeenCalled();
    expect(container.querySelector("h2")?.textContent).toBe("Título");
  });

  it("o que já está à vista quando a página abre não se esconde", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 100,
      bottom: 160,
      height: 60,
      width: 300,
      left: 0,
      right: 300,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });
    render(<RevealText>Título</RevealText>);
    await esperar();
    const { SplitText } = await import("@/lib/motion/gsap");
    expect(SplitText.create).not.toHaveBeenCalled();
  });

  it("mais abaixo, parte em linhas com máscara e anima-as quando chegam ao ecrã", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 5000,
      bottom: 5060,
      height: 60,
      width: 300,
      left: 0,
      right: 300,
      x: 0,
      y: 5000,
      toJSON: () => ({}),
    });
    render(<RevealText as="h3">Título</RevealText>);
    await esperar();
    const { SplitText } = await import("@/lib/motion/gsap");
    expect(SplitText.create).toHaveBeenCalledTimes(1);
    const [, opcoes] = (SplitText.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opcoes).toMatchObject({ type: "lines", mask: "lines", autoSplit: true });
  });

  it("se o título subiu ao ecrã antes de o GSAP chegar (rolou-se depressa), fica como está", async () => {
    const caixa = (top: number) => ({
      top,
      bottom: top + 60,
      height: 60,
      width: 300,
      left: 0,
      right: 300,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValueOnce(caixa(5000))
      .mockReturnValue(caixa(100));
    vi.spyOn(window, "scrollY", "get").mockReturnValue(4900);
    render(<RevealText>Título</RevealText>);
    await esperar();
    const { SplitText } = await import("@/lib/motion/gsap");
    expect(SplitText.create).not.toHaveBeenCalled();
  });

  it("só pede o GSAP quando o título fica a um ecrã de chegar (quem não desce não o descarrega)", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 5000,
      bottom: 5060,
      height: 60,
      width: 300,
      left: 0,
      right: 300,
      x: 0,
      y: 5000,
      toJSON: () => ({}),
    });
    let avisar: (e: Partial<IntersectionObserverEntry>[]) => void = () => {};
    const opcoes: IntersectionObserverInit[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof avisar, o: IntersectionObserverInit) {
          avisar = cb;
          opcoes.push(o);
        }
        observe() {}
        disconnect() {}
      },
    );
    render(<RevealText>Título</RevealText>);
    await esperar();
    const { SplitText } = await import("@/lib/motion/gsap");
    expect(opcoes[0]).toMatchObject({ rootMargin: "0px 0px 100% 0px" });
    expect(SplitText.create).not.toHaveBeenCalled();
    await act(async () => {
      avisar([{ isIntersecting: true }]);
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(SplitText.create).toHaveBeenCalledTimes(1);
  });

  /**
   * No DEDO (1/11): sem GSAP e sem partir linhas — foi isso que travava o
   * iPhone —, mas com a entrada leve dos blocos: o título inteiro aparece e
   * sobe 16 px quando chega ao ecrã. Ela confirmou o iPhone fluido antes.
   */
  it("no telemóvel, entrada leve: sem GSAP, o título inteiro aparece ao chegar", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("pointer: coarse"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      top: 5000,
      bottom: 5060,
      height: 60,
      width: 300,
      left: 0,
      right: 300,
      x: 0,
      y: 5000,
      toJSON: () => ({}),
    });
    let avisar: (e: Partial<IntersectionObserverEntry>[]) => void = () => {};
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: typeof avisar) {
          avisar = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { container } = render(<RevealText>Título</RevealText>);
    const h = container.querySelector("h2")!;
    expect(h.style.opacity).toBe("0");
    expect(h.style.transform).toBe("translateY(16px)");
    act(() => avisar([{ isIntersecting: true }]));
    expect(h.style.opacity).toBe("");
    expect(h.style.transform).toBe("");
    expect(h.style.transition).toMatch(/opacity .*transform/);
    await esperar();
    expect(carregado).not.toHaveBeenCalled();
    expect(h.textContent).toBe("Título");
  });

  it("no telemóvel, o que já está à vista não se esconde", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("pointer: coarse"),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    const { container } = render(<RevealText>Título</RevealText>);
    expect(container.querySelector("h2")!.style.opacity).toBe("");
  });
});
