// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";

/**
 * As fotografias pedem-se dois ecrãs antes de chegarem (1/11): o Safari do
 * iPhone só pedia uma imagem preguiçosa quase à vista, e ela via o desfoque.
 */

let caminho = "/servicos";
vi.mock("@/lib/use-public-pathname", () => ({ usePublicPathname: () => caminho }));

let observadores: {
  cb: IntersectionObserverCallback;
  opcoes?: IntersectionObserverInit;
  el: Element[];
}[] = [];
class IO {
  private r: { cb: IntersectionObserverCallback; opcoes?: IntersectionObserverInit; el: Element[] };
  constructor(cb: IntersectionObserverCallback, opcoes?: IntersectionObserverInit) {
    this.r = { cb, opcoes, el: [] };
    observadores.push(this.r);
  }
  observe(el: Element) {
    this.r.el.push(el);
  }
  unobserve(el: Element) {
    this.r.el = this.r.el.filter((e) => e !== el);
  }
  disconnect() {}
  takeRecords() {
    return [];
  }
}

function aproximar(img: Element) {
  for (const o of observadores) {
    if (!o.el.includes(img)) continue;
    act(() =>
      o.cb(
        [{ target: img, isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    );
  }
}

async function montar() {
  const { default: AnteciparFotos } = await import("./AnteciparFotos");
  const r = render(
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element -- o teste é sobre o <img> cru */}
      <img alt="" src="/a.jpg" loading="lazy" />
      <AnteciparFotos />
    </div>,
  );
  // O `load` já aconteceu no jsdom; o primeiro instante livre chega a seguir.
  await act(async () => {
    await new Promise((res) => setTimeout(res, 250));
  });
  return r;
}

beforeEach(() => {
  observadores = [];
  caminho = "/servicos";
  vi.stubGlobal("IntersectionObserver", IO);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "connection");
});

describe("AnteciparFotos", () => {
  it("passa a eager a imagem preguiçosa que chega a dois ecrãs", async () => {
    const { container } = await montar();
    const img = container.querySelector("img")!;
    expect(observadores[0]?.opcoes?.rootMargin).toBe("200% 0px 200% 0px");
    expect(img.getAttribute("loading")).toBe("lazy");
    aproximar(img);
    expect(img.getAttribute("loading")).toBe("eager");
  });

  it("apanha as imagens que aparecem depois (uma grelha que troca, outra página)", async () => {
    const { container } = await montar();
    const nova = document.createElement("img");
    nova.setAttribute("loading", "lazy");
    container.appendChild(nova);
    await act(async () => {
      await new Promise((res) => setTimeout(res, 50));
    });
    aproximar(nova);
    expect(nova.getAttribute("loading")).toBe("eager");
  });

  it("na galeria não faz nada (tem a sua própria antecipação)", async () => {
    caminho = "/galeria";
    await montar();
    expect(observadores).toHaveLength(0);
  });

  it("com «Poupar dados» não faz nada", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    await montar();
    expect(observadores).toHaveLength(0);
  });
});
