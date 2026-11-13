import "server-only";
import { randomUUID } from "node:crypto";
import { createRepository, type Mapper } from "./repository";
import type { EventMaterialItem } from "./event-material-types";
import type { MaterialKind } from "./material-types";
import type { Origem } from "./material-rules";

/**
 * As LINHAS da checklist de um evento.
 *
 * Store próprio pela mesma razão das listas base: a rede de segurança da cópia
 * descobre as tabelas pelo disco, um ficheiro por `mapper.table`.
 */
export type { EventMaterialItem } from "./event-material-types";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, 1_000_000);
}

export const mapper: Mapper<EventMaterialItem> = {
  table: "event_material_items",
  fileName: "event-material-items.json",
  getId: (i) => i.id,
  toRow: (i) => ({
    id: i.id,
    event_id: i.eventId,
    item_id: i.itemId || null,
    name: i.name,
    category: i.category,
    unit: i.unit || null,
    kind: i.kind,
    qty: i.qty,
    critical: i.critical,
    origin: i.origin,
    origin_ref: i.originRef || null,
    origin_label: i.originLabel || "",
    vehicle_id: i.vehicleId || null,
    loaded_at: i.loadedAt || null,
    loaded_by: i.loadedBy || null,
    returned_at: i.returnedAt || null,
    returned_by: i.returnedBy || null,
    missing: i.missing,
    used_qty: typeof i.usedQty === "number" ? i.usedQty : null,
    note: i.note || null,
  }),
  fromRow: (r) => {
    return {
      id: String(r.id),
      eventId: String(r.event_id ?? ""),
      itemId: (r.item_id as string) ?? undefined,
      name: String(r.name ?? ""),
      category: String(r.category ?? ""),
      unit: (r.unit as string) ?? undefined,
      kind: (r.kind as MaterialKind) === "consumivel" ? "consumivel" : "reutilizavel",
      qty: num(r.qty, 1),
      critical: Boolean(r.critical),
      origin: (r.origin as Origem) ?? "manual",
      originRef: (r.origin_ref as string) ?? undefined,
      originLabel: String(r.origin_label ?? ""),
      vehicleId: (r.vehicle_id as string) ?? undefined,
      loadedAt: (r.loaded_at as string) ?? undefined,
      loadedBy: (r.loaded_by as string) ?? undefined,
      returnedAt: (r.returned_at as string) ?? undefined,
      returnedBy: (r.returned_by as string) ?? undefined,
      missing: Boolean(r.missing),
      usedQty: r.used_qty === null || r.used_qty === undefined ? undefined : num(r.used_qty),
      note: (r.note as string) ?? undefined,
    };
  },
  order: { column: "category", ascending: true },
  fileCompare: (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  /**
   * Compare-and-set sobre o `updated_at`.
   *
   * Esta é a tabela com mais escritas simultâneas de todo o sistema, e a única
   * que é editada por várias pessoas ao mesmo tempo POR DESENHO: a checklist de
   * carga de um evento, com duas ou três pessoas a marcar no telemóvel enquanto
   * carregam a carrinha. Um marca «carregado», outro marca «em falta» na mesma
   * linha um segundo depois — e sem comparação o segundo repõe `loaded_at` e
   * `loaded_by` a nulo, porque a leitura dele é anterior. O material aparece
   * por carregar depois de ter sido carregado; alguém volta atrás para o
   * procurar e não o encontra, porque já está na carrinha.
   */
  touch: true,
};

const repo = createRepository(mapper);

export const listAllEventItems = (): Promise<EventMaterialItem[]> => repo.list();

/**
 * As linhas de UM evento — filtradas pela base de dados, não em memória.
 *
 * Era um `list()` da tabela toda seguido de um `filter`: a checklist de um
 * evento trazia as linhas de TODOS os eventos já feitos para dentro da função,
 * e isto é lido do telemóvel a meio de uma carga. O `where()` faz o filtro onde
 * ele é barato, e serve os dois backends (o de ficheiro leva o predicado
 * equivalente).
 */
export async function listItemsOfEvent(eventId: string): Promise<EventMaterialItem[]> {
  return (await repo.where("event_id", eventId, (i) => i.eventId === eventId)).sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

export async function addEventItem(
  input: Omit<EventMaterialItem, "id"> & { id?: string },
): Promise<EventMaterialItem> {
  const linha: EventMaterialItem = { ...input, id: input.id || randomUUID() };
  await repo.create(linha);
  return linha;
}

export const updateEventItem = (
  id: string,
  patch: Partial<EventMaterialItem>,
): Promise<EventMaterialItem | null> => repo.update(id, patch);

/**
 * Ler-mudar-escrever sobre a linha FRESCA, com o bloqueio optimista do
 * `touch`: quem decide se uma marcação ganha tem de decidir sobre o que está
 * na base agora, e não sobre o que leu no início do pedido.
 */
export const updateEventItemWith = (
  id: string,
  mutate: (current: EventMaterialItem) => EventMaterialItem,
): Promise<EventMaterialItem | null> => repo.updateWith(id, mutate);

export const removeEventItem = (id: string): Promise<void> => repo.remove(id);
export const obterEventItem = (id: string): Promise<EventMaterialItem | null> => repo.get(id);
/** Volta da Reciclagem com o MESMO id. */
export const reporEventItem = (l: EventMaterialItem): Promise<void> => repo.create(l);

/**
 * Quantos apagamentos podem estar no ar ao mesmo tempo.
 *
 * Não há apagamento em bloco no `Repository` (só `remove(id)`), e apagar uma
 * linha de cada vez EM SÉRIE faz uma checklist de duzentas linhas custar
 * duzentas idas ao servidor uma atrás da outra — regenerar a checklist ficava
 * parada segundos. Em grupos, é uma espera em vez de duzentas; com tecto,
 * porque disparar as duzentas de uma vez é o outro extremo (o mesmo oito de
 * `proposal-storage.duplicarFotosParaPedido`).
 */
const APAGAR_EM_PARALELO = 8;

/** Todas as linhas de um evento — para quem regenera ou apaga a checklist. */
export async function removeItemsOfEvent(eventId: string): Promise<void> {
  const linhas = await listItemsOfEvent(eventId);
  for (let i = 0; i < linhas.length; i += APAGAR_EM_PARALELO) {
    await Promise.all(linhas.slice(i, i + APAGAR_EM_PARALELO).map((l) => repo.remove(l.id)));
  }
}
