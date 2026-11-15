// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import {
  ATRIBUTO,
  HISTERESE,
  ONDE_ENCOLHEM,
  TOPO,
  proximoEstado,
  useBarrasQueEncolhem,
  type EstadoDasBarras,
} from "./barras-que-encolhem";

/**
 * As barras do «Fazer proposta» encolhem ao descer e voltam ao subir (15/11).
 * A decisão é uma função pura: aqui está a histerese (um dedo que pára não as
 * faz tremer), o topo (sempre inteiras) e o fundo da página (a correcção do
 * browser quando a página encolhe não é um gesto).
 */

const FUNDO = 5000;
const passar = (ys: number[], de: EstadoDasBarras = { encolhidas: false, ancora: 0 }) =>
  ys.reduce((e, y) => proximoEstado(e, y, { fundo: FUNDO }), de);

describe("proximoEstado", () => {
  it("no topo estão sempre inteiras", () => {
    expect(
      proximoEstado({ encolhidas: true, ancora: 900 }, TOPO, { fundo: FUNDO }).encolhidas,
    ).toBe(false);
    expect(proximoEstado({ encolhidas: true, ancora: 900 }, 0, { fundo: FUNDO }).encolhidas).toBe(
      false,
    );
  });

  it("a descer mais do que a histerese, encolhem", () => {
    expect(passar([100, 100 + HISTERESE + 1], { encolhidas: false, ancora: 100 }).encolhidas).toBe(
      true,
    );
  });

  it("um dedo lento (1 px por fotograma) também as encolhe — conta-se desde a viragem", () => {
    const ys = Array.from({ length: 40 }, (_, i) => 100 + i);
    expect(passar(ys, { encolhidas: false, ancora: 100 }).encolhidas).toBe(true);
  });

  it("tremer dentro da histerese não muda nada", () => {
    const e = passar([300, 305, 298, 306, 300], { encolhidas: true, ancora: 300 });
    expect(e.encolhidas).toBe(true);
    const f = passar([300, 305, 296, 304, 301], { encolhidas: false, ancora: 300 });
    expect(f.encolhidas).toBe(false);
  });

  it("a subir mais do que a histerese desde o ponto mais baixo, voltam", () => {
    const e = passar([400, 800, 800 - HISTERESE - 1], { encolhidas: false, ancora: 300 });
    expect(e.encolhidas).toBe(false);
  });

  it("no fundo da página não decide — a página a encolher não é um gesto", () => {
    const e = proximoEstado({ encolhidas: true, ancora: 1200 }, 1100, { fundo: 1100 });
    expect(e.encolhidas).toBe(true);
    const f = proximoEstado({ encolhidas: false, ancora: 900 }, 1100, { fundo: 1100 });
    expect(f.encolhidas).toBe(false);
  });
});

describe("useBarrasQueEncolhem", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute(ATRIBUTO);
  });

  function ecra(corresponde: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => ({
        matches: q === ONDE_ENCOLHEM ? corresponde : false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => {
      // Síncrono, e devolve 0 — o id que um fotograma já corrido deixa.
      f(0);
      return 0;
    });
  }

  it("no computador não liga nada — nem o atributo", () => {
    ecra(false);
    renderHook(() => useBarrasQueEncolhem());
    expect(document.documentElement.hasAttribute(ATRIBUTO)).toBe(false);
  });

  it("no telemóvel: inteiras ao montar, encolhidas ao descer, e o atributo sai ao desmontar", () => {
    ecra(true);
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 5000,
    });
    const { unmount } = renderHook(() => useBarrasQueEncolhem());
    expect(document.documentElement.getAttribute(ATRIBUTO)).toBe("inteiras");
    act(() => {
      window.scrollY = 400;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(document.documentElement.getAttribute(ATRIBUTO)).toBe("encolhidas");
    act(() => {
      window.scrollY = 0;
      window.dispatchEvent(new Event("scroll"));
    });
    expect(document.documentElement.getAttribute(ATRIBUTO)).toBe("inteiras");
    unmount();
    expect(document.documentElement.hasAttribute(ATRIBUTO)).toBe(false);
  });

  function cabecalhoComBotao() {
    Object.defineProperty(document.documentElement, "scrollHeight", {
      configurable: true,
      value: 5000,
    });
    const cabecalho = document.createElement("header");
    cabecalho.setAttribute("data-barra-do-topo", "");
    const botao = document.createElement("button");
    cabecalho.appendChild(botao);
    document.body.appendChild(cabecalho);
    return { cabecalho, botao };
  }
  const rolar = (y: number) =>
    act(() => {
      window.scrollY = y;
      window.dispatchEvent(new Event("scroll"));
    });

  // Revisão de 15/11, n.º 5: escondido, o cabeçalho continuava no leitor de
  // ecrã e no Tab. Fica `inert` enquanto está escondido, e volta ao subir.
  it("o cabeçalho escondido fica inerte (fora do Tab e do leitor de ecrã); ao subir volta", () => {
    ecra(true);
    const { cabecalho } = cabecalhoComBotao();
    rolar(0);
    const { unmount } = renderHook(() => useBarrasQueEncolhem());
    expect(cabecalho.hasAttribute("inert")).toBe(false);
    rolar(400);
    expect(document.documentElement.getAttribute(ATRIBUTO)).toBe("encolhidas");
    expect(cabecalho.hasAttribute("inert")).toBe(true);
    rolar(0);
    expect(document.documentElement.getAttribute(ATRIBUTO)).toBe("inteiras");
    expect(cabecalho.hasAttribute("inert")).toBe(false);
    rolar(400);
    unmount();
    expect(cabecalho.hasAttribute("inert"), "ao sair do estúdio, nada fica inerte").toBe(false);
    cabecalho.remove();
  });

  // N.º 4: com o foco no «← anterior» (um acessório), encolher escondia-o e o
  // foco caía no `body`. Enquanto o foco lá estiver, não encolhem.
  it("com o foco num acessório da barra (ou no cabeçalho), não encolhem", () => {
    ecra(true);
    const { cabecalho, botao: noCabecalho } = cabecalhoComBotao();
    const anterior = document.createElement("button");
    anterior.setAttribute("data-acessorio-da-barra", "");
    document.body.appendChild(anterior);
    rolar(0);
    const { unmount } = renderHook(() => useBarrasQueEncolhem());
    anterior.focus();
    rolar(400);
    expect(document.documentElement.getAttribute(ATRIBUTO)).toBe("inteiras");
    expect(document.activeElement).toBe(anterior);
    noCabecalho.focus();
    rolar(800);
    expect(document.documentElement.getAttribute(ATRIBUTO)).toBe("inteiras");
    // O foco sai dali: o gesto seguinte já as encolhe.
    noCabecalho.blur();
    rolar(1200);
    expect(document.documentElement.getAttribute(ATRIBUTO)).toBe("encolhidas");
    unmount();
    anterior.remove();
    cabecalho.remove();
  });
});

// N.º 6: uma janela de computador estreita (rato) não pode ver o cabeçalho
// desaparecer. Só ecrãs de toque abaixo do computador.
describe("ONDE_ENCOLHEM", () => {
  it("pede toque em todos os ramos", () => {
    for (const ramo of ONDE_ENCOLHEM.split(",")) {
      expect(ramo).toMatch(/\(pointer: coarse\)/);
    }
  });
});
