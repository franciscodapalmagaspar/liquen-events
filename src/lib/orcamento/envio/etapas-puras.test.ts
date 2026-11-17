/**
 * As etapas PURAS do envio, sozinhas (fase 5). A rota inteira está provada em
 * `app/api/orcamento/[id]/proposta-doc/route*.test.ts`; aqui prova-se que cada
 * peça faz o que diz sem precisar da rota, do Next nem da base.
 */
import { describe, it, expect, vi } from "vitest";
import type { Proposal, Quote } from "@/lib/orcamento/types";
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import { log } from "@/lib/logger";
import { cabecalhosDaPreVisualizacao } from "./pre-visualizacao";
import {
  fotosEmFaltaAceites,
  perguntaDasFotos,
  perguntaDosCortes,
} from "./perguntas-antes-do-envio";
import { montarAProposta, propostasAnteriores, versaoDaProposta } from "./a-proposta-que-se-grava";
import { prepararODocumento } from "./documento-do-envio";
import type { EmailEmoldurado } from "./email-da-proposta";
import type { DocumentoPreparado } from "./documento-do-envio";
import { SEGUE } from "./passo";

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
  validUntil: "2027-01-01",
} as unknown as DocumentoPreparado;

describe("as perguntas antes do envio", () => {
  it("o «sim» às fotos vale para quantas ela viu, e só para um número", () => {
    expect(fotosEmFaltaAceites(0, null)).toBe(true);
    expect(fotosEmFaltaAceites(3, 3)).toBe(true);
    expect(fotosEmFaltaAceites(3, 9)).toBe(true);
    expect(fotosEmFaltaAceites(9, 3)).toBe(false);
    // Um «sim» que não era número chega como `null` (ler-o-corpo.test.ts).
    expect(fotosEmFaltaAceites(1, null)).toBe(false);
  });

  it("as fotos perguntam com 409 e dizem quantas; os cortes só com `true`", () => {
    expect(perguntaDasFotos("q", 1, null)).toEqual({
      segue: false,
      desfecho: {
        tipo: "recusa",
        recusa: {
          status: 409,
          corpo: {
            error: "Falta 1 fotografia no documento.",
            precisaConfirmarFotos: true,
            missingImages: 1,
          },
        },
      },
    });
    const corte = [{ where: "Capa", dropped: 1, unit: "linhas" as const }];
    expect(perguntaDosCortes("q", corte, false)).toMatchObject({
      segue: false,
      desfecho: { recusa: { status: 409 } },
    });
    expect(perguntaDosCortes("q", corte, true)).toEqual(SEGUE);
    expect(perguntaDosCortes("q", [], false)).toEqual(SEGUE);
  });

  it("os cabeçalhos: o rascunho não leva chave; o inglês muda o nome", () => {
    const base = {
      idioma: "en" as const,
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
      pedidoId: "q",
      quote,
      doc,
      idioma: "en",
      dinheiro: dinheiroDaProposta(doc),
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
        pedidoId: "q",
        quote: { id: "q", email: "" } as Quote,
        doc,
        idioma: "pt",
        dinheiro: dinheiroDaProposta(doc),
        pdf: Buffer.from("x"),
        porEnviar: null,
      });
    const linha = novaLinha();
    const primeira = { ...linha, ...versaoDaProposta(linha, []) };
    expect(primeira.versaoNumero).toBe(1);
    // Pura: a linha que entrou não mudou.
    expect(linha.versaoNumero).toBeUndefined();

    const repetida = { ...linha, id: "outra" } as Proposal;
    const anteriores = propostasAnteriores(repetida, [primeira]);
    expect(anteriores.map((p) => p.id)).toEqual([primeira.id]);
    expect(versaoDaProposta(repetida, anteriores).versaoNumero).toBe(1);

    const mudada = { ...linha, id: "terceira", total: 999 } as Proposal;
    const outras = propostasAnteriores(mudada, [
      primeira,
      { ...primeira, id: "v4", versaoNumero: 4 },
    ]);
    expect(versaoDaProposta(mudada, outras).versaoNumero).toBe(5);
  });

  it("as anteriores vêm da mais recente para a mais antiga, e sem a própria", () => {
    const p = (id: string, createdAt: string) => ({ id, createdAt }) as Proposal;
    const lista = [p("a", "2026-01-01"), p("eu", "2026-06-01"), p("c", "2026-03-01")];
    expect(propostasAnteriores(p("eu", ""), lista).map((x) => x.id)).toEqual(["c", "a"]);
    expect(lista.map((x) => x.id)).toEqual(["a", "eu", "c"]);
  });
});

describe("o email que se manda", () => {
  it("só o que passou pelo `emailAoCliente` se pode mandar (prova-o o `tsc`)", () => {
    const aMao = { html: "<p>x</p>", text: "x", attachments: [] };
    // @ts-expect-error — um email montado à mão não leva a assinatura, e não compila.
    const _naoPassa: EmailEmoldurado = aMao;
    void _naoPassa;
    expect(true).toBe(true);
  });
});
