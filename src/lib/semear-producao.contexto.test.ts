import { describe, expect, it } from "vitest";
import { contextoDoEvento } from "./semear-producao";

/**
 * Auditoria de 12/11, n.º 3: os noivos tiraram o cocktail, ela tirou-o da
 * proposta, e a lista de material continuava a pedir o material do cocktail
 * — porque o pedido (de há meses) ainda o tinha marcado.
 */
describe("o material segue a proposta, não o pedido antigo", () => {
  const quote = {
    decorPoints: ["cerimonia", "cocktail"],
    notes: "Gostávamos de um cocktail ao pôr do sol",
    guests: 80,
  };

  it("sem proposta, contam os pontos e as notas do pedido", () => {
    const c = contextoDoEvento(quote, []);
    expect(c.servicos).toEqual(["Cerimónia", "Cocktail"]);
    expect(c.texto).toMatch(/cocktail ao pôr do sol/);
  });

  it("com proposta, conta só a proposta — o cocktail que ela tirou não volta", () => {
    const c = contextoDoEvento(quote, [
      { title: "Decoração", items: [{ label: "Cerimónia", desc: "Arco floral" }] },
    ]);
    expect(c.servicos).toEqual(["Decoração Cerimónia"]);
    expect(c.texto.toLowerCase()).not.toContain("cocktail");
    expect(c.texto).toContain("Arco floral");
    expect(c.pax).toBe(80);
  });

  it("uma proposta só com linhas vazias conta como sem proposta", () => {
    const c = contextoDoEvento(quote, [{ title: "", items: [{ label: "" }] }]);
    expect(c.servicos).toEqual(["Cerimónia", "Cocktail"]);
  });
});
