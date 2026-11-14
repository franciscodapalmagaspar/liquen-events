// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MenuDeAccoes } from "./MenuDeAccoes";
import { MenuDeContexto, type PedidoDeMenu } from "../MenuDeContexto";
import { PRAZO_MS } from "./fechar-por-fora";

/**
 * O toque (ou o clique) que fecha um menu SÓ fecha (revisão de 14/11): com o
 * menu de contexto do calendário aberto, um toque noutro dia fechava-o E abria
 * «Novo no calendário»; no «⋯ Acções» das tarefas, clicar noutra linha para o
 * fechar abria a tarefa. O gesto a sério, com o dedo, mede-se no passeio
 * `e2e/o-iphone-com-barras.spec.ts`; aqui prende-se com o rato.
 */
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** O que o browser manda quando se carrega num sítio: pointerdown, depois click. */
function carregar(el: Element) {
  fireEvent.pointerDown(el);
  fireEvent.mouseDown(el);
  fireEvent.mouseUp(el);
  fireEvent.click(el);
}

function ComMenuDeContexto({ aoDia }: { aoDia: () => void }) {
  const [pedido, setPedido] = useState<PedidoDeMenu | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={aoDia}
        onPointerDown={aoDia}
        onContextMenu={(e) => {
          e.preventDefault();
          setPedido({
            x: 10,
            y: 10,
            sobre: "o dia",
            accoes: [{ id: "a", rotulo: "Novo", onAccao: () => {} }],
          });
        }}
      >
        Outro dia
      </button>
      <MenuDeContexto pedido={pedido} onFechar={() => setPedido(null)} />
    </>
  );
}

describe("o clique que fecha um menu não faz mais nada", () => {
  it("menu de contexto: carregar noutro dia só fecha — nem `pointerdown` nem `click` lá chegam", () => {
    const aoDia = vi.fn();
    render(<ComMenuDeContexto aoDia={aoDia} />);
    const dia = screen.getByRole("button", { name: "Outro dia" });
    fireEvent.contextMenu(dia);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    carregar(dia);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(aoDia).not.toHaveBeenCalled();
    // E só esse: com o menu fechado, o dia volta a responder.
    carregar(dia);
    expect(aoDia).toHaveBeenCalledTimes(2); // o pointerdown e o click
  });

  it("menu do «⋯»: clicar noutra linha só fecha o menu, e a linha não abre", () => {
    const abrirLinha = vi.fn();
    render(
      <>
        <MenuDeAccoes
          accoes={[{ id: "a", rotulo: "Concluir", onAccao: () => {} }]}
          sobre="Tarefa A"
        />
        <button type="button" onClick={abrirLinha}>
          Tarefa B
        </button>
      </>,
    );
    const abridor = screen.getByRole("button", { name: "Acções de Tarefa A" });
    fireEvent.click(abridor);
    expect(abridor).toHaveAttribute("aria-expanded", "true");
    carregar(screen.getByRole("button", { name: "Tarefa B" }));
    expect(abridor).toHaveAttribute("aria-expanded", "false");
    expect(abrirLinha).not.toHaveBeenCalled();
    carregar(screen.getByRole("button", { name: "Tarefa B" }));
    expect(abrirLinha).toHaveBeenCalledTimes(1);
  });

  it("um toque que rolou (sem `click`) não deixa o próximo clique engolido", () => {
    vi.useFakeTimers();
    const abrirLinha = vi.fn();
    render(
      <>
        <MenuDeAccoes
          accoes={[{ id: "a", rotulo: "Concluir", onAccao: () => {} }]}
          sobre="Tarefa A"
        />
        <button type="button" onClick={abrirLinha}>
          Tarefa B
        </button>
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Acções de Tarefa A" }));
    const b = screen.getByRole("button", { name: "Tarefa B" });
    fireEvent.pointerDown(b); // fecha; o dedo rolou e o browser não mandou click
    act(() => void vi.advanceTimersByTime(PRAZO_MS + 1));
    fireEvent.click(b); // um clique sem pointerdown (teclado, leitor de ecrã)
    expect(abrirLinha).toHaveBeenCalledTimes(1);
  });
});
