import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listTasks, createTask } from "@/lib/tasks-store";
import { jsonWithEtag } from "@/lib/api-cache";
import { taskUpdateSchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";
import { tituloEPrazo } from "@/lib/tarefas/prazo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return jsonWithEtag(request, await listTasks());
  } catch (err) {
    log.error("tarefas GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    // Validate + bound the same way the PATCH path does. Malformed JSON →
    // safeParse(null) fails → a clean 400, never a 500 from a thrown parse.
    const body = await request.json().catch(() => null);
    const parsed = taskUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const title = (parsed.data.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Título obrigatório" }, { status: 400 });
    // O prazo grava-se como DIA; uma hora que venha agarrada vai para o título
    // (ver `lib/tarefas/prazo.ts`) — senão a tarefa saía de «Hoje».
    const comPrazo = tituloEPrazo(title, parsed.data.dueDate);
    const task = await createTask({
      title: comPrazo.title,
      priority: parsed.data.priority ?? "normal",
      dueDate: comPrazo.dueDate,
      quoteId: parsed.data.quoteId || undefined,
      clientName: parsed.data.clientName || undefined,
      assignee: parsed.data.assignee || undefined,
      area: parsed.data.area || undefined,
    });
    return NextResponse.json(task);
  } catch (err) {
    log.error("tarefas POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
