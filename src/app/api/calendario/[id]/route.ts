import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { enviarParaAReciclagem, quemApagou } from "@/lib/reciclagem";
import { log } from "@/lib/logger";
import { moverCalendarEvent } from "@/lib/calendar-store";
import { isConflictError } from "@/lib/repository";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { id } = await params;
    const reciclagem = await enviarParaAReciclagem("evento", id, quemApagou(request));
    return NextResponse.json({ ok: true, reciclagem });
  } catch (err) {
    log.error("calendario DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * ── MOVER UMA MARCAÇÃO DE DIA (fase 09, arrastar) ──────────────────────────
 *
 * Só `date` (aaaa-mm-dd) e, se vier, `time` (hh:mm, ou vazio para «sem
 * hora»). O título, o tipo e a nota não se mexem daqui — arrastar não é
 * editar. 404 se a marcação já não existir (outra pessoa apagou-a); 409 se
 * outra pessoa a mudou entretanto: o ecrã volta a ler e pede para repetir,
 * em vez de escrever por cima.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  const date = String((body as Record<string, unknown>).date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`))) {
    return NextResponse.json({ error: "Data inválida" }, { status: 400 });
  }
  const temHora = "time" in body;
  const time = temHora ? String((body as Record<string, unknown>).time ?? "").trim() : undefined;
  if (time && !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: "Hora inválida" }, { status: 400 });
  }
  try {
    const { id } = await params;
    const movido = await moverCalendarEvent(id, temHora ? { date, time } : { date });
    if (!movido) return NextResponse.json({ error: "Marcação não encontrada" }, { status: 404 });
    return NextResponse.json(movido);
  } catch (err) {
    if (isConflictError(err)) {
      return NextResponse.json(
        { error: "Esta marcação foi mudada noutro sítio. Volta a tentar." },
        { status: 409 },
      );
    }
    log.error("calendario PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
