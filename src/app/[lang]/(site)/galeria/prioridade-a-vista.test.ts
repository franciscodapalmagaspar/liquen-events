// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MARGEM_DE_ANTECIPACAO } from "./prioridade-a-vista";

/**
 * Ela (16/10): «à medida que fazemos scroll… ainda dá para ver a foto
 * desfocada». A fotografia da grelha passa de `lazy` a `eager` quando o
 * mosaico fica a um ecrã e meio — o Safari do iPhone, sozinho, só a pede
 * muito perto do ecrã.
 */
type Cb = (e: Array<{ target: Element; isIntersecting: boolean }>) => void;
let observadores: Array<{ cb: Cb; margem?: string; alvos: Set<Element> }>;

beforeEach(() => {
  vi.resetModules();
  observadores = [];
  (globalThis as Record<string, unknown>).IntersectionObserver = class {
    alvos = new Set<Element>();
    constructor(cb: Cb, opcoes?: { rootMargin?: string }) {
      observadores.push({ cb, margem: opcoes?.rootMargin, alvos: this.alvos });
    }
    observe(el: Element) {
      this.alvos.add(el);
    }
    unobserve(el: Element) {
      this.alvos.delete(el);
    }
    disconnect() {}
  };
});
afterEach(() => {
  Reflect.deleteProperty(globalThis, "IntersectionObserver");
});

function mosaico() {
  const ancora = document.createElement("button");
  const img = document.createElement("img");
  img.loading = "lazy";
  return { ancora, img };
}

describe("antecipar a fotografia da grelha", () => {
  it("começa três ecrãs abaixo e um e meio acima (2/11)", () => {
    expect(MARGEM_DE_ANTECIPACAO).toBe("150% 0px 300% 0px");
  });

  it("perto do ecrã, a fotografia passa a eager", async () => {
    const { anteciparQuandoPerto } = await import("./prioridade-a-vista");
    const { ancora, img } = mosaico();
    anteciparQuandoPerto(ancora, img);
    const obs = observadores.find((o) => o.margem === MARGEM_DE_ANTECIPACAO)!;
    expect(obs.alvos.has(ancora)).toBe(true);
    expect(img.loading).toBe("lazy");
    obs.cb([{ target: ancora, isIntersecting: true }]);
    expect(img.loading).toBe("eager");
    expect(obs.alvos.has(ancora)).toBe(false); // uma vez só
  });

  it("uma fotografia que o browser já está a pedir não é tocada (cortava o pedido)", async () => {
    const { anteciparQuandoPerto } = await import("./prioridade-a-vista");
    const { ancora, img } = mosaico();
    Object.defineProperty(img, "currentSrc", { value: "/_img/g/x-768.avif" });
    anteciparQuandoPerto(ancora, img);
    const obs = observadores.find((o) => o.margem === MARGEM_DE_ANTECIPACAO)!;
    obs.cb([{ target: ancora, isIntersecting: true }]);
    expect(img.loading).toBe("lazy");
  });

  it("um mosaico que sai da grelha deixa de ser observado", async () => {
    const { anteciparQuandoPerto, esquecer } = await import("./prioridade-a-vista");
    const { ancora, img } = mosaico();
    anteciparQuandoPerto(ancora, img);
    const obs = observadores.find((o) => o.margem === MARGEM_DE_ANTECIPACAO)!;
    esquecer(img);
    expect(obs.alvos.has(ancora)).toBe(false);
  });

  it("uma fotografia que já é eager (a do topo) não é tocada", async () => {
    const { anteciparQuandoPerto } = await import("./prioridade-a-vista");
    const { ancora, img } = mosaico();
    img.loading = "eager";
    anteciparQuandoPerto(ancora, img);
    expect(observadores).toHaveLength(0);
  });
});
