/**
 * As etapas do envio que mexem no mundo (base, correio), cada uma sozinha,
 * com falsos no lugar dos serviços (fase 5). A rota inteira está provada em
 * `app/api/orcamento/[id]/proposta-doc/route*.test.ts`; aqui prova-se o
 * contrato de cada etapa sem precisar da rota.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Proposal } from "@/lib/orcamento/types";
import { log } from "@/lib/logger";

const falsos = vi.hoisted(() => ({
  criar: vi.fn(async (_p: unknown) => undefined),
  actualizar: vi.fn(async (_id: string, _p: unknown): Promise<unknown> => ({})),
  envios: vi.fn(
    async (_id: string): Promise<Array<{ enviadoEm: string; propostaId?: string }>> => [],
  ),
  mandar: vi.fn(async (_m: unknown) => ({ sent: true })),
}));
vi.mock("@/lib/proposals-store", () => ({
  createProposal: falsos.criar,
  updateProposal: falsos.actualizar,
  listProposalsForQuote: vi.fn(async () => []),
}));
vi.mock("@/lib/envios-de-proposta", () => ({
  listarEnvios: falsos.envios,
  registarEnvio: vi.fn(),
}));
vi.mock("@/lib/proposta-link-curto", () => ({ enderecoDaProposta: async () => "https://x/p/tok" }));
vi.mock("@/lib/mail", () => ({ sendMail: falsos.mandar, MAIL_TO: "casa@x.pt", esc: String }));

import { gravarAProposta } from "./gravar-a-proposta";
import { repeticaoDoEnvio } from "./repeticao-do-envio";
import { mandarOEmail } from "./mandar-o-email";
import type { EmailDaProposta } from "./email-da-proposta";
import { SEGUE, type Passo } from "./passo";

/** A resposta com que a repetição parou — e o teste falha se ela seguiu. */
function respostaDaRepeticao(p: Passo) {
  if (p.segue || p.desfecho.tipo !== "envio") throw new Error("a repetição devia ter parado");
  return p.desfecho.resposta;
}

beforeEach(() => {
  vi.clearAllMocks();
  // O que um teste ensina ao registo não passa para o seguinte.
  falsos.envios.mockReset().mockResolvedValue([]);
  vi.spyOn(log, "warn").mockImplementation(() => {});
  vi.spyOn(log, "error").mockImplementation(() => {});
  vi.spyOn(log, "info").mockImplementation(() => {});
});

const proposta = (over: Partial<Proposal> = {}) =>
  ({ id: "p1", quoteId: "q", status: "rascunho", doc: {}, versaoSelo: "s1", ...over }) as Proposal;
const colunaEmFalta = (c: string) =>
  Object.assign(new Error(`Could not find the '${c}' column of 'proposals' in the schema cache`), {
    code: "PGRST204",
  });

describe("gravar a proposta", () => {
  it("tira só a coluna que falta, e diz que o documento ficou", async () => {
    falsos.criar.mockRejectedValueOnce(colunaEmFalta("versao_selo"));
    const r = await gravarAProposta("q", proposta(), null);
    expect(r).toMatchObject({ segue: true, valor: { docSaved: true } });
    expect(falsos.criar).toHaveBeenCalledTimes(2);
    expect((falsos.criar.mock.calls[1][0] as Proposal).versaoSelo).toBeUndefined();
  });

  it("sem a coluna `doc`, grava na mesma e diz que o documento se perdeu", async () => {
    falsos.criar.mockRejectedValueOnce(colunaEmFalta("doc"));
    expect(await gravarAProposta("q", proposta(), null)).toMatchObject({
      segue: true,
      valor: { docSaved: false },
    });
  });

  it("uma avaria qualquer é um 503, e não se inventa um caminho alternativo", async () => {
    falsos.criar.mockRejectedValueOnce(new Error("timeout"));
    const r = await gravarAProposta("q", proposta(), null);
    expect(r).toEqual({
      segue: false,
      desfecho: {
        tipo: "falha",
        falha: {
          status: 503,
          corpo: { error: "Não foi possível guardar a proposta. Tenta novamente." },
        },
      },
    });
  });

  it("a proposta por enviar que desapareceu a meio é criada de novo", async () => {
    falsos.actualizar.mockResolvedValueOnce(null);
    expect(await gravarAProposta("q", proposta(), proposta())).toMatchObject({ segue: true });
    expect(falsos.criar).toHaveBeenCalledTimes(1);
  });
});

describe("a repetição do envio", () => {
  const relatorio = { missingImages: 0, truncations: [], pdf: Buffer.alloc(9) };
  const agora = () => new Date().toISOString();

  it("o mesmo documento enviado há instantes não sai outra vez, e o registo lê-se UMA vez", async () => {
    const antes = proposta({ id: "p0", status: "enviada", sentAt: agora() });
    falsos.envios.mockResolvedValue([{ enviadoEm: agora(), propostaId: "p0" }]);
    const r = respostaDaRepeticao(
      await repeticaoDoEnvio({
        pedidoId: "q",
        proposal: proposta(),
        irmasAnteriores: [antes],
        porEmail: true,
        relatorio,
        agora: Date.now(),
      }),
    );
    expect(r).toMatchObject({ ok: true, id: "p0", emailed: true, repetido: true });
    expect(falsos.envios).toHaveBeenCalledTimes(1);
  });

  it("depois do WhatsApp, o email do mesmo documento é a sério — o registo lido serve as duas travas", async () => {
    const antes = proposta({ id: "p0", status: "enviada", sentAt: agora() });
    falsos.envios.mockResolvedValue([]);
    const passo = await repeticaoDoEnvio({
      pedidoId: "q",
      proposal: proposta(),
      irmasAnteriores: [antes],
      porEmail: true,
      relatorio,
      agora: Date.now(),
    });
    expect(passo).toEqual(SEGUE);
    expect(falsos.envios).toHaveBeenCalledTimes(1);
  });

  it("o registo que não responde, com uma irmã que já seguiu: a trava fica, calada, e lê-se UMA vez", async () => {
    const antes = proposta({ id: "p0", status: "enviada", sentAt: agora() });
    falsos.envios.mockRejectedValue(new Error("app_state em baixo"));
    const r = respostaDaRepeticao(
      await repeticaoDoEnvio({
        pedidoId: "q",
        proposal: proposta(),
        irmasAnteriores: [antes],
        porEmail: true,
        relatorio,
        agora: Date.now(),
      }),
    );
    expect(r).toMatchObject({ id: "p0", emailed: true, repetido: true });
    expect(falsos.envios).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalledWith(
      "proposta-doc: não deu para ler os envios registados",
      expect.anything(),
    );
  });

  it("o registo que não responde, sem irmã nenhuma: segue (é um envio a sério), e diz-se uma vez", async () => {
    falsos.envios.mockRejectedValue(new Error("app_state em baixo"));
    const passo = await repeticaoDoEnvio({
      pedidoId: "q",
      proposal: proposta(),
      irmasAnteriores: [],
      porEmail: true,
      relatorio,
      agora: Date.now(),
    });
    expect(passo).toEqual(SEGUE);
    expect(falsos.envios).toHaveBeenCalledTimes(1);
    expect(log.warn).toHaveBeenCalledWith("proposta-doc: não deu para ler os envios registados", {
      id: "q",
      erro: "Error: app_state em baixo",
    });
  });

  it("o email que já saiu mas ficou por marcar reconhece-se pelo registo, com a mesma forma de resposta", async () => {
    falsos.envios.mockResolvedValue([{ enviadoEm: agora(), propostaId: "p1" }]);
    const r = respostaDaRepeticao(
      await repeticaoDoEnvio({
        pedidoId: "q",
        proposal: proposta(),
        irmasAnteriores: [],
        porEmail: true,
        relatorio,
        agora: Date.now(),
      }),
    );
    expect(Object.keys(r)).toEqual([
      "ok",
      "id",
      "emailed",
      "estado",
      "acceptUrl",
      "missingImages",
      "truncations",
      "pdfBytes",
      "repetido",
      "repetidoAviso",
    ]);
    expect(r).toMatchObject({ id: "p1", emailed: true, acceptUrl: "https://x/p/tok" });
  });

  it("a mesma proposta marcada duas vezes pelo WhatsApp: sem registo, e sem email que ninguém mandou", async () => {
    const antes = proposta({ id: "p0", status: "enviada", sentAt: agora() });
    const r = respostaDaRepeticao(
      await repeticaoDoEnvio({
        pedidoId: "q",
        proposal: proposta(),
        irmasAnteriores: [antes],
        porEmail: false,
        relatorio,
        agora: Date.now(),
      }),
    );
    expect(Object.keys(r)).toEqual([
      "ok",
      "id",
      "emailed",
      "semEmailPorEscolha",
      "estado",
      "acceptUrl",
      "missingImages",
      "truncations",
      "pdfBytes",
      "repetido",
      "repetidoAviso",
    ]);
    expect(r).toMatchObject({ id: "p0", emailed: false, semEmailPorEscolha: true });
    expect(falsos.envios).not.toHaveBeenCalled();
  });

  it("um documento diferente nunca é repetição", async () => {
    const antes = proposta({ id: "p0", status: "enviada", sentAt: agora(), versaoSelo: "outro" });
    const passo = await repeticaoDoEnvio({
      pedidoId: "q",
      proposal: proposta(),
      irmasAnteriores: [antes],
      porEmail: true,
      relatorio,
      agora: Date.now(),
    });
    expect(passo).toEqual(SEGUE);
  });
});

describe("mandar o email", () => {
  const email = {
    emoldurado: { html: "<p>x</p>", text: "x", attachments: [] },
    assunto: "A proposta",
    textoDaCopia: "x",
    nomeDoAnexo: "Proposta.pdf",
    quem: { nome: "", cargo: "", destinatario: "A" },
  } as unknown as EmailDaProposta;
  const base = {
    pedidoId: "q",
    propostaId: "p1",
    para: "c@x.pt",
    porEmail: true,
    email,
    pdf: Buffer.from("%PDF"),
    resta: () => 60_000,
  };

  it("sai, com o PDF junto aos anexos da assinatura", async () => {
    expect(await mandarOEmail(base)).toEqual({ tipo: "saiu" });
    const enviado = falsos.mandar.mock.calls[0][0] as { attachments: { filename: string }[] };
    expect(enviado.attachments.map((a) => a.filename)).toEqual(["Proposta.pdf"]);
  });

  it("pelo WhatsApp não sai nada, e não é uma avaria", async () => {
    expect(await mandarOEmail({ ...base, porEmail: false })).toEqual({ tipo: "porEscolha" });
    expect(falsos.mandar).not.toHaveBeenCalled();
  });

  it("sem 25 s pela frente não começa; sem destinatário não tenta; SMTP a rebentar diz-se", async () => {
    const erro = async (p: typeof base) => {
      const saida = await mandarOEmail(p);
      return saida.tipo === "naoSaiu" ? saida.erro : null;
    };
    expect(await erro({ ...base, resta: () => 10_000 })).toMatch(/carregue outra vez/);
    expect(await erro({ ...base, para: "sem-arroba" })).toMatch(/email de cliente/);
    falsos.mandar.mockRejectedValueOnce(new Error("smtp"));
    expect(await erro(base)).toMatch(/o email ao cliente falhou/);
    expect(falsos.mandar).toHaveBeenCalledTimes(1);
  });
});
