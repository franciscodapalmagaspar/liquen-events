/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ROTA DA PROPOSTA, FOTOGRAFADA ANTES DE SER PARTIDA (fase 5)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `docs/ESTRUTURA-DO-CODIGO.md`, fase 5: o `POST` desta rota passa de uma
 * função de complexidade 163 a um orquestrador de etapas. A regra de ferro é
 * que nada muda para quem a chama — código a código, campo a campo.
 *
 * Os 185 casos de `route.test.ts` provam o que cada regra QUER. Este ficheiro
 * prova outra coisa: que a resposta é a MESMA. Cada cenário guarda o retrato
 * inteiro do que a rota fez — o estado HTTP, o corpo tal e qual (o TEXTO, para
 * a ordem dos campos também contar), os cabeçalhos que o estúdio lê, o email
 * que saiu, o que se gravou e cada linha do registo. O retrato foi tirado com
 * a rota ANTES de ser partida (commit de caracterização) e fica no
 * `__snapshots__`; depois disso, qualquer diferença é uma regressão.
 *
 * Só se normaliza o que muda sozinho entre corridas: identificadores
 * (`randomUUID`) e datas (o relógio).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Proposal } from "@/lib/orcamento/types";
import { chaveDoPdf } from "@/lib/proposal-pdf-chave";
import type { ProposalDoc } from "@/lib/proposal-doc";

const relogio = vi.hoisted(() => ({ agora: 0 }));
const ctl = vi.hoisted(() => ({
  autenticado: true,
  semPedido: false,
  pedidoRebenta: false,
  emailDoPedido: "cliente@example.com" as string | undefined,
  estadoDoPedido: "pendente",
  /** Quantos ms «demora» cada desenho do PDF (o relógio da rota anda com ele). */
  desenhoDemora: 0,
  missing: 0,
  truncations: [] as { where: string; dropped: number; unit: "fotos" | "linhas" }[],
  gravarFalhaCom: null as unknown,
  gravarFalhaSempre: false,
  marcarEnviadaFalha: false,
  pedidoFalha: false,
  copiaFalha: false,
  smtp: "ok" as "ok" | "nao-configurado" | "rebenta",
  modelo: null as null | { assunto: string; corpo: string },
  linhas: new Map<string, Proposal>(),
  envios: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/admin-auth", () => ({
  isAuthed: () => ctl.autenticado,
  assinaturaConfigurada: () => ({}),
}));

vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async (id: string) => {
    if (ctl.pedidoRebenta) throw new Error("a base caiu");
    if (ctl.semPedido) return null;
    return { id, name: "Mãe da Noiva", email: ctl.emailDoPedido, status: "pendente" };
  }),
  updateQuoteWith: vi.fn(
    async (id: string, mutar: (q: Record<string, unknown>) => Record<string, unknown>) => {
      if (ctl.pedidoFalha) throw new Error("a base recusou o pedido");
      return mutar({ id, email: ctl.emailDoPedido, status: ctl.estadoDoPedido, activityLog: [] });
    },
  ),
}));
vi.mock("@/lib/proposals-store", () => ({
  createProposal: vi.fn(async (p: Proposal) => {
    if (ctl.gravarFalhaSempre) throw ctl.gravarFalhaCom;
    if (ctl.gravarFalhaCom) {
      const e = ctl.gravarFalhaCom;
      ctl.gravarFalhaCom = null;
      throw e;
    }
    ctl.linhas.set(p.id, { ...p });
  }),
  updateProposal: vi.fn(async (id: string, patch: Partial<Proposal>) => {
    if (ctl.marcarEnviadaFalha && patch.status === "enviada") return null;
    const actual = ctl.linhas.get(id);
    if (!actual) return null;
    const novo = { ...actual, ...patch };
    ctl.linhas.set(id, novo);
    return novo;
  }),
  listProposalsForQuote: vi.fn(async (q: string) =>
    [...ctl.linhas.values()].filter((p) => p.quoteId === q),
  ),
}));
vi.mock("@/lib/contracts-store", () => ({
  newContractId: () => "c1",
  createContractIfAbsent: vi.fn(async () => undefined),
  deleteContract: vi.fn(async () => undefined),
  getContractByProposal: vi.fn(async () => null),
}));
vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredEditorialPdfWithReport: vi.fn(async () => ({
    ...(ctl.desenhoDemora ? { _: (relogio.agora += ctl.desenhoDemora) } : {}),
    pdf: Buffer.from("%PDF-1.4 caracterizacao"),
    missingImages: ctl.missing,
    truncations: ctl.truncations,
  })),
}));
vi.mock("@/lib/email-templates-store", async (original) => {
  const real = await original<typeof import("@/lib/email-templates-store")>();
  return { ...real, getTemplate: vi.fn(async () => ctl.modelo) };
});
vi.mock("@/lib/proposta-link-curto", () => ({
  enderecoDaProposta: async () => "https://liquen-events.com/proposta/tok",
  enderecoDoPdfDaProposta: (url: string) =>
    `${url.replace(/\/proposta\/([^/]+)$/, "/api/proposta/$1")}/pdf`,
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => {
    if (ctl.smtp === "rebenta") throw new Error("credenciais erradas");
    return { sent: ctl.smtp === "ok" };
  }),
  esc: (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;"),
  MAIL_TO: "team@example.com",
}));
vi.mock("@/lib/envios-de-proposta", () => ({
  registarEnvio: vi.fn(async (_q: string, envio: Record<string, unknown>) => {
    if (ctl.copiaFalha) throw new Error("app_state recusou");
    ctl.envios.push(envio);
    return { gravado: true };
  }),
  listarEnvios: vi.fn(async () => ctl.envios),
}));
vi.mock("@/lib/proposta-fotos-verificacao", () => ({
  fotosEscolhidasQueFaltam: vi.fn(async () => []),
}));
vi.mock("@/lib/proposal-pdf-guardado", () => ({
  guardarPdfDaProposta: vi.fn(async () => true),
}));

import { GET, POST } from "./route";
import { sendMail } from "@/lib/mail";
import { createProposal, updateProposal } from "@/lib/proposals-store";
import { updateQuoteWith } from "@/lib/quotes-store";
import { registarEnvio } from "@/lib/envios-de-proposta";
import { esvaziarPdfsFinais } from "@/lib/proposal-preview-cache";
import { log } from "@/lib/logger";
import { __limparTrincosEmMemoria, fecharTrinco } from "@/lib/trinco";
import { dominioRecebeEmail } from "@/lib/dominio-do-email";

const params = Promise.resolve({ id: "q1" });

/** Um documento que passa todas as travas: uma linha com preço e artigo. */
function doc(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    template: "decoracao",
    ref: "PO Decoração Teste",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Évora",
    guests: "150 pax",
    serviceGroups: [],
    moodBoards: [],
    budgetItems: ["Decoração"],
    budgetAmounts: [3000],
    budgetArtigos: ["flores"],
    totalAmount: 3000,
    totalVatMode: "acrescer",
    totalLabel: "Valor Total Decoração",
    totalText: "",
    coverImages: [],
    ...over,
  };
}

function chave(d: Record<string, unknown>, idioma: unknown = "pt"): string {
  const { fotosDeBiblioteca: _o, ...sem } = JSON.parse(JSON.stringify(d));
  return chaveDoPdf(sem as ProposalDoc, idioma === "en" ? "en" : "pt");
}

function pedido(corpo: unknown, cru = false): NextRequest {
  return new Request("https://liquen.test/api/orcamento/q1/proposta-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: cru ? (corpo as string) : JSON.stringify(corpo),
  }) as unknown as NextRequest;
}

/** Um envio como o do estúdio, com a chave do PDF visto. */
function envio(d = doc(), extra: Record<string, unknown> = {}): NextRequest {
  return pedido({ mode: "send", doc: d, pdfVisto: chave(d, extra.idioma), ...extra });
}

/** O que muda sozinho entre corridas sai do retrato. */
function normaliza(texto: string): string {
  return (
    texto
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<id>")
      // O identificador curto de cada linha do histórico do pedido.
      .replace(/\b[0-9a-f]{10}\b/g, "<hex>")
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<instante>")
      .replace(/\d{4}-\d{2}-\d{2}/g, "<dia>")
      .replace(/\b\d{1,2} de [a-zç]+ de \d{4}\b/g, "<data por extenso>")
  );
}

function chamadas(fn: unknown): unknown {
  return (fn as { mock: { calls: unknown[][] } }).mock.calls;
}

/** O retrato inteiro de um pedido à rota. */
async function retrato(res: Response): Promise<string> {
  const cabecalhos: Record<string, string | null> = {};
  for (const h of [
    "content-type",
    "content-disposition",
    "x-fotos-em-falta",
    "x-conteudo-cortado",
    "x-chave-do-pdf",
    "x-pdf-da-memoria",
  ]) {
    cabecalhos[h] = res.headers.get(h);
  }
  const ct = res.headers.get("content-type") ?? "";
  const corpo = ct.includes("pdf")
    ? `<pdf ${(await res.arrayBuffer()).byteLength} bytes>`
    : await res.text();
  // O modo de observar da fronteira (fase 6) é uma linha NOVA no registo, e
  // de propósito: fica fora do retrato, e tem os seus testes em
  // `lib/fronteira/observar.test.ts` e `lib/orcamento/envio/corpo-do-pedido.test.ts`.
  const registo = (["info", "warn", "error"] as const).flatMap((nivel) =>
    vi
      .mocked(log[nivel])
      .mock.calls.filter((c) => !String(c[0]).startsWith("fronteira:"))
      .map((c) => [nivel, ...c.map((x) => (x instanceof Error ? `Error(${x.message})` : x))]),
  );
  const mail = vi.mocked(sendMail).mock.calls.map(([m]) => ({
    to: m.to,
    replyTo: m.replyTo,
    subject: m.subject,
    html: m.html,
    text: m.text,
    anexos: (m.attachments ?? []).map((a) => a.filename),
  }));
  return normaliza(
    JSON.stringify(
      {
        estado: res.status,
        cabecalhos,
        corpo,
        mail,
        criadas: chamadas(createProposal),
        actualizadas: chamadas(updateProposal),
        pedido: await Promise.all(
          vi.mocked(updateQuoteWith).mock.results.map((r) => r.value as Promise<unknown>),
        ).catch((e) => `rebentou: ${String(e)}`),
        copias: chamadas(registarEnvio),
        registo,
      },
      null,
      2,
    ),
  );
}

beforeEach(() => {
  Object.assign(ctl, {
    autenticado: true,
    semPedido: false,
    pedidoRebenta: false,
    emailDoPedido: "cliente@example.com",
    estadoDoPedido: "pendente",
    desenhoDemora: 0,
    missing: 0,
    truncations: [],
    gravarFalhaCom: null,
    gravarFalhaSempre: false,
    marcarEnviadaFalha: false,
    pedidoFalha: false,
    copiaFalha: false,
    smtp: "ok",
    modelo: null,
    envios: [],
  });
  ctl.linhas.clear();
  __limparTrincosEmMemoria();
  esvaziarPdfsFinais();
  vi.clearAllMocks();
  for (const nivel of ["info", "warn", "error"] as const)
    vi.spyOn(log, nivel).mockImplementation(() => {});
});

const colunaEmFalta = (coluna: string) =>
  Object.assign(
    new Error(`Could not find the '${coluna}' column of 'proposals' in the schema cache`),
    {
      code: "PGRST204",
    },
  );

/** Cada cenário: o nome, a preparação e o pedido. */
const CENARIOS: Array<[string, () => void, () => NextRequest]> = [
  ["401 sem sessão", () => (ctl.autenticado = false), () => envio()],
  ["404 sem pedido", () => (ctl.semPedido = true), () => envio()],
  ["500 a base cai a ler o pedido", () => (ctl.pedidoRebenta = true), () => envio()],
  [
    "409 o trinco está fechado",
    // Outro pedido a enviar a mesma proposta (o trinco verdadeiro, em memória).
    () => void fecharTrinco("envio-da-proposta:q1", 60_000),
    () => envio(),
  ],
  [
    "400 corpo do email acima do tecto",
    () => {},
    () => envio(doc(), { corpo: "x".repeat(20_001) }),
  ],
  ["400 corpo que não é JSON", () => {}, () => pedido("{isto não é json", true)],
  ["400 corpo nulo", () => {}, () => pedido(null)],
  ["400 sem documento", () => {}, () => pedido({ mode: "send" })],
  ["400 sem referência", () => {}, () => envio(doc({ ref: "" }))],
  ["400 sem nomes", () => {}, () => envio(doc({ clientNames: "" }))],
  ["400 sem as duas", () => {}, () => envio(doc({ ref: "", clientNames: "" }))],
  ["413 documento enorme", () => {}, () => envio(doc({ notas: "y".repeat(600_000) }))],
  ["422 envio sem o PDF visto", () => {}, () => envio(doc(), { pdfVisto: undefined })],
  ["422 envio sem email no pedido", () => (ctl.emailDoPedido = undefined), () => envio()],
  [
    "422 PDF final sem preços",
    () => {},
    () => pedido({ mode: "preview", doc: doc({ budgetAmounts: [] }) }),
  ],
  ["pré-visualização final", () => {}, () => pedido({ mode: "preview", doc: doc() })],
  [
    "pré-visualização rascunho",
    () => {},
    () => pedido({ mode: "preview", doc: doc(), rascunho: true }),
  ],
  [
    "pré-visualização em inglês",
    () => {},
    () => pedido({ mode: "preview", doc: doc(), idioma: "en" }),
  ],
  [
    "pré-visualização com idioma estranho",
    () => {},
    () => pedido({ mode: "preview", doc: doc(), idioma: "fr" }),
  ],
  ["modo desconhecido é pré-visualização", () => {}, () => pedido({ mode: "outro", doc: doc() })],
  [
    "pré-visualização com fotos em falta e cortes",
    () => {
      ctl.missing = 2;
      ctl.truncations = [{ where: "Mood board «Cerimónia»", dropped: 3, unit: "fotos" }];
    },
    () => pedido({ mode: "preview", doc: doc() }),
  ],
  ["409 fotos em falta por confirmar", () => (ctl.missing = 3), () => envio()],
  [
    "409 fotos aceites a menos",
    () => (ctl.missing = 3),
    () => envio(doc(), { fotosEmFaltaConfirmadas: 2 }),
  ],
  [
    "409 cortes por confirmar",
    () => (ctl.truncations = [{ where: "Capa", dropped: 1, unit: "linhas" }]),
    () => envio(),
  ],
  [
    "envio com fotos e cortes confirmados",
    () => {
      ctl.missing = 1;
      ctl.truncations = [{ where: "Capa", dropped: 1, unit: "linhas" }];
    },
    () => envio(doc(), { fotosEmFaltaConfirmadas: 1, cortesConfirmados: true }),
  ],
  ["envio normal", () => {}, () => envio()],
  ["envio em inglês", () => {}, () => envio(doc(), { idioma: "en" })],
  [
    "envio com mensagem pessoal",
    () => {},
    () => envio(doc(), { mensagem: "  Foi um gosto <3\n\nAté breve  " }),
  ],
  [
    "envio com corpo escrito à mão",
    () => {},
    () =>
      envio(doc(), {
        corpo: "Olá!\n\nA proposta: {{link_proposta}}",
        assunto: "A vossa proposta",
        modelo: "registo-formal",
      }),
  ],
  [
    "envio com o modelo dela",
    () =>
      (ctl.modelo = {
        assunto: "Proposta {cliente_nome}",
        corpo: "<p>Olá {cliente_nome}, {link}</p>",
      }),
    () => envio(),
  ],
  ["envio só pelo WhatsApp", () => {}, () => envio(doc(), { porEmail: false })],
  ["envio fora de um casamento", () => {}, () => envio(doc({ eventType: "Jantar de empresa" }))],
  ["SMTP não configurado", () => (ctl.smtp = "nao-configurado"), () => envio()],
  ["SMTP rebenta", () => (ctl.smtp = "rebenta"), () => envio()],
  ["a cópia do envio falha", () => (ctl.copiaFalha = true), () => envio()],
  ["o pedido não actualiza", () => (ctl.pedidoFalha = true), () => envio()],
  ["a marcação «enviada» falha", () => (ctl.marcarEnviadaFalha = true), () => envio()],
  ["coluna `doc` em falta", () => (ctl.gravarFalhaCom = colunaEmFalta("doc")), () => envio()],
  [
    "tabela em falta sem nomear a coluna",
    () =>
      (ctl.gravarFalhaCom = Object.assign(new Error("relation proposals does not exist"), {
        code: "42P01",
      })),
    () => envio(),
  ],
  [
    "a base recusa tudo",
    () => {
      ctl.gravarFalhaSempre = true;
      ctl.gravarFalhaCom = Object.assign(new Error("relation proposals does not exist"), {
        code: "42P01",
      });
    },
    () => envio(),
  ],
  [
    "422 o domínio do email não recebe correio",
    () => vi.mocked(dominioRecebeEmail).mockResolvedValueOnce(false),
    () => envio(),
  ],
  ["pedido já ganho: a proposta fica aceite", () => (ctl.estadoDoPedido = "aceite"), () => envio()],
  [
    "sem tempo para o email",
    () => {
      relogio.agora = Date.now();
      ctl.desenhoDemora = 40_000;
      vi.spyOn(Date, "now").mockImplementation(() => relogio.agora);
    },
    () => envio(),
  ],
  [
    "503 avaria qualquer a gravar",
    () => (ctl.gravarFalhaCom = new Error("timeout")),
    () => envio(),
  ],
];

describe("o retrato de cada resposta da rota (fase 5)", () => {
  it.each(CENARIOS)("%s", async (_nome, preparar, fazer) => {
    preparar();
    const res = await POST(fazer(), { params });
    vi.mocked(Date.now).mockRestore?.();
    expect(await retrato(res)).toMatchSnapshot();
  });

  it("o segundo envio do mesmo documento é uma repetição", async () => {
    await POST(envio(), { params });
    vi.clearAllMocks();
    expect(await retrato(await POST(envio(), { params }))).toMatchSnapshot();
  });

  it("o segundo toque no WhatsApp é uma repetição", async () => {
    await POST(envio(doc(), { porEmail: false }), { params });
    vi.clearAllMocks();
    expect(
      await retrato(await POST(envio(doc(), { porEmail: false }), { params })),
    ).toMatchSnapshot();
  });

  it("o reenvio depois de a marcação falhar reconhece-se pelo registo", async () => {
    ctl.marcarEnviadaFalha = true;
    await POST(envio(), { params });
    vi.clearAllMocks();
    expect(await retrato(await POST(envio(), { params }))).toMatchSnapshot();
  });

  it("depois do WhatsApp, o email do mesmo documento sai", async () => {
    await POST(envio(doc(), { porEmail: false }), { params });
    vi.clearAllMocks();
    expect(await retrato(await POST(envio(), { params }))).toMatchSnapshot();
  });

  it("a segunda pré-visualização sai da memória, e o envio a seguir também", async () => {
    await POST(pedido({ mode: "preview", doc: doc() }), { params });
    expect(
      await retrato(await POST(pedido({ mode: "preview", doc: doc() }), { params })),
    ).toMatchSnapshot();
    vi.clearAllMocks();
    expect(await retrato(await POST(envio(), { params }))).toMatchSnapshot();
  });

  it("GET: sem propostas, e depois de um envio", async () => {
    const pedirGet = () =>
      GET(new Request("https://liquen.test/x") as unknown as NextRequest, { params });
    expect(await (await pedirGet()).text()).toMatchSnapshot();
    await POST(envio(), { params });
    expect(await (await pedirGet()).text()).toMatchSnapshot();
    ctl.autenticado = false;
    const r = await pedirGet();
    expect([r.status, await r.text()]).toMatchSnapshot();
  });
});
