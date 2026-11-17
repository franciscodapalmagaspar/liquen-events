/**
 * As etapas PURAS do envio, sozinhas (fase 5). A rota inteira está provada em
 * `app/api/orcamento/[id]/proposta-doc/route*.test.ts`; aqui prova-se que cada
 * peça faz o que diz sem precisar da rota, do Next nem da base.
 */
import { describe, it, expect, vi } from "vitest";
import type { Proposal, Quote } from "@/lib/orcamento/types";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import { log } from "@/lib/logger";
import {
  cabecalhosDaPreVisualizacao,
  fotosEmFaltaAceites,
  perguntaDasFotos,
  perguntaDosCortes,
} from "./perguntas-antes-do-envio";
import { carimbarAVersao, montarAProposta } from "./a-proposta-que-se-grava";
import { prepararODocumento } from "./documento-do-envio";

vi.spyOn(log, "warn").mockImplementation(() => {});

const doc = {
  ref: "PO",
  clientNames: "A & B",
  eventType: "Casamento",
  serviceGroups: [],
  moodBoards: [],
  budgetItems: [],
  coverImages: [],
  totalAmount: 1000,
  totalVatMode: "acrescer",
} as unknown as ProposalDoc;

describe("as perguntas antes do envio", () => {
  it("o «sim» às fotos vale para quantas ela viu, e só para um número", () => {
    expect(fotosEmFaltaAceites(0, undefined)).toBe(true);
    expect(fotosEmFaltaAceites(3, 3)).toBe(true);
    expect(fotosEmFaltaAceites(3, 9)).toBe(true);
    expect(fotosEmFaltaAceites(9, 3)).toBe(false);
    expect(fotosEmFaltaAceites(1, true)).toBe(false);
    expect(fotosEmFaltaAceites(1, Number.NaN)).toBe(false);
  });

  it("as fotos perguntam com 409 e dizem quantas; os cortes só com `true`", () => {
    expect(perguntaDasFotos("q", 1, undefined)).toEqual({
      status: 409,
      corpo: {
        error: "Falta 1 fotografia no documento.",
        precisaConfirmarFotos: true,
        missingImages: 1,
      },
    });
    const corte = [{ where: "Capa", dropped: 1, unit: "linhas" as const }];
    expect(perguntaDosCortes("q", corte, "sim")?.status).toBe(409);
    expect(perguntaDosCortes("q", corte, true)).toBeNull();
    expect(perguntaDosCortes("q", [], undefined)).toBeNull();
  });

  it("os cabeçalhos: o rascunho não leva chave; o inglês muda o nome", () => {
    const base = {
      idioma: "en",
      rascunho: true,
      missingImages: 2,
      truncations: [{ where: "Mood board «Ç»", dropped: 1, unit: "fotos" as const }],
      chaveDoQueChegou: "k",
      pdfDaMemoria: false,
    };
    const h = cabecalhosDaPreVisualizacao(base);
    expect(h["Content-Disposition"]).toBe('inline; filename="proposal-preview-draft.pdf"');
    expect(h["X-Chave-Do-Pdf"]).toBeUndefined();
    expect(JSON.parse(Buffer.from(h["X-Conteudo-Cortado"], "base64").toString("utf8"))).toEqual(
      base.truncations,
    );
    const f = cabecalhosDaPreVisualizacao({
      ...base,
      idioma: "pt",
      rascunho: false,
      pdfDaMemoria: true,
    });
    expect(f["X-Chave-Do-Pdf"]).toBe("k");
    expect(f["X-Pdf-Da-Memoria"]).toBe("1");
  });
});

describe("o documento e a linha que se grava", () => {
  it("a chave é do documento que CHEGOU, sem as fotos de biblioteca", () => {
    const a = prepararODocumento({ ...doc }, "pt");
    const b = prepararODocumento({ ...doc, fotosDeBiblioteca: ["x.jpg"] }, "pt");
    expect(a.chaveDoQueChegou).toBe(b.chaveDoQueChegou);
    expect(a.doc.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(a.grandeDemais).toBe(false);
  });

  it("a linha nasce «rascunho», reaproveita a por enviar, e sela o PDF", () => {
    const quote = { id: "q", email: "c@x.pt" } as Quote;
    const porEnviar = { id: "p-antiga", createdAt: "2026-01-01T00:00:00.000Z" } as Proposal;
    const pdf = Buffer.from("%PDF");
    const p = montarAProposta({
      id: "q",
      quote,
      doc,
      idioma: "en",
      money: dinheiroDaProposta(doc),
      validUntil: "2027-01-01",
      pdf,
      porEnviar,
    });
    expect(p).toMatchObject({
      id: "p-antiga",
      createdAt: porEnviar.createdAt,
      status: "rascunho",
      total: 1230,
      subtotal: 1000,
      idioma: "en",
      pdfBytes: 4,
    });
    expect(p.pdfSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a versão: o mesmo conteúdo não sobe; mudar sobe sobre o maior número", () => {
    const novaLinha = () =>
      montarAProposta({
        id: "q",
        quote: { id: "q", email: "" } as Quote,
        doc,
        idioma: "pt",
        money: dinheiroDaProposta(doc),
        validUntil: "2027-01-01",
        pdf: Buffer.from("x"),
        porEnviar: null,
      });
    const primeira = novaLinha();
    expect(carimbarAVersao(primeira, [])).toEqual([]);
    expect(primeira.versaoNumero).toBe(1);

    const repetida = { ...primeira, id: "outra" } as Proposal;
    const anteriores = carimbarAVersao(repetida, [primeira]);
    expect(anteriores.map((p) => p.id)).toEqual([primeira.id]);
    expect(repetida.versaoNumero).toBe(1);

    const mudada = { ...primeira, id: "terceira", total: 999 } as Proposal;
    carimbarAVersao(mudada, [primeira, { ...primeira, id: "v4", versaoNumero: 4 }]);
    expect(mudada.versaoNumero).toBe(5);
  });
});
