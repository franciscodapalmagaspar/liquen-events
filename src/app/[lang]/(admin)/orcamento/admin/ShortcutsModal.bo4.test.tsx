// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ShortcutsModal, { GROUPS } from "./ShortcutsModal";
import { VIEW_KEYS } from "./atalhos";

/**
 * A folha dos atalhos mostra os que EXISTEM (BO 4): os das Tarefas, do
 * Calendário e da Biblioteca estavam escondidos, e o acorde «G» lê a mesma
 * tabela que o ouvinte — não pode voltar a prometer uma letra que não faz nada.
 */

afterEach(cleanup);

const grupo = (titulo: string) => GROUPS.find((g) => g.title.startsWith(titulo));

describe("ShortcutsModal — o que existe, e só isso", () => {
  it("o acorde «G» é exactamente o `VIEW_KEYS`", () => {
    const nav = grupo("Navegar")!;
    expect(nav.items.map((i) => i.keys.join(""))).toEqual(
      Object.keys(VIEW_KEYS).map((k) => `G${k.toUpperCase()}`),
    );
    const rotulos = nav.items.map((i) => i.label);
    for (const r of ["Pagamentos", "Temas", "Material", "Propostas Aceites", "Fazer proposta"]) {
      expect(rotulos).toContain(r);
    }
    expect(rotulos).not.toContain("Clientes");
    expect(rotulos).not.toContain("Fornecedores");
  });

  it("as Tarefas, o Calendário e a Biblioteca de temas têm o seu grupo", () => {
    for (const t of ["Tarefas", "Calendário", "Biblioteca de temas", "Pedidos"]) {
      expect(grupo(t), `falta o grupo «${t}»`).toBeTruthy();
    }
    render(<ShortcutsModal open onClose={vi.fn()} />);
    expect(screen.getByText("Tarefa anterior e seguinte")).toBeTruthy();
    expect(screen.getByText("Eliminar a tarefa")).toBeTruthy();
    expect(screen.getByText("Dia, semana, mês, ano")).toBeTruthy();
    expect(screen.getByText("Selecionar todas as fotos")).toBeTruthy();
    expect(screen.getByText("Procurar na vista aberta")).toBeTruthy();
  });

  it("nenhum grupo repete um rótulo (são a chave de cada linha)", () => {
    for (const g of GROUPS) {
      const r = g.items.map((i) => i.label);
      expect(new Set(r).size, g.title).toBe(r.length);
    }
  });
});
