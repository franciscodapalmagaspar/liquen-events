import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({ authed: true }));

/**
 * Um mock por store, indexado pela MESMA chave que o conjunto tem no ficheiro
 * de backup, para que os testes possam percorrer `BACKUP_DATASETS` em vez de
 * repetirem à mão a lista de conjuntos (que é precisamente o hábito que deixou
 * as faturas e os contratos de fora durante meses).
 */
const stores = vi.hoisted(() => ({
  quotes: vi.fn(async () => [] as unknown[]),
  proposals: vi.fn(async () => [] as unknown[]),
  suppliers: vi.fn(async () => [] as unknown[]),
  tasks: vi.fn(async () => [] as unknown[]),
  calendarEvents: vi.fn(async () => [] as unknown[]),
  invoices: vi.fn(async () => [] as unknown[]),
  contracts: vi.fn(async () => [] as unknown[]),
  inventoryItems: vi.fn(async () => [] as unknown[]),
  materialItems: vi.fn(async () => [] as unknown[]),
  materialLists: vi.fn(async () => [] as unknown[]),
  materialListItems: vi.fn(async () => [] as unknown[]),
  materialRules: vi.fn(async () => [] as unknown[]),
  eventMaterial: vi.fn(async () => [] as unknown[]),
  eventMaterialItems: vi.fn(async () => [] as unknown[]),
  eventMaterialLog: vi.fn(async () => [] as unknown[]),
  emailTemplates: vi.fn(async () => [] as unknown[]),
  themes: vi.fn(async () => [] as unknown[]),
  overviewSettings: vi.fn(async () => [] as unknown[]),
  propostaDefinicoes: vi.fn(async () => [] as unknown[]),
  servicosCatalogo: vi.fn(async () => [] as unknown[]),
  bibliotecaEtiquetas: vi.fn(async () => [] as unknown[]),
  bibliotecaFotos: vi.fn(async () => [] as unknown[]),
  bibliotecaFotoEtiquetas: vi.fn(async () => [] as unknown[]),
  // Os rascunhos do estúdio não têm store próprio (vivem num espaço de nomes
  // do `app_state`), mas do ponto de vista da cópia são um conjunto como os
  // outros — e é assim que entram nas asserções que percorrem `BACKUP_DATASETS`.
  proposalDrafts: vi.fn(async () => [] as unknown[]),
  // As cópias dos emails enviados vivem no mesmo espaço partilhado dos
  // rascunhos, e entram na cópia pelo mesmo caminho.
  proposalEmails: vi.fn(async () => [] as unknown[]),
}));

/** Estado do cliente Supabase falso que serve os contadores de numeração. */
const sb = vi.hoisted(() => ({ configured: true, rows: [] as unknown[], fails: false }));

/** O carimbo de «esta cópia chegou». Duplo, e não o verdadeiro, porque o
 *  verdadeiro escreve no `app_state` — que sem Supabase é o `data/app-state.json`
 *  de quem estiver a correr os testes. */
const carimbos = vi.hoisted(() => ({ registados: [] as unknown[] }));

/**
 * O `after` do Next atira fora de um contexto de pedido, por isso é substituído
 * por um que GUARDA as tarefas em vez de as correr. Não é conveniência: é o que
 * permite provar que o carimbo ficou mesmo DE FORA da resposta (o ficheiro sai
 * primeiro) e, ainda assim, que corre — que era exactamente o que o `void`
 * solto não garantia.
 */
const depois = vi.hoisted(() => ({ tarefas: [] as (() => unknown)[] }));
vi.mock("next/server", async (original) => {
  const real = await original<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => depois.tarefas.push(fn) };
});
async function correrDepois() {
  const pendentes = depois.tarefas.splice(0);
  for (const t of pendentes) await t();
}

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authState.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/copia-de-seguranca-marcador", () => ({
  registarCopiaEnviada: vi.fn(async (info: unknown) => {
    carimbos.registados.push(info);
  }),
}));
vi.mock("@/lib/quotes-store", () => ({ listQuotes: stores.quotes }));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: stores.proposals }));
vi.mock("@/lib/suppliers-store", () => ({ listSuppliers: stores.suppliers }));
vi.mock("@/lib/tasks-store", () => ({ listTasks: stores.tasks }));
vi.mock("@/lib/calendar-store", () => ({ listCalendarEvents: stores.calendarEvents }));
vi.mock("@/lib/invoices-store", () => ({ listInvoices: stores.invoices }));
vi.mock("@/lib/contracts-store", () => ({ listContracts: stores.contracts }));
vi.mock("@/lib/inventory-store", () => ({ listItems: stores.inventoryItems }));
vi.mock("@/lib/material-store", () => ({ listMaterial: stores.materialItems }));
vi.mock("@/lib/material-lists-store", () => ({ listLists: stores.materialLists }));
vi.mock("@/lib/material-list-items-store", () => ({
  listAllListItems: stores.materialListItems,
}));
vi.mock("@/lib/material-rules-store", () => ({ listRules: stores.materialRules }));
vi.mock("@/lib/event-material-store", () => ({ listEventMaterial: stores.eventMaterial }));
vi.mock("@/lib/event-material-items-store", () => ({
  listAllEventItems: stores.eventMaterialItems,
}));
vi.mock("@/lib/event-material-log-store", () => ({ listAllLog: stores.eventMaterialLog }));
vi.mock("@/lib/email-templates-store", () => ({
  listTemplatesWithDefaults: stores.emailTemplates,
}));
vi.mock("@/lib/themes-store", () => ({ listThemes: stores.themes }));
vi.mock("@/lib/biblioteca-etiquetas-store", () => ({ listEtiquetas: stores.bibliotecaEtiquetas }));
vi.mock("@/lib/biblioteca-fotos-store", () => ({ listFotos: stores.bibliotecaFotos }));
vi.mock("@/lib/biblioteca-foto-etiquetas-store", () => ({
  listFotoEtiquetas: stores.bibliotecaFotoEtiquetas,
}));
// `readOverviewSettings` devolve os campos indexados; a rota faz-lhes
// `Object.values`, que sobre um array devolve o próprio conteúdo — por isso o
// mock pode servir uma lista como todos os outros.
vi.mock("@/lib/proposta-definicoes-store", () => ({
  listarDefinicoes: stores.propostaDefinicoes,
}));
vi.mock("@/lib/servicos-catalogo-store", () => ({
  listarServicos: stores.servicosCatalogo,
}));
vi.mock("@/lib/overview-settings-store", () => ({
  readOverviewSettings: stores.overviewSettings,
}));
vi.mock("@/lib/proposal-drafts", () => ({ listProposalDrafts: stores.proposalDrafts }));
vi.mock("@/lib/envios-de-proposta", () => ({ listEnviosDeProposta: stores.proposalEmails }));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () =>
    sb.configured
      ? {
          from: () => ({
            select: () => ({
              order: async () =>
                sb.fails
                  ? { data: null, error: new Error("db down") }
                  : { data: sb.rows, error: null },
            }),
          }),
        }
      : null,
}));

import { GET, BACKUP_DATASETS, NOT_BACKED_UP, PARTIALLY_BACKED_UP, EXTERNAL_ASSETS } from "./route";

function get(): NextRequest {
  return new Request("https://liquen.test/api/backup") as unknown as NextRequest;
}

/** Chaves servidas por um store mockado (todas menos os contadores de faturas). */
const STORE_KEYS = Object.keys(stores) as (keyof typeof stores)[];

beforeEach(() => {
  authState.authed = true;
  sb.configured = true;
  sb.rows = [];
  sb.fails = false;
  for (const fn of Object.values(stores)) {
    fn.mockReset();
    fn.mockResolvedValue([]);
  }
  carimbos.registados = [];
  depois.tarefas = [];
  vi.clearAllMocks();
});

describe("GET /api/backup", () => {
  it("401 without auth (never reads any store)", async () => {
    authState.authed = false;
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(stores.quotes).not.toHaveBeenCalled();
    expect(stores.invoices).not.toHaveBeenCalled();
  });

  it("empty data → 200 with a well-formed export, never 500", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.exportedAt).toBe("string");
    expect(Number.isNaN(Date.parse(json.exportedAt))).toBe(false);
    expect(typeof json.schemaVersion).toBe("number");
    expect(json.incomplete).toEqual([]);
    for (const d of BACKUP_DATASETS) {
      expect(json[d.key], `conjunto "${d.key}" em falta no ficheiro`).toEqual([]);
      expect(json.counts[d.key], `contagem de "${d.key}" em falta`).toBe(0);
    }
  });

  /**
   * O teste que a versão antiga desta rota não tinha: o ficheiro tem de trazer
   * TODOS os conjuntos declarados, não os cinco que alguém se lembrou de listar.
   * `route.coverage.test.ts` garante o passo seguinte — que a declaração não
   * fica atrás dos stores que existem mesmo.
   */
  it("exporta TODOS os conjuntos declarados, com contagens certas", async () => {
    STORE_KEYS.forEach((key, i) => {
      stores[key].mockResolvedValue(
        Array.from({ length: i + 1 }, (_, n) => ({ id: `${key}-${n}` })),
      );
    });
    sb.rows = [{ year: 2026, n: 7 }];

    const res = await GET(get());
    const json = await res.json();

    STORE_KEYS.forEach((key, i) => {
      expect(json[key], `conjunto "${key}"`).toHaveLength(i + 1);
      expect(json.counts[key], `contagem de "${key}"`).toBe(i + 1);
    });
    expect(json.invoiceCounters).toEqual([{ year: 2026, n: 7 }]);
    expect(json.counts.invoiceCounters).toBe(1);
    // Nenhum conjunto declarado pode faltar às contagens, nem sobrar nelas.
    expect(Object.keys(json.counts).sort()).toEqual(BACKUP_DATASETS.map((d) => d.key).sort());
  });

  it("o livro de faturas e os contratos aceites vão mesmo no ficheiro", async () => {
    stores.invoices.mockResolvedValue([{ id: "i1", number: "FT 2026/0001", status: "paga" }]);
    stores.contracts.mockResolvedValue([
      { id: "c1", status: "aceite", acceptedName: "Ana", termsSnapshot: "…" },
    ]);
    const json = await (await GET(get())).json();
    expect(json.invoices[0].number).toBe("FT 2026/0001");
    expect(json.contracts[0].termsSnapshot).toBe("…");
  });

  /**
   * Os rascunhos do estúdio. Foram a maior lacuna desta cópia durante todo o
   * tempo em que cá estiveram: uma colaboradora montou uma proposta inteira e
   * noutro computador não estava lá nada. A causa da gravação silenciosa foi
   * corrigida noutro sítio; isto prende a outra metade — o trabalho por acabar
   * VAI no ficheiro.
   */
  it("os RASCUNHOS do estúdio vão mesmo no ficheiro", async () => {
    stores.proposalDrafts.mockResolvedValue([
      {
        key: "proposal-draft:LIQ-AAA-1",
        doc: { ref: "PO Casamento Ana Dias", moodBoards: [{ images: ["LIQ-AAA-1/foto-1.jpg"] }] },
        updatedAt: "2026-03-01T09:00:00.000Z",
        savedBy: "Catarina",
      },
    ]);
    const json = await (await GET(get())).json();
    expect(json.proposalDrafts[0].key).toBe("proposal-draft:LIQ-AAA-1");
    expect(json.proposalDrafts[0].doc.moodBoards[0].images).toEqual(["LIQ-AAA-1/foto-1.jpg"]);
    expect(json.counts.proposalDrafts).toBe(1);
  });

  it("uma varredura de rascunhos truncada marca a cópia como INCOMPLETA (não sai vazia calada)", async () => {
    // `listProposalDrafts` lança quando não conseguiu varrer tudo. Sem isso, um
    // ficheiro com ar de completo e sem os rascunhos lá dentro — a mentira que
    // esta funcionalidade existe para não contar.
    stores.proposalDrafts.mockRejectedValue(new Error("varredura truncada"));
    const json = await (await GET(get())).json();
    expect(json.proposalDrafts).toEqual([]);
    expect(json.incomplete).toEqual(["proposalDrafts"]);
  });

  /**
   * A cópia sai sem espaços (mais pequena, mais depressa no telemóvel) e com o
   * tamanho à frente, para o back office mostrar quanto já chegou. É o mesmo
   * JSON: o restauro lê-o igual.
   */
  it("sai sem espaços, com o tamanho certo, e lê-se igual", async () => {
    const res = await GET(get());
    const texto = await res.text();
    expect(texto).not.toMatch(/\n\s/);
    expect(res.headers.get("Content-Length")).toBe(String(Buffer.byteLength(texto, "utf8")));
    const lida = JSON.parse(texto);
    expect(lida).toEqual(JSON.parse(JSON.stringify(lida, null, 2)));
    expect(lida.counts).toBeDefined();
  });

  it("sets a downloadable JSON Content-Disposition/Content-Type", async () => {
    const res = await GET(get());
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain("liquen-backup-");
    expect(cd).toContain(".json");
  });

  it("a single store rejecting does not 500 — that dataset degrades to [] but is FLAGGED", async () => {
    stores.suppliers.mockRejectedValue(new Error("db down"));
    stores.quotes.mockResolvedValue([{ id: "q1" }]);
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.suppliers).toEqual([]);
    expect(json.counts.suppliers).toBe(0);
    expect(json.counts.quotes).toBe(1);
    // Um vazio por avaria não pode passar por "não havia nada".
    expect(json.incomplete).toEqual(["suppliers"]);
  });

  it("uma recusa PASSAGEIRA de um conjunto tenta outra vez, e a cópia sai COMPLETA (registos de 13 e 16/11)", async () => {
    // «backup: conjunto falhou a leitura — cópia INCOMPLETA»: `eventMaterial`
    // a 13/11 e `proposalEmails` a 16/11, ambos com PGRST303 («JWT issued at
    // future» — o relógio do PostgREST uns segundos atrás). Passa sozinho num
    // segundo; sem nova tentativa, a cópia da noite saía incompleta.
    const relogio = Object.assign(new Error("JWT issued at future"), { code: "PGRST303" });
    stores.eventMaterial.mockRejectedValueOnce(relogio).mockResolvedValue([{ id: "em1" }]);
    stores.proposalEmails
      .mockRejectedValueOnce(new Error("tempo esgotado"))
      .mockResolvedValue([{ key: "envio-de-proposta:1" }]);
    const json = await (await GET(get())).json();
    expect(json.incomplete).toEqual([]);
    expect(json.counts.eventMaterial).toBe(1);
    expect(json.counts.proposalEmails).toBe(1);
  });

  it("uma avaria que NÃO é passageira não se repete às cegas", async () => {
    stores.suppliers.mockRejectedValue(new Error("db down"));
    await GET(get());
    expect(stores.suppliers).toHaveBeenCalledTimes(1);
  });

  it("contadores de numeração: erro do Supabase marca a cópia como incompleta", async () => {
    sb.fails = true;
    const json = await (await GET(get())).json();
    expect(json.invoiceCounters).toEqual([]);
    expect(json.incomplete).toEqual(["invoiceCounters"]);
  });

  it("sem Supabase (desenvolvimento) os contadores vêm vazios sem falhar a cópia", async () => {
    sb.configured = false;
    const json = await (await GET(get())).json();
    expect(json.invoiceCounters).toEqual([]);
    expect(json.incomplete).toEqual([]);
  });

  it("all stores rejecting still yields a 200 backup that ADMITS being empty", async () => {
    for (const fn of Object.values(stores)) fn.mockRejectedValue(new Error("total outage"));
    sb.fails = true;
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    for (const d of BACKUP_DATASETS) expect(json.counts[d.key]).toBe(0);
    expect(json.incomplete.sort()).toEqual(BACKUP_DATASETS.map((d) => d.key).sort());
  });

  it("o ficheiro diz por escrito o que NÃO traz (fotos) e COMO se repõe", async () => {
    const json = await (await GET(get())).json();
    expect(typeof json.readme).toBe("string");
    // Durante muito tempo dizia "NÃO existe botão de restauro". Agora existe, e
    // o ficheiro tem de dizer por onde — quem o abre daqui a dois anos, num dia
    // mau, não vai adivinhar o caminho da rota.
    expect(json.readme).toMatch(/repor/i);
    expect(json.readme).toContain("/api/backup/restore");
    for (const key of [...Object.keys(NOT_BACKED_UP), ...Object.keys(EXTERNAL_ASSETS)]) {
      expect(json.notIncluded[key], `exclusão "${key}" sem explicação no ficheiro`).toBeTruthy();
    }
    expect(Object.keys(json.notIncluded)).toContain("storage:proposal-assets");
    expect(Object.keys(json.notIncluded)).toContain("storage:theme-assets");
  });

  it("o ficheiro não dá a entender que leva a `app_state` toda — diz que parte é que fica de fora", async () => {
    // A tabela dos rascunhos é partilhada com os marcadores de operação. O
    // ficheiro leva uns e não os outros, e tem de o DIZER: sem esta entrada,
    // quem o lê daqui a dois anos conclui uma de duas mentiras — ou que a
    // tabela vai toda, ou (se aparecesse em `notIncluded` sem mais nada) que
    // não vai nada dela e os rascunhos se perderam.
    const json = await (await GET(get())).json();
    const chave = "app_state (parte)";
    expect(Object.keys(json.notIncluded)).toContain(chave);
    expect(json.notIncluded[chave]).toBe(PARTIALLY_BACKED_UP.app_state);
    expect(json.notIncluded[chave]).toMatch(/proposal-draft/);
    expect(Object.keys(json.notIncluded), "a tabela vai em parte, não fica de fora").not.toContain(
      "app_state",
    );
    // E o README diz a mesma coisa por palavras, para quem não lê listas.
    expect(json.readme).toMatch(/rascunhos/i);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA CÓPIA DESCARREGADA À MÃO TAMBÉM É UMA CÓPIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel do back office avisa quando não chega uma cópia há três dias (ver
 * `lib/copia-de-seguranca-marcador.ts`). Se só a tarefa agendada carimbasse,
 * quem faz o descarregamento à mão — que é o que o RUNBOOK manda fazer antes de
 * mexer em dados, e o caminho enquanto o `CRON_SECRET` não estiver resolvido —
 * continuaria a levar com o aviso depois de ter feito exactamente o que ele
 * pede. Um aviso assim aprende-se a ignorar.
 */
describe("GET /api/backup — o carimbo da cópia", () => {
  it("descarregar carimba, e diz que foi à mão", async () => {
    await GET(get());
    // O carimbo fica AGENDADO para depois da resposta (o ficheiro é o que
    // interessa) — mas agendado no `after`, que a plataforma mantém vivo, e
    // não num `void` que o contentor podia congelar antes de correr.
    expect(carimbos.registados).toHaveLength(0);
    await correrDepois();
    expect(carimbos.registados).toHaveLength(1);
    expect(carimbos.registados[0]).toMatchObject({ modo: "manual", parcial: false });
  });

  it("sem sessão não se carimba nada — não saiu cópia nenhuma", async () => {
    authState.authed = false;
    await GET(get());
    await correrDepois();
    expect(carimbos.registados).toHaveLength(0);
  });

  it("uma cópia com conjuntos em falta fica carimbada como parcial", async () => {
    stores.quotes.mockRejectedValue(new Error("base de dados em baixo"));
    await GET(get());
    await correrDepois();
    expect(carimbos.registados[0]).toMatchObject({ parcial: true });
  });

  it("o carimbo a falhar não estraga o ficheiro que já saiu", async () => {
    const marcador = await import("@/lib/copia-de-seguranca-marcador");
    vi.mocked(marcador.registarCopiaEnviada).mockRejectedValueOnce(new Error("app_state em baixo"));
    const res = await GET(get());
    expect(res.status).toBe(200);
    await expect(correrDepois()).resolves.toBeUndefined();
  });
});
