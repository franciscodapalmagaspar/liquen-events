import { describe, expect, it } from "vitest";
import { painelParaGravar, type PainelDoPedido } from "./painel-do-pedido";

const PAINEL: PainelDoPedido = {
  estado: "cotado",
  preco: 1500,
  notas: "n",
  responsavel: "Rita",
  motivoDePerda: "",
  data: "2027-01-02",
  convidados: "120",
  local: "Monsaraz",
  nome: "Ana",
  email: "ana@x.pt",
  telefone: "",
};

describe("painelParaGravar", () => {
  it("um número que serve vai como número; o resto vai tal e qual", () => {
    expect(painelParaGravar(PAINEL, { ok: true, valor: 120 }, { guests: 80 })).toEqual({
      ...PAINEL,
      convidados: 120,
    });
  });

  it("um número que não serve não é uma alteração: fica o gravado", () => {
    expect(
      painelParaGravar(PAINEL, { ok: false, porque: "negativo" }, { guests: 80 }).convidados,
    ).toBe(80);
  });

  it("em branco também fica o gravado", () => {
    expect(painelParaGravar(PAINEL, { ok: true, valor: null }, { guests: 80 }).convidados).toBe(80);
  });

  it("zero é um número a sério", () => {
    expect(painelParaGravar(PAINEL, { ok: true, valor: 0 }, { guests: 80 }).convidados).toBe(0);
  });
});
