// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { MenuDeAccoes, type AccaoDeItem } from "./MenuDeAccoes";
import { MenuDeContexto, type PedidoDeMenu } from "../MenuDeContexto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS DOIS MENUS DA CASA — grupos, setas, foco e saída
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O «⋯» (`MenuDeAccoes`) e o botão direito (`MenuDeContexto`) desenham a mesma
 * lista de `AccaoDeItem`. A Fase 2 dos Temas pede-lhes quatro coisas que não
 * tinham: separadores entre grupos (com `role="separator"`), ↑/↓/Home/End,
 * o foco de volta a quem abriu o do botão direito, e a saída da casa nele.
 * E a regra de sempre: quem não usa o campo novo fica exactamente como estava.
 */
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const accoes = (agrupadas: boolean, onAccao = () => {}): AccaoDeItem[] => [
  { id: "abrir", rotulo: "Abrir", onAccao },
  { id: "ver", rotulo: "Pré-visualizar", onAccao },
  { id: "renomear", rotulo: "Renomear…", onAccao, separadorAntes: agrupadas },
  { id: "arquivar", rotulo: "Arquivar", onAccao, separadorAntes: agrupadas },
  { id: "eliminar", rotulo: "Eliminar…", onAccao, destrutiva: true, separadorAntes: agrupadas },
];

function abrirMenu(lista: AccaoDeItem[]) {
  render(<MenuDeAccoes accoes={lista} sobre="Terracotta" />);
  fireEvent.click(screen.getByRole("button", { name: "Acções de Terracotta" }));
  return screen.getByRole("menu");
}

describe("o menu do «⋯»", () => {
  it("desenha um `role=separator` antes de cada grupo declarado", () => {
    const menu = abrirMenu(accoes(true));
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(3);
    // O da destrutiva é UM só, mesmo sendo ela também a primeira destrutiva.
    expect(menu.querySelectorAll('[aria-hidden="true"].border-t')).toHaveLength(0);
  });

  it("sem o campo, fica como estava: só o filete decorativo antes da destrutiva", () => {
    const menu = abrirMenu(accoes(false));
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(0);
    expect(menu.querySelectorAll('[aria-hidden="true"].border-t')).toHaveLength(1);
  });

  it("↓ ↑ Home End andam pelos itens, e a seta não sobe para o ecrã de baixo", () => {
    const deFora = vi.fn();
    render(
      <div onKeyDown={deFora}>
        <MenuDeAccoes accoes={accoes(true)} sobre="Terracotta" />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Acções de Terracotta" }));
    const itens = screen.getAllByRole("menuitem");
    itens[0].focus();
    fireEvent.keyDown(itens[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(itens[1]);
    fireEvent.keyDown(itens[1], { key: "End" });
    expect(document.activeElement).toBe(itens[4]);
    // Dá a volta.
    fireEvent.keyDown(itens[4], { key: "ArrowDown" });
    expect(document.activeElement).toBe(itens[0]);
    fireEvent.keyDown(itens[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(itens[4]);
    fireEvent.keyDown(itens[4], { key: "Home" });
    expect(document.activeElement).toBe(itens[0]);
    expect(deFora).not.toHaveBeenCalled();
  });

  it("cresce a partir do «⋯», com a entrada dos menus", () => {
    const menu = abrirMenu(accoes(true));
    expect(menu.className).toContain("bo-entrada-menu");
    expect(menu.className).toContain("origin-top-right");
  });
});

/** Um botão que abre o menu de contexto, como o cartão de tema faz. */
function ComOrigem({ lista }: { lista: AccaoDeItem[] }) {
  const [pedido, setPedido] = useState<PedidoDeMenu | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => setPedido({ x: 40, y: 50, sobre: "Terracotta", accoes: lista })}
      >
        Cartão
      </button>
      <MenuDeContexto pedido={pedido} onFechar={() => setPedido(null)} />
    </>
  );
}

function abrirContexto(lista: AccaoDeItem[]) {
  render(<ComOrigem lista={lista} />);
  const cartao = screen.getByRole("button", { name: "Cartão" });
  cartao.focus();
  fireEvent.click(cartao);
  return { cartao, menu: screen.getByRole("menu") };
}

describe("o menu do botão direito", () => {
  it("separadores, e a entrada dos menus a crescer do ponteiro", () => {
    const { menu } = abrirContexto(accoes(true));
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(3);
    expect(menu.className).toContain("bo-entrada-menu");
    expect(menu.style.transformOrigin).not.toBe("");
  });

  it("sem o campo, nenhum `role=separator`", () => {
    const { menu } = abrirContexto(accoes(false));
    expect(menu.querySelectorAll('[role="separator"]')).toHaveLength(0);
  });

  it("↓ e End andam pelos itens", () => {
    abrirContexto(accoes(true));
    const itens = screen.getAllByRole("menuitem");
    // O foco entra no primeiro ao abrir.
    expect(document.activeElement).toBe(itens[0]);
    fireEvent.keyDown(itens[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(itens[1]);
    fireEvent.keyDown(itens[1], { key: "End" });
    expect(document.activeElement).toBe(itens[4]);
  });

  it("o Escape devolve o foco a quem abriu", () => {
    const { cartao } = abrirContexto(accoes(true));
    expect(document.activeElement).not.toBe(cartao);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(cartao);
  });

  it("escolher um item devolve o foco ANTES da acção", () => {
    let focadoNaAccao: Element | null = null;
    const { cartao } = abrirContexto(
      accoes(true, () => {
        focadoNaAccao = document.activeElement;
      }),
    );
    fireEvent.click(screen.getAllByRole("menuitem")[2]);
    expect(focadoNaAccao).toBe(cartao);
  });

  it("sai com a saída da casa: 200 ms já sem ser um menu, e depois desaparece", () => {
    vi.useFakeTimers();
    const { menu } = abrirContexto(accoes(true));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    // Ainda montado, mas já não é um menu nem se lhe chega pelo teclado.
    expect(screen.queryByRole("menu")).toBeNull();
    expect(menu.isConnected).toBe(true);
    expect(menu.className).toContain("bo-saida");
    expect(menu.getAttribute("aria-hidden")).toBe("true");
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(menu.isConnected).toBe(false);
  });
});

/**
 * ── O QUE A CAPTURA DA FASE 2 MOSTROU ──────────────────────────────────────
 *
 * Três defeitos que as classes não mostravam e o browser mostrou: no dedo os
 * itens apareciam CENTRADOS (o `.alvo-toque` centra o conteúdo e os itens não
 * diziam o contrário); «Adicionar fotografias…» partia-se em duas linhas; e o
 * menu do tema, com nove itens, aberto de um cartão da segunda fila, passava
 * o fundo da janela.
 */
describe("o que a captura mostrou", () => {
  it("os itens dos dois menus alinham à esquerda e não partem o rótulo", () => {
    abrirMenu(accoes(true));
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.className).toContain("justify-start");
      expect(item.className).toContain("whitespace-nowrap");
    }
    cleanup();
    abrirContexto(accoes(true));
    for (const item of screen.getAllByRole("menuitem")) {
      expect(item.className).toContain("justify-start");
      expect(item.className).toContain("whitespace-nowrap");
    }
  });

  it("sem lugar por baixo e com lugar por cima, o «⋯» abre para cima", () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    const alturaOriginal = window.innerHeight;
    // Uma janela de 900 px: o «⋯» a 560 e um painel de 430 px, que por baixo
    // acabaria nos 1000.
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      const menu = this.getAttribute("role") === "menu";
      const top = menu ? 600 : 560;
      const h = menu ? 430 : 40;
      return {
        top,
        bottom: top + h,
        height: h,
        left: 0,
        right: 40,
        width: 40,
        x: 0,
        y: top,
        toJSON() {},
      } as DOMRect;
    };
    try {
      Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
      const menu = abrirMenu(accoes(true));
      expect(menu.style.bottom).toBe("100%");
      expect(menu.style.top).toBe("auto");
      expect(menu.style.transformOrigin).toBe("bottom right");
    } finally {
      HTMLElement.prototype.getBoundingClientRect = original;
      Object.defineProperty(window, "innerHeight", { configurable: true, value: alturaOriginal });
    }
  });

  it("com lugar por baixo, fica como sempre esteve", () => {
    const menu = abrirMenu(accoes(true));
    expect(menu.style.bottom).toBe("");
  });
});

describe("a entrada dos menus no CSS", () => {
  // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
  // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
  // o browser os aplica no back office.
  const css =
    readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8") +
    readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8");
  it("é a `.bo-entrada` com a duração, a curva e a escala dos tokens — nenhum número novo", () => {
    const regra = /\.bo-entrada-menu\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    expect(regra).toContain("var(--transition-duration-quick)");
    expect(regra).toContain("var(--bo-escala-chegada)");
    expect(regra).not.toMatch(/\d+m?s\b/);
    expect(css).toMatch(
      /@supports[^{]*linear\(0, 1\)\)\s*\{\s*\.bo-entrada-menu\s*\{\s*animation-timing-function:\s*var\(--ease-quick\)/,
    );
  });
});
