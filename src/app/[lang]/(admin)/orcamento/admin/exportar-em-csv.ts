/**
 * Os pedidos, as propostas, os pagamentos e os convidados em CSV (Excel,
 * Numbers e Sheets: UTF-8 com BOM e `;`, como em Portugal).
 *
 * Saiu do `export.ts` (17/11) por uma razão de peso: a lista de pedidos
 * exporta em CSV e importava o `export.ts` inteiro — as folhas de impressão e
 * o calendário — no primeiro descarregamento do painel. O CSV é pequeno e fica
 * no pacote; a impressão fica no `export.ts`, e o painel vai buscá-la a pedido.
 */
import type { Proposal, Quote } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from "@/lib/orcamento/data";
import { contractedAmounts } from "@/lib/orcamento/dossier";
import { round2 } from "@/lib/money";
import { todayKey } from "./util";

/** O nome do tipo de evento («Casamento», «Conferência»…), para o CSV e para a impressão. */
export function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "";
}

/** Escape a single CSV cell (handles quotes, separators, newlines) and neutralises
 *  CSV formula injection (CWE-1236): a STRING whose text begins with = + - @ (or a
 *  leading tab/CR) is treated as a formula by Excel/Sheets/Numbers when the file is
 *  opened. Client-supplied data (name, message, location, guest names) flows here,
 *  so a lead like `=HYPERLINK(...)` could execute in the admin's spreadsheet. We
 *  prefix such cells with a quote so they are read as text — but NEVER a numeric
 *  value, so a treasury amount like -100 stays an intact number. */
function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  const guarded = typeof v !== "number" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** Build a `;`-separated CSV string (PT locale) with a UTF-8 BOM for Excel. */
export function toCsv(rows: (string | number)[][]): string {
  const body = rows.map((r) => r.map(cell).join(";")).join("\r\n");
  return "﻿" + body;
}

/** Trigger a client-side download of a CSV file. */
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_revisao: "Em Revisão",
  a_preparar: "A Preparar Proposta",
  cotado: "Cotado",
  aceite: "Aceite",
  rejeitado: "Rejeitado",
};

/** Format an ISO submission timestamp for the pt-PT export, guarding against an
 *  empty/malformed value: `new Date("")`/`new Date("nope")` is an Invalid Date
 *  whose `.toLocaleString()` emits the literal "Invalid Date" — garbage in a
 *  spreadsheet cell. Return "" for anything unparseable so the column stays blank. */
function submittedStamp(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-PT");
}

/** Export a list of quotes (pedidos) as CSV rows. */
export function quotesToCsvRows(quotes: Quote[]): (string | number)[][] {
  const header = [
    "ID",
    "Data submissão",
    "Estado",
    "Nome",
    "Email",
    "Telefone",
    "Empresa",
    "NIF",
    "Categoria",
    "Tipo de evento",
    "Pacote",
    "Convidados",
    "Data do evento",
    "Local",
    "Duração (h)",
    "Estimativa (€)",
    "Cotado (€)",
    "Responsável",
    "Ref. contrato",
    "Motivo de perda",
    "Arquivado",
  ];
  const rows = quotes.map((q) => [
    q.id,
    submittedStamp(q.submittedAt),
    STATUS_LABEL[q.status] ?? q.status,
    q.name,
    q.email,
    q.phone,
    q.company ?? "",
    q.nif ?? "",
    CATEGORIES.find((c) => c.id === q.category)?.label ?? "",
    eventTypeLabel(q),
    PACKAGES.find((p) => p.id === q.packageTier)?.label ?? "",
    q.guests ?? 0,
    q.date ?? "",
    q.location ?? "",
    q.duration ?? "",
    q.priceBreakdown?.total ?? "",
    q.quotedPrice ?? "",
    q.assignedTo ?? "",
    q.contractRef ?? "",
    q.lostReason ?? "",
    q.archived ? "Sim" : "",
  ]);
  return [header, ...rows];
}

const ESTADO_DA_PROPOSTA: Record<string, string> = {
  rascunho: "Por enviar",
  enviada: "Enviada",
  em_negociacao: "Em negociação",
  aceite: "Aceite",
  rejeitada: "Recusada",
};

/**
 * As propostas escolhidas, para a folha de cálculo (BO 4, «Exportar CSV» das
 * Propostas). Os valores vão em número, arredondados ao cêntimo, para a folha
 * os poder somar; as datas vão como o resto do export (`AAAA-MM-DD`).
 */
export function propostasToCsvRows(propostas: readonly Proposal[]): (string | number)[][] {
  const header = [
    "ID",
    "Pedido",
    "Cliente",
    "Email",
    "Estado",
    "Criada",
    "Enviada",
    "Validade",
    "Subtotal (€)",
    "IVA (€)",
    "Total c/ IVA (€)",
  ];
  const dia = (iso?: string) => (iso ? iso.slice(0, 10) : "");
  const rows = propostas.map((p) => [
    p.id,
    p.quoteId,
    p.clientName,
    p.clientEmail,
    ESTADO_DA_PROPOSTA[p.status] ?? p.status,
    dia(p.createdAt),
    dia(p.sentAt),
    dia(p.validUntil),
    round2(p.subtotal ?? 0),
    round2(p.vat ?? 0),
    round2(p.total ?? 0),
  ]);
  return [header, ...rows];
}

/** O tipo de cada pagamento, como se escreve no CSV e na impressão. */
export const PAYMENT_KIND_LABEL: Record<string, string> = {
  sinal: "Sinal",
  pagamento: "Pagamento",
  saldo: "Saldo final",
};

/** Flatten every payment across all quotes into CSV rows (treasury export). */
export function paymentsToCsvRows(quotes: Quote[]): (string | number)[][] {
  const header = ["Evento (ID)", "Cliente", "Tipo", "Valor c/IVA (€)", "Data", "Estado", "Nota"];
  const rows: (string | number)[][] = [];
  for (const q of quotes) {
    for (const p of q.payments ?? []) {
      rows.push([
        q.id,
        q.name,
        PAYMENT_KIND_LABEL[p.kind] ?? p.kind,
        p.amount ?? 0,
        p.date ?? "",
        p.paid ? "Pago" : "Por receber",
        p.note ?? "",
      ]);
    }
  }
  rows.sort((a, b) => String(a[4]).localeCompare(String(b[4])));
  return [header, ...rows];
}

/**
 * O dia civil de quem carrega no botão, `yyyy-mm-dd`, para o nome do ficheiro.
 *
 * `toISOString()` é UTC e não serve: em Portugal, no Verão (UTC+1), quem
 * exporta entre a meia-noite e a 01:00 levava para casa um ficheiro carimbado
 * com ONTEM — e no dia seguinte tinha dois `clientes-<data>.csv` com a mesma
 * data e conteúdos diferentes. `todayKey` (do mesmo painel) faz a conta no
 * calendário local, que é o único que o utilizador reconhece.
 */
export function dateStamp(): string {
  return todayKey();
}

/** As respostas dos convidados, como se escrevem no CSV e na impressão. */
export const RSVP_LABEL: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  recusado: "Recusado",
};

/** Export an event's guest list (RSVP) as CSV rows. */
export function guestsToCsvRows(q: Quote): (string | number)[][] {
  const header = ["Convidado / Família", "Pessoas", "RSVP", "Nota"];
  const rows = (q.guestList ?? []).map((g) => [
    g.name,
    g.party ?? 1,
    RSVP_LABEL[g.rsvp] ?? g.rsvp,
    g.note ?? "",
  ]);
  return [header, ...rows];
}
