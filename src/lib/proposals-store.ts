import "server-only";
import type { Proposal } from "@/lib/orcamento/types";
import { ehIdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { createRepository, type Mapper } from "./repository";

export const mapper: Mapper<Proposal> = {
  table: "proposals",
  fileName: "proposals.json",
  getId: (p) => p.id,
  toRow: (p) => ({
    id: p.id,
    quote_id: p.quoteId,
    client_name: p.clientName,
    client_email: p.clientEmail,
    currency: p.currency,
    line_items: p.lineItems,
    vat_rate: p.vatRate,
    subtotal: p.subtotal,
    vat: p.vat,
    total: p.total,
    valid_until: p.validUntil || null,
    notes: p.notes || null,
    status: p.status,
    sent_at: p.sentAt || null,
    responded_at: p.respondedAt || null,
    follow_up_at: p.followUpAt || null,
    follow_up_note: p.followUpNote || null,
    lost_reason: p.lostReason || null,
    lost_note: p.lostNote || null,
    chosen_version: p.versaoEscolhida || null,
    // O documento do Estúdio (jsonb `proposals.doc`) só entra na linha quando a
    // proposta o TEM. Duas razões, ambas concretas:
    //  · uma proposta de linhas (criada em /api/propostas) nunca teve `doc` e
    //    não passa a escrever uma coluna a null por causa disto;
    //  · numa base onde o `alter table` de db/schema.sql ainda não correu, a
    //    coluna não existe — escrevê-la sempre partia tudo, até um simples
    //    "aceitar proposta". Assim só quem GRAVA um documento é que apanha o
    //    erro de coluna em falta, e a rota do estúdio trata-o (isMissingTable).
    ...(p.doc !== undefined ? { doc: p.doc } : {}),
    // Mesmo cuidado do `doc`: só entram na linha quando existem, para uma base
    // onde o `alter table` ainda não correu continuar a aceitar tudo o resto.
    ...(p.pdfSha256 !== undefined ? { pdf_sha256: p.pdfSha256 } : {}),
    ...(p.pdfBytes !== undefined ? { pdf_bytes: p.pdfBytes } : {}),
    // A língua em que a proposta foi apresentada ao casal, pelo mesmo cuidado
    // do `doc`: só entra na linha quando existe. Uma proposta de linhas
    // (/api/propostas) e todas as que são anteriores a este campo continuam a
    // gravar-se numa base onde o `alter table` ainda não correu.
    ...(p.idioma !== undefined ? { idioma: p.idioma } : {}),
    // A versão do conteúdo, com o mesmo cuidado do `doc`: só entra na linha
    // quando existe. Uma proposta de linhas (/api/propostas) nunca a tem, e
    // numa base onde o `alter table` ainda não correu escrevê-la sempre partia
    // até um simples "aceitar proposta".
    ...(p.versaoSelo !== undefined ? { versao_selo: p.versaoSelo } : {}),
    ...(p.versaoNumero !== undefined ? { versao_numero: p.versaoNumero } : {}),
    ...(p.versaoEm !== undefined ? { versao_em: p.versaoEm } : {}),
  }),
  fromRow: (r) => ({
    id: String(r.id),
    quoteId: String(r.quote_id ?? ""),
    clientName: String(r.client_name ?? ""),
    clientEmail: String(r.client_email ?? ""),
    currency: String(r.currency ?? "EUR"),
    lineItems: (r.line_items as Proposal["lineItems"]) ?? [],
    vatRate: Number(r.vat_rate ?? 0.23),
    subtotal: Number(r.subtotal ?? 0),
    vat: Number(r.vat ?? 0),
    total: Number(r.total ?? 0),
    validUntil: (r.valid_until as string) ?? undefined,
    notes: (r.notes as string) ?? undefined,
    status: (r.status as Proposal["status"]) ?? "rascunho",
    createdAt: String(r.created_at ?? new Date().toISOString()),
    sentAt: (r.sent_at as string) ?? undefined,
    respondedAt: (r.responded_at as string) ?? undefined,
    followUpAt: (r.follow_up_at as string) ?? undefined,
    followUpNote: (r.follow_up_note as string) ?? undefined,
    lostReason: (r.lost_reason as Proposal["lostReason"]) ?? undefined,
    lostNote: (r.lost_note as string) ?? undefined,
    versaoEscolhida: (r.chosen_version as Proposal["versaoEscolhida"]) ?? undefined,
    // Simétrico do `toRow`: sem documento gravado (proposta antiga, proposta de
    // linhas, ou coluna ainda por criar) a propriedade nem aparece — é o que
    // mantém `getProposal` a devolver exatamente o que devolvia antes desta
    // coluna existir, e o portal do cliente a esconder o botão do PDF em vez de
    // oferecer um documento que não há.
    ...(r.doc && typeof r.doc === "object" ? { doc: r.doc as Proposal["doc"] } : {}),
    ...(r.pdf_sha256 ? { pdfSha256: String(r.pdf_sha256) } : {}),
    ...(r.pdf_bytes != null ? { pdfBytes: Number(r.pdf_bytes) } : {}),
    // Simétrico do `toRow`, com uma exigência a mais: só se lê o que é MESMO
    // uma língua que se sabe desenhar. A coluna tem um `check`, mas a aplicação
    // não pode depender de ele existir numa base antiga — e um valor estranho a
    // entrar aqui espalhava-se pelo email, pela página do aceite e pelo PDF.
    // O que não é língua vale o mesmo que a ausência, e a ausência é português.
    ...(ehIdiomaDaProposta(r.idioma) ? { idioma: r.idioma } : {}),
    // Simétrico do `toRow`. Uma proposta anterior a estas colunas volta sem
    // elas, que é o que o `proximaVersao` lê como «ainda não tem versão» — e a
    // primeira gravação a seguir dá-lhe a 1.
    ...(r.versao_selo ? { versaoSelo: String(r.versao_selo) } : {}),
    ...(r.versao_numero != null ? { versaoNumero: Number(r.versao_numero) } : {}),
    ...(r.versao_em ? { versaoEm: String(r.versao_em) } : {}),
  }),
  order: { column: "created_at", ascending: false },
  fileCompare: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  /**
   * Compare-and-set sobre o `updated_at` (ver `SupabaseBackend.persist`).
   *
   * A coluna já existia em `db/schema.sql` desde o primeiro dia e nunca foi
   * escrita nem lida — a protecção estava montada e desligada. O que corria sem
   * ela: a proposta é o documento que seguiu para o casal, e há pelo menos três
   * caminhos a escrevê-la ao mesmo tempo — o Estúdio a gravar o `doc`, a rota
   * `/api/propostas/[id]` a mudar o estado ou a pôr um motivo de perda, e o
   * portal do cliente a registar o aceite (`/api/proposta`). Cada um manda um
   * patch pequeno, mas o `update` reescreve a LINHA INTEIRA a partir da leitura
   * que fez: quem tivesse aberto a proposta antes do aceite repunha o estado em
   * «enviada» ao gravar uma nota, e o aceite do casal desaparecia sem erro
   * nenhum. Agora essa escrita é recusada, o `updateWith` relê e volta a
   * aplicar o patch por cima do aceite — sobrevivem os dois.
   */
  touch: true,
};

const repo = createRepository(mapper);

export const createProposal = (p: Proposal): Promise<void> => repo.create(p);
export const listAllProposals = (): Promise<Proposal[]> => repo.list();
export const getProposal = (id: string): Promise<Proposal | null> => repo.get(id);
export const updateProposal = (id: string, patch: Partial<Proposal>): Promise<Proposal | null> =>
  repo.update(id, patch);
/** Alteração feita sobre a proposta acabada de ler — não escreve por cima do
    que outro gesto gravou entretanto (ver `updateWith` no repositório). */
export const updateProposalWith = (
  id: string,
  mutate: (current: Proposal) => Proposal,
): Promise<Proposal | null> => repo.updateWith(id, mutate);
export const deleteProposal = (id: string): Promise<void> => repo.remove(id);
/** Volta da Reciclagem com o MESMO id e a data em que foi criada. */
export const reporProposta = (p: Proposal): Promise<void> =>
  repo.create(p, { created_at: p.createdAt });
export const listProposalsForQuote = (quoteId: string): Promise<Proposal[]> =>
  repo.where("quote_id", quoteId, (p) => p.quoteId === quoteId);
/** The newest proposal for a quote (created_at descending), or null. The client
    portal shows a quote's current proposal — the most recently created one. */
export const getProposalByQuote = (quoteId: string): Promise<Proposal | null> =>
  listProposalsForQuote(quoteId).then((rows) => rows[0] ?? null);
