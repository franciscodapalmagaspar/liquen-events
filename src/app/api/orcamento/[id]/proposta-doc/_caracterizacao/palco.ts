/**
 * O PALCO DOS RETRATOS DA ROTA DA PROPOSTA (fase 5) — os duplos, o pedido e o
 * retrato, partilhados por `route.caracterizacao.test.ts` e por
 * `route.contra-a-antiga.test.ts`.
 *
 * Os `vi.mock` vivem AQUI e não no teste, e funcionam porque cada teste importa
 * este módulo ANTES da rota: o vitest corre os imports pela ordem, e quando a
 * rota pede `@/lib/mail` o duplo já está registado. Quem importar a rota antes
 * do palco fica com os módulos verdadeiros — e o retrato deixa de bater.
 *
 * `ctl` é o painel de controlo: cada cenário liga o que quer (sem sessão, fotos
 * em falta, SMTP em baixo…) e {@link repor} põe tudo como estava.
 */
import { vi } from "vitest";
import type { NextRequest } from "next/server";
import type { Proposal } from "@/lib/orcamento/types";
import { chaveDoPdf } from "@/lib/proposal-pdf-chave";
import type { ProposalDoc } from "@/lib/proposal-doc";

export const relogio = { agora: 0 };
export const ctl = {
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
};

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

import { sendMail } from "@/lib/mail";
import { createProposal, updateProposal } from "@/lib/proposals-store";
import { updateQuoteWith } from "@/lib/quotes-store";
import { registarEnvio } from "@/lib/envios-de-proposta";
import { esvaziarPdfsFinais } from "@/lib/proposal-preview-cache";
import { log } from "@/lib/logger";
import { __limparTrincosEmMemoria } from "@/lib/trinco";

export const params = Promise.resolve({ id: "q1" });

/** Um documento que passa todas as travas: uma linha com preço e artigo. */
export function doc(over: Record<string, unknown> = {}): Record<string, unknown> {
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

export function chave(d: Record<string, unknown>, idioma: unknown = "pt"): string {
  const { fotosDeBiblioteca: _o, ...sem } = JSON.parse(JSON.stringify(d));
  return chaveDoPdf(sem as ProposalDoc, idioma === "en" ? "en" : "pt");
}

export function pedido(corpo: unknown, cru = false): NextRequest {
  return new Request("https://liquen.test/api/orcamento/q1/proposta-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: cru ? (corpo as string) : JSON.stringify(corpo),
  }) as unknown as NextRequest;
}

/** Um envio como o do estúdio, com a chave do PDF visto. */
export function envio(d = doc(), extra: Record<string, unknown> = {}): NextRequest {
  return pedido({ mode: "send", doc: d, pdfVisto: chave(d, extra.idioma), ...extra });
}

/** O que muda sozinho entre corridas sai do retrato. */
export function normaliza(texto: string): string {
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

export function chamadas(fn: unknown): unknown {
  return (fn as { mock: { calls: unknown[][] } }).mock.calls;
}

/** O retrato inteiro de um pedido à rota. */
export async function retrato(res: Response): Promise<string> {
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
  // `lib/fronteira/observar.test.ts` e `lib/orcamento/envio/ler-o-corpo.test.ts`.
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

export function repor(): void {
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
}
