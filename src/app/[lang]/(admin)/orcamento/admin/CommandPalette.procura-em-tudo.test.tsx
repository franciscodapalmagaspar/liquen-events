// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommandPalette, { type Command } from "./CommandPalette";
import type { GrupoDaProcura } from "./procura-em-tudo";

/**
 * A paleta procura em tudo (BO 4): os grupos que lhe chegam entram com texto
 * escrito, no máximo quatro por grupo, e escolher um corre a porta dele. E a
 * paleta, sozinha, não faz pedido nenhum.
 */

const NAV: Command[] = [{ id: "nav-tarefas", label: "Tarefas", group: "Navegar", run: vi.fn() }];

function grupo(nome: string, n: number, run = vi.fn()): GrupoDaProcura {
  return {
    nome,
    itens: Array.from({ length: n }, (_, i) => ({
      id: `${nome}-${i}`,
      label: `Florista ${nome} ${i + 1}`,
      hint: "dica",
      campos: [`Florista ${nome} ${i + 1}`],
      run,
    })),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CommandPalette — procura em tudo", () => {
  it("sem texto não mostra os grupos; com texto, no máximo quatro por grupo", async () => {
    const user = userEvent.setup();
    render(
      <CommandPalette
        open
        onClose={vi.fn()}
        navCommands={NAV}
        quotes={[]}
        onOpenQuote={vi.fn()}
        grupos={[grupo("Tarefas", 6), grupo("Temas", 2)]}
      />,
    );
    const campo = screen.getByRole("combobox", { name: /pesquisar/i });
    await waitFor(() => expect(campo).toHaveFocus());
    expect(screen.queryByRole("group", { name: "Tarefas" })).toBeNull();

    await user.type(campo, "florista");
    const tarefas = screen.getByRole("group", { name: "Tarefas" });
    expect(within(tarefas).getAllByRole("option")).toHaveLength(4);
    expect(
      within(screen.getByRole("group", { name: "Temas" })).getAllByRole("option"),
    ).toHaveLength(2);
  });

  it("escolher um resultado corre a porta dele e fecha a paleta", async () => {
    const user = userEvent.setup();
    const abrir = vi.fn();
    const fechar = vi.fn();
    render(
      <CommandPalette
        open
        onClose={fechar}
        navCommands={NAV}
        quotes={[]}
        onOpenQuote={vi.fn()}
        grupos={[grupo("Calendário", 1, abrir)]}
      />,
    );
    await user.type(screen.getByRole("combobox", { name: /pesquisar/i }), "florista");
    await user.click(screen.getByRole("option", { name: /Florista Calendário 1/ }));
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(fechar).toHaveBeenCalled();
  });

  it("procurar não faz pedido nenhum ao servidor", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(
      <CommandPalette
        open
        onClose={vi.fn()}
        navCommands={NAV}
        quotes={[]}
        onOpenQuote={vi.fn()}
        grupos={[grupo("Material", 3)]}
      />,
    );
    await user.type(screen.getByRole("combobox", { name: /pesquisar/i }), "flor");
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
