import { describe, expect, it } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import { mesLegivel, oQueSePerdeComOPedido, shortRef, textoDoPreco } from "./textos-do-pedido";

describe("textos do pedido", () => {
  it("a referência curta", () => {
    expect(shortRef("LIQ-MRR1L78R-438B649E86343C27")).toBe("LIQ-MRR1L78R…3C27");
    expect(shortRef("ABCDEFGHIJKL")).toBe("ABCDEFGH…IJKL");
    expect(shortRef("CURTO")).toBe("CURTO");
  });

  it("o mês por extenso, e o que não é mês fica como veio", () => {
    expect(mesLegivel("2027-05")).toBe("maio de 2027");
    expect(mesLegivel("lixo")).toBe("lixo");
  });

  it("o preço do campo: zero é um preço escrito, a falta é vazio", () => {
    expect(textoDoPreco({ quotedPrice: 0 } as Quote)).toBe("0");
    expect(textoDoPreco({} as Quote)).toBe("");
  });

  it("o que se perde com o pedido: só o que existe, contado", () => {
    expect(oQueSePerdeComOPedido(null)).toEqual([]);
    expect(oQueSePerdeComOPedido({} as Quote)).toEqual([]);
    const q = {
      messages: [{}],
      payments: [{}, {}],
      quotedPrice: 1500,
    } as unknown as Quote;
    const linhas = oQueSePerdeComOPedido(q);
    expect(linhas.slice(0, 2)).toEqual(["1 mensagem trocada", "2 pagamentos registados"]);
    expect(linhas[2]).toMatch(/^o valor combinado, 1\s?500,00\s€$/);
  });
});
