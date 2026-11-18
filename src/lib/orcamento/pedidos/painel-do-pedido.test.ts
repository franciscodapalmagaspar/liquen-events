import type { Quote } from "@/lib/orcamento/types";
import { describe, expect, it } from "vitest";
import {
  camposNoPainel,
  lerPainel,
  seguirOServidor,
  type PainelDoPedido,
} from "./painel-do-pedido";

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

describe("o pedido que voltou do servidor: que campos do painel o seguem", () => {
  it("o campo que ela não mexeu segue o servidor", () => {
    expect(seguirOServidor("pendente", "pendente", "cotado")).toBe("cotado");
  });

  it("o campo que ela mexeu fica — é trabalho dela à espera de «Guardar»", () => {
    expect(seguirOServidor("1500", "1200", "1300")).toBe("1500");
  });

  it("camposNoPainel escreve cada campo como o painel o mostra", () => {
    const q = {
      id: "LQ-1",
      status: "cotado",
      quotedPrice: 1234,
      guests: 80,
      name: "Ana e Rui",
    } as unknown as Quote;
    expect(camposNoPainel(q)).toEqual({
      status: "cotado",
      preco: "1234",
      responsavel: "",
      data: "",
      convidados: "80",
      local: "",
      nome: "Ana e Rui",
      email: "",
      telefone: "",
    });
  });

  it("o preço do estúdio para o pedido B não chega ao campo do A: a guarda é de quem chama, com o pedido de antes", () => {
    const antes = camposNoPainel({
      id: "A",
      status: "pendente",
      quotedPrice: 900,
    } as unknown as Quote);
    const depois = camposNoPainel({
      id: "A",
      status: "pendente",
      quotedPrice: 1100,
    } as unknown as Quote);
    // Ela não mexeu no preço: segue. Mexeu: fica.
    expect(seguirOServidor("900", antes.preco, depois.preco)).toBe("1100");
    expect(seguirOServidor("950", antes.preco, depois.preco)).toBe("950");
  });
});

describe("seguirOServidor e textoMudou dão a mesma resposta", () => {
  it("um espaço no fim não conta como mexido: o campo segue o servidor", () => {
    expect(seguirOServidor("Ana", "Ana ", "Ana Marques")).toBe("Ana Marques");
  });
});
