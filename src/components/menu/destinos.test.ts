import { describe, expect, it } from "vitest";
import { DESTINOS_DO_MENU, destinoAtivo, posicaoNaOrdem, sentidoDaPassagem } from "./destinos";

describe("as páginas do menu", () => {
  it("são as cinco, pela ordem do site", () => {
    expect(DESTINOS_DO_MENU.map((d) => d.href)).toEqual([
      "/sobre",
      "/servicos",
      "/galeria",
      "/clientes",
      "/contacto",
    ]);
  });

  it("uma subpágina acende a mãe, e a entrada não acende nada", () => {
    expect(destinoAtivo("/servicos/casamentos", "/servicos")).toBe(true);
    expect(destinoAtivo("/servicos", "/servicos")).toBe(true);
    expect(destinoAtivo("/servicos-extra", "/servicos")).toBe(false);
    expect(destinoAtivo("/", "/sobre")).toBe(false);
  });

  it("a passagem anda para a frente para a direita, e para trás para a esquerda", () => {
    expect(sentidoDaPassagem("/", "/sobre")).toBe("nav-forward");
    expect(sentidoDaPassagem("/galeria", "/sobre")).toBe("nav-back");
    expect(sentidoDaPassagem("/galeria", "/galeria")).toBe("nav-forward");
    expect(sentidoDaPassagem("/servicos/casamentos", "/sobre")).toBe("nav-back");
  });

  it("uma página fora da ordem conta como a entrada", () => {
    expect(posicaoNaOrdem("/orcamento")).toBe(0);
  });
});
