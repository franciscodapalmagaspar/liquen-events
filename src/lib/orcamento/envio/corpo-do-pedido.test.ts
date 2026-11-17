import { describe, it, expect, vi, beforeEach } from "vitest";
import { log } from "@/lib/logger";
import { __esquecerDesviosDitos } from "@/lib/fronteira/observar";
import type { ProposalDoc } from "@/lib/proposal-doc";
import {
  avisarDoIdiomaDesconhecido,
  lerOPedido,
  pedidoDoCorpo,
  documentoCompleto,
  type CorpoDoPedido,
} from "./corpo-do-pedido";

const pedir = (corpo: string) =>
  new Request("https://liquen.test/x", { method: "POST", body: corpo });

beforeEach(() => {
  __esquecerDesviosDitos();
  vi.restoreAllMocks();
});

describe("o corpo do pedido à rota da proposta", () => {
  it("cada tolerância de sempre, aplicada uma vez", () => {
    const p = pedidoDoCorpo({
      mode: "send",
      mensagem: 42,
      porEmail: "não",
      rascunho: true,
    } as unknown as CorpoDoPedido);
    expect(p.modo).toBe("send");
    // Uma mensagem que não é texto não pára o envio: vale vazia.
    expect(p.mensagem).toBe("");
    // Só um `false` explícito cala o email.
    expect(p.porEmail).toBe(true);
    // O rascunho só existe na pré-visualização.
    expect(p.rascunho).toBe(false);
  });

  it("um corpo nulo é uma pré-visualização sem documento", () => {
    const p = pedidoDoCorpo(null);
    expect(p).toMatchObject({ modo: "preview", doc: undefined, porEmail: true, rascunho: false });
    expect(documentoCompleto(p.doc)).toEqual({
      ok: false,
      error: "Proposta incompleta: falta o documento.",
    });
  });

  it("a mensagem perde os espaços das pontas, e o modo desconhecido é pré-visualização", () => {
    const p = pedidoDoCorpo({ mode: "outro", mensagem: "  olá  " } as unknown as CorpoDoPedido);
    expect(p.modo).toBe("preview");
    expect(p.mensagem).toBe("olá");
  });

  it("diz o que falta no documento", () => {
    const d = (o: object) => o as ProposalDoc;
    const erro = (o: object) => {
      const r = documentoCompleto(d(o));
      return r.ok ? null : r.error;
    };
    expect(erro({ ref: "", clientNames: "A" })).toBe("Proposta incompleta: falta a referência.");
    expect(erro({ ref: "", clientNames: "" })).toBe(
      "Proposta incompleta: falta a referência e o nome dos clientes.",
    );
    const bom = d({ ref: "R", clientNames: "A" });
    expect(documentoCompleto(bom)).toEqual({ ok: true, doc: bom });
  });

  it("a língua: sem campo é português calado; um valor estranho é português e diz-se", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    const corpo = (idioma: unknown) => ({ idioma }) as unknown as CorpoDoPedido;
    for (const [recebido, idioma] of [
      [undefined, "pt"],
      ["en", "en"],
      ["pt", "pt"],
    ] as const) {
      const p = pedidoDoCorpo(corpo(recebido));
      expect(p.idioma).toBe(idioma);
      avisarDoIdiomaDesconhecido(p, "q1");
    }
    expect(aviso).not.toHaveBeenCalled();
    const estranho = pedidoDoCorpo(corpo("fr"));
    expect(estranho.idioma).toBe("pt");
    avisarDoIdiomaDesconhecido(estranho, "q1");
    expect(aviso).toHaveBeenCalledWith(
      "proposta-doc: idioma desconhecido, a desenhar em português",
      {
        id: "q1",
        recebido: "fr",
      },
    );
  });

  it("as respostas e os textos só contam com a forma certa — o resto é «não veio»", () => {
    const p = pedidoDoCorpo({
      corpo: 42,
      assunto: ["x"],
      modelo: 7,
      pdfVisto: 1,
      fotosEmFaltaConfirmadas: true,
      cortesConfirmados: "sim",
    } as unknown as CorpoDoPedido);
    expect(p).toMatchObject({
      corpo: null,
      assunto: null,
      modelo: "",
      pdfVisto: null,
      fotosEmFaltaConfirmadas: null,
      cortesConfirmados: false,
    });
    expect(
      pedidoDoCorpo({ fotosEmFaltaConfirmadas: Number.NaN } as CorpoDoPedido)
        .fotosEmFaltaConfirmadas,
    ).toBeNull();
    const bom = pedidoDoCorpo({
      corpo: "Olá",
      assunto: "A proposta",
      modelo: "registo-formal",
      pdfVisto: "k",
      fotosEmFaltaConfirmadas: 3,
      cortesConfirmados: true,
    } as CorpoDoPedido);
    expect(bom).toMatchObject({
      corpo: "Olá",
      assunto: "A proposta",
      modelo: "registo-formal",
      pdfVisto: "k",
      fotosEmFaltaConfirmadas: 3,
      cortesConfirmados: true,
    });
  });
});

describe("o esquema do corpo, em modo de observar", () => {
  it("o corpo que o estúdio manda passa calado", async () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    await lerOPedido(
      pedir(JSON.stringify({ mode: "preview", doc: { ref: "R", clientNames: "A" }, idioma: "pt" })),
      "q1",
    );
    expect(aviso).not.toHaveBeenCalled();
  });

  it("um corpo estranho é DITO e segue tal e qual — nada se recusa", async () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    const corpo = { mode: "send", doc: { ref: "R", clientNames: "Ana Secreta" }, mensagem: 7 };
    const p = await lerOPedido(pedir(JSON.stringify(corpo)), "q1");
    expect(p.doc).toEqual(corpo.doc);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso.mock.calls[0][1]).toEqual({
      id: "q1",
      desvios: [{ campo: "mensagem", problema: "invalid_type" }],
    });
    expect(JSON.stringify(aviso.mock.calls)).not.toContain("Ana Secreta");
  });

  it("um corpo que não é JSON vale nulo, como sempre", async () => {
    vi.spyOn(log, "warn").mockImplementation(() => {});
    const p = await lerOPedido(pedir("{não é json"), "q1");
    expect(p.doc).toBeUndefined();
    expect(p.modo).toBe("preview");
  });
});
