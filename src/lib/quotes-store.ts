import "server-only";
import { randomBytes, createHmac } from "node:crypto";
import type { Quote, QuoteSummary } from "@/lib/orcamento/types";
import { CAMPOS_SO_DO_DETALHE } from "@/lib/orcamento/types";
import { createRepository, type Mapper } from "./repository";
import { getSupabase } from "./supabase";

/**
 * Generates a quote reference id (e.g. LIQ-M1A2B3-9F3C7A1B2D4E5F60). The
 * random suffix is hex (each nibble uniform, no modulo bias) and wide enough
 * (16 hex chars = 64 bits) that brute-forcing/enumerating other clients'
 * references is infeasible even without the rate limit the GET route also
 * applies.
 */
export function generateQuoteId(): string {
  const now = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(8).toString("hex").toUpperCase();
  return `LIQ-${now}-${rand}`;
}

/**
 * Deterministic, unguessable id derived from a client-supplied submission id.
 * A retried POST (the response was lost, the visitor resubmitted the same
 * enquiry) carries the same submissionId → the same id → the route detects the
 * existing quote and returns it instead of creating a duplicate lead + email.
 *
 * HMAC over a server-side key (not a plain hash) so the id can't be computed or
 * enumerated from the submissionId alone — it stays as unguessable as the
 * random ids the confirmation page relies on for its public GET-by-id.
 */
export function quoteIdFor(submissionId: string): string {
  const key = process.env.SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET ?? "liquen-idem-dev";
  const h = createHmac("sha256", key).update(`quote:${submissionId}`).digest("hex").toUpperCase();
  return `LIQ-${h.slice(0, 6)}-${h.slice(6, 22)}`;
}

/**
 * Storage layer for quote requests. The full quote is kept in a `data` jsonb
 * column (with status/name/email mirrored for listing/searching); the file
 * fallback stores the quote object verbatim.
 */
export const mapper: Mapper<Quote> = {
  table: "quotes",
  fileName: "quotes.json",
  selectColumns: "data",
  getId: (q) => q.id,
  toRow: (q) => ({ id: q.id, status: q.status, name: q.name, email: q.email, data: q }),
  fromRow: (r) => r.data as Quote,
  order: { column: "created_at", ascending: false },
  fileCompare: (a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt),
  touch: true,
  beforeUpdate: (q) => ({ ...q, lastUpdated: new Date().toISOString() }),
};

const repo = createRepository(mapper);

export const createQuote = (quote: Quote): Promise<void> => repo.create(quote);
export const listQuotes = (): Promise<Quote[]> => repo.list();

/**
 * O mesmo pedido sem as colecções que só o pedido ABERTO mostra — ver
 * {@link CAMPOS_SO_DO_DETALHE}, que explica campo a campo o que sai e,
 * sobretudo, o que NÃO pode sair.
 *
 * Apaga em vez de escolher: uma lista de campos a MANTER ficava a dever um
 * campo novo cada vez que alguém acrescentasse um a `Quote`, e o defeito era
 * silencioso (um campo que simplesmente não chegava à lista). Assim, o que é
 * novo viaja por omissão e só sai daqui quem for escrito nesta lista.
 */
export function resumirQuote(quote: Quote): QuoteSummary {
  const resumo: Quote = { ...quote };
  for (const campo of CAMPOS_SO_DO_DETALHE) delete resumo[campo];
  return resumo;
}

/**
 * A lista de pedidos para o ECRÃ DE LISTA.
 *
 * O que isto poupa é a viagem, não a leitura: o pedido inteiro vive numa só
 * coluna `data` (jsonb), por isso a base de dados devolve na mesma o blob todo
 * e o corte é feito aqui. O que deixa de acontecer é o blob todo ser
 * SERIALIZADO para dentro do HTML da página de administração — que é onde os
 * megabytes se pagam, uma vez por carregamento e antes de haver ecrã.
 */
export const listQuoteSummaries = async (): Promise<QuoteSummary[]> =>
  (await repo.list()).map(resumirQuote);
export const getQuote = (id: string): Promise<Quote | null> => repo.get(id);

/**
 * Só o ESTADO de um pedido, sem o pedido.
 *
 * Existe para o autosave do estúdio (`proposta-rascunho`), que corre a cada
 * pausa na escrita e só precisa de saber se o pedido ainda está antes de «A
 * preparar proposta». Ler o pedido inteiro para isso era trazer a coluna
 * `data` toda — histórico, mensagens, pagamentos — e desfazê-la em JSON a cada
 * tecla. O `status` vive espelhado na sua coluna (`toRow`, acima): uma linha
 * pela chave primária, um texto curto.
 *
 * Sem base de dados (desenvolvimento), cai no pedido inteiro: o disco local
 * não tem colunas, e lá o custo não se paga a ninguém.
 *
 * `undefined` quando o pedido não existe — que é diferente de existir sem
 * estado, e quem chama não mexe num pedido que não há.
 */
export async function getQuoteStatus(id: string): Promise<Quote["status"] | null | undefined> {
  const sb = getSupabase();
  if (!sb) {
    const q = await repo.get(id);
    return q ? (q.status ?? null) : undefined;
  }
  const { data, error } = await sb.from(mapper.table).select("status").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  const status = (data as { status?: unknown }).status;
  return typeof status === "string" ? (status as Quote["status"]) : null;
}
export const updateQuote = (id: string, updates: Partial<Quote>): Promise<Quote | null> =>
  repo.update(id, updates);
/** Update derived from the freshly-read quote — use for appends (activity log,
    payments…) so concurrent writers can't drop each other's entries. */
export const updateQuoteWith = (
  id: string,
  mutate: (current: Quote) => Quote,
): Promise<Quote | null> => repo.updateWith(id, mutate);
/** Permanently remove a quote. Distinct from archiving (a soft-delete via the
    `archived` flag, still restorable and kept for the record) — this is a hard
    delete for junk/test leads and cannot be undone. */
export const deleteQuote = (id: string): Promise<void> => repo.remove(id);
/** Volta da Reciclagem com o MESMO id e a data em que chegou (`created_at`). */
export const reporPedido = (q: Quote): Promise<void> =>
  repo.create(q, { created_at: q.submittedAt });
