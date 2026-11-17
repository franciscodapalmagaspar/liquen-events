// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ShortcutsModal, { GROUPS, gruposDosAtalhos } from "./ShortcutsModal";
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
    // O ⌘1–4 só aparece na aplicação instalada (ver em baixo); as setas sempre.
    expect(screen.getByText("Anterior e seguinte")).toBeTruthy();
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

describe("revisão · 9 — só o que o browser deixa chegar, e as teclas do sistema certo", () => {
  const teclas = (g: ReturnType<typeof gruposDosAtalhos>) =>
    g.flatMap((x) => x.items.map((i) => `${i.keys.join("+")} ${i.label}`));

  it("num separador do browser não promete ⌘N nem ⌘T (o browser fica com eles)", () => {
    const t = teclas(gruposDosAtalhos({ mac: true, app: false }));
    expect(t.some((x) => x.startsWith("⌘+N"))).toBe(false);
    expect(t.some((x) => x.startsWith("⌘+T"))).toBe(false);
    // O «T» solto do Calendário continua lá.
    expect(t).toContain("T Hoje");
  });

  it("aberto como aplicação instalada, mostra-os", () => {
    const t = teclas(gruposDosAtalhos({ mac: true, app: true }));
    expect(t).toContain("⌘+N Nova tarefa");
    expect(t).toContain("⌘+N Novo evento");
  });

  it("fora do Mac, Ctrl em vez de ⌘", () => {
    const t = teclas(gruposDosAtalhos({ mac: false, app: false }));
    expect(t.some((x) => x.includes("⌘"))).toBe(false);
    expect(t).toContain("Ctrl+K Procurar em tudo e comandos");
  });
});

describe("2.ª revisão — ⌘/Ctrl+1–4 é do browser num separador", () => {
  it("só aparece na aplicação instalada", () => {
    const tem14 = (app: boolean) =>
      gruposDosAtalhos({ mac: true, app })
        .flatMap((g) => g.items)
        .some((i) => i.keys.includes("1–4"));
    expect(tem14(false)).toBe(false);
    expect(tem14(true)).toBe(true);
  });
});
