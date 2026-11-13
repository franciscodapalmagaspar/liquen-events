import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REPOSIÇÃO DE UMA CÓPIA DE SEGURANÇA — testes.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto escreve por cima do histórico de um negócio a sério. Os testes seguem
 * essa ordem de prioridades:
 *
 *   1. O PERCURSO REAL, ponta a ponta e sem atalhos: exportar → apagar tudo →
 *      repor → exportar outra vez → comparar. É a única prova de que a
 *      conversão de ida e volta (o `mapper` de cada store) não perde nada pelo
 *      caminho — e foi ela que apanhou o `created_at` que os `toRow` não
 *      escrevem.
 *   2. O CONTADOR DE FATURAS. Tem secção própria: repor um contador abaixo do
 *      número mais alto já emitido reemite números de fatura que já saíram, e
 *      num livro fiscal português isso é um problema legal.
 *   3. OS CASOS MAUS: ficheiro de outra aplicação, truncado, com um conjunto
 *      da forma errada, com ids repetidos, de uma versão futura.
 *   4. O ENSAIO NÃO ESCREVE. Verificado contando as escritas no cliente falso.
 *
 * A base de dados é um Supabase FALSO em memória (`fakeSupabase`), o que faz
 * correr o caminho de produção verdadeiro — os stores, os `mapper`, o
 * `SupabaseBackend` — em vez do fallback de ficheiro. Também conta cada
 * `delete`/`insert`/`upsert`, o que torna "o ensaio não escreveu nada" uma
 * asserção e não uma esperança.
 */

// ── Supabase falso (em memória) ─────────────────────────────────────────────

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: new Map<string, Row[]>(),
  writes: [] as string[],
  /** Tabelas que devem falhar, e em que operação. */
  fail: new Map<string, "read" | "write" | "all">(),
  /**
   * Colunas que uma tabela NÃO tem — o retrato de uma base onde o
   * `alter table ... add column if not exists` do db/schema.sql ainda não
   * correu. Pedi-las (ou escrevê-las) devolve o 42703 do Postgres, tal como lá
   * fora. É com isto que se põe à prova a sonda de pré-voo das propostas.
   */
  missingColumns: new Map<string, Set<string>>(),
  /** A coluna por que cada tabela foi apagada. É o que prova que a reposição
   *  usa a chave que o `mapper` declara e não `id` à letra. */
  deleteColumns: new Map<string, string>(),
  configured: true,
}));

/** O erro que o Postgres devolve para uma coluna que não existe. */
function undefinedColumn(table: string, column: string) {
  return {
    code: "42703",
    message: `column ${table}.${column} does not exist`,
  };
}

/** A primeira coluna pedida/escrita que a tabela não tem, se houver. */
function missingColumnIn(table: string, columns: readonly string[]): string | null {
  const absent = db.missingColumns.get(table);
  if (!absent) return null;
  return columns.map((c) => c.trim()).find((c) => absent.has(c)) ?? null;
}

/**
 * O `like` do PostgREST em expressão regular: `%` é o curinga, `_` é um
 * carácter, e `\` escapa qualquer um deles. Existe aqui porque a varredura dos
 * RASCUNHOS do estúdio é um `like` sobre o prefixo (`proposal-draft:%`) e um
 * fake que ignorasse o filtro devolvia a tabela `app_state` inteira — incluindo
 * os marcadores de operação, que é exactamente o que a cópia não pode levar.
 */
function likeParaRegExp(padrao: string): RegExp {
  const escapar = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let fonte = "";
  for (let i = 0; i < padrao.length; i++) {
    const c = padrao[i];
    if (c === "\\" && i + 1 < padrao.length) fonte += escapar(padrao[++i]);
    else if (c === "%") fonte += ".*";
    else if (c === "_") fonte += ".";
    else fonte += escapar(c);
  }
  return new RegExp(`^${fonte}$`);
}

/** A chave primária de cada tabela, para o `upsert` do fake saber o que é a
 *  mesma linha. `app_state` é a que obriga a isto: a chave dela é `key`, e
 *  procurar por `id` fazia duas chaves diferentes passarem pela mesma linha. */
function chavePrimaria(table: string): string {
  if (table === "invoice_counters") return "year";
  if (table === "app_state") return "key";
  return "id";
}

function shouldFail(table: string, op: "read" | "write"): boolean {
  const mode = db.fail.get(table);
  return mode === "all" || mode === op;
}

function rowsOf(table: string): Row[] {
  if (!db.tables.has(table)) db.tables.set(table, []);
  return db.tables.get(table)!;
}

/**
 * Um construtor de consultas mínimo mas fiel ao que o código usa: `select`
 * (com `order`/`eq`/`maybeSingle`/`limit`), `insert`, `delete().not()` e
 * `upsert`. É `thenable`, como o do supabase-js, para poder ser esperado tanto
 * directamente como depois de `.order(...)`.
 */
function fakeSupabase() {
  const client = {
    from(table: string) {
      const api = {
        select(columns?: string) {
          const q: Record<string, unknown> = {};
          let filtered: Row[] | null = null;
          // Uma coluna que a tabela não tem rebenta a leitura inteira (42703),
          // como no Postgres. `*` não pede coluna nenhuma pelo nome.
          const absent =
            columns && columns !== "*" ? missingColumnIn(table, columns.split(",")) : null;
          const builder = {
            order(column: string, opts?: { ascending?: boolean }) {
              // A primeira ordem manda; as seguintes (o desempate pela chave)
              // só decidem empates — como no PostgREST.
              q.ordens = [
                ...((q.ordens as { column: string; ascending: boolean }[]) ?? []),
                { column, ascending: opts?.ascending !== false },
              ];
              return builder;
            },
            limit(n?: number) {
              // Respeitado a sério: a varredura dos rascunhos pede `limite + 1`
              // linhas justamente para saber se ficou truncada, e um `limit`
              // decorativo fazia esse mecanismo passar por testado sem o estar.
              if (typeof n === "number") q.limit = n;
              return builder;
            },
            range(desde: number, ate: number) {
              // Respeitado a sério, como o `limit`: o `list()` pagina de 1000
              // em 1000 e pára numa página curta.
              q.range = [desde, ate];
              return builder;
            },
            eq(column: string, value: unknown) {
              filtered = (filtered ?? rowsOf(table)).filter((r) => r[column] === value);
              return builder;
            },
            like(column: string, padrao: string) {
              const re = likeParaRegExp(padrao);
              filtered = (filtered ?? rowsOf(table)).filter((r) =>
                re.test(String(r[column] ?? "")),
              );
              return builder;
            },
            async maybeSingle() {
              if (absent) return { data: null, error: undefinedColumn(table, absent) };
              if (shouldFail(table, "read"))
                return { data: null, error: new Error(`${table} em baixo`) };
              return { data: (filtered ?? rowsOf(table))[0] ?? null, error: null };
            },
            then(resolve: (v: { data: Row[] | null; error: unknown }) => unknown) {
              if (absent) {
                return Promise.resolve(
                  resolve({ data: null, error: undefinedColumn(table, absent) }),
                );
              }
              if (shouldFail(table, "read")) {
                return Promise.resolve(
                  resolve({ data: null, error: new Error(`${table} em baixo`) }),
                );
              }
              let data = [...(filtered ?? rowsOf(table))];
              const ordens = (q.ordens as { column: string; ascending: boolean }[]) ?? [];
              if (ordens.length > 0) {
                data.sort((a, b) => {
                  for (const order of ordens) {
                    const x = String(a[order.column] ?? "");
                    const y = String(b[order.column] ?? "");
                    const c = order.ascending ? x.localeCompare(y) : y.localeCompare(x);
                    if (c !== 0) return c;
                  }
                  return 0;
                });
              }
              data = data.map((r) => ({ ...r }));
              if (typeof q.limit === "number") data = data.slice(0, q.limit as number);
              if (q.range) {
                const [desde, ate] = q.range as [number, number];
                data = data.slice(desde, ate + 1);
              }
              return Promise.resolve(resolve({ data, error: null }));
            },
          };
          return builder;
        },
        async insert(payload: Row | Row[]) {
          if (shouldFail(table, "write")) return { error: new Error(`${table} recusa escritas`) };
          const list = Array.isArray(payload) ? payload : [payload];
          // Escrever numa coluna que não existe falha o lote INTEIRO — e o
          // `replaceAll` já apagou a tabela antes de chegar aqui. É exatamente
          // este o estrago que a sonda de pré-voo existe para evitar.
          for (const r of list) {
            const absent = missingColumnIn(table, Object.keys(r));
            if (absent) return { error: undefinedColumn(table, absent) };
          }
          db.writes.push(`insert:${table}:${list.length}`);
          rowsOf(table).push(...list.map((r) => ({ ...r })));
          return { error: null };
        },
        async upsert(payload: Row | Row[]) {
          if (shouldFail(table, "write")) return { error: new Error(`${table} recusa escritas`) };
          const list = Array.isArray(payload) ? payload : [payload];
          db.writes.push(`upsert:${table}:${list.length}`);
          const key = chavePrimaria(table);
          for (const r of list) {
            const existing = rowsOf(table).find((x) => x[key] === r[key]);
            if (existing) Object.assign(existing, r);
            else rowsOf(table).push({ ...r });
          }
          return { error: null };
        },
        delete() {
          // A coluna do filtro conta: filtrar por uma que a tabela não tem é o
          // 42703 do Postgres, e nesse caso NÃO se apaga nada — que é
          // exactamente o que acontecia à `biblioteca_fotos`, sem coluna `id`.
          const run = async (column?: string) => {
            if (shouldFail(table, "write")) return { error: new Error(`${table} recusa escritas`) };
            const absent = column ? missingColumnIn(table, [column]) : null;
            if (absent) return { error: undefinedColumn(table, absent) };
            if (column) db.deleteColumns.set(table, column);
            db.writes.push(`delete:${table}`);
            db.tables.set(table, []);
            return { error: null };
          };
          return {
            not: (column: string) => run(column),
            eq: (column: string) => run(column),
            then: (resolve: (v: unknown) => unknown) => run().then(resolve),
          };
        },
      };
      return api;
    },
  };
  return client;
}

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => (db.configured ? (fakeSupabase() as never) : null),
  isDatabaseConfigured: () => db.configured,
}));
vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  validateBackupFile,
  planRestore,
  applyRestore,
  RESTORE_TARGETS,
  RESTORE_EXCEPTIONS,
  type ValidBackup,
} from "./backup-restore";
import {
  planInvoiceCounters,
  parseInvoiceNumber,
  highestIssuedByYear,
  BACKUP_SCHEMA_VERSION,
} from "./backup-restore-types";
import { buildBackupPayload } from "@/app/api/backup/route";

// ── Um negócio pequeno mas completo, para o percurso ponta a ponta ──────────

const ONTEM = "2026-03-01T09:00:00.000Z";

/** Um documento do Estúdio como os que se guardam mesmo: texto, condições e os
 *  caminhos das fotos no bucket (nunca os bytes das imagens). */
const DOC_DO_ESTUDIO = {
  ref: "PO Decoração Casamento Ana Dias 16.05.2026",
  clientNames: "Ana Dias",
  eventType: "Casamento",
  eventDate: "16 de maio de 2026",
  location: "Évora",
  guests: "120 pax",
  serviceGroups: [{ letter: "a)", title: "Decoração Floral", items: [{ label: "Cerimónia" }] }],
  moodBoards: [{ title: "Cerimónia", images: ["LIQ-AAA-1/foto-1.jpg"] }],
  budgetItems: ["Decor Cerimónia"],
  totalLabel: "Valor Total Decoração",
  totalText: "10.000,00 € + IVA",
  coverImages: ["LIQ-AAA-1/capa.jpg", ""],
  condicoesGerais: ["Aos valores acresce o IVA à taxa legal em vigor."],
};

/** Um rascunho por acabar: a mesma proposta um passo antes de seguir, ainda só
 *  no estúdio. É o que se perdia por inteiro quando a cópia saltava a tabela. */
/**
 * A cópia de um email de proposta que saiu — o que se relê três semanas depois,
 * ao telefone, quando a pergunta é «o que é que nós lhes escrevemos?».
 */
const EMAIL_ENVIADO = {
  enviadoEm: ONTEM,
  para: "ana@exemplo.pt",
  porQuem: "Catarina",
  modelo: "registo-formal",
  idioma: "pt" as const,
  assunto: "A nossa proposta para o vosso casamento",
  texto: "Olá Ana, boa tarde,\n\nDe acordo com o solicitado, enviamos a nossa proposta.",
  anexo: { nome: "Proposta-Liquen.pdf", bytes: 421_337 },
  propostaId: "p-1",
};

const RASCUNHO_DO_ESTUDIO = {
  ...DOC_DO_ESTUDIO,
  totalText: "9.500,00 € + IVA (por confirmar)",
  moodBoards: [{ title: "Copo de água", images: ["LIQ-AAA-1/foto-7.jpg"] }],
};

/** Um registo representativo de CADA conjunto, com os campos que o `mapper`
 *  tem de saber levar e trazer (datas de criação incluídas — foi aí que a
 *  primeira versão desta funcionalidade perdia dados). */
function seedBusiness(): void {
  db.tables.clear();
  rowsOf("quotes").push({
    id: "LIQ-AAA-1",
    status: "aceite",
    name: "Ana Dias",
    email: "ana@exemplo.pt",
    created_at: ONTEM,
    data: {
      id: "LIQ-AAA-1",
      status: "aceite",
      name: "Ana Dias",
      email: "ana@exemplo.pt",
      submittedAt: ONTEM,
      quotedPrice: 12500,
      notes: "Casamento em Évora",
      guests: 120,
    },
  });
  rowsOf("proposals").push({
    id: "11111111-1111-4111-8111-111111111111",
    quote_id: "LIQ-AAA-1",
    client_name: "Ana Dias",
    client_email: "ana@exemplo.pt",
    currency: "EUR",
    line_items: [{ description: "Decoração", qty: 1, unitPrice: 10000 }],
    vat_rate: 0.23,
    subtotal: 10000,
    vat: 2300,
    total: 12300,
    valid_until: "2026-04-30",
    notes: null,
    status: "aceite",
    created_at: ONTEM,
    sent_at: ONTEM,
    responded_at: ONTEM,
    // O documento do Estúdio, com os CAMINHOS das fotos no Storage. Vai no
    // seed de propósito: é o campo mais pesado e mais fácil de perder na
    // conversão, e é dele que depende o PDF que o cliente abre pelo link.
    doc: DOC_DO_ESTUDIO,
  });
  rowsOf("invoices").push({
    id: "inv-1",
    number: "FT 2026/0007",
    quote_id: "LIQ-AAA-1",
    client_name: "Ana Dias",
    client_email: "ana@exemplo.pt",
    kind: "sinal",
    amount: 3690,
    vat_rate: 0.23,
    issued_at: "2026-03-01",
    due_at: "2026-03-15",
    paid_at: "2026-03-02",
    status: "paga",
    note: null,
  });
  rowsOf("contracts").push({
    id: "ct-1",
    quote_id: "LIQ-AAA-1",
    proposal_id: "11111111-1111-4111-8111-111111111111",
    client_name: "Ana Dias",
    client_email: "ana@exemplo.pt",
    terms_version: "2026-01",
    terms_snapshot: "Condições acordadas…",
    status: "aceite",
    created_at: ONTEM,
    accepted_at: ONTEM,
    accepted_name: "Ana Dias",
    accepted_ip: "1.2.3.4",
  });
  rowsOf("suppliers").push({
    id: "sup-1",
    name: "Flores do Alentejo",
    category: "Flores",
    email: "flores@exemplo.pt",
    phone: null,
    location: "Évora",
    notes: null,
    created_at: ONTEM,
  });
  rowsOf("tasks").push({
    id: "task-1",
    title: "Confirmar catering",
    done: false,
    priority: "alta",
    due_date: "2026-04-01",
    quote_id: "LIQ-AAA-1",
    client_name: "Ana Dias",
    assignee: "Catarina",
    area: "Produção",
    created_at: ONTEM,
  });
  rowsOf("calendar_events").push({
    id: "cal-1",
    event_date: "2026-05-16",
    title: "Casamento Ana",
    kind: "evento",
    event_time: "16:00",
    note: null,
    created_at: ONTEM,
  });
  rowsOf("inventory_items").push({
    id: "item-1",
    name: "Castiçais de latão",
    category: "Castiçais e Velas",
    quantity: 24,
    unit: "un",
    condition: "bom",
    location: "Atelier",
    notes: null,
    updated_at: ONTEM,
  });
  rowsOf("proposal_themes").push({
    id: "theme-1",
    name: "Terracotta",
    notes: "tons quentes",
    cover_path: "theme-1/capa.jpg",
    photo_order: ["theme-1/capa.jpg"],
    created_at: ONTEM,
    updated_at: ONTEM,
  });
  rowsOf("message_links").push({
    id: "<msg-1@exemplo.pt>",
    quote_id: "LIQ-AAA-1",
    proposal_id: null,
    labels: ["importante"],
    pinned: true,
    archived_at: null,
    created_at: ONTEM,
  });
  rowsOf("overview_settings").push({
    id: "notas",
    value: "Reunião de equipa à segunda",
    revision: 3,
    updated_at: ONTEM,
  });
  rowsOf("email_templates").push({
    id: "proposta-enviada",
    name: "Proposta enviada",
    subject: "A sua proposta",
    body: "<p>Olá {nome}</p>",
    updated_at: ONTEM,
  });
  rowsOf("invoice_counters").push({ year: 2026, n: 7 });
  // ── `app_state`: a tabela partilhada ──────────────────────────────────────
  // Os RASCUNHOS do estúdio (trabalho de horas que não existe em mais lado
  // nenhum) e, ao lado deles, os marcadores de operação. A cópia leva os
  // primeiros e não os segundos, e a reposição não pode tocar nos segundos —
  // é por isso que os dois estão aqui.
  rowsOf("app_state").push({
    key: "proposal-draft:LIQ-AAA-1",
    value: { doc: RASCUNHO_DO_ESTUDIO, updatedAt: ONTEM, savedBy: "Catarina" },
    updated_at: ONTEM,
  });
  // Um rascunho APAGADO: a linha fica, o trabalho não. Não é trabalho, não vai
  // na cópia (ver `clearProposalDraft`).
  rowsOf("app_state").push({
    key: "proposal-draft:LIQ-ZZZ-9",
    value: null,
    updated_at: ONTEM,
  });
  // A CÓPIA do email que acompanhou a proposta. Vive no mesmo espaço partilhado
  // e tem o mesmo problema: a cópia levava a proposta e não levava o que lhes
  // foi escrito.
  rowsOf("app_state").push({
    key: "envio-de-proposta:LIQ-AAA-1",
    value: { envios: [EMAIL_ENVIADO] },
    updated_at: ONTEM,
  });
  rowsOf("app_state").push({ key: "inbox-last-uid", value: 4211, updated_at: ONTEM });
}

/** Só os conjuntos de dados de uma cópia (sem os metadados do envelope). */
function datasetsOf(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const t of RESTORE_TARGETS) out[t.key] = payload[t.key];
  out.invoiceCounters = payload.invoiceCounters;
  return out;
}

function wipeEverything(): void {
  for (const key of [...db.tables.keys()]) db.tables.set(key, []);
}

/** Atalho: valida e devolve o ficheiro, rebentando se não passar (nos testes
 *  em que a validação não é o assunto). */
function mustValidate(payload: unknown): ValidBackup {
  const result = validateBackupFile(payload);
  if (!result.ok) throw new Error(`validação falhou: ${result.errors.join(" | ")}`);
  return result.file;
}

beforeEach(() => {
  db.tables.clear();
  db.writes.length = 0;
  db.fail.clear();
  db.missingColumns.clear();
  db.deleteColumns.clear();
  db.configured = true;
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. O PERCURSO REAL: exportar → apagar → repor → confirmar que voltou igual
// ════════════════════════════════════════════════════════════════════════════

describe("percurso completo: exportar → apagar → repor", () => {
  it("uma base APAGADA volta byte a byte ao que era, conjunto a conjunto", async () => {
    seedBusiness();
    const antes = await buildBackupPayload();
    expect(antes.incomplete).toEqual([]);

    wipeEverything();
    const vazio = await buildBackupPayload();
    for (const t of RESTORE_TARGETS) {
      // Os modelos de email são a excepção: a exportação leva-os SEMPRE, mesmo
      // os que ainda estão na versão de origem (`listTemplatesWithDefaults`),
      // por isso uma tabela vazia continua a exportar os quatro modelos-base.
      // A Visão Geral é a outra: `readOverviewSettings` devolve sempre os dois
      // campos, inventando com revisão 0 os que ainda não existem.
      if (t.key === "emailTemplates" || t.key === "overviewSettings") continue;
      expect(vazio[t.key], `${t.key} devia estar vazio depois do apagão`).toEqual([]);
    }

    const file = mustValidate(antes);
    const plan = await planRestore(file);
    expect(plan.unreadable).toEqual([]);
    const result = await applyRestore(file, plan);
    expect(result.failed, "nenhum conjunto podia falhar").toEqual([]);
    expect(result.countersFailed).toEqual([]);

    const depois = await buildBackupPayload();
    expect(datasetsOf(depois)).toEqual(datasetsOf(antes));
  });

  it("cada conjunto volta com TODOS os campos — incluindo as datas de criação que o `toRow` não escreve", async () => {
    seedBusiness();
    const antes = await buildBackupPayload();
    wipeEverything();
    const file = mustValidate(antes);
    await applyRestore(file, await planRestore(file));
    const depois = await buildBackupPayload();

    // Estas quatro são as que a base de dados preenche sozinha com `now()`
    // quando a aplicação cria um registo — numa reposição isso seria a data
    // errada, e sem `extraColumns` todo o histórico ficava datado de hoje.
    expect((depois.proposals as { createdAt: string }[])[0].createdAt).toBe(ONTEM);
    expect((depois.suppliers as { createdAt: string }[])[0].createdAt).toBe(ONTEM);
    expect((depois.tasks as { createdAt: string }[])[0].createdAt).toBe(ONTEM);
    expect((depois.calendarEvents as { createdAt: string }[])[0].createdAt).toBe(ONTEM);
    // E os pedidos mantêm a ordem de chegada (created_at é a coluna de ordenação).
    expect(rowsOf("quotes")[0].created_at).toBe(ONTEM);
  });

  it("o DOCUMENTO do Estúdio volta inteiro — caminhos das fotos incluídos", async () => {
    // A cópia leva `doc` desde que a coluna existe; se a reposição o deixasse
    // cair, o cliente voltava a ficar sem o botão do PDF no link e o estúdio
    // sem a proposta para reabrir — só que agora depois de um restauro, que é
    // precisamente quando ninguém tem outra cópia de onde os ir buscar.
    seedBusiness();
    const antes = await buildBackupPayload();
    wipeEverything();
    const file = mustValidate(antes);
    await applyRestore(file, await planRestore(file));

    const depois = (await buildBackupPayload()).proposals as { doc?: Record<string, unknown> }[];
    expect(depois[0].doc).toEqual(DOC_DO_ESTUDIO);
    // A coluna existe MESMO na linha (não é só o `fromRow` a inventar).
    expect(rowsOf("proposals")[0].doc).toEqual(DOC_DO_ESTUDIO);
  });

  /**
   * ── E A PROPOSTA BILINGUE VOLTA COM AS DUAS LÍNGUAS ─────────────────────
   *
   * Os campos `…En` viajam como o resto do documento: o `doc` é JSON opaco em
   * todo este percurso, e nada aqui precisou de uma linha de código para os
   * conhecer. É por isso mesmo que o teste é obrigatório — o que ninguém
   * escreveu é o que ninguém se lembra de verificar, e uma tradução perdida num
   * restauro é meio dia de trabalho dela que já ninguém consegue distinguir do
   * que nunca foi escrito.
   */
  it("uma proposta BILINGUE volta com as traduções todas", async () => {
    seedBusiness();
    const bilingue = {
      ...DOC_DO_ESTUDIO,
      serviceGroups: [
        {
          letter: "a)",
          title: "Decoração Floral",
          titleEn: "Floral Design",
          items: [{ label: "Cerimónia", labelEn: "Ceremony" }],
        },
      ],
      moodBoards: [
        {
          title: "Cerimónia",
          titleEn: "Ceremony",
          annotation: "Hortênsias",
          annotationEn: "Hydrangeas",
          images: ["LIQ-AAA-1/foto-1.jpg"],
        },
      ],
      budgetItems: ["Decor Cerimónia"],
      budgetItemsEn: ["Ceremony Decor"],
      totalLabelEn: "Decoration Total",
    };
    rowsOf("proposals")[0].doc = bilingue;

    const antes = await buildBackupPayload();
    wipeEverything();
    const file = mustValidate(antes);
    await applyRestore(file, await planRestore(file));

    const depois = (await buildBackupPayload()).proposals as { doc?: Record<string, unknown> }[];
    expect(depois[0].doc).toEqual(bilingue);
  });

  /**
   * ── OS RASCUNHOS DO ESTÚDIO ─────────────────────────────────────────────
   *
   * O maior bloco de trabalho irrecuperável da casa, e o que esta cópia saltava
   * durante todo o tempo em que ele cá esteve. Uma colaboradora montou uma
   * proposta inteira — fotos escolhidas, mood boards compostos, textos — e
   * noutro computador não estava lá nada. Aqui prova-se o percurso todo:
   * exportar → apagar → repor → o rascunho volta IGUAL.
   */
  it("o RASCUNHO do estúdio volta inteiro — mood boards, textos e a marca de tempo", async () => {
    seedBusiness();
    const antes = await buildBackupPayload();
    expect(antes.incomplete).toEqual([]);
    expect(antes.proposalDrafts).toEqual([
      {
        key: "proposal-draft:LIQ-AAA-1",
        doc: RASCUNHO_DO_ESTUDIO,
        updatedAt: ONTEM,
        savedBy: "Catarina",
      },
    ]);

    wipeEverything();
    expect((await buildBackupPayload()).proposalDrafts).toEqual([]);

    const file = mustValidate(antes);
    const plan = await planRestore(file);
    const rascunhos = plan.datasets.find((d) => d.key === "proposalDrafts")!;
    expect(rascunhos.label).toBe("Rascunhos do Estúdio de Propostas");
    expect(rascunhos.incoming).toBe(1);
    const result = await applyRestore(file, plan);
    expect(result.failed).toEqual([]);

    const depois = await buildBackupPayload();
    expect(depois.proposalDrafts).toEqual(antes.proposalDrafts);
    // E está mesmo na linha do `app_state`, não é o `fromRow` a inventar: é
    // desta chave que o estúdio lê o rascunho ao reabrir a proposta.
    const linha = rowsOf("app_state").find((r) => r.key === "proposal-draft:LIQ-AAA-1")!;
    expect(linha.value).toEqual({
      doc: RASCUNHO_DO_ESTUDIO,
      updatedAt: ONTEM,
      savedBy: "Catarina",
    });
  });

  it("um rascunho APAGADO não vai na cópia — e repô-lo não ressuscita linhas vazias", async () => {
    // `clearProposalDraft` grava `null` em vez de remover a linha: a chave fica
    // lá com "não há rascunho". Isso não é trabalho e não tem nada que ser
    // copiado — nem, ao repor, que voltar a aparecer como se fosse.
    seedBusiness();
    const copia = await buildBackupPayload();
    expect((copia.proposalDrafts as { key: string }[]).map((d) => d.key)).toEqual([
      "proposal-draft:LIQ-AAA-1",
    ]);

    const file = mustValidate(copia);
    await applyRestore(file, await planRestore(file));
    expect(
      rowsOf("app_state").find((r) => r.key === "proposal-draft:LIQ-ZZZ-9")!.value,
      "a chave apagada tinha de continuar a null",
    ).toBeNull();
  });

  it("repor os rascunhos NÃO toca nos marcadores de operação da mesma tabela", async () => {
    // `app_state` é partilhada. Se a reposição apagasse a tabela para reescrever
    // os rascunhos, levava à frente o marcador da caixa de entrada — e o robô
    // voltava a avisar de emails já avisados no dia da reposição, que é o dia
    // em que a atenção tem de estar toda nos dados.
    seedBusiness();
    const copia = await buildBackupPayload();
    expect(
      JSON.stringify(copia),
      "o marcador de operação não pode sequer ir no ficheiro",
    ).not.toContain("inbox-last-uid");

    const file = mustValidate(copia);
    await applyRestore(file, await planRestore(file));
    expect(rowsOf("app_state").find((r) => r.key === "inbox-last-uid")?.value).toBe(4211);
  });

  it("SUBSTITUI dentro do espaço de nomes: um rascunho que a cópia não traz é apagado", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    copia.exportedAt = "2026-03-02T00:00:00.000Z";

    // Depois da cópia começou-se outra proposta, que não está no ficheiro.
    rowsOf("app_state").push({
      key: "proposal-draft:LIQ-BBB-2",
      value: { doc: { ref: "começada depois da cópia" }, updatedAt: "2026-04-02T10:00:00.000Z" },
      updated_at: "2026-04-02T10:00:00.000Z",
    });

    const file = mustValidate(copia);
    const plan = await planRestore(file);
    const rascunhos = plan.datasets.find((d) => d.key === "proposalDrafts")!;
    expect(rascunhos.current).toBe(2);
    expect(rascunhos.removed, "o rascunho novo conta como trabalho que desaparece").toBe(1);
    // E é dito por extenso: a cópia é mais velha do que o que lá está.
    const aviso = plan.warnings.find((w) => w.message.includes("MAIS ANTIGA"));
    expect(aviso?.message).toContain("Rascunhos do Estúdio de Propostas (1)");

    await applyRestore(file, plan);
    expect(rowsOf("app_state").find((r) => r.key === "proposal-draft:LIQ-BBB-2")!.value).toBeNull();
    expect(rowsOf("app_state").find((r) => r.key === "inbox-last-uid")?.value).toBe(4211);
  });

  it("uma cópia com uma chave FORA do espaço de nomes é recusada na validação", async () => {
    // O ficheiro vem de fora e a `app_state` é partilhada: sem esta guarda, uma
    // cópia adulterada repunha o contador de faturas (ou o marcador da caixa de
    // entrada) pela porta dos rascunhos. Recusa-se o ficheiro INTEIRO — nada
    // é escrito, como em qualquer outro erro de forma.
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    (copia.proposalDrafts as Record<string, unknown>[])[0].key = "invoice-seq-2026";
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/Rascunhos do Estúdio de Propostas.*registo 0: key/);
  });

  it("REPÕE POR SUBSTITUIÇÃO: o que está na base e não está na cópia desaparece", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();

    // Depois da cópia, o negócio continuou: mais uma tarefa e mais uma fatura.
    rowsOf("tasks").push({
      id: "task-2",
      title: "Tarefa criada DEPOIS da cópia",
      done: false,
      priority: "normal",
      created_at: "2026-04-01T10:00:00.000Z",
    });

    const file = mustValidate(copia);
    const plan = await planRestore(file);
    const tarefas = plan.datasets.find((d) => d.key === "tasks")!;
    expect(tarefas.current).toBe(2);
    expect(tarefas.incoming).toBe(1);
    expect(tarefas.removed, "a tarefa nova conta como registo que desaparece").toBe(1);
    expect(tarefas.replaced).toBe(1);
    expect(tarefas.created).toBe(0);

    await applyRestore(file, plan);
    const depois = await buildBackupPayload();
    expect((depois.tasks as { id: string }[]).map((t) => t.id)).toEqual(["task-1"]);
  });

  it("repor numa base VAZIA cria tudo de novo (o cenário de desastre)", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    wipeEverything();

    const file = mustValidate(copia);
    const plan = await planRestore(file);
    expect(plan.totals.current).toBe(0);
    expect(plan.totals.removed).toBe(0);
    expect(plan.totals.created).toBe(plan.totals.incoming);
    // Sem dados no destino não há aviso de "o destino não está vazio".
    expect(plan.warnings.some((w) => w.message.includes("O destino NÃO está vazio"))).toBe(false);

    const result = await applyRestore(file, plan);
    expect(result.applied.map((a) => a.key).sort()).toEqual(
      RESTORE_TARGETS.map((t) => t.key).sort(),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 1b. A CHAVE PRIMÁRIA NÃO SE CHAMA `id` EM TODA A GENTE
// ════════════════════════════════════════════════════════════════════════════
//
// O `replaceAll` apagava sempre com `not("id","is",null)` e um comentário a
// dizer «a coluna é chave primária». É verdade em onze das doze tabelas — e é
// falso na `biblioteca_fotos`, que tem `path text primary key` e NENHUMA coluna
// `id` (ver `Mapper.idColumn`). O Postgres respondia 42703 e o conjunto das
// fotos falhava.
//
// E não falhava sozinho: as ETIQUETAS DAS FOTOS são apagadas antes, por
// cascata da chave estrangeira. Ou seja, uma reposição apagava o trabalho de
// etiquetar — a única coisa da biblioteca que não se reconstrói do bucket — e
// depois não conseguia repor as fotos a que as etiquetas se agarravam.

/** As três tabelas da biblioteca visual, e a base a dizer a verdade sobre a
 *  `biblioteca_fotos`: não tem coluna `id` nenhuma. */
function seedBiblioteca(): void {
  db.tables.clear();
  rowsOf("biblioteca_etiquetas").push({
    id: "estilo:terracotta",
    eixo: "estilo",
    nome: "Terracotta",
    ordem: 1,
    created_at: ONTEM,
  });
  rowsOf("biblioteca_fotos").push({
    path: "terracotta/foto-1.jpg",
    pasta: "terracotta",
    fingerprint: "f1",
    md5: "m1",
    largura: 2000,
    altura: 1300,
    lqip: "data:image/webp;base64,AAA",
    created_at: ONTEM,
    updated_at: ONTEM,
  });
  rowsOf("biblioteca_foto_etiquetas").push({
    id: "terracotta/foto-1.jpg#estilo:terracotta",
    path: "terracotta/foto-1.jpg",
    etiqueta_id: "estilo:terracotta",
    origem: "manual",
    created_at: ONTEM,
  });
  db.missingColumns.set("biblioteca_fotos", new Set(["id"]));
}

describe("repor a Biblioteca visual (a tabela cuja chave é o `path`)", () => {
  it("as fotos são apagadas pela coluna que o mapper declara, e voltam", async () => {
    seedBiblioteca();
    const copia = await buildBackupPayload();
    expect(copia.bibliotecaFotos).toHaveLength(1);

    wipeEverything();
    const file = mustValidate(copia);
    const result = await applyRestore(file, await planRestore(file));

    expect(result.failed, "nenhum conjunto podia falhar").toEqual([]);
    expect(db.deleteColumns.get("biblioteca_fotos")).toBe("path");
    expect(rowsOf("biblioteca_fotos")).toHaveLength(1);
    // O que se perdia de verdade: as etiquetas, apagadas antes por cascata.
    expect(rowsOf("biblioteca_foto_etiquetas")).toHaveLength(1);
    expect((await buildBackupPayload()).bibliotecaFotoEtiquetas).toEqual(
      copia.bibliotecaFotoEtiquetas,
    );
  });

  it("cada conjunto apaga pela chave do SEU mapper — nenhum por um `id` presumido", async () => {
    seedBiblioteca();
    const file = mustValidate(await buildBackupPayload());
    await applyRestore(file, await planRestore(file));

    for (const t of RESTORE_TARGETS) {
      // Os conjuntos com escrita à medida (os rascunhos) não apagam a tabela.
      if (!db.deleteColumns.has(t.table)) continue;
      expect(db.deleteColumns.get(t.table), `${t.key} apagou pela coluna errada`).toBe(
        t.mapper.idColumn ?? "id",
      );
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. O ENSAIO NÃO ESCREVE NADA
// ════════════════════════════════════════════════════════════════════════════

describe("ensaio (dry run)", () => {
  it("planear NÃO escreve nada — nem um insert, nem um delete, nem um contador", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    wipeEverything();
    seedBusiness();
    db.writes.length = 0;

    const file = mustValidate(copia);
    const plan = await planRestore(file);

    expect(db.writes, "o ensaio escreveu na base de dados").toEqual([]);
    expect(plan.totals.incoming).toBeGreaterThan(0);
  });

  it("diz, por conjunto, quantos entram, quantos lá estão, quantos são substituídos e quantos desaparecem", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    // Muda o destino: um fornecedor diferente e mais um.
    db.tables.set("suppliers", [
      {
        id: "sup-1",
        name: "Flores do Alentejo (renomeado)",
        category: "Flores",
        created_at: ONTEM,
      },
      { id: "sup-9", name: "Outro fornecedor", category: "Som", created_at: ONTEM },
    ]);

    const plan = await planRestore(mustValidate(copia));
    const s = plan.datasets.find((d) => d.key === "suppliers")!;
    expect(s).toMatchObject({ incoming: 1, current: 2, created: 0, replaced: 1, removed: 1 });
    expect(s.label).toBe("Fornecedores");
  });

  it("um conjunto ilegível BLOQUEIA a reposição e aparece pelo nome", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    db.fail.set("invoices", "read");

    const plan = await planRestore(mustValidate(copia));
    expect(plan.unreadable.map((u) => u.key)).toEqual(["invoices"]);
    expect(plan.unreadable[0].label).toBe("Faturas");
    expect(plan.datasets.find((d) => d.key === "invoices")!.skipped).toBeTruthy();
    expect(plan.warnings.some((w) => w.level === "critico" && w.message.includes("Faturas"))).toBe(
      true,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. AVISOS: destino com dados, e sobretudo cópia MAIS VELHA do que os dados
// ════════════════════════════════════════════════════════════════════════════

describe("avisos", () => {
  it("avisa alto quando o destino NÃO está vazio", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    const plan = await planRestore(mustValidate(copia));
    const aviso = plan.warnings.find((w) => w.message.includes("O destino NÃO está vazio"));
    expect(aviso?.level).toBe("critico");
  });

  it("GRITA quando a cópia é MAIS ANTIGA do que os dados, e conta os registos que se perdem", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    // O negócio andou um mês para a frente depois desta cópia.
    (copia as Record<string, unknown>).exportedAt = "2026-03-02T00:00:00.000Z";
    rowsOf("tasks").push({
      id: "task-abril",
      title: "Trabalho de Abril",
      done: false,
      priority: "normal",
      created_at: "2026-04-02T00:00:00.000Z",
    });
    rowsOf("suppliers").push({
      id: "sup-abril",
      name: "Fornecedor de Abril",
      category: "Som",
      created_at: "2026-04-03T00:00:00.000Z",
    });
    // A contagem declarada deixa de bater certo se não a acertarmos.
    (copia.counts as Record<string, number>).tasks = 1;

    const plan = await planRestore(mustValidate(copia));
    const aviso = plan.warnings.find((w) => w.message.includes("MAIS ANTIGA"));
    expect(aviso?.level).toBe("critico");
    expect(aviso?.message).toContain("2026-04-03");
    expect(aviso?.message).toContain("Tarefas (1)");
    expect(aviso?.message).toContain("Fornecedores (1)");
    expect(plan.totals.newerThanBackup).toBe(2);
  });

  it("uma cópia MAIS RECENTE do que os dados não dispara o aviso de cópia velha", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    const plan = await planRestore(mustValidate(copia));
    expect(plan.warnings.some((w) => w.message.includes("MAIS ANTIGA"))).toBe(false);
  });

  it("diz sempre, por escrito, que as FOTOS não vêm na cópia", async () => {
    seedBusiness();
    const plan = await planRestore(mustValidate(await buildBackupPayload()));
    expect(plan.photosNotice).toMatch(/FOTOS/);
    expect(plan.photosNotice).toMatch(/proposal-assets/);
    expect(plan.photosNotice).toMatch(/theme-assets/);
    expect(plan.warnings.some((w) => w.message === plan.photosNotice)).toBe(true);
  });

  it("conjuntos EM FALTA no ficheiro não são tocados, e são nomeados", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    delete copia.themes;
    delete (copia.counts as Record<string, number>).themes;

    const file = mustValidate(copia);
    expect(file.missing).toContain("themes");
    const plan = await planRestore(file);
    const temas = plan.datasets.find((d) => d.key === "themes")!;
    expect(temas.skipped).toBe("a cópia não traz este conjunto");
    expect(plan.warnings.some((w) => w.message.includes("Temas"))).toBe(true);

    db.writes.length = 0;
    await applyRestore(file, plan);
    expect(db.writes.some((w) => w.includes("proposal_themes"))).toBe(false);
    expect(rowsOf("proposal_themes")).toHaveLength(1);
  });

  it("um conjunto que o ficheiro admite estar INCOMPLETO não é reposto (não se troca dados bons por um vazio de avaria)", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    copia.invoices = [];
    (copia.counts as Record<string, number>).invoices = 0;
    copia.incomplete = ["invoices"];

    const file = mustValidate(copia);
    expect(file.incomplete).toEqual(["invoices"]);
    const plan = await planRestore(file);
    expect(plan.datasets.find((d) => d.key === "invoices")!.skipped).toBe(
      "a cópia declara este conjunto como incompleto",
    );
    const aviso = plan.warnings.find((w) => w.message.includes("INCOMPLETA"));
    expect(aviso?.level).toBe("critico");
    expect(aviso?.message).toContain("Faturas");

    await applyRestore(file, plan);
    expect(rowsOf("invoices"), "as faturas boas não podiam ter sido apagadas").toHaveLength(1);
  });

  it("NÃO repõe as propostas numa base sem a coluna `doc` — deixa-as intactas em vez de as apagar", async () => {
    // O cenário: a cópia vem de uma instalação já migrada (traz propostas com
    // o documento do Estúdio) e vai para uma base onde o `alter table` do
    // db/schema.sql ainda não correu. Sem a sonda de pré-voo, o `replaceAll`
    // APAGAVA as propostas todas e depois falhava a inserir cada uma delas —
    // uma ferramenta de recuperação a destruir dados.
    seedBusiness();
    const copia = await buildBackupPayload();
    expect((copia.proposals as { doc?: unknown }[])[0].doc).toBeTruthy();

    db.missingColumns.set("proposals", new Set(["doc"]));

    const file = mustValidate(copia);
    const plan = await planRestore(file);
    const propostas = plan.datasets.find((d) => d.key === "proposals")!;
    expect(propostas.skipped ?? "(as propostas NÃO foram saltadas)").toContain("proposals.doc");
    expect(propostas.created + propostas.replaced + propostas.removed).toBe(0);
    const aviso = plan.warnings.find((w) => w.message.includes("proposals.doc"));
    expect(aviso?.level).toBe("critico");
    expect(aviso?.message).toContain("db/schema.sql");

    await applyRestore(file, plan);
    expect(rowsOf("proposals"), "as propostas não podiam ter sido apagadas").toHaveLength(1);
    expect(db.writes.some((w) => w.includes("proposals"))).toBe(false);
    // E o resto da cópia entra na mesma: um conjunto saltado não trava os outros.
    expect(rowsOf("invoices")).toHaveLength(1);
  });

  it("a sonda não incomoda quando a cópia não traz documentos nenhuns", async () => {
    // Uma cópia antiga (propostas de linhas, sem `doc`) repõe-se numa base sem
    // a coluna exatamente como sempre se repôs — a sonda nem chega a perguntar.
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    delete (copia.proposals as Record<string, unknown>[])[0].doc;
    db.missingColumns.set("proposals", new Set(["doc"]));

    const file = mustValidate(copia);
    const plan = await planRestore(file);
    expect(plan.datasets.find((d) => d.key === "proposals")!.skipped).toBeUndefined();
    const result = await applyRestore(file, plan);
    expect(result.failed).toEqual([]);
    expect(rowsOf("proposals")).toHaveLength(1);
  });

  it("avisa quando a própria cópia tem referências penduradas", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    (copia.proposals as Record<string, unknown>[])[0].quoteId = "LIQ-QUE-NAO-EXISTE";
    const plan = await planRestore(mustValidate(copia));
    expect(plan.warnings.some((w) => w.message.includes("Referências sem destino"))).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. O CONTADOR DE FATURAS NUNCA ANDA PARA TRÁS
// ════════════════════════════════════════════════════════════════════════════

describe("numeração fiscal: o contador nunca recua", () => {
  it("lê o número de sequência de uma fatura, e só de uma fatura nossa", () => {
    expect(parseInvoiceNumber("FT 2026/0042")).toEqual({ year: 2026, n: 42 });
    expect(parseInvoiceNumber("ft 2026/7")).toEqual({ year: 2026, n: 7 });
    expect(parseInvoiceNumber("2026/0042")).toBeNull();
    expect(parseInvoiceNumber("Recibo 12")).toBeNull();
    expect(parseInvoiceNumber(undefined)).toBeNull();
    expect(parseInvoiceNumber(42 as unknown as string)).toBeNull();
  });

  it("encontra o número mais alto por ano", () => {
    const m = highestIssuedByYear([
      { number: "FT 2025/0100" },
      { number: "FT 2026/0007" },
      { number: "FT 2026/0042" },
      { number: "à mão" },
    ]);
    expect(m.get(2025)).toBe(100);
    expect(m.get(2026)).toBe(42);
  });

  it("⚠️ O CASO QUE MOTIVA TUDO: a cópia é velha e a base já emitiu mais faturas", () => {
    // A cópia é de quando o contador ia em 30. Desde então emitiu-se até
    // FT 2026/0042 e essas faturas foram para clientes. Repor "30" faria a
    // próxima emissão devolver FT 2026/0031 — um número já usado.
    const [plan] = planInvoiceCounters({
      fileCounters: [{ year: 2026, n: 30 }],
      fileInvoices: [{ number: "FT 2026/0030" }],
      currentCounters: [{ year: 2026, n: 42 }],
      currentInvoices: [{ number: "FT 2026/0042" }],
    });
    expect(plan.willBe).toBe(42);
    expect(plan.raised).toBe(true);
    expect(plan.inFile).toBe(30);
    expect(plan.highestIssued).toBe(42);
  });

  it("as faturas ACTUAIS contam mesmo quando vão ser apagadas — o número já saiu desta casa", () => {
    const [plan] = planInvoiceCounters({
      fileCounters: [{ year: 2026, n: 5 }],
      fileInvoices: [],
      // O contador da base perdeu-se (tabela recriada), mas as faturas lá estão.
      currentCounters: [],
      currentInvoices: [{ number: "FT 2026/0099" }],
    });
    expect(plan.willBe).toBe(99);
    expect(plan.raised).toBe(true);
  });

  it("as faturas DA CÓPIA também elevam o contador (uma cópia com o contador em atraso)", () => {
    const [plan] = planInvoiceCounters({
      fileCounters: [{ year: 2026, n: 3 }],
      fileInvoices: [{ number: "FT 2026/0011" }],
      currentCounters: [],
      currentInvoices: [],
    });
    expect(plan.willBe).toBe(11);
    expect(plan.raised).toBe(true);
  });

  it("quando o ficheiro já é o valor mais alto, nada é elevado", () => {
    const [plan] = planInvoiceCounters({
      fileCounters: [{ year: 2026, n: 50 }],
      fileInvoices: [{ number: "FT 2026/0050" }],
      currentCounters: [{ year: 2026, n: 20 }],
      currentInvoices: [{ number: "FT 2026/0020" }],
    });
    expect(plan.willBe).toBe(50);
    expect(plan.raised).toBe(false);
  });

  it("cada ano é tratado à parte (o reset anual da numeração)", () => {
    const plans = planInvoiceCounters({
      fileCounters: [{ year: 2025, n: 120 }],
      fileInvoices: [],
      currentCounters: [{ year: 2026, n: 4 }],
      currentInvoices: [{ number: "FT 2026/0009" }],
    });
    expect(plans.map((p) => [p.year, p.willBe])).toEqual([
      [2025, 120],
      [2026, 9],
    ]);
  });

  it("INVARIANTE: o valor final nunca é inferior a nenhuma das entradas (100 combinações)", () => {
    for (let i = 0; i < 100; i++) {
      const a = Math.floor(Math.random() * 200);
      const b = Math.floor(Math.random() * 200);
      const c = Math.floor(Math.random() * 200);
      const d = Math.floor(Math.random() * 200);
      const [plan] = planInvoiceCounters({
        fileCounters: [{ year: 2026, n: a }],
        fileInvoices: [{ number: `FT 2026/${String(b).padStart(4, "0")}` }],
        currentCounters: [{ year: 2026, n: c }],
        currentInvoices: [{ number: `FT 2026/${String(d).padStart(4, "0")}` }],
      });
      expect(plan.willBe, `a=${a} b=${b} c=${c} d=${d}`).toBe(Math.max(a, b, c, d));
      expect(plan.willBe).toBeGreaterThanOrEqual(a);
      expect(plan.willBe).toBeGreaterThanOrEqual(b);
      expect(plan.willBe).toBeGreaterThanOrEqual(c);
      expect(plan.willBe).toBeGreaterThanOrEqual(d);
    }
  });

  it("a reposição GRAVA mesmo o contador elevado, e diz que o elevou", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    // A cópia é velha: contador em 7. A base já vai em 42.
    db.tables.set("invoice_counters", [{ year: 2026, n: 42 }]);
    rowsOf("invoices").push({
      id: "inv-42",
      number: "FT 2026/0042",
      quote_id: "LIQ-AAA-1",
      client_name: "Ana",
      client_email: "ana@exemplo.pt",
      kind: "saldo",
      amount: 100,
      vat_rate: 0.23,
      issued_at: "2026-04-01",
      status: "emitida",
    });

    const file = mustValidate(copia);
    const plan = await planRestore(file);
    const c2026 = plan.counters.find((c) => c.year === 2026)!;
    expect(c2026.willBe).toBe(42);
    expect(c2026.raised).toBe(true);
    expect(plan.warnings.some((w) => w.message.includes("Numeração fiscal"))).toBe(true);

    await applyRestore(file, plan);
    expect(rowsOf("invoice_counters")).toEqual([{ year: 2026, n: 42 }]);
  });

  it("o contador é gravado MESMO QUE as faturas falhem — a garantia não depende de outro conjunto", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    // O contador da base está ATRASADO em relação à cópia: só uma escrita
    // verdadeira o põe em 7. Assim este teste distingue "gravou" de "já lá
    // estava" — sem isto, passava mesmo que a reposição não tocasse no contador.
    db.tables.set("invoice_counters", [{ year: 2026, n: 2 }]);

    const file = mustValidate(copia);
    const plan = await planRestore(file);
    expect(plan.counters.find((c) => c.year === 2026)!.willBe).toBe(7);
    db.fail.set("invoices", "write");

    const result = await applyRestore(file, plan);
    expect(result.failed.map((f) => f.key)).toEqual(["invoices"]);
    expect(result.failed[0].label).toBe("Faturas");
    expect(result.countersFailed).toEqual([]);
    expect(rowsOf("invoice_counters"), "o contador tinha de ter sido gravado à mesma").toEqual([
      { year: 2026, n: 7 },
    ]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. OS CASOS MAUS — validar TUDO antes de escrever o que quer que seja
// ════════════════════════════════════════════════════════════════════════════

describe("validação do ficheiro", () => {
  it("aceita uma cópia verdadeira desta aplicação", async () => {
    seedBusiness();
    const result = validateBackupFile(await buildBackupPayload());
    expect(result.ok).toBe(true);
  });

  it("recusa um ficheiro de OUTRA aplicação", () => {
    const result = validateBackupFile({
      version: 3,
      users: [{ id: 1 }],
      orders: [],
      exportedAt: new Date().toISOString(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors[0]).toMatch(/não parece uma cópia de segurança da Líquen/i);
  });

  it("recusa o que nem sequer é um objeto", () => {
    for (const junk of [null, 42, "texto", [1, 2, 3]]) {
      const result = validateBackupFile(junk);
      expect(result.ok, String(junk)).toBe(false);
    }
  });

  it("recusa um ficheiro TRUNCADO — as contagens declaradas não batem certo", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    (copia.quotes as unknown[]).pop(); // ficheiro cortado a meio da cópia
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/Pedidos.*truncado ou alterado/);
  });

  it("recusa um ficheiro a que falta um conjunto BASE (cópia cortada)", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    delete copia.quotes;
    delete copia.proposals;
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/faltam conjuntos base/);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O NOME DO PEDIDO NÃO PODE FICAR VAZIO NUMA REPOSIÇÃO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Como no `quoteUpdateSchema` (`validation.ts`), que já recusa um `name`
   * vazio nas escritas normais. Sem o mesmo `min(1)` aqui, uma cópia de
   * segurança com `name: ""` (ou só espaços) repunha um pedido sem nome — e o
   * portal desse pedido cumprimenta o casal com «Olá, .» (ver
   * `PortalView.test.tsx`).
   */
  it("recusa um pedido com o nome VAZIO", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    (copia.quotes as Record<string, unknown>[])[0].name = "";
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/"Pedidos" \(quotes\) registo 0: name/);
  });

  it("recusa um pedido com o nome só de espaços", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    (copia.quotes as Record<string, unknown>[])[0].name = "   ";
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/"Pedidos" \(quotes\) registo 0: name/);
  });

  it("recusa um conjunto com a FORMA errada, dizendo o conjunto e a linha", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    (copia.invoices as Record<string, unknown>[])[0].status = "meio-paga";
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/"Faturas" \(invoices\) registo 0: status/);
  });

  it("recusa um conjunto que nem sequer é uma lista", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    copia.contracts = { id: "ct-1" };
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/"Contratos aceites" \(contracts\) não é uma lista/);
  });

  it("recusa identificadores repetidos dentro do mesmo conjunto", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    const tarefas = copia.tasks as Record<string, unknown>[];
    tarefas.push({ ...tarefas[0] });
    (copia.counts as Record<string, number>).tasks = tarefas.length;
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/identificador repetido/);
  });

  it("recusa uma cópia de uma versão FUTURA do formato", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    copia.schemaVersion = BACKUP_SCHEMA_VERSION + 1;
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/só sabe repor até/);
  });

  it("recusa uma cópia sem versão e sem data de exportação", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    delete copia.schemaVersion;
    copia.exportedAt = "ontem à tarde";
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/schemaVersion/);
    expect(result.errors.join(" ")).toMatch(/data de exportação/);
  });

  it("recusa contadores de numeração com a forma errada", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    copia.invoiceCounters = [{ year: "dois mil e vinte e seis", n: -3 }];
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/Contadores de numeração/);
  });

  it("NENHUMA escrita acontece quando a validação falha", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    (copia.invoices as Record<string, unknown>[])[0].amount = -1;
    db.writes.length = 0;
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    expect(db.writes).toEqual([]);
  });

  it("guarda os campos que não conhece (uma cópia mais antiga não é recusada por trazer menos)", () => {
    const antiga = {
      schemaVersion: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      quotes: [
        {
          id: "LIQ-OLD-1",
          status: "pendente",
          name: "Zé",
          email: "ze@exemplo.pt",
          submittedAt: "2025-01-01T00:00:00.000Z",
          campoQueJaNaoExiste: "guardado à mesma",
        },
      ],
      proposals: [],
      suppliers: [],
      tasks: [],
      calendarEvents: [],
    };
    const result = validateBackupFile(antiga);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("impossível");
    expect(result.file.rows.get("quotes")![0].campoQueJaNaoExiste).toBe("guardado à mesma");
    expect(result.file.missing).toContain("invoices");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. NADA FALHA EM SILÊNCIO
// ════════════════════════════════════════════════════════════════════════════

describe("nada falha em silêncio", () => {
  it("um conjunto que não se consegue escrever sai PELO NOME e não trava os outros", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    const file = mustValidate(copia);
    const plan = await planRestore(file);
    db.fail.set("contracts", "write");

    const result = await applyRestore(file, plan);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ key: "contracts", label: "Contratos aceites" });
    expect(result.failed[0].error).toBeTruthy();
    // Os outros conjuntos foram todos repostos.
    expect(result.applied.map((a) => a.key)).toContain("invoices");
    expect(result.applied.map((a) => a.key)).toContain("quotes");
  });

  it("um conjunto que o plano marcou como SALTADO não é escrito, mesmo trazendo registos", async () => {
    // O caso: a leitura do estado actual das faturas falhou, por isso o plano
    // marcou-as como saltadas — mas o ficheiro TRAZ faturas. A rota já recusa
    // repor nesta situação; esta é a segunda tranca, dentro do `applyRestore`.
    // Sem ela, apagavam-se as faturas de que nem se sabe o que são.
    seedBusiness();
    const copia = await buildBackupPayload();
    const file = mustValidate(copia);
    expect(file.rows.get("invoices"), "o ficheiro tem mesmo faturas").toHaveLength(1);

    db.fail.set("invoices", "read");
    const plan = await planRestore(file);
    expect(plan.datasets.find((d) => d.key === "invoices")!.skipped).toBeTruthy();

    db.writes.length = 0;
    const result = await applyRestore(file, plan);
    expect(db.writes.filter((w) => w.includes(":invoices"))).toEqual([]);
    expect(result.applied.map((a) => a.key)).not.toContain("invoices");
  });

  it("cada conjunto reposto declara quantos apagou e quantos escreveu", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    const file = mustValidate(copia);
    const plan = await planRestore(file);
    const result = await applyRestore(file, plan);
    for (const outcome of result.applied) {
      const planned = plan.datasets.find((d) => d.key === outcome.key)!;
      expect(outcome.deleted, outcome.key).toBe(planned.current);
      expect(outcome.inserted, outcome.key).toBe(planned.incoming);
    }
  });

  it("sem base de dados em PRODUÇÃO recusa-se a escrever, em vez de gravar num ficheiro que o próximo deploy apaga", async () => {
    db.configured = false;
    vi.stubEnv("NODE_ENV", "production");
    try {
      // Plano e ficheiro à mão: sem tocar em `planRestore`, que aqui leria o
      // disco. O que se testa é a recusa de `replaceAll`, e só ela.
      const file: ValidBackup = {
        exportedAt: ONTEM,
        schemaVersion: 2,
        rows: new Map([
          [
            "tasks",
            [{ id: "task-1", title: "x", done: false, priority: "normal", createdAt: ONTEM }],
          ],
        ]),
        counters: [],
        missing: [],
        incomplete: [],
      };
      const plan = {
        datasets: [{ key: "tasks", label: "Tarefas", current: 0, incoming: 1 }],
        counters: [],
      } as unknown as Awaited<ReturnType<typeof planRestore>>;

      const result = await applyRestore(file, plan);
      expect(result.applied).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].label).toBe("Tarefas");
      expect(result.failed[0].error).toMatch(/Persistence unavailable/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("todo o conjunto exportado é reposto ou tem uma excepção escrita por extenso", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    const keys = Object.keys(copia.counts);
    const known = new Set([
      ...RESTORE_TARGETS.map((t) => t.key),
      ...Object.keys(RESTORE_EXCEPTIONS),
    ]);
    const orfaos = keys.filter((k) => !known.has(k));
    expect(
      orfaos,
      `Conjuntos exportados que ninguém decidiu como repor: ${orfaos.join(", ")}`,
    ).toEqual([]);
  });
});
