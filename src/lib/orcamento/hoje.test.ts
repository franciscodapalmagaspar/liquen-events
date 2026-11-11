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
