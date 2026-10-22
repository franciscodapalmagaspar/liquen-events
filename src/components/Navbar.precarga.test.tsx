// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import Navbar from "./Navbar";
import { LocaleProvider } from "./LocaleProvider";
import { getDictionary, pickChromeDict } from "@/lib/i18n";

/**
 * O MENU FECHADO NÃO PRÉ-CARREGA NADA — E NENHUM LINK FORÇA A ROTA INTEIRA.
 *
 * Medido a 390×844 em `next start`, primeira visita: com `prefetch` forçado e o
 * painel fechado só `invisible` (que o observador do `<Link>` conta como
 * visível), `/` pedia 383 KB de pré-carga e `/galeria` 421 KB. Sem o forçado e
 * com o menu fechado em `prefetch={false}`: 93 KB e 68 KB.
 *
 * O `<Link>` não deixa o `prefetch` no DOM; por isso aqui ele é substituído por
 * um `<a>` que o escreve num atributo, e é isso que se lê.
 */
vi.mock("next/link", () => ({
  default: ({
    prefetch,
    transitionTypes: _t,
    ...props
  }: ComponentProps<"a"> & {
    prefetch?: boolean | null;
    transitionTypes?: string[];
  }) => <a data-prefetch={prefetch === undefined ? "omissao" : String(prefetch)} {...props} />,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
}));

const dicionario = await getDictionary("pt");

beforeEach(() => {
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

function montar() {
  render(
    <LocaleProvider locale="pt" dict={pickChromeDict(dicionario)}>
      <Navbar />
    </LocaleProvider>,
  );
  return screen.getByRole("dialog", { hidden: true });
}

/** Os links de navegação do painel (os cinco itens e os dois serviços em destaque; a CTA do fundo não conta). */
const destinosDoMenu = (painel: HTMLElement) =>
  [...painel.querySelectorAll<HTMLAnchorElement>("a[data-prefetch]")].filter(
    (a) => !a.getAttribute("href")?.includes("orcamento"),
  );

describe("a pré-carga do menu do telemóvel", () => {
  it("com o menu FECHADO, nenhum destino do painel pré-carrega", () => {
    const painel = montar();
    const links = destinosDoMenu(painel);
    // Controlo positivo: os sete destinos estão mesmo montados (só invisíveis).
    expect(links.length).toBe(7);
    for (const a of links) expect(a.dataset.prefetch, a.getAttribute("href")!).toBe("false");
  });

  it("com o menu ABERTO, pré-carregam pela omissão — a página está cá quando o dedo chega", () => {
    const painel = montar();
    act(() => void fireEvent.click(screen.getAllByRole("button", { name: /menu/i })[0]));
    for (const a of destinosDoMenu(painel)) {
      expect(a.dataset.prefetch, a.getAttribute("href")!).toBe("omissao");
    }
  });

  it("nenhum link da barra força a rota inteira (`prefetch={true}`)", () => {
    montar();
    const forcados = [...document.querySelectorAll<HTMLAnchorElement>('a[data-prefetch="true"]')];
    expect(forcados.map((a) => a.getAttribute("href"))).toEqual([]);
  });
});
