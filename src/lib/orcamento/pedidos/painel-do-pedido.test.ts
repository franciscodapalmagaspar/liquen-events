import { describe, expect, it } from "vitest";
import { lerPainel, type PainelDoPedido } from "./painel-do-pedido";

const PAINEL: PainelDoPedido = {
  estado: "pendente",
  preco: 1000,
  notas: "n",
  responsavel: "Rita",
  motivoDePerda: "",
  data: "2026-09-20",
  convidados: "80",
  local: "Évora",
  nome: "Ana",
  email: "ana@ex.pt",
  telefone: "+351910000000",
};

describe("lerPainel", () => {
  it("os convidados lidos substituem o que está escrito; o resto passa igual", () => {
    expect(lerPainel(PAINEL, { ok: true, valor: 82 }, { guests: 80 })).toEqual({
      ...PAINEL,
      convidados: 82,
    });
  });

  it("um número que não serve fica o gravado — não é uma alteração", () => {
    expect(lerPainel(PAINEL, { ok: false, porque: "x" }, { guests: 80 }).convidados).toBe(80);
  });

  it("um campo vazio que se pode deixar vazio também fica o gravado", () => {
    expect(lerPainel(PAINEL, { ok: true, valor: null }, { guests: 120 }).convidados).toBe(120);
  });

  it("não muda o painel que recebe", () => {
    const antes = { ...PAINEL };
    lerPainel(PAINEL, { ok: true, valor: 1 }, { guests: 0 });
    expect(PAINEL).toEqual(antes);
  });
});
