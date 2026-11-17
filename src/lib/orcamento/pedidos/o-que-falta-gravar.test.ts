import { describe, expect, it } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import { oQueFaltaGravar, type PainelPorGravar } from "./o-que-falta-gravar";

const PEDIDO = {
  id: "LQ-1",
  status: "pendente",
  quotedPrice: 1000,
  adminNotes: "notas",
  assignedTo: "Rita",
  lostReason: "",
  date: "2026-09-20",
  guests: 80,
  location: "Évora",
  name: "Ana",
  email: "ana@ex.pt",
  phone: "+351910000000",
} as Quote;

const IGUAL: PainelPorGravar = {
  estado: "pendente",
  preco: 1000,
  notas: "notas",
  responsavel: "Rita",
  motivoDePerda: "",
  data: "2026-09-20",
  convidados: "80",
  local: "Évora",
  nome: "Ana",
  email: "ana@ex.pt",
  telefone: "+351910000000",
};

const falta = (e: Partial<PainelPorGravar>, antes: Quote | null = PEDIDO) =>
  oQueFaltaGravar(antes, { ...IGUAL, ...e });

describe("oQueFaltaGravar", () => {
  it("sem pedido aberto, nada falta", () => {
    expect(falta({ notas: "x" }, null)).toEqual({
      motivoVaiComADecisao: false,
      porConfirmar: false,
      porEscrever: false,
    });
  });

  it("o painel tal e qual abriu: nada falta", () => {
    expect(falta({})).toEqual({
      motivoVaiComADecisao: false,
      porConfirmar: false,
      porEscrever: false,
    });
  });

  it("cada campo de decisão pede um clique", () => {
    const campos: Partial<PainelPorGravar>[] = [
      { estado: "cotado" },
      { preco: 999 },
      { preco: undefined },
      { responsavel: "Inês" },
      { data: "" },
      { convidados: "81" },
      { local: "Arraiolos" },
      { nome: "Ana M." },
      { email: "outro@ex.pt" },
      { telefone: "" },
    ];
    for (const c of campos) expect(falta(c).porConfirmar, JSON.stringify(c)).toBe(true);
  });

  it("o preço compara-se lido: o mesmo número escrito de outra maneira não é edição", () => {
    // O painel lê «1000,00» e «1000» para o mesmo 1000 — e é esse que chega.
    expect(falta({ preco: 1000 }).porConfirmar).toBe(false);
  });

  it("um espaço a mais nos contactos e no local não conta (achado F-08)", () => {
    expect(
      falta({ local: "Évora ", nome: " Ana", email: "ana@ex.pt ", telefone: " +351910000000" }),
    ).toEqual({
      motivoVaiComADecisao: false,
      porConfirmar: false,
      porEscrever: false,
    });
    // …e um espaço a mais no lado do SERVIDOR também não.
    expect(falta({}, { ...PEDIDO, name: "Ana " } as Quote).porConfirmar).toBe(false);
  });

  it("as notas gravam-se sozinhas: contam como escritas, não como por confirmar", () => {
    expect(falta({ notas: "novas" })).toMatchObject({ porConfirmar: false, porEscrever: true });
  });

  it("o motivo de perda vai com a decisão do estado quando ela está à espera", () => {
    expect(falta({ estado: "rejeitado", motivoDePerda: "caro" })).toEqual({
      motivoVaiComADecisao: true,
      porConfirmar: true,
      porEscrever: false,
    });
    // Sem mudança de estado à espera, é prosa — grava-se sozinho.
    expect(falta({ motivoDePerda: "caro" })).toEqual({
      motivoVaiComADecisao: false,
      porConfirmar: false,
      porEscrever: true,
    });
  });
});
