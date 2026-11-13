import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listCalendarEvents, createCalendarEvent } from "@/lib/calendar-store";
import { jsonWithEtag } from "@/lib/api-cache";
import type { CalendarEventKind } from "@/lib/orcamento/types";
import { log } from "@/lib/logger";
import { dataIso } from "@/lib/validation";
import { minutosDe } from "@/lib/orcamento/guiao-do-dia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: CalendarEventKind[] = ["reuniao", "evento", "bloqueio", "nota"];

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return jsonWithEtag(request, await listCalendarEvents());
  } catch (err) {
    log.error("calendario GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    // JSON malformado é pedido errado, não avaria: sem isto o `request.json()`
    // atirava e saía 500 do `catch` lá em baixo, e um `null` rebentava as
    // leituras abaixo com um TypeError. Mesmo padrão do PATCH de
    // `/api/orcamento/[id]`.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
    const title = String(body.title ?? "").trim();
    const dataEscrita = String(body.date ?? "").trim();
    if (!title || !dataEscrita) {
      return NextResponse.json({ error: "Título e data são obrigatórios" }, { status: 400 });
    }
    // ── UM DIA QUE EXISTA, UMA HORA QUE EXISTA, TEXTOS COM TECTO ──────────
    // A regex sozinha deixava passar «2027-02-30»; a coluna `event_date` é
    // `date` e o Postgres recusava-o, o que saía como 500 «Erro interno» em
    // vez de dizer o que estava mal (achado n.º 15 da auditoria 6).
    const date = dataIso(dataEscrita);
    if (!date) {
      return NextResponse.json(
        { error: "Data inválida — escolhe um dia do calendário." },
        { status: 400 },
      );
    }
    if (title.length > 200) {
      return NextResponse.json(
        { error: "O título é demasiado longo (o máximo são 200 caracteres)." },
        { status: 400 },
      );
    }
    const horaEscrita = String(body.time ?? "").trim();
    if (horaEscrita && minutosDe(horaEscrita) === null) {
      return NextResponse.json({ error: "Hora inválida — usa o formato hh:mm." }, { status: 400 });
    }
    const note = String(body.note ?? "");
    if (note.length > 2000) {
      return NextResponse.json(
        { error: "A nota é demasiado longa (o máximo são 2000 caracteres)." },
        { status: 400 },
      );
    }
    const kind: CalendarEventKind = KINDS.includes(body.kind) ? body.kind : "evento";
    const event = await createCalendarEvent({
      title,
      date,
      kind,
      time: horaEscrita || undefined,
      note: note || undefined,
    });
    return NextResponse.json(event);
  } catch (err) {
    log.error("calendario POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
