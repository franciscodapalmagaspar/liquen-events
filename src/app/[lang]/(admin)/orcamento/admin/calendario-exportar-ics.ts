import type { Quote } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { ocupaOsDias } from "@/lib/orcamento/choque-de-datas";
import { isDateKey } from "./util";

/*
 * O rótulo do tipo de evento e a exportação do calendário em `.ics` — saíram
 * do `Calendario.tsx` tal e qual, para o ficheiro caber no tecto da catraca
 * (`test/tamanho-dos-ficheiros.test.ts`).
 */

export function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Evento";
}

/** Build and download an .ics calendar with every dated event. */
export function exportIcs(quotes: Quote[]) {
  const day = (iso: string) => iso.replace(/-/g, "");
  // Escape per RFC 5545 instead of blanking commas/semicolons.
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Liquen Events//Back Office//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const q of quotes) {
    // Só o que OCUPA o dia (proposta enviada ou ganho, não arquivado) — a
    // mesma regra do aviso de data ocupada. Exportava-se tudo: um pedido
    // perdido ou ainda sem resposta aparecia como dia ocupado no calendário
    // do telemóvel, e ela recusava trabalho por um casamento que não existe.
    if (!ocupaOsDias(q)) continue;
    // Only real calendar dates — free-form values ("a definir") would otherwise
    // emit a malformed `DTSTART;VALUE=DATE:adefinir`. Skip them.
    if (!isDateKey(q.date)) continue;
    // DTEND is exclusive for all-day events: the day after the last day. Honour
    // multi-day ranges (endDate) so a 3-day wedding shows as 3 days, not 1.
    const lastDay = q.endDate && isDateKey(q.endDate) && q.endDate >= q.date ? q.endDate : q.date;
    const dtEnd = new Date(Date.parse(lastDay + "T00:00:00Z") + 86_400_000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const title = `${eventTypeLabel(q)} — ${q.name}`;
    const desc = [
      q.location && `Local: ${q.location}`,
      q.guests && `${q.guests} convidados`,
      q.phone && `Tel: ${q.phone}`,
    ]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${q.id}@liquen-events.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(q.date)}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      // Proposta enviada é um dia em aberto; ganho é um dia confirmado.
      `STATUS:${q.status === "aceite" ? "CONFIRMED" : "TENTATIVE"}`,
      `SUMMARY:${esc(title)}`,
      q.location ? `LOCATION:${esc(q.location)}` : "",
      desc ? `DESCRIPTION:${esc(desc)}` : "",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.filter(Boolean).join("\r\n")], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "liquen-eventos.ics";
  a.click();
  URL.revokeObjectURL(url);
}
