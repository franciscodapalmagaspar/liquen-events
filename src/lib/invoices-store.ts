import "server-only";
import { createRepository, type Mapper } from "./repository";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LIVRO DE FACTURAS DEIXOU DE SER ESCRITO — MAS NÃO FOI APAGADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A casa passou a emitir facturas noutro sítio, e todo o código que EMITIA
 * (numeração sequencial, PDF, rotas, painel do back office, portal do cliente)
 * saiu desta aplicação.
 *
 * O que ficou aqui é deliberado e é só isto: LER. A tabela `invoices` continua
 * na base de dados com as facturas que já foram emitidas — cada uma é um
 * documento fiscal, e apagar registos fiscais não é uma operação reversível.
 * Este módulo sobrevive para que a CÓPIA DE SEGURANÇA os continue a copiar e a
 * restaurar (`backup-restore.ts`), e nada mais o escreve.
 *
 * Não há `createInvoice`, `updateInvoice`, `deleteInvoice` nem
 * `nextInvoiceNumber` — se voltarem a ser precisos, voltam com a decisão de
 * voltar a facturar aqui dentro, não por engano.
 */
export interface Invoice {
  id: string;
  number: string;
  quoteId: string;
  clientName: string;
  clientEmail: string;
  kind: "sinal" | "saldo" | "total";
  amount: number; // com IVA, em €
  vatRate: number; // ex.: 0.23
  issuedAt: string; // yyyy-mm-dd (data de emissão)
  dueAt?: string; // yyyy-mm-dd (vencimento)
  paidAt?: string; // yyyy-mm-dd
  status: "emitida" | "paga" | "anulada";
  note?: string;
}

export const mapper: Mapper<Invoice> = {
  table: "invoices",
  fileName: "invoices.json",
  getId: (i) => i.id,
  toRow: (i) => ({
    id: i.id,
    number: i.number,
    // Vazio é «sem pedido» (chave estrangeira desde o P5; ver contracts-store).
    quote_id: i.quoteId || null,
    client_name: i.clientName,
    client_email: i.clientEmail,
    kind: i.kind,
    amount: i.amount,
    vat_rate: i.vatRate,
    issued_at: i.issuedAt,
    due_at: i.dueAt || null,
    paid_at: i.paidAt || null,
    status: i.status,
    note: i.note || null,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    number: String(r.number ?? ""),
    quoteId: String(r.quote_id ?? ""),
    clientName: String(r.client_name ?? ""),
    clientEmail: String(r.client_email ?? ""),
    kind: (r.kind as Invoice["kind"]) ?? "total",
    amount: Number(r.amount ?? 0),
    vatRate: Number(r.vat_rate ?? 0.23),
    issuedAt: String(r.issued_at ?? new Date().toISOString().slice(0, 10)),
    dueAt: (r.due_at as string) ?? undefined,
    paidAt: (r.paid_at as string) ?? undefined,
    status: (r.status as Invoice["status"]) ?? "emitida",
    note: (r.note as string) ?? undefined,
  }),
  order: { column: "issued_at", ascending: false },
  fileCompare: (a, b) => {
    const d = +new Date(b.issuedAt) - +new Date(a.issuedAt);
    // Same day: keep the higher invoice number first (stable, human order).
    return d !== 0 ? d : b.number.localeCompare(a.number);
  },
  /**
   * Compare-and-set sobre o `updated_at`. Nada nesta aplicação escreve hoje na
   * tabela (ver o topo do módulo) — fica ligado porque o RESTAURO da cópia de
   * segurança escreve, e uma linha fiscal restaurada não pode perder uma
   * escrita para outra que corra ao mesmo tempo.
   */
  touch: true,
};

const repo = createRepository(mapper);

/** Só leitura — é o que a cópia de segurança precisa (ver o topo do módulo). */
export const listInvoices = (): Promise<Invoice[]> => repo.list();
/** As faturas de um pedido, pelo índice `invoices_quote_id_idx`. */
export const listInvoicesForQuote = (quoteId: string): Promise<Invoice[]> =>
  repo.where("quote_id", quoteId, (i) => (i.quoteId ?? "").trim() === quoteId);

/**
 * Reconhece uma violação de unicidade do Postgres (SQLSTATE 23505) vinda do
 * Supabase — o backstop das corridas TOCTOU em que dois pedidos concorrentes
 * tentam criar a mesma linha: o índice único deixa só um vencer o insert, e o
 * que perde apanha este erro, que é tratado como "já existe" e não como falha.
 *
 * Vive neste módulo por razões históricas (nasceu para a emissão sinal/saldo,
 * que já não se faz aqui) e é usado por quem tem índices únicos próprios:
 * `temas`, `biblioteca/etiquetas` e `overview-settings-store`. O backend de
 * ficheiro (dev) serializa as escritas e não chega aqui.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23505") return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === "string" && /duplicate key value|unique constraint/i.test(msg);
}
