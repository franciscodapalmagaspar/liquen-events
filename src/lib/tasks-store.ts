import "server-only";
import { randomUUID } from "node:crypto";
import type { Task } from "@/lib/orcamento/types";
import { createRepository, type Mapper } from "./repository";
import { log } from "./logger";

export const mapper: Mapper<Task> = {
  table: "tasks",
  fileName: "tasks.json",
  getId: (t) => t.id,
  toRow: (t) => ({
    id: t.id,
    title: t.title,
    done: t.done,
    priority: t.priority,
    due_date: t.dueDate || null,
    quote_id: t.quoteId || null,
    client_name: t.clientName || null,
    assignee: t.assignee || null,
    area: t.area || null,
    /* ── AS DUAS METADES DESTE PAR ANDAM JUNTAS ──────────────────────────
       QUEM ESCREVE são estas quatro linhas; QUEM GUARDA são as colunas do
       `db/schema.sql`. Faltando as colunas, cada gravação de uma tarefa
       rebenta com `column "notas" does not exist`; faltando a projecção, o
       que ela escreve no painel de detalhe grava-se com 200 e desaparece no
       recarregamento seguinte — em desenvolvimento nunca se via, porque o
       backend de ficheiro guarda o objecto inteiro tal como ele é. É o mesmo
       par que o `suppliers-store` documenta, e pela mesma razão.

       `|| null` no texto e `?? null` no número: uma posição ZERO é uma
       posição legítima (é a primeira linha da lista), e `0 || null` dava
       null — a tarefa perdia o sítio ao ser gravada. */
    notas: t.notas || null,
    subtarefas: t.subtarefas ?? null,
    anexos: t.anexos ?? null,
    posicao: t.posicao ?? null,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    done: Boolean(r.done),
    priority: (r.priority as Task["priority"]) ?? "normal",
    dueDate: (r.due_date as string) ?? undefined,
    quoteId: (r.quote_id as string) ?? undefined,
    clientName: (r.client_name as string) ?? undefined,
    assignee: (r.assignee as string) ?? undefined,
    area: (r.area as string) ?? undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
    notas: (r.notas as string) ?? undefined,
    // As duas colunas são `jsonb`. Um `Array.isArray` e não um cast: uma linha
    // antiga traz `null`, e uma linha estragada à mão traria um objecto — nos
    // dois casos o que o ecrã tem de receber é «não há», e não um valor que
    // rebenta no primeiro `.map()`.
    subtarefas: Array.isArray(r.subtarefas) ? (r.subtarefas as Task["subtarefas"]) : undefined,
    anexos: Array.isArray(r.anexos) ? (r.anexos as Task["anexos"]) : undefined,
    posicao: typeof r.posicao === "number" ? r.posicao : undefined,
  }),
  order: { column: "created_at", ascending: false },
  fileCompare: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  /**
   * Compare-and-set sobre o `updated_at`.
   *
   * A tarefa é o objecto mais partilhado do back office: uma pessoa risca-a do
   * telemóvel enquanto outra lhe muda o responsável ou a data no computador.
   * São dois patches pequenos e disjuntos — `{done}` e `{assignee, dueDate}` —
   * e sem comparação o segundo a chegar reescreve a linha inteira a partir da
   * leitura que fez: a tarefa desmarca-se sozinha. Ninguém interpreta isso como
   * um conflito; interpreta-o como «alguém voltou a abrir a tarefa».
   */
  touch: true,
};

const repo = createRepository(mapper);

/**
 * A chave estrangeira `tasks.quote_id → quotes` (P5, 17/11) recusa uma tarefa
 * ligada a um pedido que não existe — um pedido apagado noutro ecrã enquanto
 * este criava a tarefa, ou uma tarefa da Reciclagem cujo pedido já saiu de vez.
 * Antes da chave a tarefa gravava-se na mesma, a apontar para nada. Continua a
 * gravar-se, agora sem a ligação, que é o que o Postgres faria a uma fatura
 * nas mesmas condições (`set null`): perder a tarefa por causa da ligação era
 * pior do que perder a ligação.
 */
export function eTarefaComPedidoQueNaoExiste(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; details?: unknown };
  return (
    e.code === "23503" &&
    /tasks_quote_id_fkey/.test(`${String(e.message ?? "")} ${String(e.details ?? "")}`)
  );
}

async function semLigacaoSeOPedidoJaNaoExiste<R>(
  quoteId: string | undefined,
  gravar: (semPedido: boolean) => Promise<R>,
): Promise<R> {
  try {
    return await gravar(false);
  } catch (err) {
    if (!quoteId || !eTarefaComPedidoQueNaoExiste(err)) throw err;
    log.warn("tarefa: o pedido ligado já não existe — grava-se sem a ligação", {
      pedido: quoteId,
    });
    return gravar(true);
  }
}

export const listTasks = (): Promise<Task[]> => repo.list();

/** As tarefas de um pedido, pelo índice `tasks_quote_id_idx` (P5) e não a tabela toda. */
export const listTasksForQuote = (quoteId: string): Promise<Task[]> =>
  repo.where("quote_id", quoteId, (t) => (t.quoteId ?? "").trim() === quoteId);

export async function createTask(
  input: Omit<Task, "id" | "createdAt" | "done"> & { done?: boolean },
): Promise<Task> {
  const task: Task = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    done: input.done ?? false,
    title: input.title,
    priority: input.priority,
    dueDate: input.dueDate,
    quoteId: input.quoteId,
    clientName: input.clientName,
    assignee: input.assignee,
    area: input.area,
    /* Copiados um a um, como os de cima: este objecto é construído campo a
       campo de propósito (é o que impede um `id` ou um `createdAt` vindos do
       pedido de passarem), e um campo novo que não seja copiado aqui é um
       campo que se perde na CRIAÇÃO — em silêncio, e só na criação, que é o
       pior sítio para procurar. */
    notas: input.notas,
    subtarefas: input.subtarefas,
    anexos: input.anexos,
    posicao: input.posicao,
  };
  return semLigacaoSeOPedidoJaNaoExiste(task.quoteId, async (semPedido) => {
    const gravada = semPedido ? { ...task, quoteId: undefined } : task;
    await repo.create(gravada);
    return gravada;
  });
}

export const updateTask = (id: string, updates: Partial<Task>): Promise<Task | null> =>
  semLigacaoSeOPedidoJaNaoExiste(updates.quoteId, (semPedido) =>
    repo.update(id, semPedido ? { ...updates, quoteId: undefined } : updates),
  );

export const deleteTask = (id: string): Promise<void> => repo.remove(id);

/** Para a Reciclagem: ler uma, e repô-la tal e qual — com o MESMO id, que o
 *  `createTask` não deixa (gera sempre um novo, de propósito). */
export const obterTarefa = (id: string): Promise<Task | null> => repo.get(id);
export const reporTarefa = (t: Task): Promise<void> =>
  semLigacaoSeOPedidoJaNaoExiste(t.quoteId, (semPedido) =>
    repo.create(semPedido ? { ...t, quoteId: undefined } : t, { created_at: t.createdAt }),
  );
