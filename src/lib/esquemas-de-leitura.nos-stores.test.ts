import { describe, it, expect, vi } from "vitest";

/**
 * P6: os dois sítios onde o pedido e o documento do estúdio entram vindos da
 * base de dados passam pelo verificador — e devolvem o valor tal e qual.
 */
const verificados = vi.hoisted(() => [] as { tipo: string; id: string }[]);
vi.mock("./esquemas-de-leitura", () => ({
  registarSeForaDoEsquema: (tipo: string, id: string) => {
    verificados.push({ tipo, id });
    return false;
  },
}));

const { mapper: pedidos } = await import("./quotes-store");
const { mapper: propostas } = await import("./proposals-store");

describe("os stores verificam o que leem (só registo)", () => {
  it("o pedido: pelo id que vem dentro de `data`, e devolvido sem mudanças", () => {
    const data = { id: "LIQ-AAA-1", status: "pendente" };
    expect(pedidos.fromRow({ data })).toBe(data);
    expect(verificados).toContainEqual({ tipo: "pedido", id: "LIQ-AAA-1" });
  });

  it("o documento do estúdio: verificado e devolvido sem mudanças", () => {
    const doc = { ref: "x" };
    const p = propostas.fromRow({ id: "p-1", doc });
    expect(p.doc).toBe(doc);
    expect(verificados).toContainEqual({ tipo: "documento-do-estudio", id: "p-1" });
  });
});
