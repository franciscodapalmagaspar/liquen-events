import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Mandar o mapa de mesas por email. O correio é simulado — nenhum email sai
 * deste teste. O que se prende: o endereço escrito por ela é o destino; o PDF
 * vai em anexo; um endereço inválido não chega ao correio; sem SMTP diz que
 * NÃO seguiu (e não regista nada no histórico); e o que seguiu fica escrito.
 */

interface Anexo {
  filename: string;
  content: Buffer;
  contentType?: string;
}
interface Enviado {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: Anexo[];
}

const estado = vi.hoisted(() => ({
  authed: true,
  pedido: { id: "q1", name: "TESTE Ana", activityLog: [] as unknown[] } as {
    id: string;
    name: string;
    activityLog: unknown[];
  } | null,
  pdf: { bytes: new Uint8Array([37, 80, 68, 70]), ficheiro: "mapa-de-mesas-teste-ana.pdf" } as {
    bytes: Uint8Array;
    ficheiro: string;
  } | null,
}));
const correio = vi.hoisted(() => ({
  enviar: vi.fn(async (_args: unknown): Promise<{ sent: boolean }> => ({ sent: true })),
}));
const historico = vi.hoisted(() => ({
  gravar: vi.fn(async (_id: string, f: (q: { activityLog?: unknown[] }) => unknown) =>
    f({ activityLog: [] }),
  ),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => estado.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async () => estado.pedido),
  updateQuoteWith: historico.gravar,
}));
vi.mock("@/lib/orcamento/mapa-de-mesas-pdf", () => ({ pdfDoMapa: vi.fn(async () => estado.pdf) }));
vi.mock("@/lib/mail", () => ({
  sendMail: correio.enviar,
  MAIL_TO: "casa@exemplo.test",
  esc: (s: string) => s.replace(/</g, "&lt;"),
}));
vi.mock("@/lib/email-assinatura", () => ({
  emailAoCliente: ({ html, texto }: { html: string; texto: string }) => ({
    html: `<moldura>${html}</moldura>`,
    text: texto,
    attachments: [{ filename: "logo.png", content: Buffer.from("x"), cid: "logo" }],
  }),
}));
vi.mock("@/lib/email-quem-assina", () => ({
  assinaturaDeQuemEnvia: () => ({ nome: "TESTE Equipa" }),
}));

const { POST } = await import("./route");

const enviar = (body: unknown) =>
  POST(
    new Request("https://liquen.test/api/mesas/q1/enviar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest,
    { params: Promise.resolve({ id: "q1" }) },
  );

const corpo = {
  para: "quinta@exemplo.test",
  assunto: "Mapa de mesas — TESTE Ana",
  mensagem: "Olá,\nSegue o mapa.",
};

beforeEach(() => {
  estado.authed = true;
  estado.pedido = { id: "q1", name: "TESTE Ana", activityLog: [] };
  estado.pdf = { bytes: new Uint8Array([37, 80, 68, 70]), ficheiro: "mapa-de-mesas-teste-ana.pdf" };
  correio.enviar.mockReset();
  correio.enviar.mockResolvedValue({ sent: true });
  historico.gravar.mockClear();
});

describe("POST /api/mesas/[id]/enviar", () => {
  it("sem sessão, 401 — e o correio nem é chamado", async () => {
    estado.authed = false;
    expect((await enviar(corpo)).status).toBe(401);
    expect(correio.enviar).not.toHaveBeenCalled();
  });

  it("um endereço que não é email dá 400 com a frase", async () => {
    const r = await enviar({ ...corpo, para: "quinta" });
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("Esse email não parece certo.");
    expect(correio.enviar).not.toHaveBeenCalled();
  });

  it("um mapa sem mesas não segue: 409", async () => {
    estado.pdf = null;
    expect((await enviar(corpo)).status).toBe(409);
    expect(correio.enviar).not.toHaveBeenCalled();
  });

  it("vai para quem ela escreveu, com o assunto dela e o PDF em anexo", async () => {
    const r = await enviar(corpo);
    expect(r.status).toBe(200);
    expect(correio.enviar).toHaveBeenCalledTimes(1);
    const e = correio.enviar.mock.calls[0]![0] as Enviado;
    expect(e.to).toBe("quinta@exemplo.test");
    expect(e.subject).toBe("Mapa de mesas — TESTE Ana");
    expect(e.text).toContain("Segue o mapa.");
    const pdf = e.attachments.find((a) => a.contentType === "application/pdf");
    expect(pdf?.filename).toBe("mapa-de-mesas-teste-ana.pdf");
    expect(Buffer.from(pdf!.content).subarray(0, 4).toString()).toBe("%PDF");
    // A assinatura da casa continua lá.
    expect(e.attachments.some((a) => a.filename === "logo.png")).toBe(true);
  });

  it("o que seguiu fica no histórico do pedido, com o destino", async () => {
    await enviar(corpo);
    expect(historico.gravar).toHaveBeenCalledTimes(1);
    const depois = (await historico.gravar.mock.results[0]!.value) as {
      activityLog: { kind: string; summary: string }[];
    };
    expect(depois.activityLog.at(-1)).toMatchObject({
      kind: "message_sent",
      summary: "Mapa de mesas enviado por email a quinta@exemplo.test",
    });
  });

  it("sem SMTP diz que NÃO seguiu, e não escreve no histórico", async () => {
    correio.enviar.mockResolvedValue({ sent: false });
    const r = await enviar(corpo);
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/NÃO seguiu/);
    expect(historico.gravar).not.toHaveBeenCalled();
  });

  it("o servidor de correio a recusar dá 502, e também não fica registo", async () => {
    correio.enviar.mockRejectedValue(new Error("recusado"));
    const r = await enviar(corpo);
    expect(r.status).toBe(502);
    expect(historico.gravar).not.toHaveBeenCalled();
  });
});

/**
 * O DOMÍNIO DO ENDEREÇO TEM DE RECEBER CORREIO (pedido dela, 30/10). O mapa
 * que ela julga ter mandado à quinta e que morreu no servidor de correio é o
 * que se descobre na manhã do casamento.
 */
describe("POST /api/mesas/[id]/enviar — o domínio do endereço", () => {
  it("um domínio que não recebe correio dá 422 com a frase, e nada segue nem fica no histórico", async () => {
    const r = await enviar({ ...corpo, para: "quinta@nao-existe.invalid" });
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({
      error:
        "O email «quinta@nao-existe.invalid» não parece existir (o domínio «nao-existe.invalid» não recebe email). Confira-o antes de enviar.",
      campo: "para",
    });
    expect(correio.enviar).not.toHaveBeenCalled();
    expect(historico.gravar).not.toHaveBeenCalled();
  });
});
