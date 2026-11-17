/**
 * As etapas que ainda só estavam provadas pela rota inteira, agora sozinhas
 * (fase 5): o que trava, o desenho e a segunda passagem, o email escrito, e o
 * que fica depois do correio. Falsos no lugar dos serviços; a regra é a real.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Proposal, Quote } from "@/lib/orcamento/types";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import { log } from "@/lib/logger";

const f = vi.hoisted(() => ({
  desenhos: [] as number[],
  marcar: vi.fn(async (_id: string, _p: unknown): Promise<unknown> => ({})),
  pedido: vi.fn(async (_id: string, _m: unknown): Promise<unknown> => ({ status: "cotado" })),
  copia: vi.fn(async (_id: string, _e: unknown) => ({ gravado: true })),
  modelo: vi.fn(async (): Promise<unknown> => null),
}));
vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredEditorialPdfWithReport: vi.fn(async () => ({
    pdf: Buffer.from("%PDF"),
    missingImages: f.desenhos.shift() ?? 0,
    truncations: [],
  })),
}));
vi.mock("@/lib/proposta-fotos-verificacao", () => ({ fotosEscolhidasQueFaltam: async () => [] }));
vi.mock("@/lib/proposals-store", () => ({ updateProposal: f.marcar }));
vi.mock("@/lib/quotes-store", () => ({ updateQuoteWith: f.pedido }));
vi.mock("@/lib/envios-de-proposta", () => ({ registarEnvio: f.copia }));
vi.mock("@/lib/proposal-pdf-guardado", () => ({ guardarPdfDaProposta: async () => true }));
vi.mock("@/lib/contrato-do-ganho", () => ({ aceitarSeOPedidoJaEstaGanho: async () => false }));
vi.mock("@/lib/email-modelos", async (original) => ({
  ...(await original<typeof import("@/lib/email-modelos")>()),
  modeloParaEnvioAutomatico: f.modelo,
}));

import { travaDoEnvio } from "./travas-do-envio";
import { desenharOPdf } from "./desenhar-o-pdf";
import { escreverOEmail } from "./email-da-proposta";
import { depoisDoEmail } from "./depois-do-email";
import { esvaziarPdfsFinais } from "@/lib/proposal-preview-cache";

const doc = {
  ref: "PO",
  clientNames: "Maria & Zé",
  eventType: "Casamento",
  eventDate: "3 de julho de 2027",
  serviceGroups: [],
  moodBoards: [],
  budgetItems: ["Decoração"],
  budgetAmounts: [3000],
  budgetArtigos: ["flores"],
  totalAmount: 3000,
  totalVatMode: "acrescer",
  coverImages: [],
  validUntil: "2027-01-01",
} as unknown as ProposalDoc;
const quote = { id: "q", name: "Mãe da Noiva", email: "c@x.pt", status: "pendente" } as Quote;
const envio = { pedidoId: "q", quote, doc, idioma: "pt" as const };

beforeEach(() => {
  vi.clearAllMocks();
  esvaziarPdfsFinais();
  f.desenhos = [];
  for (const nivel of ["warn", "error", "info"] as const) {
    vi.spyOn(log, nivel).mockImplementation(() => {});
  }
});

describe("a trava do envio", () => {
  it("sem o PDF visto não segue (422, com as faltas); com a chave certa segue", async () => {
    const sem = await travaDoEnvio({
      ...envio,
      porEmail: true,
      pdfVisto: null,
      chaveDoQueChegou: "k",
    });
    expect(sem?.status).toBe(422);
    expect(sem && "faltas" in sem.corpo && sem.corpo.faltas.map((x) => x.id)).toEqual(["visto"]);
    expect(
      await travaDoEnvio({ ...envio, porEmail: true, pdfVisto: "k", chaveDoQueChegou: "k" }),
    ).toBeNull();
  });
});

describe("o desenho", () => {
  const pedir = (over: object = {}) => ({
    ...envio,
    modo: "send" as const,
    rascunho: false,
    chaveDoQueChegou: "k",
    resta: () => 60_000,
    ...over,
  });

  it("uma foto que falhou à primeira tenta-se outra vez — e fica-se com o melhor", async () => {
    f.desenhos = [2, 0];
    expect((await desenharOPdf(pedir())).relatorio.missingImages).toBe(0);
  });

  it("sem tempo para a segunda passagem e para o email, não se repete", async () => {
    f.desenhos = [2, 0];
    expect((await desenharOPdf(pedir({ resta: () => 30_000 }))).relatorio.missingImages).toBe(2);
  });

  it("a pré-visualização não repete; e a segunda do mesmo PDF final sai da memória", async () => {
    f.desenhos = [2, 0];
    const primeira = await desenharOPdf(pedir({ modo: "preview" }));
    expect(primeira.relatorio.missingImages).toBe(2);
    f.desenhos = [0];
    const segunda = await desenharOPdf(pedir({ modo: "preview", chaveDoQueChegou: "k2" }));
    expect(segunda.pdfDaMemoria).toBe(false);
  });
});

describe("o email escrito", () => {
  const escrever = (over: object = {}) =>
    escreverOEmail({
      ...envio,
      mensagem: "",
      textoDoEmail: null,
      assuntoDoEmail: null,
      acceptUrl: "https://x/proposta/tok",
      dinheiro: dinheiroDaProposta(doc),
      assinatura: { nome: "Catarina", cargo: "" },
      ...over,
    });

  it("o corpo escrito à mão ganha ao modelo, e leva o assunto que ela viu", async () => {
    const e = await escrever({
      textoDoEmail: "Olá {{link_proposta}}",
      assuntoDoEmail: "A vossa proposta",
    });
    expect(e.assunto).toBe("A vossa proposta");
    expect(e.textoDaCopia).toContain("https://x/proposta/tok");
    expect(f.modelo).not.toHaveBeenCalled();
  });

  it("sem corpo nem modelo sai o texto da casa, a saudar o casal — não a mãe da noiva", async () => {
    const e = await escrever();
    expect(e.emoldurado.text).toContain("Maria & Zé");
    expect(e.emoldurado.text).not.toContain("Mãe da Noiva");
    expect(e.quem.destinatario).toBe("Maria & Zé");
  });

  it("numa proposta inglesa o modelo português não é consultado, e diz-se", async () => {
    await escrever({ idioma: "en" });
    expect(f.modelo).not.toHaveBeenCalled();
    expect(vi.mocked(log.warn).mock.calls[0][0]).toMatch(/noutra língua/);
  });
});

describe("o que fica depois do email", () => {
  const proposal = { id: "p1", status: "rascunho" } as Proposal;
  const email = {
    emoldurado: { html: "", text: "texto", attachments: [] },
    assunto: "A proposta",
    textoDaCopia: "texto",
    nomeDoAnexo: "P.pdf",
    quem: { nome: "Catarina", cargo: "", destinatario: "Maria & Zé" },
  } as never;
  const depois = (over: object = {}) =>
    depoisDoEmail({
      ...envio,
      proposal,
      dinheiro: dinheiroDaProposta(doc),
      emailed: true,
      semEmailPorEscolha: false,
      email,
      modelo: "",
      pdf: Buffer.from("%PDF"),
      ...over,
    });

  it("o email saiu: fica «enviada», com a cópia e o pedido actualizado", async () => {
    expect(await depois()).toEqual({ estado: "enviada" });
    expect(f.copia).toHaveBeenCalledTimes(1);
    expect(f.pedido).toHaveBeenCalledTimes(1);
  });

  it("o email não saiu: fica «rascunho», sem cópia — mas o preço grava-se", async () => {
    expect(await depois({ emailed: false })).toEqual({ estado: "rascunho" });
    expect(f.copia).not.toHaveBeenCalled();
    expect(f.marcar).not.toHaveBeenCalled();
    expect(f.pedido).toHaveBeenCalledTimes(1);
  });

  it("cada escrita que falha sai pelo nome, e as outras continuam", async () => {
    f.copia.mockRejectedValueOnce(new Error("x"));
    f.marcar.mockResolvedValueOnce(null);
    f.pedido.mockRejectedValueOnce(new Error("y"));
    const r = await depois();
    expect(r.estado).toBe("rascunho");
    expect(r.copiaError).toMatch(/CÓPIA/);
    expect(r.estadoError).toMatch(/JÁ a recebeu/);
    expect(r.pedidoError).toMatch(/PEDIDO/);
  });
});
