import type { Quote } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";

/**
 * Os rótulos que o CSV (`exportar-em-csv.ts`) e as folhas de impressão
 * (`export.ts`) escrevem do mesmo modo. Vivem à parte para a impressão não
 * depender do módulo do CSV, nem o CSV do da impressão.
 */

/** O nome do tipo de evento («Casamento», «Conferência»…), para o CSV e para a impressão. */
export function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "";
}

/** O tipo de cada pagamento, como se escreve no CSV e na impressão. */
export const PAYMENT_KIND_LABEL: Record<string, string> = {
  sinal: "Sinal",
  pagamento: "Pagamento",
  saldo: "Saldo final",
};

/** As respostas dos convidados, como se escrevem no CSV e na impressão. */
export const RSVP_LABEL: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  recusado: "Recusado",
};
