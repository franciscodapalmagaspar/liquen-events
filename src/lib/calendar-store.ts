import "server-only";
import { randomUUID } from "node:crypto";
import type { CalendarEvent } from "@/lib/orcamento/types";
import { createRepository, type Mapper } from "./repository";

export const mapper: Mapper<CalendarEvent> = {
  table: "calendar_events",
  fileName: "calendar-events.json",
  getId: (e) => e.id,
  toRow: (e) => ({
    id: e.id,
    event_date: e.date,
    title: e.title,
    kind: e.kind,
    event_time: e.time || null,
    note: e.note || null,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    date: String(r.event_date ?? ""),
    title: String(r.title ?? ""),
    kind: (r.kind as CalendarEvent["kind"]) ?? "evento",
    time: (r.event_time as string) ?? undefined,
    note: (r.note as string) ?? undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
  order: { column: "event_date", ascending: true },
  fileCompare: (a, b) => a.date.localeCompare(b.date),
  /**
   * COM `touch` desde 2/11 (fase 09 do `docs/APPLE-CALENDARIO.md`, arrastar).
   *
   * Até aqui uma marcação não se actualizava — corrigia-se apagando e voltando
   * a criar, o que lhe trocava o `id`, perdia o `created_at` e, se a criação
   * falhasse depois de apagar, perdia a marcação. Mover de dia precisa de um
   * `update` a sério, e um `update` sem compare-and-set é uma escrita cega: a
   * colega que mudou a hora no telemóvel enquanto ela arrastava no computador
   * perdia a hora em silêncio.
   *
   * As duas metades estão feitas juntas, como esta nota pedia: a coluna
   * `updated_at` em `db/schema.sql` (e em `db/migracoes/20261102_…`, aplicada
   * com a autorização dela) e o `touch: true` aqui. O
   * `bloqueio-optimista.test.ts` prende as duas.
   */
  touch: true,
};

const repo = createRepository(mapper);

export const listCalendarEvents = (): Promise<CalendarEvent[]> => repo.list();

export async function createCalendarEvent(
  input: Omit<CalendarEvent, "id" | "createdAt">,
): Promise<CalendarEvent> {
  const event: CalendarEvent = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    date: input.date,
    title: input.title,
    kind: input.kind,
    time: input.time,
    note: input.note,
  };
  await repo.create(event);
  return event;
}

export const deleteCalendarEvent = (id: string): Promise<void> => repo.remove(id);

/**
 * Mover uma marcação para outro dia (e, se vier, outra hora). Só o dia e a
 * hora: o título, o tipo e a nota não se mexem daqui. Devolve `null` se a
 * marcação já não existir; atira `ConflictError` se outra pessoa a mudou
 * entretanto (o repositório tenta de novo antes de desistir).
 */
export const moverCalendarEvent = (
  id: string,
  patch: { date: string; time?: string | null },
): Promise<CalendarEvent | null> =>
  repo.update(id, {
    date: patch.date,
    ...(patch.time !== undefined ? { time: patch.time || undefined } : {}),
  });

/** Para a Reciclagem: ler uma marcação, e repô-la tal e qual — com o MESMO id. */
export const obterEvento = (id: string): Promise<CalendarEvent | null> => repo.get(id);
export const reporEvento = (e: CalendarEvent): Promise<void> =>
  repo.create(e, { created_at: e.createdAt });

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LIGAÇÃO A UM PEDIDO — SEM COLUNA NOVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `calendar_events` não tem `quote_id` (é «standalone», de propósito — ver o
 * comentário do tipo, acima). A geração de datas-chave ao marcar «Ganho»
 * precisa, na mesma, de saber SE JÁ GEROU uma dada chave para um dado pedido,
 * para "gerar" duas vezes não duplicar a reunião, a encomenda de flores, a
 * montagem e a desmontagem. Sem tabela nova, o elo é uma marca dentro da
 * própria nota — que já é texto livre e já existe.
 *
 * Não aparece a quem lê a nota no calendário como um blob ilegível: é um
 * sufixo depois de uma frase em português.
 */
function tagDeGeracao(quoteId: string, chave: string): string {
  return `#gerado:${quoteId}:${chave}`;
}

/** A nota com que uma data-chave gerada automaticamente se identifica. */
export function notaDeDataChaveGerada(quoteId: string, chave: string): string {
  return `Gerado automaticamente ao marcar como ganho. ${tagDeGeracao(quoteId, chave)}`;
}

/**
 * As chaves de data-chave já geradas para este pedido ("reuniao", "flores",
 * "montagem", "desmontagem" — ver {@link import("./semear-producao").ANTECEDENCIAS_DATAS_CHAVE}).
 *
 * Devolve só as CHAVES, não os eventos inteiros: quem chama só precisa de
 * saber "já gerei esta?" para não a repetir — nunca de reescrever um evento
 * que ela já possa ter editado à mão (título, hora, nota).
 */
export async function chavesDeDatasJaGeradas(quoteId: string): Promise<Set<string>> {
  const prefixo = tagDeGeracao(quoteId, "");
  const eventos = await listCalendarEvents();
  const chaves = new Set<string>();
  for (const e of eventos) {
    const nota = e.note ?? "";
    const i = nota.indexOf(prefixo);
    if (i === -1) continue;
    chaves.add(nota.slice(i + prefixo.length));
  }
  return chaves;
}
