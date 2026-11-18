import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Task } from "@/lib/orcamento/types";

/**
 * P5 (17/11): `tasks.quote_id` passou a ter chave estrangeira para `quotes`.
 * Uma tarefa ligada a um pedido que já não existe continua a gravar-se — sem a
 * ligação —, como antes da chave se gravava (a apontar para nada).
 */
const db = vi.hoisted(() => ({
  rows: new Map<string, Task>(),
  /** Cada gravação que encontra um pedido daqui falha com 23503. */
  pedidosApagados: new Set<string>(),
  tentativas: 0,
}));

const violacao = () =>
  Object.assign(
    new Error(
      'insert or update on table "tasks" violates foreign key constraint "tasks_quote_id_fkey"',
    ),
    { code: "23503", details: 'Key (quote_id)=(Q-APAGADO) is not present in table "quotes".' },
  );

vi.mock("./repository", () => ({
  createRepository: () => ({
    get: async (id: string) => db.rows.get(id) ?? null,
    create: async (t: Task) => {
      db.tentativas++;
      if (t.quoteId && db.pedidosApagados.has(t.quoteId)) throw violacao();
      db.rows.set(t.id, t);
    },
    update: async (id: string, patch: Partial<Task>) => {
      db.tentativas++;
      const cur = db.rows.get(id);
      if (!cur) return null;
      const merged = { ...cur, ...patch };
      if (merged.quoteId && db.pedidosApagados.has(merged.quoteId)) throw violacao();
      db.rows.set(id, merged);
      return merged;
    },
  }),
}));

vi.mock("./logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { createTask, updateTask, reporTarefa, eTarefaComPedidoQueNaoExiste } from "./tasks-store";

beforeEach(() => {
  db.rows.clear();
  db.pedidosApagados.clear();
  db.tentativas = 0;
});

const tarefa = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "a",
  done: false,
  priority: "normal",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("tarefa ligada a um pedido que já não existe (chave estrangeira do P5)", () => {
  it("createTask grava a tarefa sem a ligação, em vez de falhar", async () => {
    db.pedidosApagados.add("Q-APAGADO");
    const t = await createTask({
      title: "Ligar ao casal",
      priority: "normal",
      quoteId: "Q-APAGADO",
    });
    expect(t.quoteId).toBeUndefined();
    expect(db.rows.get(t.id)?.title).toBe("Ligar ao casal");
    expect(db.tentativas).toBe(2);
  });

  it("createTask com um pedido que existe grava a ligação à primeira", async () => {
    const t = await createTask({ title: "x", priority: "normal", quoteId: "Q-VIVO" });
    expect(db.rows.get(t.id)?.quoteId).toBe("Q-VIVO");
    expect(db.tentativas).toBe(1);
  });

  it("updateTask que liga a um pedido apagado grava o resto da alteração", async () => {
    db.rows.set("t1", tarefa());
    db.pedidosApagados.add("Q-APAGADO");
    const r = await updateTask("t1", { quoteId: "Q-APAGADO", done: true });
    expect(r?.done).toBe(true);
    expect(r?.quoteId).toBeUndefined();
  });

  it("reporTarefa (Reciclagem) repõe a tarefa mesmo que o pedido já tenha saído de vez", async () => {
    db.pedidosApagados.add("Q-APAGADO");
    await reporTarefa(tarefa({ id: "t9", quoteId: "Q-APAGADO" }));
    expect(db.rows.get("t9")).toBeTruthy();
    expect(db.rows.get("t9")?.quoteId).toBeUndefined();
  });

  it("só reconhece a violação desta chave; os outros erros não são engolidos", () => {
    expect(eTarefaComPedidoQueNaoExiste({ code: "23505", message: "tasks_quote_id_fkey" })).toBe(
      false,
    );
    expect(eTarefaComPedidoQueNaoExiste({ code: "23503", message: "outra_fkey" })).toBe(false);
    expect(eTarefaComPedidoQueNaoExiste(null)).toBe(false);
    expect(eTarefaComPedidoQueNaoExiste(violacao())).toBe(true);
  });
});

describe("o nome da restrição que a recuperação reconhece existe na base", () => {
  it("tasks_quote_id_fkey está no db/schema.sql (renomeá-la desligava a recuperação)", () => {
    const sql = readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf-8");
    expect(sql).toContain("'tasks_quote_id_fkey'");
    expect(
      eTarefaComPedidoQueNaoExiste({ code: "23503", message: 'violates "tasks_quote_id_fkey"' }),
    ).toBe(true);
  });
});
