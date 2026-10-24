// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";

/**
 * O aquecimento dos heróis das outras páginas pede o MESMO ficheiro que o
 * `<picture>` delas vai escolher: AVIF onde o browser o lê. Antes pedia sempre
 * o WebP, que a página seguinte nunca usava — e o herói dela vinha a frio, por
 * trás do desfoque (ela, 16/10: «ainda dá para ver a foto desfocada»).
 */
vi.mock("@/lib/use-public-pathname", () => ({ usePublicPathname: () => "/" }));
vi.mock("@/lib/onIdle", () => ({
  onIdle: (cb: () => void) => {
    cb();
    return () => undefined;
  },
}));

let pedidos: string[];
let descodificadas: string[];
let avif: boolean;
beforeEach(() => {
  vi.resetModules();
  pedidos = [];
  descodificadas = [];
  class FalsaImagem {
    width = 0;
    ultimo = "";
    decode() {
      descodificadas.push(this.ultimo);
      return Promise.resolve();
    }
    decoding = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(v: string) {
      if (v.startsWith("data:image/avif")) {
        queueMicrotask(() => {
          if (avif) {
            this.width = 1;
            this.onload?.();
          } else this.onerror?.();
        });
        return;
      }
      this.ultimo = v;
      pedidos.push(v);
    }
  }
  vi.stubGlobal("Image", FalsaImagem);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function aquecer() {
  const { default: HeroWarm } = await import("./HeroWarm");
  render(<HeroWarm />);
  await act(async () => {
    for (let k = 0; k < 4; k++) await Promise.resolve();
  });
}

describe("HeroWarm", () => {
  it("num browser com AVIF, aquece os AVIF que as páginas vão usar", async () => {
    avif = true;
    await aquecer();
    expect(pedidos.length).toBeGreaterThan(0);
    expect(pedidos.every((u) => u.endsWith(".avif"))).toBe(true);
    expect(pedidos.some((u) => u.includes("EW1_1330"))).toBe(true); // /servicos
  });

  it("sem AVIF, aquece os WebP", async () => {
    avif = false;
    await aquecer();
    expect(pedidos.length).toBeGreaterThan(0);
    expect(pedidos.every((u) => u.endsWith(".webp"))).toBe(true);
  });
});

describe("HeroWarm — no toque, a fotografia do destino fica pronta (ela, 24/10)", () => {
  it("rotaDoHref tira a língua e ignora outros sítios", async () => {
    const { rotaDoHref } = await import("./HeroWarm");
    const o = "https://liquen-events.com";
    expect(rotaDoHref("/clientes", o)).toBe("/clientes");
    expect(rotaDoHref("/en/clientes/", o)).toBe("/clientes");
    expect(rotaDoHref("/en", o)).toBe("/");
    expect(rotaDoHref("https://instagram.com/x", o)).toBeNull();
  });

  it("tocar num link para /clientes pede e DESCODIFICA o herói de /clientes", async () => {
    avif = true;
    const { default: HeroWarm } = await import("./HeroWarm");
    render(<HeroWarm />);
    // Um link como os do sítio (o `<Link>` do Next desenha um `<a>`).
    const link = document.createElement("a");
    link.setAttribute("href", "/en/clientes");
    link.textContent = "Clientes";
    document.body.appendChild(link);
    descodificadas = [];
    link.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await act(async () => {
      for (let k = 0; k < 4; k++) await Promise.resolve();
    });
    expect(descodificadas.some((u) => u.includes("EW1_1393") && u.endsWith(".avif"))).toBe(true);
    link.remove();
  });

  it("um link sem herói não pede nada", async () => {
    avif = true;
    const { prepararHeroiDe } = await import("./HeroWarm");
    prepararHeroiDe("/orcamento");
    await act(async () => {
      for (let k = 0; k < 4; k++) await Promise.resolve();
    });
    expect(descodificadas).toEqual([]);
  });
});
