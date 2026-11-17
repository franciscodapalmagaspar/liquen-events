import { describe, expect, it } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import { diasAEsperar, pedidoParado } from "./espera-na-lista";
import { mesmasNotas } from "./notas-automaticas";
import { proximaAccaoDoPedido } from "./proxima-accao";
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

describe("notas automáticas", () => {
  it("compara por campos, não por identidade", () => {
    const a = { id: "1", adminNotes: "x", lostReason: null };
    expect(mesmasNotas(a, { ...a })).toBe(true);
    expect(mesmasNotas(a, { ...a, lostReason: "" })).toBe(false);
  });
});

describe("a espera na lista", () => {
  const agora = Date.parse("2026-11-17T12:00:00Z");
  it("um fechado não está à espera; um aberto conta dias inteiros", () => {
    expect(
      diasAEsperar({ status: "aceite", submittedAt: "2026-01-01" } as Quote, agora),
    ).toBeNull();
    expect(
      diasAEsperar({ status: "cotado", submittedAt: "2026-11-10T13:00:00Z" } as Quote, agora),
    ).toBe(6);
  });

  it("parado: aberto e catorze dias ou mais", () => {
    expect(pedidoParado("cotado", 14)).toBe(true);
    expect(pedidoParado("cotado", 13)).toBe(false);
    expect(pedidoParado("aceite", 99)).toBe(false);
  });
});

describe("a próxima acção", () => {
  it("perdido reabre; tudo feito revê a produção; senão, pelo degrau", () => {
    const p = (o: Partial<{ perdido: boolean; currentIndex: number; allDone: boolean }>) =>
      proximaAccaoDoPedido({ perdido: false, currentIndex: 0, allDone: false, ...o }).tab;
    expect(p({ perdido: true })).toBe("gestao");
    expect(p({ allDone: true })).toBe("producao");
    expect([0, 1, 2, 3, 4].map((i) => p({ currentIndex: i }))).toEqual([
      "comunicacao",
      "comunicacao",
      "financeiro",
      "producao",
      "producao",
    ]);
  });
});
