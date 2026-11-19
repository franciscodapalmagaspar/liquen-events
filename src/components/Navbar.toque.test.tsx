// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import Navbar from "./Navbar";
import { LocaleProvider } from "./LocaleProvider";
import { getDictionary, pickChromeDict } from "@/lib/i18n";

/**
 * Ela (16/10): «a entrada nas páginas não está muito boa, parece que está assim
 * meia coisa». Filmado no telemóvel: depois de tocar num item do menu, o menu
 * ficava meio segundo PARADO, sem sinal de que o toque tinha sido recebido,
 * enquanto a página nova se montava. Agora o destino acende logo e os outros
 * esmorecem — no mesmo instante do toque, antes de a página chegar.
 */
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
}));

const dicionario = await getDictionary("pt");

beforeEach(() => {
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
});

describe("o menu do telemóvel responde ao toque no mesmo instante", () => {
  it("o destino acende e os outros esmorecem, antes de a página nova chegar", () => {
    render(
      <LocaleProvider locale="pt" dict={pickChromeDict(dicionario)}>
        <Navbar />
      </LocaleProvider>,
    );
    act(() => void fireEvent.click(screen.getAllByRole("button", { name: /menu/i })[0]));
    const nav = screen.getByRole("navigation", { name: dicionario.nav.menuLabel });
    const ligacao = (nome: RegExp) =>
      [...nav.querySelectorAll("a")].find((a) => nome.test(a.textContent ?? ""))!;
    const sobre = ligacao(/sobre/i);
    const galeria = ligacao(/galeria/i);
    expect(galeria.style.opacity).toBe("1");

    // O clique não chega a navegar aqui (sem router a sério): só interessa o
    // que muda no ecrã no instante do toque.
    sobre.addEventListener("click", (e) => e.preventDefault(), { once: true });
    act(() => void fireEvent.click(sobre));

    expect(sobre.className).toContain("text-white");
    // O destino fica em negrito (o menu «Capa», 19/11).
    expect(sobre.className).toContain("font-semibold");
    expect(galeria.style.opacity).toBe("0.3");
    // Esmorecer é só opacidade, e rápido: a placa gráfica anima-o sozinha.
    expect(galeria.style.transition).toContain("opacity 0.15s");
  });
});
