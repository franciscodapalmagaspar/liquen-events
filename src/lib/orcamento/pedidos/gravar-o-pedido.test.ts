import { describe, expect, it } from "vitest";
import { eur0 } from "@/lib/money";
import type { Quote } from "@/lib/orcamento/types";
import { corpoDaGravacao, corpoDoAnular, linhasDoHistorico } from "./gravar-o-pedido";
import type { PainelEscrito } from "./painel-do-pedido";

const ANTES = {
  id: "LQ-1",
  status: "pendente",
  quotedPrice: 1000,
  adminNotes: "antigas",
  assignedTo: "Rita",
  lostReason: "",
  date: "2026-09-20",
  guests: 80,
  location: "Évora",
  name: "Ana Marques",
  email: "ana@example.com",
  phone: "+351910000000",
} as Quote;

/** O painel tal e qual como abriu: nada mudou. */
const IGUAL: PainelEscrito = {
  estado: "pendente",
  preco: 1000,
  notas: "antigas",
  responsavel: "Rita",
  motivoDePerda: "",
  data: "2026-09-20",
  convidados: 80,
  local: "Évora",
  nome: "Ana Marques",
  email: "ana@example.com",
  telefone: "+351910000000",
};

let n = 0;
const AUTOR = { actor: "Teste", agora: "2026-11-17T10:00:00.000Z", novoId: () => `id-${++n}` };
const resumos = (escrito: Partial<PainelEscrito>, antes: Quote = ANTES) =>
  linhasDoHistorico(antes, { ...IGUAL, ...escrito }, AUTOR).map((l) => l.summary);
const corpo = (escrito: Partial<PainelEscrito>, antes: Quote = ANTES) =>
  corpoDaGravacao(antes, { ...IGUAL, ...escrito }, { baseDasNotas: "lido", linhas: [] });

describe("linhasDoHistorico", () => {
  it("nada mudou: nenhuma linha", () => {
    expect(resumos({})).toEqual([]);
  });

  it("cada linha leva quem, quando e um id novo", () => {
    const [l] = linhasDoHistorico(ANTES, { ...IGUAL, convidados: 90 }, AUTOR);
    expect(l).toMatchObject({ actor: "Teste", at: AUTOR.agora, kind: "note_added" });
    expect(l.id).toMatch(/^id-\d+$/);
  });

  it("o estado diz-se pelos rótulos do quadro", () => {
    expect(resumos({ estado: "cotado" })).toEqual(["Novo → Proposta enviada"]);
  });

  it("o preço só entra quando há número e é outro; zero conta como «sem preço» antes", () => {
    expect(resumos({ preco: undefined })).toEqual([]);
    expect(resumos({ preco: 2500 })).toEqual([`Preço: ${eur0(2500)}`]);
    expect(resumos({ preco: 0 }, { ...ANTES, quotedPrice: undefined })).toEqual([]);
  });

  it("notas: só as que ficam com texto, e aparadas dos dois lados", () => {
    expect(resumos({ notas: "  " })).toEqual([]);
    expect(resumos({ notas: " antigas " })).toEqual([]);
    expect(resumos({ notas: "novas" })).toEqual(["Notas internas atualizadas"]);
  });

  it("responsável: atribuído, ou removido", () => {
    expect(resumos({ responsavel: " Inês " })).toEqual(["Atribuído a Inês"]);
    expect(resumos({ responsavel: "" })).toEqual(["Responsável removido"]);
  });

  it("data: só a que fica escrita, por extenso em português", () => {
    expect(resumos({ data: "" })).toEqual([]);
    expect(resumos({ data: "2027-01-02" })).toEqual(["Data do evento alterada para 02/01/2027"]);
  });

  it("convidados, local, contactos e nome — a ordem é a de sempre", () => {
    expect(
      resumos({
        nome: "Ana M.",
        telefone: "",
        email: "",
        local: " Monsaraz ",
        convidados: 100,
      }),
    ).toEqual([
      "Convidados: 80 → 100",
      "Local: Monsaraz",
      "Email do cliente removido",
      "Telefone do cliente removido",
      "Nome do cliente: Ana Marques → Ana M.",
    ]);
  });

  it("apagar o local ou o nome muda o corpo mas não escreve linha", () => {
    expect(resumos({ local: "", nome: "  " })).toEqual([]);
  });
});

describe("corpoDaGravacao", () => {
  it("nada mudou: corpo vazio", () => {
    expect(corpo({})).toEqual({});
  });

  it("só vai o que mudou, pela ordem de sempre, e o limpo vai como nulo ou vazio", () => {
    const c = corpo({
      estado: "rejeitado",
      preco: undefined,
      notas: "x",
      responsavel: "  ",
      motivoDePerda: " caro ",
      data: "",
      convidados: 0,
      local: " ",
      nome: " Ana ",
      email: " a@b.pt ",
      telefone: "",
    });
    expect(Object.keys(c)).toEqual([
      "status",
      "quotedPrice",
      "adminNotes",
      "base",
      "assignedTo",
      "lostReason",
      "date",
      "guests",
      "location",
      "name",
      "email",
      "phone",
    ]);
    expect(c).toEqual({
      status: "rejeitado",
      quotedPrice: null,
      adminNotes: "x",
      base: { adminNotes: "lido" },
      assignedTo: null,
      lostReason: "caro",
      date: "",
      guests: 0,
      location: "",
      name: "Ana",
      email: "a@b.pt",
      phone: "",
    });
  });

  it("um espaço a mais nos contactos e no local não é alteração", () => {
    expect(
      corpo({ local: "Évora ", email: " ana@example.com", telefone: "+351910000000 " }),
    ).toEqual({});
  });

  it("as linhas vão no fim, e só quando existem", () => {
    const linhas = linhasDoHistorico(ANTES, { ...IGUAL, convidados: 81 }, AUTOR);
    const c = corpoDaGravacao(ANTES, { ...IGUAL, convidados: 81 }, { baseDasNotas: "", linhas });
    expect(Object.keys(c)).toEqual(["guests", "activityLogAppend"]);
    expect(c.activityLogAppend).toBe(linhas);
  });
});

describe("corpoDoAnular", () => {
  it("devolve o valor de antes de cada campo que foi, e só desses", () => {
    const c = corpo({ preco: 5, local: "Arraiolos", estado: "cotado" });
    expect(corpoDoAnular(ANTES, c)).toEqual({ quotedPrice: 1000, location: "Évora" });
  });

  it("o que antes não existia volta como nulo ou vazio, para apagar mesmo", () => {
    const antes = {
      ...ANTES,
      quotedPrice: undefined,
      assignedTo: undefined,
      date: undefined,
    } as unknown as Quote;
    const c = corpo({ preco: 5, responsavel: "Inês", data: "2027-01-01" }, antes);
    expect(corpoDoAnular(antes, c)).toEqual({ quotedPrice: null, assignedTo: null, date: "" });
  });
});
