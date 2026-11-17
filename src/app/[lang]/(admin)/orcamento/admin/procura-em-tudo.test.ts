import { describe, expect, it, vi } from "vitest";
import type { CalendarEvent, Supplier, Task } from "@/lib/orcamento/types";
import type { ThemeSummary } from "@/lib/theme-types";
import type { MaterialItem } from "@/lib/material-types";
import type { ItemDosAceites } from "@/lib/orcamento/aceites";
import {
  MAX_POR_GRUPO,
  montarGruposDaProcura,
  procurarNosGrupos,
  servirUmaVez,
  type PortasDaProcura,
} from "./procura-em-tudo";

/**
 * A procura em tudo do ⌘K (BO 4). O que se prende aqui:
 *  · um grupo só nasce quando a lista JÁ está na memória (sem fonte, sem grupo
 *    — nunca «sem resultados» sobre uma lista que não se leu);
 *  · no máximo quatro por grupo, sem acentos nem maiúsculas;
 *  · sem texto não há resultados (a paleta é a navegação);
 *  · cada resultado abre pela porta da sua vista;
 *  · um pedido da paleta é servido uma vez, monte a vista as vezes que montar.
 */

const portas = (): PortasDaProcura => ({
  proposta: vi.fn(),
  tarefa: vi.fn(),
  marcacao: vi.fn(),
  tema: vi.fn(),
  contrato: vi.fn(),
  fornecedor: vi.fn(),
  material: vi.fn(),
});

const tarefa = (i: number, over: Partial<Task> = {}): Task => ({
  id: `t${i}`,
  title: `Ligar ao florista ${i}`,
  done: false,
  priority: "normal",
  createdAt: "2026-10-01T09:00:00.000Z",
  ...over,
});

describe("montarGruposDaProcura", () => {
  it("sem nada na memória, não há grupo nenhum", () => {
    expect(montarGruposDaProcura({}, portas())).toEqual([]);
  });

  it("só nascem os grupos cuja lista já veio", () => {
    const grupos = montarGruposDaProcura({ tarefas: [tarefa(1)], material: undefined }, portas());
    expect(grupos.map((g) => g.nome)).toEqual(["Tarefas"]);
  });

  it("os sete grupos, pela ordem da paleta", () => {
    const grupos = montarGruposDaProcura(
      {
        propostas: [{ id: "p1", clientName: "Ana & Rui", status: "enviada" }],
        tarefas: [tarefa(1)],
        calendario: [
          { id: "e1", date: "2027-03-12", title: "Prova de menu", kind: "reuniao", createdAt: "" },
        ] as CalendarEvent[],
        temas: [{ id: "th1", name: "Terracotta", imageCount: 3 }] as ThemeSummary[],
        contratos: [
          { tipo: "sem-contrato", id: "c1", quoteId: "q1", clientName: "Ana", clientEmail: "" },
        ] as ItemDosAceites[],
        fornecedores: [{ id: "s1", name: "Flores do Sado", category: "Florista" }] as Supplier[],
        material: [{ id: "m1", name: "Escadote", category: "Ferramentas" }] as MaterialItem[],
      },
      portas(),
    );
    expect(grupos.map((g) => g.nome)).toEqual([
      "Propostas",
      "Tarefas",
      "Calendário",
      "Temas",
      "Contratos",
      "Fornecedores",
      "Material",
    ]);
  });

  it("um tema arquivado não volta pela procura", () => {
    const grupos = montarGruposDaProcura(
      {
        temas: [
          { id: "a", name: "Branco", imageCount: 1 },
          { id: "b", name: "Branco antigo", imageCount: 1, arquivado: true },
        ] as ThemeSummary[],
      },
      portas(),
    );
    expect(grupos[0].itens.map((i) => i.label)).toEqual(["Branco"]);
  });

  it("uma lista que veio estragada (não é array) não entra", () => {
    const grupos = montarGruposDaProcura({ tarefas: { erro: "x" } as unknown as Task[] }, portas());
    expect(grupos).toEqual([]);
  });

  it("cada resultado abre pela porta da sua vista", () => {
    const p = portas();
    const t = tarefa(7);
    const [grupo] = montarGruposDaProcura({ tarefas: [t] }, p);
    grupo.itens[0].run();
    expect(p.tarefa).toHaveBeenCalledWith(t);
  });
});

describe("procurarNosGrupos", () => {
  const muitas = Array.from({ length: 9 }, (_, i) => tarefa(i + 1));

  it("sem texto, nenhum resultado", () => {
    const grupos = montarGruposDaProcura({ tarefas: muitas }, portas());
    expect(procurarNosGrupos("   ", grupos)).toEqual([]);
  });

  it(`no máximo ${MAX_POR_GRUPO} por grupo`, () => {
    const grupos = montarGruposDaProcura({ tarefas: muitas }, portas());
    const r = procurarNosGrupos("florista", grupos);
    expect(r).toHaveLength(MAX_POR_GRUPO);
    expect(r.every((x) => x.group === "Tarefas")).toBe(true);
  });

  it("procura sem acentos e sem maiúsculas, nos campos que a vista mostra", () => {
    const grupos = montarGruposDaProcura(
      {
        calendario: [
          {
            id: "e1",
            date: "2027-03-12",
            title: "Visita à Quinta de Évora",
            kind: "evento",
            createdAt: "",
          },
          {
            id: "e2",
            date: "2027-03-13",
            title: "Outra",
            note: "levar ÉVORA",
            kind: "nota",
            createdAt: "",
          },
        ] as CalendarEvent[],
      },
      portas(),
    );
    expect(procurarNosGrupos("evora", grupos).map((r) => r.id)).toEqual([
      "marcacao-e1",
      "marcacao-e2",
    ]);
  });
});

describe("servirUmaVez", () => {
  it("serve um pedido uma vez, e o seguinte (outro objecto) outra vez", () => {
    const servir = vi.fn();
    const pedido = { id: "t1" };
    servirUmaVez(pedido, servir);
    servirUmaVez(pedido, servir); // a vista voltou a montar com o mesmo pedido
    expect(servir).toHaveBeenCalledTimes(1);
    servirUmaVez({ id: "t1" }, servir); // nova escolha na paleta
    expect(servir).toHaveBeenCalledTimes(2);
  });

  it("sem pedido não faz nada", () => {
    const servir = vi.fn();
    servirUmaVez(undefined, servir);
    servirUmaVez(null, servir);
    expect(servir).not.toHaveBeenCalled();
  });
});
