import { describe, expect, it } from "vitest";
import type { Payment, Quote, Task } from "./types";
import { oQueHaHoje, quantasHoje } from "./hoje";

const HOJE = "2026-11-10";
const AGORA = new Date("2026-11-10T09:00:00");

function pedido(id: string, extra: Partial<Quote> = {}): Quote {
  return {
    id,
    name: `TESTE ${id}`,
    status: "pendente",
    date: "2027-06-12",
    quotedPrice: 1000,
    payments: [],
    ...extra,
  } as unknown as Quote;
}

const devido = (date: string, kind: Payment["kind"] = "sinal"): Payment => ({
  id: `p-${date}`,
  kind,
  amount: 300,
  date,
  paid: false,
});

const tarefa = (id: string, extra: Partial<Task> = {}): Task =>
  ({ id, title: `Tarefa ${id}`, done: false, priority: "normal", ...extra }) as Task;

describe("«Hoje» na Visão Geral (10/11)", () => {
  it("eventos de hoje e de amanhã, só aceites ou com proposta enviada", () => {
    const h = oQueHaHoje(
      [
        pedido("a", { status: "aceite", date: HOJE }),
        pedido("b", { status: "cotado", date: "2026-11-11" }),
        pedido("c", { status: "pendente", date: HOJE }),
        pedido("d", { status: "aceite", date: "2026-11-12" }),
        pedido("e", { status: "aceite", date: HOJE, archived: true }),
      ],
      [],
      [],
      HOJE,
      AGORA,
    );
    expect(h.eventos).toEqual([
      { quoteId: "a", nome: "TESTE a", quando: "hoje" },
      { quoteId: "b", nome: "TESTE b", quando: "amanha" },
    ]);
  });

  it("pagamentos em atraso, de hoje e de amanhã — pelas regras dos Pagamentos", () => {
    const h = oQueHaHoje(
      [
        pedido("atraso", { status: "aceite", payments: [devido("2026-11-01")] }),
        pedido("hoje", { status: "aceite", payments: [devido(HOJE)] }),
        pedido("amanha", { status: "aceite", payments: [devido("2026-11-11")] }),
        pedido("longe", { status: "aceite", payments: [devido("2026-12-20")] }),
        // Não aceite: não entra nas cobranças.
        pedido("cotado", { status: "cotado", payments: [devido("2026-11-01")] }),
      ],
      [],
      [],
      HOJE,
      AGORA,
    );
    expect(h.pagamentos.map((p) => [p.quoteId, p.dias])).toEqual([
      ["atraso", -9],
      ["hoje", 0],
      ["amanha", 1],
    ]);
  });

  it("tarefas por fazer até hoje, as atrasadas primeiro", () => {
    const h = oQueHaHoje(
      [],
      [],
      [
        tarefa("hoje", { dueDate: HOJE }),
        tarefa("ontem", { dueDate: "2026-11-09", quoteId: "q1" }),
        tarefa("feita", { dueDate: HOJE, done: true }),
        tarefa("amanha", { dueDate: "2026-11-11" }),
        tarefa("sem-data"),
      ],
      HOJE,
      AGORA,
    );
    expect(h.tarefas).toEqual([
      { id: "ontem", titulo: "Tarefa ontem", atrasada: true, quoteId: "q1" },
      { id: "hoje", titulo: "Tarefa hoje", atrasada: false },
    ]);
  });

  it("seguimentos marcados até hoje, fora os ganhos e perdidos", () => {
    const h = oQueHaHoje(
      [
        pedido("a", { status: "cotado", followUpAt: HOJE }),
        pedido("b", { status: "cotado", followUpAt: "2026-11-08" }),
        pedido("c", { status: "aceite", followUpAt: HOJE }),
        pedido("d", { status: "cotado", followUpAt: "2026-11-15" }),
      ],
      [],
      [],
      HOJE,
      AGORA,
    );
    expect(h.seguimentos).toEqual([
      { quoteId: "b", nome: "TESTE b", atrasado: true },
      { quoteId: "a", nome: "TESTE a", atrasado: false },
    ]);
  });

  it("o que o casal escolheu na proposta nas últimas 48 horas", () => {
    const h = oQueHaHoje(
      [
        pedido("a", {
          escolhasDoCasal: [
            { escolhaId: "e1", opcaoId: "o1", em: "2026-11-09T20:00:00" },
            { escolhaId: "e2", opcaoId: "o2", em: "2026-11-10T08:00:00" },
          ],
        }),
        pedido("velho", {
          escolhasDoCasal: [{ escolhaId: "e1", opcaoId: "o1", em: "2026-11-01T10:00:00" }],
        }),
      ],
      [],
      [],
      HOJE,
      AGORA,
    );
    expect(h.respostas).toEqual([
      { quoteId: "a", nome: "TESTE a", escolhas: 2, em: "2026-11-10T08:00:00" },
    ]);
  });

  it("um dia sem nada é zero, e não um erro", () => {
    const h = oQueHaHoje([pedido("a")], [], [], HOJE, AGORA);
    expect(quantasHoje(h)).toBe(0);
  });
});

describe("propostas sem resposta (13/11)", () => {
  const enviada = (dia: string) => ({
    activityLog: [{ id: "x", at: `${dia}T10:00:00`, kind: "proposal_sent" as const, summary: "" }],
  });

  it("enviada há 5 dias ou mais sem notícias aparece; a mais esquecida primeiro", () => {
    const h = oQueHaHoje(
      [
        pedido("a", { status: "cotado", ...enviada("2026-11-04") }), // 6 dias
        pedido("b", { status: "cotado", ...enviada("2026-11-08") }), // 2 dias: ainda não
        pedido("c", { status: "cotado", ...enviada("2026-10-30") }), // 10 dias e 23 horas
        pedido("d", { status: "aceite", ...enviada("2026-10-01") }), // já respondeu
      ],
      [],
      [],
      HOJE,
      AGORA,
    );
    expect(h.semResposta.map((s) => [s.quoteId, s.dias])).toEqual([
      ["c", 10],
      ["a", 5],
    ]);
    expect(quantasHoje(h)).toBe(2);
  });

  it("um contacto depois do envio (chamada, mensagem, escolha do casal) recomeça a conta", () => {
    const h = oQueHaHoje(
      [
        pedido("a", {
          status: "cotado",
          activityLog: [
            { id: "1", at: "2026-11-01T10:00:00", kind: "proposal_sent", summary: "" },
            { id: "2", at: "2026-11-08T10:00:00", kind: "call_logged", summary: "" },
          ],
        }),
        pedido("b", {
          status: "cotado",
          ...enviada("2026-11-01"),
          escolhasDoCasal: [{ em: "2026-11-09T12:00:00" } as never],
        }),
      ],
      [],
      [],
      HOJE,
      AGORA,
    );
    expect(h.semResposta).toEqual([]);
  });

  it("um seguimento marcado para mais tarde tira-a daqui (a decisão já foi tomada)", () => {
    const h = oQueHaHoje(
      [pedido("a", { status: "cotado", followUpAt: "2026-11-20", ...enviada("2026-11-01") })],
      [],
      [],
      HOJE,
      AGORA,
    );
    expect(h.semResposta).toEqual([]);
  });
});
