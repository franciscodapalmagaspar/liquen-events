// @vitest-environment jsdom
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aEscrever, procuraDaVista, VIEW_KEYS } from "./atalhos";
import { VIEWS, type View } from "./nav";

/**
 * Os atalhos do back office (BO 4). Prende-se:
 *  · o acorde «G» tem as vistas pedidas, sem letras repetidas, e não leva a
 *    vistas que ela mandou tirar do menu;
 *  · nenhuma letra do acorde é uma tecla solta de outra vista;
 *  · o `/` de cada vista aponta para um campo que EXISTE no código — se o
 *    nome do campo mudar, isto parte em vez de o `/` deixar de funcionar
 *    calado.
 */

const AQUI = __dirname;

describe("VIEW_KEYS — o acorde «G»", () => {
  it("leva aos cinco destinos novos", () => {
    const destinos = Object.values(VIEW_KEYS);
    for (const v of ["pagamentos", "temas", "material", "contratos", "fazer-proposta"] as View[]) {
      expect(destinos, `falta G + letra para ${v}`).toContain(v);
    }
  });

  it("cada letra é uma só tecla, minúscula, e cada destino tem uma só letra", () => {
    for (const k of Object.keys(VIEW_KEYS)) expect(k).toMatch(/^[a-z]$/);
    const destinos = Object.values(VIEW_KEYS);
    expect(new Set(destinos).size).toBe(destinos.length);
  });

  it("todos os destinos são vistas que existem", () => {
    for (const v of Object.values(VIEW_KEYS)) expect(VIEWS).toContain(v);
  });

  it("não leva a Clientes nem a Fornecedores — fora do menu e sem porta no ecrã", () => {
    expect(Object.values(VIEW_KEYS)).not.toContain("clientes");
    expect(Object.values(VIEW_KEYS)).not.toContain("fornecedores");
  });

  it("a Organização de propostas fica: a Visão Geral leva lá", () => {
    expect(VIEW_KEYS.k).toBe("kanban");
    const visao = readFileSync(join(AQUI, "Overview.tsx"), "utf8");
    expect(visao).toContain('onGo("kanban")');
  });

  it("o «g» e o «n» não são destinos (um arma o acorde, o outro é Novo pedido)", () => {
    expect(VIEW_KEYS.g).toBeUndefined();
    expect(VIEW_KEYS.n).toBeUndefined();
  });

  it("nenhuma letra nova choca com uma tecla solta do Calendário (só o «t», que é do acorde)", () => {
    const cal = readFileSync(join(AQUI, "Calendario.tsx"), "utf8");
    const soltas = [...cal.matchAll(/tecla === "([a-z])" && !acorde/g)].map((m) => m[1]);
    expect(soltas).toEqual(["t"]);
    expect(VIEW_KEYS.t).toBe("tarefas");
  });
});

describe("procuraDaVista — o «/»", () => {
  // Recursivo: os campos de procura vivem também nas pastas privadas das
  // vistas (`_pedidos/`, `_temas/`…) desde as fases 7 e 8 da estrutura do código.
  const fontes = (readdirSync(AQUI, { recursive: true }) as string[])
    .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
    .map((f) => readFileSync(join(AQUI, f), "utf8"))
    .join("\n");

  it("cada campo nomeado existe mesmo, com esse nome, num `aria-label`", () => {
    for (const v of VIEWS) {
      const seletor = procuraDaVista(v);
      if (!seletor) continue;
      const nome = /aria-label="([^"]+)"/.exec(seletor)![1];
      expect(fontes, `a procura de «${v}» chama-se «${nome}» e não está em lado nenhum`).toContain(
        `aria-label="${nome}"`,
      );
    }
  });

  it("os Pedidos e as Propostas têm procura; a Visão Geral e as Estatísticas não", () => {
    expect(procuraDaVista("pedidos")).toContain("Procurar pedidos");
    expect(procuraDaVista("propostas")).toBe('input[aria-label="Procurar propostas"]');
    expect(procuraDaVista("overview")).toBeNull();
    expect(procuraDaVista("estatisticas")).toBeNull();
  });
});

describe("aEscrever", () => {
  it("campos de texto, áreas e selectores contam; botões não", () => {
    const el = (tag: string) => document.createElement(tag);
    expect(aEscrever(el("input"))).toBe(true);
    expect(aEscrever(el("textarea"))).toBe(true);
    expect(aEscrever(el("select"))).toBe(true);
    expect(aEscrever(el("button"))).toBe(false);
  });

  it("uma caixa de seleção, um rádio ou um botão-input não são escrita (revisão · 2)", () => {
    for (const tipo of ["checkbox", "radio", "button", "submit", "reset"]) {
      const i = document.createElement("input");
      i.type = tipo;
      expect(aEscrever(i), tipo).toBe(false);
    }
    const texto = document.createElement("input");
    texto.type = "search";
    expect(aEscrever(texto)).toBe(true);
    expect(aEscrever(null)).toBe(false);
  });
});
