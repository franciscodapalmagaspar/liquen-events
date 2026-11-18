import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import {
  eTarefaDeUmPedidoApagado,
  MENSAGEM_PEDIDO_APAGADO,
  RESTRICAO_DA_TAREFA_AO_PEDIDO,
} from "./pedido-apagado";

/**
 * P5 (17/11): a tarefa segue o pedido (`tasks_quote_id_fkey on delete
 * cascade`). Gravar uma tarefa para um pedido apagado entretanto é recusado
 * pela base, e as rotas dizem-no com 409 em vez de «Erro interno». A mesma
 * regra em todo o lado: nunca uma tarefa solta com o nome de um casal cujo
 * pedido foi apagado.
 */
const violacao = () =>
  Object.assign(
    new Error(
      'insert or update on table "tasks" violates foreign key constraint "tasks_quote_id_fkey"',
    ),
    { code: "23503", details: 'Key (quote_id)=(Q-APAGADO) is not present in table "quotes".' },
  );

const store = vi.hoisted(() => ({ falha: null as unknown }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/tasks-store", () => ({
  listTasks: async () => [],
  obterTarefa: async () => null,
  deleteTask: async () => {},
  reporTarefa: async () => {},
  listTasksForQuote: async () => [],
  createTask: async () => {
    throw store.falha;
  },
  updateTask: async () => {
    throw store.falha;
  },
}));

const { POST } = await import("@/app/api/tarefas/route");
const { PATCH } = await import("@/app/api/tarefas/[id]/route");

const pedido = (method: string, body: unknown) =>
  new Request("https://liquen.test/api/tarefas", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  store.falha = violacao();
});

describe("tarefa de um pedido que já foi apagado", () => {
  it("reconhece só a violação desta chave", () => {
    expect(eTarefaDeUmPedidoApagado(violacao())).toBe(true);
    expect(
      eTarefaDeUmPedidoApagado({ code: "23505", message: RESTRICAO_DA_TAREFA_AO_PEDIDO }),
    ).toBe(false);
    expect(eTarefaDeUmPedidoApagado({ code: "23503", message: "outra_fkey" })).toBe(false);
    expect(eTarefaDeUmPedidoApagado(null)).toBe(false);
  });

  it("o nome da restrição existe no db/schema.sql (renomeá-la desligava o 409)", () => {
    const sql = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf-8");
    expect(sql).toContain(`'${RESTRICAO_DA_TAREFA_AO_PEDIDO}'`);
  });

  it("criar responde 409 com a frase certa, não «Erro interno»", async () => {
    const res = await POST(pedido("POST", { title: "Ligar ao casal", quoteId: "Q-APAGADO" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: MENSAGEM_PEDIDO_APAGADO });
  });

  it("alterar responde 409 com a frase certa", async () => {
    const res = await PATCH(pedido("PATCH", { quoteId: "Q-APAGADO" }), {
      params: Promise.resolve({ id: "t1" }),
    });
    expect(res.status).toBe(409);
  });

  it("outra avaria continua a ser 500", async () => {
    store.falha = new Error("rede");
    const res = await POST(pedido("POST", { title: "x" }));
    expect(res.status).toBe(500);
  });
});
