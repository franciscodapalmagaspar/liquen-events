// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { attach } from "./liquid-glass";

/**
 * O `transitionrun` BORBULHA. Os botões dentro de uma superfície de vidro têm
 * transições de cor no `hover`, e cada passagem do rato subia até ao vidro e
 * arrancava um `track(900)` — 900 ms de `requestAnimationFrame` a remedir uma
 * superfície que não mudou de forma. Só conta a transição DO PRÓPRIO vidro.
 */
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

describe("um desenho já pedido não volta a pôr o vidro depois do destroy()", () => {
  it("o paint() que chega tarde não escreve o filtro numa superfície desmontada (revisão do lote de 18/11)", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    let aoMudar: () => void = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          aoMudar = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const pedidos: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      pedidos.push(cb);
      return pedidos.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    // O jsdom não desenha: um contexto 2D que aceita tudo chega para o mapa.
    const imagem = (w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
      width: w,
      height: h,
    });
    const contexto = new Proxy({} as Record<string, unknown>, {
      get: (alvo, nome) =>
        nome in alvo
          ? alvo[nome as string]
          : nome === "createImageData"
            ? imagem
            : nome === "getImageData"
              ? (_x: number, _y: number, w: number, h: number) => imagem(w, h)
              : () => {},
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(contexto as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:,");

    const el = document.createElement("div");
    let largura = 300;
    el.getBoundingClientRect = () => ({ width: largura, height: 80 }) as DOMRect;
    document.body.appendChild(el);
    const vidro = attach(el, {});
    expect(el.style.backdropFilter).toContain("url(#");

    // A janela muda de tamanho e o redesenho fica pedido ao browser…
    largura = 320;
    aoMudar();
    // …e, na mesma fotografia, o vídeo volta ao ecrã e o vidro desmonta-se.
    vidro.destroy();
    expect(el.style.backdropFilter).toBe("");

    for (const cb of pedidos) cb(0);
    expect(el.style.backdropFilter).toBe("");
    el.remove();
  });
});
