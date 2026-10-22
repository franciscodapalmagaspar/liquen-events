import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AUTH-GUARD AUDIT — one place that verifies EVERY API route enforces the
 * protection it is supposed to. It is deliberately data-driven so a NEW route
 * (or a new method on an existing one) is only "covered" once it appears in the
 * table below — the table is the contract, and a regression fails loudly here.
 *
 * Three classes of route, each pinned to its intended gate:
 *
 *  1. ADMIN-SESSION  — back-office CRUD. MUST reject an unauthenticated caller
 *                      with 401 *before touching its store*. We invoke the real
 *                      handler with no session and assert (a) 401 and (b) that
 *                      NOT A SINGLE store function ran (no read, no write). The
 *                      request bodies are valid-ish, so a missing guard would let
 *                      the handler fall through into a store write — which the
 *                      empty-call-log assertion catches.
 *
 *  2. PUBLIC         — health, csp-report, the public quote POST, the public
 *                      confirmation GET, admin login/logout. Asserted REACHABLE
 *                      without a session (never 401 for lack of one).
 *
 *  3. TOKEN / SECRET — the proposal PDF + the proposal accept POST (signed token,
 *                      404/401 on a bad token), cron (CRON_SECRET, fails closed
 *                      in prod), devproposalpreview (dev-only, 404 in prod).
 *
 * The auth mock mirrors every existing route test: `@/lib/admin-auth` keeps its
 * real exports (cookie names, token signing) but `isAuthed()` returns a flag we
 * control. Every side-effecting module (stores, mail, push, PDF renderers,
 * supabase…) is mocked with logging spies that append "<module>.<fn>" to a shared
 * `calls` array, so "did the handler touch its store?" is a single assertion.
 * Pure modules (validation, tokens, rate-limit, money…) stay real so the gates
 * they implement are exercised for real.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// Controls isAuthed(); flipped per-test.
const authed = vi.hoisted(() => ({ ok: false }));

// Shared harness: a call log + a factory that turns a list of export names into
// logging spies (plus literal `extra` exports for constants / sync gates).
const H = vi.hoisted(() => {
  const calls: string[] = [];
  const afn = (label: string, impl?: (...a: unknown[]) => unknown) =>
    vi.fn(async (...a: unknown[]) => {
      calls.push(label);
      return impl ? impl(...a) : undefined;
    });
  const build = (name: string, names: string[], extra: Record<string, unknown> = {}) => {
    const mod: Record<string, unknown> = {};
    for (const n of names) mod[n] = afn(`${name}.${n}`);
    return Object.assign(mod, extra);
  };
  return { calls, afn, build };
});

// ── Auth: keep real module, override only the guard ──────────────────────────
vi.mock("@/lib/admin-auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin-auth")>()),
  isAuthed: () => authed.ok,
}));

// ── Stores + side-effecting libs (logging spies) ─────────────────────────────
// A handful of exports get real-ish returns / sync gates so the PUBLIC + SECRET
// happy paths that legitimately run don't crash on `undefined`.
vi.mock("@/lib/quotes-store", () =>
  H.build(
    "quotes-store",
    [
      "createQuote",
      "deleteQuote",
      "generateQuoteId",
      "getQuote",
      "quoteIdFor",
      "updateQuote",
      "updateQuoteWith",
    ],
    { listQuotes: H.afn("quotes-store.listQuotes", async () => []) },
  ),
);
vi.mock("@/lib/proposals-store", () =>
  H.build("proposals-store", [
    "createProposal",
    "getProposal",
    "getProposalByQuote",
    "listAllProposals",
    "listProposalsForQuote",
    "updateProposal",
  ]),
);
vi.mock("@/lib/reciclagem-store", () =>
  H.build("reciclagem-store", [
    "guardarNaReciclagem",
    "listarReciclagem",
    "obterDaReciclagem",
    "tirarDaReciclagem",
  ]),
);
vi.mock("@/lib/tasks-store", () =>
  H.build("tasks-store", [
    "createTask",
    "deleteTask",
    "listTasks",
    "updateTask",
    "obterTarefa",
    "reporTarefa",
  ]),
);
vi.mock("@/lib/calendar-store", () =>
  H.build(
    "calendar-store",
    ["createCalendarEvent", "deleteCalendarEvent", "obterEvento", "reporEvento"],
    {
      listCalendarEvents: H.afn("calendar-store.listCalendarEvents", async () => []),
    },
  ),
);
vi.mock("@/lib/suppliers-store", () =>
  H.build("suppliers-store", [
    "createSupplier",
    "deleteSupplier",
    "listSuppliers",
    "updateSupplier",
    "obterFornecedor",
    "reporFornecedor",
  ]),
);
vi.mock("@/lib/inventory-store", () =>
  H.build(
    "inventory-store",
    ["createItem", "deleteItem", "listItems", "updateItem", "getItem", "reporItem"],
    {
      PROP_CATEGORIES: ["Outro"],
    },
  ),
);
// Material de logística: catálogo e listas base. Simulados como os outros —
// sem isto, a auditoria só conseguia afirmar que a rota devolve 401, e não a
// parte que interessa, que é NENHUMA escrita ter acontecido antes disso.
vi.mock("@/lib/material-store", () =>
  H.build(
    "material-store",
    ["createMaterial", "deleteMaterial", "updateMaterial", "getMaterial", "reporMaterial"],
    {
      listMaterial: H.afn("material-store.listMaterial", async () => []),
    },
  ),
);
vi.mock("@/lib/material-rules-store", () =>
  H.build(
    "material-rules-store",
    ["createRule", "updateRule", "deleteRule", "obterRegra", "reporRegra"],
    {
      listRules: H.afn("material-rules-store.listRules", async () => []),
    },
  ),
);
vi.mock("@/lib/material-list-items-store", () =>
  H.build(
    "material-list-items-store",
    [
      "addListItem",
      "updateListItem",
      "removeListItem",
      "listItemsOf",
      "removeItemsOf",
      "obterLinha",
      "reporLinha",
    ],
    { listAllListItems: H.afn("material-list-items-store.listAllListItems", async () => []) },
  ),
);
vi.mock("@/lib/event-material-store", () =>
  H.build(
    "event-material-store",
    [
      "getForQuote",
      "createEventMaterial",
      "updateEventMaterial",
      "deleteEventMaterial",
      "getEventMaterial",
    ],
    { listEventMaterial: H.afn("event-material-store.listEventMaterial", async () => []) },
  ),
);
vi.mock("@/lib/event-material-log-store", () =>
  H.build("event-material-log-store", ["registar", "listLogOf"], {
    listAllLog: H.afn("event-material-log-store.listAllLog", async () => []),
  }),
);
vi.mock("@/lib/event-material-items-store", () =>
  H.build(
    "event-material-items-store",
    [
      "addEventItem",
      "updateEventItem",
      "removeEventItem",
      "listItemsOfEvent",
      "removeItemsOfEvent",
    ],
    { listAllEventItems: H.afn("event-material-items-store.listAllEventItems", async () => []) },
  ),
);
vi.mock("@/lib/material-lists-store", () =>
  H.build(
    "material-lists-store",
    [
      "createList",
      "updateList",
      "deleteList",
      "getList",
      "reporList",
      "addListItem",
      "updateListItem",
      "removeListItem",
      "listItemsOf",
      "duplicateList",
    ],
    {
      listLists: H.afn("material-lists-store.listLists", async () => []),
      listAllListItems: H.afn("material-lists-store.listAllListItems", async () => []),
    },
  ),
);
// Só leitura: o módulo ficou reduzido ao que a cópia de segurança precisa
// (ver o topo de `invoices-store.ts`) — a facturação saiu desta aplicação.
vi.mock("@/lib/invoices-store", () =>
  H.build("invoices-store", ["listInvoices", "isUniqueViolation"]),
);
vi.mock("@/lib/contracts-store", () =>
  H.build("contracts-store", [
    "createContractIfAbsent",
    "getAcceptedContractByQuote",
    "getContract",
    "listContracts",
    "newContractId",
  ]),
);
vi.mock("@/lib/email-templates-store", () =>
  H.build("email-templates-store", [
    "listTemplatesWithDefaults",
    "upsertTemplate",
    "listarModelos",
    "guardarModelo",
    "listarVersoes",
    "reverterPara",
    "idFisico",
    "MODELOS_DE_ORIGEM",
  ]),
);
vi.mock("@/lib/app-state", () => H.build("app-state", ["getState", "setState"]));
vi.mock("@/lib/mail", () =>
  H.build("mail", ["sendMail"], { esc: (s: string) => s, MAIL_TO: "team@liquen.test" }),
);
vi.mock("@/lib/push", () =>
  H.build("push", ["removeSubscription", "saveSubscription"], {
    pushConfigured: () => false,
    sendPushToAll: H.afn("push.sendPushToAll", async () => ({ sent: 0 })),
  }),
);
vi.mock("@/lib/proposal-storage", () =>
  H.build(
    "proposal-storage",
    [
      "uploadProposalImage",
      "ensureBucket",
      "createProposalUploadTickets",
      "confirmProposalUploads",
    ],
    {
      UPLOAD_TICKET_TTL: 300,
      MAX_UPLOAD_TICKETS: 40,
      BUCKET_FILE_SIZE_LIMIT: 12 * 1024 * 1024,
      // Os NOMES dos buckets são constantes, não comportamento — quem os
      // importa (`lib/derivadas.ts`) só quer a string. Deixá-los de fora fazia
      // a rota rebentar ao carregar o módulo, e o teste dizia "não devolveu
      // 401" quando o que se passava era o mock a faltar.
      PROPOSAL_BUCKET: "proposal-assets",
      PROPOSAL_THUMB_BUCKET: "proposal-thumbs",
      // A de 1200 px. Entrou na lista quando o lote passou a fabricá-la: até
      // aí só era lida DENTRO de uma função, e um mock em falta não se notava.
      // Agora é lida no topo do módulo, e a falta rebentava cinco rotas.
      PROPOSAL_MID_BUCKET: "proposal-medias",
      PROPOSAL_AVIF_MID_BUCKET: "proposal-avif-medias",
    },
  ),
);
vi.mock("@/lib/supabase", () =>
  H.build("supabase", [], { getSupabase: () => null, isDatabaseConfigured: () => false }),
);

// ── Biblioteca de Temas + rascunhos + Visão Geral ────────────────────────────
// Estes módulos entraram com as rotas que a tabela abaixo passou a cobrir. Tal
// como os restantes, são espias que registam a chamada: é isso que transforma
// "a rota tem guarda?" na asserção de que NADA no armazenamento correu.
vi.mock("@/lib/themes-store", () =>
  H.build("themes-store", ["getTheme", "createTheme", "updateTheme", "deleteTheme"], {
    listThemes: H.afn("themes-store.listThemes", async () => []),
  }),
);
vi.mock("@/lib/theme-storage", () =>
  H.build(
    "theme-storage",
    [
      "uploadThemeImage",
      "createThemeUploadTickets",
      "confirmThemeUploads",
      "listThemeObjects",
      "countThemeFiles",
      "readThemeFingerprints",
      "noteThemeFingerprint",
      "forgetThemeFingerprints",
      "findThemeImageByBytes",
      "signThemeThumbs",
      "listThemeImagePage",
      "deleteThemeImage",
      "deleteThemeFolder",
      "fetchThemeImageBytes",
      "copyThemeImageToProposal",
      "transferThemeImage",
    ],
    {
      // Constantes e auxiliares PUROS ficam síncronos e verdadeiros o suficiente
      // para o caminho autenticado de sanidade correr até ao fim.
      THEME_BUCKET: "temas",
      THEME_THUMB_BUCKET: "temas-mini",
      SIGNED_TTL: 3600,
      isAlreadyExists: () => false,
      themeFolder: (id: string) => `tema-${id}`,
      isThemePath: () => true,
      themeIdOfPath: (p: string) => p.split("/")[0],
      contentTypeForPath: () => "image/jpeg",
      invalidateThemeCount: () => undefined,
      planOrderedPage: () => ({ names: [], truncated: false }),
      listThemeFiles: H.afn("theme-storage.listThemeFiles", async () => ({
        names: [],
        ok: true,
        truncated: false,
      })),
      signThemePaths: H.afn("theme-storage.signThemePaths", async () => new Map<string, string>()),
    },
  ),
);
vi.mock("@/lib/proposal-drafts", () =>
  H.build("proposal-drafts", ["getProposalDraft", "saveProposalDraft", "clearProposalDraft"], {
    // A cópia de segurança lê os rascunhos como um conjunto seu. Devolve lista
    // (e não `undefined`) porque o caminho autenticado de `/api/backup` conta
    // os registos de cada conjunto — uma espia muda rebentava-o a contar.
    listProposalDrafts: H.afn("proposal-drafts.listProposalDrafts", async () => []),
  }),
);
// Parcial: o esquema Zod da rota lê OVERVIEW_FIELDS/MAX_* no topo do módulo e o
// 409 depende da classe StaleWriteError real — só as duas funções de I/O é que
// passam a espias.
vi.mock("@/lib/servicos-catalogo-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/servicos-catalogo-store")>()),
  listarServicos: H.afn("servicos-catalogo-store.listarServicos", async () => []),
  criarServico: H.afn("servicos-catalogo-store.criarServico", async () => undefined),
  actualizarServico: H.afn("servicos-catalogo-store.actualizarServico", async () => ({})),
  apagarServico: H.afn("servicos-catalogo-store.apagarServico", async () => undefined),
}));

vi.mock("@/lib/proposta-definicoes-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/proposta-definicoes-store")>()),
  listarDefinicoes: H.afn("proposta-definicoes-store.listarDefinicoes", async () => []),
  gravarDefinicao: H.afn("proposta-definicoes-store.gravarDefinicao", async () => ({})),
}));

vi.mock("@/lib/overview-settings-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/overview-settings-store")>()),
  readOverviewSettings: H.afn("overview-settings-store.readOverviewSettings", async () => ({})),
  saveOverviewField: H.afn("overview-settings-store.saveOverviewField", async () => ({})),
}));
// Passkeys. As funções puras (`mesmaConta`, `contadorRetrocedeu`) ficam reais —
// não tocam em dados; só as que leem ou escrevem viram espias, para a asserção
// "não chegou ao store" ter mesmo o que apanhar se um dia a guarda cair.
vi.mock("@/lib/passkeys-store", async (orig) => ({
  ...(await orig<typeof import("@/lib/passkeys-store")>()),
  listPasskeys: H.afn("passkeys-store.listPasskeys", async () => []),
  listPasskeysFor: H.afn("passkeys-store.listPasskeysFor", async () => []),
  getPasskey: H.afn("passkeys-store.getPasskey", async () => null),
  createPasskey: H.afn("passkeys-store.createPasskey"),
  removePasskeyOwnedBy: H.afn("passkeys-store.removePasskeyOwnedBy", async () => false),
  renamePasskeyOwnedBy: H.afn("passkeys-store.renamePasskeyOwnedBy", async () => false),
  marcarUso: H.afn("passkeys-store.marcarUso"),
}));
// `sharp` é importado no topo da rota das miniaturas; fica de fora da auditoria
// pela mesma razão que o pdf-lib.
vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({}) }) }));
// PDF renderers — mocked so pdf-lib / sharp never load in the audit.
vi.mock("@/lib/contract-pdf", () => H.build("contract-pdf", ["renderContractPdf"]));
vi.mock("@/lib/proposal-pdf", () => H.build("proposal-pdf", ["renderProposalPdf"]));
vi.mock("@/lib/proposal-doc-pdf", () => H.build("proposal-doc-pdf", ["renderProposalDocPdf"]));
vi.mock("@/lib/proposal-doc-render", () =>
  H.build("proposal-doc-render", ["renderStoredProposalDocPdf"]),
);

const { calls } = H;

// A body wide enough that, were a guard missing, the handler would proceed into
// its validation / write path (making the "store untouched" assertion meaningful).
const BODY = {
  title: "Audit",
  name: "Audit",
  key: "audit",
  subject: "Audit",
  body: "Audit",
  message: "Olá",
  to: "cliente@exemplo.pt",
  amount: 100,
  status: "enviada",
  messageId: "<m@x>",
  seen: true,
};

function req(
  method: string,
  path = "/api/x",
  body?: unknown,
  headers: Record<string, string> = {},
  raw = false,
) {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: { "content-type": "application/json", ...headers },
  };
  if (body !== undefined) init.body = raw ? (body as string) : JSON.stringify(body);
  return new NextRequest(`https://liquen.test${path}`, init);
}

// A route context whose params satisfy every dynamic segment used in the tree.
const ctx = () => ({ params: Promise.resolve({ id: "id-1", uid: "1", token: "bad-token" }) });

async function handler(routePath: string, method: string) {
  const mod = (await import(/* @vite-ignore */ routePath)) as Record<
    string,
    (r: NextRequest, c?: unknown) => Promise<Response>
  >;
  return mod[method];
}

beforeEach(() => {
  authed.ok = false;
  calls.length = 0;
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. ADMIN-SESSION routes: route → guarded methods. (params = dynamic segment.)
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN: Array<{ path: string; methods: string[] }> = [
  { path: "./backup/route", methods: ["GET"] },
  // A reposição é a rota mais destrutiva da casa: sem sessão tem de sair em
  // 401 ANTES de tocar em seja o que for (e o módulo que sabe escrever nem
  // sequer é carregado — ver o import dinâmico em restore/route.ts).
  { path: "./backup/restore/route", methods: ["POST"] },
  // As conversões offline expõem o VALOR de cada casamento fechado — é
  // informação comercial, não uma exportação técnica inofensiva.
  { path: "./admin/conversoes/route", methods: ["GET"] },
  // O relato de uma imagem que não desenhou no browser. É telemetria e não
  // devolve nada de útil — mas ESCREVE nos registos, e uma rota de registo
  // aberta é um sítio onde qualquer pessoa põe o que quiser no sítio onde nós
  // procuramos a verdade. Sem sessão, 401.
  { path: "./admin/imagem-falhou/route", methods: ["POST"] },
  // Contar as miniaturas em falta lê a biblioteca INTEIRA e as pastas de todas
  // as propostas; gerar ESCREVE no Storage. Nem uma nem outra podem ficar
  // abertas — a primeira desenha o mapa do armazenamento a quem perguntar, a
  // segunda gasta-o.
  { path: "./admin/derivadas/route", methods: ["GET", "POST"] },
  // O aquecimento dos PDF das propostas já enviadas. O GET conta e o POST
  // DESENHA — cada volta são até oito documentos de vários megabytes, com o
  // `pdf-lib` e o `sharp` a correr numa função. Sem sessão, é uma maneira de
  // qualquer pessoa gastar a conta do estúdio a partir de fora.
  { path: "./admin/aquecimento-pdf/route", methods: ["GET", "POST"] },
  // A auditoria dos valores inchados lê os pedidos e as propostas TODOS, com os
  // nomes dos noivos e o dinheiro de cada um. Só lê — mas o que lê é a base
  // inteira, e é a leitura que a guarda protege.
  { path: "./admin/valores-suspeitos/route", methods: ["GET"] },
  { path: "./admin/valor-enviado/route", methods: ["GET", "POST"] },
  // O estado do armazenamento diz se a base de dados responde, se a tabela
  // existe e se a chave em uso tem permissões — o mapa da instalação, com os
  // nomes das variáveis a confirmar. E a verificação ESCREVE (é assim que ela é
  // honesta: tenta gravar e volta a ler). Sem sessão, nem se pergunta.
  { path: "./admin/armazenamento/route", methods: ["GET"] },
  // «Porque é que as fotografias não aparecem?» — a rota que responde. Nomeia
  // as variáveis do Supabase, os buckets, o papel da chave e a política de
  // segurança que esta instalação serve: é o mapa da instalação, e vai buscar
  // uma fotografia REAL ao Storage para a experimentar. Sem sessão, 401 antes
  // de qualquer pergunta.
  { path: "./admin/fotos-diagnostico/route", methods: ["GET"] },
  // O mesmo, do lado da Meta: o relatório e o envio dos casamentos fechados
  // trazem o valor de cada negócio. O POST é o que efectivamente ENVIA
  // conversões para fora — sem sessão não pode sequer ser tentado.
  { path: "./meta/fechos/route", methods: ["GET", "POST"] },
  { path: "./calendario/route", methods: ["GET", "POST"] },
  { path: "./calendario/[id]/route", methods: ["DELETE"] },
  { path: "./contratos/route", methods: ["GET"] },
  { path: "./contratos/[id]/route", methods: ["PATCH"] },
  { path: "./contratos/[id]/pdf/route", methods: ["GET"] },
  { path: "./contratos/criar/route", methods: ["POST"] },
  // ── Guiões do dia ─────────────────────────────────────────────────────────
  // O guião de um evento diz a que horas a equipa entra na quinta, quem faz o
  // quê e quando o espaço fica vazio. É logística interna e nomes de clientes:
  // a leitura devolve os dois para TODOS os eventos com data de uma vez, o que
  // faz desta rota o resumo mais compacto da agenda da casa. Sem sessão, nem
  // ler nem escrever.
  { path: "./guioes/route", methods: ["GET"] },
  // O mesmo guião, desenhado em PDF para descarregar. Traz o nome do cliente,
  // a data, o local e o nome de cada pessoa da equipa com a hora a que entra
  // ao serviço — é o resumo interno de um dia inteiro num ficheiro. Sem sessão
  // não sai.
  { path: "./guioes/[id]/pdf/route", methods: ["GET"] },
  // O mapa de mesas traz o nome de cada convidado e onde se senta; e o envio
  // manda-o por email a um endereço escrito por ela. Sem sessão, nenhum dos dois.
  { path: "./mesas/[id]/pdf/route", methods: ["GET"] },
  { path: "./mesas/[id]/enviar/route", methods: ["POST"] },
  { path: "./guioes/modelos/route", methods: ["GET", "POST"] },
  { path: "./guioes/modelos/[id]/route", methods: ["DELETE"] },
  { path: "./email-templates/route", methods: ["GET", "POST", "PUT"] },
  // Os modelos nas duas línguas: o corpo é o texto que sai para clientes na
  // hora seguinte, e a leitura devolve-o inteiro. Sem sessão, nem uma coisa
  // nem outra.
  { path: "./email-templates/bilingues/route", methods: ["GET", "POST", "PUT"] },
  // O histórico guarda as versões anteriores do texto dela, e o POST REPÕE uma
  // delas — muda o que sai para clientes.
  { path: "./email-templates/versoes/route", methods: ["GET", "POST"] },
  // A pré-visualização com dados reais: devolve a lista de pedidos e, de um
  // deles, o nome do casal, a data, o local e o valor. É a carteira de
  // clientes; sem sessão não sai daqui.
  { path: "./email-templates/dados/route", methods: ["GET"] },
  // O rascunho que o ecrã de envio abre — leva os dados do casal lá dentro.
  { path: "./email-templates/rascunho/route", methods: ["GET"] },
  // ENVIA correio a sério. É a rota deste conjunto com mais a perder.
  { path: "./email-templates/teste/route", methods: ["POST"] },
  { path: "./fornecedores/route", methods: ["GET", "POST"] },
  { path: "./fornecedores/[id]/route", methods: ["PATCH", "DELETE"] },
  { path: "./inventario/route", methods: ["GET", "POST"] },
  { path: "./inventario/[id]/route", methods: ["PATCH", "DELETE"] },
  { path: "./material/route", methods: ["GET", "POST"] },
  { path: "./material/[id]/route", methods: ["PATCH", "DELETE"] },
  // Escreve o catálogo todo de uma vez a partir de um CSV. Sem sessão, um
  // pedido só podia apagar meio inventário.
  { path: "./material/importar/route", methods: ["POST"] },
  { path: "./material/listas/route", methods: ["GET", "POST"] },
  { path: "./material/listas/[id]/route", methods: ["PATCH", "DELETE"] },
  { path: "./material/regras/route", methods: ["GET", "POST"] },
  { path: "./material/regras/[id]/route", methods: ["PATCH", "DELETE"] },
  { path: "./orcamento/[id]/material/route", methods: ["GET", "POST"] },
  { path: "./orcamento/[id]/material/marcar/route", methods: ["POST"] },
  { path: "./orcamento/route", methods: ["GET"] }, // POST = PUBLIC quote form (below)
  { path: "./orcamento/[id]/route", methods: ["PATCH", "DELETE"] }, // GET partly public (below)
  { path: "./orcamento/[id]/assets/route", methods: ["GET", "POST"] },
  // Escrita directa e importação da biblioteca: emitem bilhetes de escrita para
  // o Storage e copiam bytes para a pasta do pedido. Sem sessão, nem os
  // bilhetes podem ser emitidos.
  { path: "./orcamento/[id]/assets/url/route", methods: ["POST", "PUT"] },
  // Fabrica a miniatura em falta de uma foto do pedido (e guarda-a). Lê o
  // Storage do pedido e escreve no bucket das miniaturas — a mesma barreira das
  // outras rotas de fotografias, e por isso na mesma tabela.
  { path: "./orcamento/[id]/miniatura/route", methods: ["GET"] },
  { path: "./orcamento/[id]/assets/importar/route", methods: ["POST"] },
  { path: "./orcamento/[id]/mensagem/route", methods: ["POST"] },
  // Manda um modelo de email ao cliente (e, sem `enviar`, pré-visualiza-o com o
  // endereço dele lá dentro). Escreve para fora da casa — a barreira é a mesma
  // do mensageiro.
  { path: "./orcamento/[id]/modelo/route", methods: ["POST"] },
  { path: "./orcamento/[id]/proposta/route", methods: ["GET", "POST"] },
  { path: "./orcamento/[id]/email-rascunho/route", methods: ["POST"] },
  { path: "./orcamento/[id]/proposta-doc/route", methods: ["POST"] },
  // A verificação das fotografias antes de o link seguir. Recebe o documento
  // que está no ecrã dela — preços, notas, caminhos de ficheiro — e lista as
  // pastas do Storage: ler isto de fora seria enumerar o armazenamento da casa.
  { path: "./orcamento/[id]/fotos-em-falta/route", methods: ["POST"] },
  // O rascunho é trabalho comercial por publicar (preços, notas internas): ler
  // conta tanto como escrever.
  { path: "./orcamento/[id]/proposta-rascunho/route", methods: ["GET", "PUT", "DELETE"] },
  // Quanto tempo custou montar esta proposta. Não é dado do cliente, mas é
  // dado sobre COMO a casa trabalha — e o `POST` escreve na medição de que
  // depende a resposta a "que boards custam mais tempo?".
  // A biblioteca é o activo principal: ler o ensaio já diz o que lá está, e o
  // POST escreve etiquetas em ~200 fotos.
  { path: "./biblioteca/paletas/route", methods: ["GET", "POST"] },
  { path: "./orcamento/[id]/tempo-activo/route", methods: ["GET", "POST"] },
  // O histórico devolve o que se cobrou em cada ronda de negociação, e com
  // `?doc=` devolve um documento inteiro. É a proposta toda, por outra porta.
  // Cortar os links já enviados de um pedido. É a rota que fecha uma porta do
  // lado do casal, e o GET diz se e quando já foi cortada — as duas coisas são
  // do back office e nenhuma pode ser feita, nem lida, por quem tem só o link.
  // Quem trabalha aqui. Saber os nomes da equipa de uma empresa não é
  // informação pública — um endereço aberto a listá-los é meio caminho para
  // tentar entrar com um deles.
  // O relato de um erro do browser. Escreve no registo da casa — uma rota
  // aberta a fazê-lo é um megafone para quem a encontrar.
  { path: "./admin/erro-do-cliente/route", methods: ["POST"] },
  { path: "./admin/equipa/route", methods: ["GET"] },
  { path: "./orcamento/[id]/links/route", methods: ["GET", "POST"] },
  { path: "./orcamento/[id]/versoes/route", methods: ["GET"] },
  // O recorte automático da capa, para o estúdio o mostrar igual ao PDF.
  { path: "./orcamento/[id]/foco-da-capa/route", methods: ["GET"] },
  { path: "./orcamento/[id]/fotos-do-pdf/route", methods: ["POST"] },
  // «Ver as propostas que já mandei»: o PDF que seguiu, o link do casal e as
  // cópias dos emails — tudo dados de clientes, só com sessão.
  { path: "./orcamento/[id]/propostas/[pid]/pdf/route", methods: ["GET"] },
  { path: "./orcamento/[id]/propostas/[pid]/link/route", methods: ["GET"] },
  { path: "./orcamento/[id]/envios/route", methods: ["GET"] },
  // A memória de preços atravessa TODAS as propostas já enviadas: o que se
  // cobrou a cada cliente, agregado. É o ficheiro comercial da casa numa
  // resposta JSON.
  { path: "./orcamento/[id]/memoria/route", methods: ["GET"] },
  // Diz para que casamentos é que cada foto da biblioteca já foi — nomes de
  // clientes, datas e locais de OUTROS pedidos, numa resposta só.
  { path: "./orcamento/[id]/fotos-repetidas/route", methods: ["GET"] },
  { path: "./orcamento/manual/route", methods: ["POST"] },
  // A biblioteca visual: o vocabulário de etiquetas, a procura por etiquetas e
  // o etiquetar em lote. Tudo isto lê e escreve o trabalho de arrumação da
  // equipa, e as fotos que devolve são URLs assinados de um bucket PRIVADO.
  { path: "./biblioteca/etiquetas/route", methods: ["GET", "POST"] },
  { path: "./biblioteca/fotos/route", methods: ["GET"] },
  { path: "./biblioteca/etiquetar/route", methods: ["POST"] },
  { path: "./propostas/route", methods: ["GET"] },
  { path: "./propostas/[id]/route", methods: ["PATCH", "DELETE"] },
  // Copiar uma proposta lê o documento de OUTRA e escreve fotos no Storage.
  { path: "./propostas/copiar/route", methods: ["POST"] },
  // Os modelos guardam a estrutura e os preços das propostas dela.
  { path: "./propostas/modelos/route", methods: ["GET", "POST", "DELETE"] },
  // As preferências do estúdio (validade por omissão).
  { path: "./propostas/preferencias/route", methods: ["GET", "PUT"] },
  // A tradução das propostas. Aberta, era a QUOTA da casa a ser gasta por quem
  // passasse — o plano gratuito do DeepL tem um tecto de caracteres por mês, e
  // esgotá-lo é a Catarina a ficar sem tradução no dia em que precisa. O `GET`
  // só diz se o serviço está configurado, e nem isso: quem não tem sessão não
  // tem nada que saber o que este servidor tem ligado.
  { path: "./propostas/traduzir/route", methods: ["GET", "POST"] },
  { path: "./push/subscribe/route", methods: ["GET", "POST", "DELETE"] },
  { path: "./tarefas/route", methods: ["GET", "POST"] },
  { path: "./tarefas/[id]/route", methods: ["PATCH", "DELETE"] },
  // ── Biblioteca de Temas ────────────────────────────────────────────────────
  // Toda a árvore /temas é back-office: fotos do estúdio, os seus metadados e
  // as operações em lote que as movem. Estava FORA desta tabela até aqui — as
  // guardas existiam, mas nada as prendia, e é a tabela que é o contrato.
  { path: "./temas/route", methods: ["GET", "POST"] },
  { path: "./temas/[id]/route", methods: ["PATCH", "DELETE"] },
  { path: "./temas/[id]/imagens/route", methods: ["GET", "POST", "DELETE"] },
  { path: "./temas/[id]/imagens/url/route", methods: ["POST", "PUT"] },
  { path: "./temas/[id]/imagens/copiar/route", methods: ["POST"] },
  { path: "./temas/[id]/miniaturas/route", methods: ["POST"] },
  { path: "./temas/[id]/repetidas/route", methods: ["POST"] },
  // Fundir dois temas: MOVE a pasta inteira de um para o outro e arquiva a
  // origem. É a operação mais destrutiva desta família — não apaga fotos, mas
  // esvazia um tema —, e por isso é a que menos pode viver sem sessão.
  { path: "./temas/[id]/fundir/route", methods: ["POST"] },
  // «Usado em 7 propostas»: lê os documentos das propostas TODAS para os
  // contar. Não devolve nada de nenhuma delas — só um número por tema —, mas o
  // que ele lê são dados de clientes, e é aí que a guarda tem de estar.
  { path: "./temas/uso/route", methods: ["GET"] },
  // Notas da equipa e meta de receita — texto interno, e uma escrita.
  { path: "./visao-geral/route", methods: ["GET", "PUT"] },
  // Os números com que o estúdio faz contas (combustível, margem mínima). Ler
  // não expõe dados de clientes, mas ESCREVER muda o que todas as propostas
  // seguintes cobram de deslocação — é tão de sessão como o resto.
  { path: "./proposta-definicoes/route", methods: ["GET", "PUT"] },
  // A biblioteca de serviços: as palavras que vão nas propostas. Ler já é
  // interno; escrever muda o que sai em todas as propostas seguintes.
  { path: "./servicos-catalogo/route", methods: ["GET", "POST"] },
  { path: "./servicos-catalogo/[id]/route", methods: ["PATCH", "DELETE"] },
  // Passkeys. A LISTA e a REMOÇÃO são de sessão, como tudo o resto. O REGISTO
  // também, e é o ponto todo do desenho: transformar um aparelho numa chave só
  // pode ser feito por quem já provou ser quem diz. Sem esta guarda, um estranho
  // registava o aparelho dele e passava a ter porta própria.
  { path: "./admin/passkeys/route", methods: ["GET"] },
  // O PATCH é o RENOMEAR, e é tão de sessão como o remover: o nome é a única
  // coisa que distingue os aparelhos na lista, e quem o pudesse mudar sem
  // sessão baptizava o aparelho de outra pessoa para ela apagar o dela.
  { path: "./admin/passkeys/[id]/route", methods: ["DELETE", "PATCH"] },
  { path: "./admin/passkeys/registo/route", methods: ["GET", "POST"] },
  // A Reciclagem (R3): ler mostra o que se apagou — dados de clientes e de
  // fornecedores —, e repor e apagar de vez escrevem. Tudo de sessão.
  { path: "./reciclagem/route", methods: ["GET"] },
  { path: "./reciclagem/[id]/route", methods: ["DELETE"] },
  { path: "./reciclagem/[id]/repor/route", methods: ["POST"] },
];

describe("ADMIN-SESSION routes reject the unauthenticated before touching the store", () => {
  for (const route of ADMIN) {
    for (const method of route.methods) {
      it(`${method} ${route.path} → 401 and no store access`, async () => {
        const fn = await handler(route.path, method);
        expect(fn, `${method} ${route.path} is not exported`).toBeTypeOf("function");
        const hasBody = method !== "GET" && method !== "DELETE";
        const res = await fn(req(method, "/api/x", hasBody ? BODY : undefined), ctx());
        expect(res.status, `${method} ${route.path} must be 401 without a session`).toBe(401);
        // The guard runs first, so nothing in the data layer should have executed.
        expect(calls, `${method} ${route.path} reached its store while unauthenticated`).toEqual(
          [],
        );
      });
    }
  }

  // Guard-sanity: prove the 401s above are truly gated on auth, not a blanket
  // failure. With a session, the same handlers proceed INTO their store.
  it("GET /api/tarefas passes the guard for an authenticated admin (reaches the store)", async () => {
    authed.ok = true;
    const fn = await handler("./tarefas/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).not.toBe(401);
    expect(calls).toContain("tasks-store.listTasks");
  });

  it("GET /api/calendario passes the guard for an authenticated admin (reaches the store)", async () => {
    authed.ok = true;
    const fn = await handler("./calendario/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).not.toBe(401);
    expect(calls).toContain("calendar-store.listCalendarEvents");
  });

  // Mesma sanidade para a Biblioteca de Temas, o ramo que esta tabela acabou de
  // adoptar: prova que os 401 acima são a guarda a decidir e não a rota a
  // rebentar por outro motivo qualquer.
  it("GET /api/temas passes the guard for an authenticated admin (reaches the store)", async () => {
    authed.ok = true;
    const fn = await handler("./temas/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).not.toBe(401);
    expect(calls).toContain("themes-store.listThemes");
  });

  it("GET /api/servicos-catalogo passes the guard for an authenticated admin (reaches the store)", async () => {
    authed.ok = true;
    const fn = await handler("./servicos-catalogo/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).not.toBe(401);
    expect(calls).toContain("servicos-catalogo-store.listarServicos");
  });

  it("GET /api/proposta-definicoes passes the guard for an authenticated admin (reaches the store)", async () => {
    authed.ok = true;
    const fn = await handler("./proposta-definicoes/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).not.toBe(401);
    expect(calls).toContain("proposta-definicoes-store.listarDefinicoes");
  });

  it("GET /api/visao-geral passes the guard for an authenticated admin (reaches the store)", async () => {
    authed.ok = true;
    const fn = await handler("./visao-geral/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).not.toBe(401);
    expect(calls).toContain("overview-settings-store.readOverviewSettings");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1b. COMPLETUDE — a tabela acima só vale se cobrir mesmo a árvore toda. Este
// teste lê `src/app/api` do disco e exige que cada ficheiro de rota apareça em
// ALGUMA das listas deste ficheiro. Foi assim que onze rotas (a Biblioteca de
// Temas inteira, a Visão Geral, o rascunho da proposta e a escrita directa)
// se descobriram fora da auditoria: tinham guarda, mas ninguém as prendia. Uma
// rota nova falha aqui até ser classificada — que é exactamente o ponto.
// ─────────────────────────────────────────────────────────────────────────────
describe("a auditoria cobre TODAS as rotas de src/app/api", () => {
  it("nenhum ficheiro de rota fica fora das tabelas", async () => {
    const { readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = new URL(".", import.meta.url).pathname;

    const found: string[] = [];
    const walk = (dir: string, rel: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(dir, entry.name), `${rel}/${entry.name}`);
        else if (entry.name === "route.ts") found.push(`.${rel}/route`);
      }
    };
    walk(root, "");

    // As rotas que NÃO são de sessão admin, cada uma coberta na sua secção.
    const NON_ADMIN = [
      "./admin/login/route",
      "./admin/logout/route",
      "./health/route",
      "./security/csp-report/route",
      "./vitals/route",
      // O registo anónimo do vídeo da entrada (ela autorizou, 16/10). PÚBLICO
      // pela mesma razão que os Web Vitals: quem manda é o browser de quem
      // visita, sem sessão. O que o protege: esquema fechado, 8 KB, 20 por
      // minuto por IP, e desliga-se sozinho no fim do prazo.
      "./diagnostico-video/route",
      "./orcamento/route", // POST público + GET admin (ambos acima)
      // A medição da Meta. É PÚBLICA de propósito: recebe os eventos que o
      // browser acabou de mandar ao pixel, e o browser não tem sessão nenhuma.
      // O que a protege não é autenticação — é a lista fechada de nomes de
      // evento, a recusa do `Purchase` (que só o back office pode enviar, por
      // `./meta/fechos`), e o limite de 20 pedidos por minuto por IP.
      "./meta/route",
      // A entrada por passkey. É um CAMINHO DE ENTRADA, como o login por
      // palavra-passe: exigir sessão para entrar não faria sentido nenhum. O
      // que a protege é a assinatura do aparelho, verificada contra a chave
      // pública guardada, a origem e o domínio — mais o tecto de 20 tentativas
      // por minuto por IP.
      "./admin/passkeys/entrada/route",
      // A recuperação de palavra-passe. PÚBLICAS pela mesma razão que a
      // entrada: quem se esqueceu da palavra-passe não tem sessão nenhuma para
      // mostrar. O que as fecha é o tecto de pedidos, o token de uso único com
      // 30 minutos de vida (guardado só em resumo) e o facto de a ligação só
      // sair para um endereço já configurado no ADMIN_USERS.
      "./admin/recuperar/route",
      "./admin/recuperar/definir/route",
      "./proposta/[token]/pdf/route",
      // As fotografias da proposta, assinadas para quem tem o token. Mesmo
      // modelo de confiança do PDF ao lado — e ver menos do que ele, que já
      // leva os mesmos ficheiros embutidos.
      "./proposta/[token]/fotos/route",
      // A escolha do casal entre as alternativas que ela escreveu. Mesmo
      // modelo de confiança: o token É a autorização, e o corpo do pedido só
      // pode nomear um par (escolha, opção) que EXISTE no documento que esse
      // token abre. Não muda o estado do pedido, não gera contrato, não manda
      // email — não é o aceite, e há um teste ao lado a prendê-lo.
      "./proposta/[token]/escolha/route",
      // A fotografia no tamanho que o ecrã pede. Mesmo modelo de confiança do
      // `/fotos` ao lado, e a MESMA regra que o torna seguro: o parâmetro é o
      // id OPACO da foto dentro daquele documento, e o caminho real sai do
      // `doc` que o token abre. Uma rota que aceitasse caminhos serviria, com
      // o token de um casal, qualquer ficheiro da Biblioteca de Temas.
      "./proposta/[token]/foto/[id]/route",
      // As páginas do PDF como imagens, e a sua contagem. Mesmo modelo de
      // confiança do PDF: são o MESMO ficheiro, aos bocados.
      "./proposta/[token]/pagina/[n]/route",
      "./proposta/[token]/paginas/route",
      "./proposta/route",
      "./cron/reminders/route",
      // A cópia de segurança automática. Mesmo guarda das irmãs (Bearer com
      // CRON_SECRET, comparado em tempo constante, a falhar fechado em
      // produção) — e sai daqui um ficheiro com TODOS os dados de clientes,
      // por isso é a rota desta lista onde a guarda mais tem de valer.
      "./cron/backup/route",
      "./devproposalpreview/route",
      /**
       * O apanha-tudo da API. É PÚBLICO porque não pode ser outra coisa: só
       * recebe endereços que não existem, e responde 404 em JSON a todos os
       * métodos, sem tocar em store nenhum e sem dizer que endereços existem.
       *
       * Exigir sessão aqui seria pior do que inútil — dizia a um estranho, com
       * um 401 em vez de um 404, que aquele caminho é «uma coisa que existe e
       * está fechada». O 404 é a resposta honesta e a que menos conta.
       */
      "./[...rota]/route",
    ];
    const covered = new Set([...ADMIN.map((r) => r.path), ...NON_ADMIN]);
    const missing = found.filter((p) => !covered.has(p)).sort();
    expect(missing, `rotas sem classificação na auditoria: ${missing.join(", ")}`).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PUBLIC routes: reachable WITHOUT a session (never 401 for lack of one).
// ─────────────────────────────────────────────────────────────────────────────
describe("PUBLIC routes stay reachable without a session", () => {
  it("GET /api/health responds 200 (no session required)", async () => {
    const fn = await handler("./health/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).toBe(200);
  });

  it("GET /api/admin/passkeys/entrada dá o desafio sem sessão nenhuma", async () => {
    // É um caminho de ENTRADA: se exigisse sessão, ninguém entrava por aqui.
    const fn = await handler("./admin/passkeys/entrada/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).not.toBe(401);
  });

  it("POST /api/admin/passkeys/entrada recusa uma assinatura inventada — sem 401 por falta de sessão", async () => {
    // O que a fecha não é a sessão: é a criptografia. Sem desafio selado no
    // cookie, o pedido morre em 400 — e nunca chega a ler credencial nenhuma.
    const fn = await handler("./admin/passkeys/entrada/route", "POST");
    const res = await fn(
      req("POST", "/api/admin/passkeys/entrada", { response: { id: "credencial-inventada" } }),
      ctx(),
    );
    expect([400, 401, 429]).toContain(res.status);
    expect(calls, "leu a credencial sem sequer ter um desafio válido").toEqual([]);
  });

  it("POST /api/security/csp-report accepts a report unauthenticated", async () => {
    const fn = await handler("./security/csp-report/route", "POST");
    const res = await fn(req("POST", "/api/security/csp-report", { "csp-report": {} }), ctx());
    // Public report sink: 204 accepted (or 429 if rate-limited) — never an auth wall.
    expect([204, 429]).toContain(res.status);
  });

  it("POST /api/vitals accepts a Web Vitals beacon unauthenticated", async () => {
    const fn = await handler("./vitals/route", "POST");
    const res = await fn(
      req("POST", "/api/vitals", { name: "LCP", value: 1234, rating: "good" }),
      ctx(),
    );
    // Public RUM sink (browsers beacon here): 204 accepted (or 429 if rate-limited).
    expect([204, 429]).toContain(res.status);
  });

  it("POST /api/diagnostico-video accepts the anonymous video report unauthenticated", async () => {
    const fn = await handler("./diagnostico-video/route", "POST");
    const res = await fn(req("POST", "/api/diagnostico-video", { v: 1 }), ctx());
    // Público (o browser manda): 204 sempre, mesmo quando recusa o corpo.
    expect(res.status).toBe(204);
  });

  it("POST /api/orcamento (public quote form) is processed, not auth-gated", async () => {
    const fn = await handler("./orcamento/route", "POST");
    // A structurally-invalid payload → 400 from validation, proving the route is
    // reachable without a session (a 401 here would mean it got locked).
    const res = await fn(req("POST", "/api/orcamento", { junk: true }), ctx());
    expect(res.status).toBe(400);
    expect(calls).not.toContain("quotes-store.createQuote");
  });

  it("GET /api/orcamento/[id] serves the public confirmation view unauthenticated", async () => {
    const fn = await handler("./orcamento/[id]/route", "GET");
    const res = await fn(req("GET"), ctx());
    // getQuote is mocked → undefined → 404 (not found), but crucially NOT 401:
    // the endpoint is reachable by reference id without a session.
    expect(res.status).not.toBe(401);
    expect(calls).toContain("quotes-store.getQuote");
  });

  it("POST /api/admin/login is reachable without a session (malformed body → 400)", async () => {
    const fn = await handler("./admin/login/route", "POST");
    const res = await fn(req("POST", "/api/admin/login", "{ not json", {}, true), ctx());
    expect(res.status).toBe(400);
  });

  it("POST /api/admin/logout always succeeds (clears the cookie, no session needed)", async () => {
    const fn = await handler("./admin/logout/route", "POST");
    const res = await fn(req("POST"), ctx());
    expect(res.status).toBe(200);
  });

  it("POST /api/admin/recuperar é alcançável sem sessão (corpo mal formado → 400)", async () => {
    // Se exigisse sessão, quem se esqueceu da palavra-passe não tinha por onde
    // pedir a ligação — que é exactamente o problema que ela veio resolver.
    const fn = await handler("./admin/recuperar/route", "POST");
    const res = await fn(req("POST", "/api/admin/recuperar", "{ not json", {}, true), ctx());
    expect(res.status).toBe(400);
  });

  it("POST /api/admin/recuperar/definir recusa uma ligação inventada — sem 401 por falta de sessão", async () => {
    const fn = await handler("./admin/recuperar/definir/route", "POST");
    const res = await fn(
      req("POST", "/api/admin/recuperar/definir", { token: "inventado", password: "x".repeat(14) }),
      ctx(),
    );
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. TOKEN-guarded routes: a bad token must NOT resolve (404/401), never a leak.
// ─────────────────────────────────────────────────────────────────────────────
describe("TOKEN-guarded routes deny a bad token", () => {
  it("GET /api/proposta/[token]/pdf → 404 on a bad token", async () => {
    // Mesmo modelo de confiança do aceite: o token assinado É a autorização, e
    // um token que não seja o da proposta não abre o documento de ninguém.
    const fn = await handler("./proposta/[token]/pdf/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).toBe(404);
    expect(calls).toEqual([]); // nunca chegou à proposta nem ao gerador
  });

  it("GET /api/proposta/[token]/pagina/[n] e /paginas → 404 on a bad token", async () => {
    // As páginas do PDF como imagens: um token forjado não abre nem desenha nada.
    for (const rota of [
      "./proposta/[token]/pagina/[n]/route",
      "./proposta/[token]/paginas/route",
    ]) {
      const fn = await handler(rota, "GET");
      const res = await fn(req("GET"), { params: Promise.resolve({ token: "bad-token", n: "1" }) });
      expect(res.status).toBe(404);
    }
    expect(calls).toEqual([]);
  });

  it("GET /api/proposta/[token]/fotos → 404 on a bad token, e não assina nada", async () => {
    /**
     * A rota que assina as fotografias para o casal. Um token forjado não pode
     * produzir um único URL assinado — e o que se afirma não é só o 404: é que
     * NADA correu antes dele. Um caminho assinado por engano é um ficheiro do
     * bucket privado a ficar acessível durante o prazo da assinatura, e a
     * Biblioteca de Temas é o activo do estúdio inteiro.
     */
    const fn = await handler("./proposta/[token]/fotos/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).toBe(404);
    expect(calls).toEqual([]); // nunca chegou à proposta nem ao Storage
  });

  it("GET /api/proposta/[token]/foto/[id] → 404 on a bad token, e não toca no Storage", async () => {
    // Um token forjado não pode fabricar nem servir uma derivada de nada.
    const fn = await handler("./proposta/[token]/foto/[id]/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it("POST /api/proposta/[token]/escolha → 404 on a bad token, e não escreve nada", async () => {
    // A ÚNICA escrita que o lado do cliente faz. Um token forjado não pode
    // tocar num registo de ninguém — e o que se afirma não é só o 404: é que
    // nada correu antes dele.
    const fn = await handler("./proposta/[token]/escolha/route", "POST");
    const res = await fn(req("POST", "/api/x", { escolhaId: "e1", opcaoId: "o1" }), ctx());
    expect(res.status).toBe(404);
    expect(calls).toEqual([]);
  });

  /**
   * A ROTA DO ACEITE JÁ NÃO EXISTE, E É ISSO QUE SE AUDITA AGORA.
   *
   * Havia aqui um teste a provar que ela recusava um token forjado. Recusava —
   * mas a dona da casa mandou tirar o botão de aceitar do lado do cliente («não
   * quero que eles cliquem num botão para aceitarem a proposta»), e uma rota
   * que grava decisões do casal não pode ficar de pé só porque estava bem
   * guardada: uma ligação antiga numa caixa de correio continuava a poder
   * escrever um «aceito» que ninguém quis.
   *
   * O guarda passa a ser a AUSÊNCIA. A prova de que nada foi esquecido está em
   * `proposta/[token]/nada-de-aceitar-por-botao.test.ts`.
   */
  it("POST /api/proposta (o aceite do cliente) já não existe", async () => {
    await expect(handler("./proposta/route", "POST")).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SECRET / DEV-gated routes.
// ─────────────────────────────────────────────────────────────────────────────
describe("SECRET-guarded cron routes fail closed", () => {
  afterEach(() => vi.unstubAllEnvs());

  for (const path of ["./cron/reminders/route", "./cron/backup/route"]) {
    it(`GET ${path} → 401 in production with no CRON_SECRET, and never scans`, async () => {
      vi.stubEnv("CRON_SECRET", "");
      vi.stubEnv("NODE_ENV", "production");
      const fn = await handler(path, "GET");
      const res = await fn(req("GET", "/api/cron"), ctx());
      expect(res.status).toBe(401);
      expect(calls).toEqual([]);
    });

    it(`GET ${path} → not 401 with the correct Bearer secret`, async () => {
      vi.stubEnv("CRON_SECRET", "top-secret");
      const fn = await handler(path, "GET");
      const res = await fn(
        req("GET", "/api/cron", undefined, { authorization: "Bearer top-secret" }),
        ctx(),
      );
      expect(res.status).not.toBe(401);
    });
  }

  it("a logged-in admin may trigger cron without any secret header", async () => {
    vi.stubEnv("CRON_SECRET", "top-secret");
    authed.ok = true;
    const fn = await handler("./cron/reminders/route", "GET");
    const res = await fn(req("GET"), ctx());
    expect(res.status).not.toBe(401);
  });
});

describe("DEV-only preview is not exposed in production", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("GET /api/devproposalpreview → 404 in production (never renders the sample)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fn = await handler("./devproposalpreview/route", "GET");
    const url = new URL("https://liquen.test/api/devproposalpreview");
    const res = await fn({ nextUrl: url, url: url.toString() } as unknown as NextRequest, ctx());
    expect(res.status).toBe(404);
    expect(calls).not.toContain("proposal-doc-pdf.renderProposalDocPdf");
  });
});
