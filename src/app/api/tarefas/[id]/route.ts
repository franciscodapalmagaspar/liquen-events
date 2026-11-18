import { NextRequest, NextResponse } from "next/server";
import type { Task } from "@/lib/orcamento/types";
import { isAuthed } from "@/lib/admin-auth";
import { enviarParaAReciclagem, quemApagou } from "@/lib/reciclagem";
import { updateTask } from "@/lib/tasks-store";
import { taskUpdateSchema, firstError } from "@/lib/validation";
import { respostaDeConflito, respostaDeMigracaoEmFalta } from "@/lib/resposta-de-conflito";
import { log } from "@/lib/logger";
import { diaDoPrazo } from "@/lib/tarefas/prazo";

export const runtime = "nodejs";

// id/createdAt are server-assigned and must never be overwritable via PATCH.
const ALLOWED: (keyof Task)[] = [
  "title",
  "done",
  "priority",
  "dueDate",
  "quoteId",
  "clientName",
  "assignee",
  "area",
  /* Os campos do painel de detalhe (fase 08) e a ordem manual (fase 09). Esta
     lista é a PRIMEIRA das duas peneiras — o que não estiver aqui nem chega ao
     `taskUpdateSchema`, e desaparece com 200 e sem erro, tal como o que não
     estiver declarado lá. Duas listas a ter de concordar é a armadilha que o
     `validation.tarefas.test.ts` guarda do lado do esquema; aqui fica o
     lembrete de que são duas. */
  "notas",
  "subtarefas",
  "anexos",
  "posicao",
];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    // Malformed or non-object body → 400, not a 500. `null`/primitives/arrays
    // would otherwise blow up the `key in body` check with a TypeError.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
    const source = body as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in source) picked[key] = source[key];
    }
    const parsed = taskUpdateSchema.safeParse(picked);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const patch = parsed.data as Partial<Task>;
    // O prazo é um dia (ver `lib/tarefas/prazo.ts`): uma hora agarrada saía de
    // «Hoje» e perdia-se na coluna `date` ao recarregar.
    if (patch.dueDate) patch.dueDate = diaDoPrazo(patch.dueDate);
    const updated = await updateTask(id, patch);
    if (!updated) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    // Duas pessoas na mesma tarefa (uma risca-a no telemóvel, outra muda-lhe o
    // responsável) — ver o `touch` em tasks-store.
    const conflito = respostaDeConflito(err);
    if (conflito) return conflito;
    const migracao = respostaDeMigracaoEmFalta(err, "As tarefas");
    if (migracao) return migracao;
    log.error("tarefas PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const reciclagem = await enviarParaAReciclagem("tarefa", id, quemApagou(request));
    return NextResponse.json({ ok: true, reciclagem });
  } catch (err) {
    log.error("tarefas DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
