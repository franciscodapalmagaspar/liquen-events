/**
 * As etapas PURAS do envio, sozinhas (fase 5). A rota inteira está provada em
 * `app/api/orcamento/[id]/proposta-doc/route*.test.ts`; aqui prova-se que cada
 * peça faz o que diz sem precisar da rota, do Next nem da base.
 */
import { describe, it, expect, vi } from "vitest";
import type { Proposal, Quote } from "@/lib/orcamento/types";
import { log } from "@/lib/logger";
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import { cabecalhosDaPreVisualizacao } from "./pre-visualizacao";
import {
  fotosEmFaltaAceites,
  FIM_DO_SIM_ANTIGO,
  perguntaDasFotos,
  perguntaDosCortes,
} from "./perguntas-antes-do-envio";
import {
  comAVersao,
  montarAProposta,
  propostasAnteriores,
  versaoDaProposta,
} from "./a-proposta-que-se-grava";
import { prepararODocumento } from "./documento-do-envio";
import type { EmailEmoldurado } from "./email-da-proposta";
import { envioDaProposta, type DocumentoPreparado } from "./envio-da-proposta";
import { SEGUE } from "./passo";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { seloDoConteudo } from "@/lib/proposta-versao";

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

/** Um instante qualquer: as etapas puras recebem o relógio de quem as chama. */
const AGORA = Date.parse("2026-11-17T12:00:00.000Z");
const AGORA_DATA = new Date(AGORA);

describe("as perguntas antes do envio", () => {
  it("o «sim» às fotos vale para quantas ela viu, e só para um número", () => {
    expect(fotosEmFaltaAceites(0, null, AGORA)).toBe(true);
    expect(fotosEmFaltaAceites(3, 3, AGORA)).toBe(true);
    expect(fotosEmFaltaAceites(3, 9, AGORA)).toBe(true);
    expect(fotosEmFaltaAceites(9, 3, AGORA)).toBe(false);
    // Um «sim» que não era número chega como `null` (ler-o-corpo.test.ts).
    expect(fotosEmFaltaAceites(1, null, AGORA)).toBe(false);
  });

  it("o «sim» antigo (`true`) vale até 18/11 às 23:59 em Lisboa, e depois não", () => {
    expect(fotosEmFaltaAceites(9, true, Date.parse("2026-11-18T23:59:59Z"))).toBe(true);
    expect(fotosEmFaltaAceites(9, true, FIM_DO_SIM_ANTIGO)).toBe(false);
    expect(fotosEmFaltaAceites(0, true, FIM_DO_SIM_ANTIGO)).toBe(true);
  });

  it("as fotos perguntam com 409 e dizem quantas; os cortes só com `true`", () => {
    expect(perguntaDasFotos("q", 1, null, AGORA)).toEqual({
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

describe("o envio e o seu dinheiro", () => {
  const quote = { id: "q", email: "c@x.pt" } as Quote;
  it("o dinheiro deriva do documento: só se conta quando é pedido, e uma vez", () => {
    // Um adicional nulo parte a conta — e um envio que não a pede não parte.
    const partido = { ...doc, budgetExtrasSomam: true, budgetExtras: [null] } as never;
    const envio = envioDaProposta({ pedidoId: "q", quote, doc: partido, idioma: "pt" });
    expect(envio.pedidoId).toBe("q");
    expect(() => envio.dinheiro()).toThrow();

    const bom = envioDaProposta({ pedidoId: "q", quote, doc, idioma: "pt" });
    const primeiro = bom.dinheiro();
    expect(primeiro).toEqual(dinheiroDaProposta(doc));
    expect(bom.dinheiro()).toBe(primeiro);
    expect(Object.isFrozen(primeiro)).toBe(true);
  });
});

describe("o documento e a linha que se grava", () => {
  it("prepararODocumento: com o relógio fixo, a validade é a desse dia — e fica escrita no documento", () => {
    const { validUntil: _semValidade, ...semValidade } = doc;
    const agora = new Date("2026-11-17T12:00:00.000Z");
    const depois = new Date("2026-12-17T12:00:00.000Z");
    const a = prepararODocumento({ ...semValidade } as ProposalDoc, "pt", agora);
    const b = prepararODocumento({ ...semValidade } as ProposalDoc, "pt", depois);
    // 17/11/2026 + os dias da regra = 16/1/2027; um mês depois, 15/2/2027.
    expect(a.doc.validUntil).toBe("2027-01-16");
    expect(b.doc.validUntil).toBe("2027-02-15");
    // Uma validade já escrita não se mexe, seja qual for o relógio.
    expect(prepararODocumento({ ...doc }, "pt", depois).doc.validUntil).toBe("2027-01-01");
  });

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
      ...envioDaProposta({ pedidoId: "q", quote, doc, idioma: "en" }),
      pdf,
      porEnviar,
      agora: AGORA_DATA,
      idNovo: "nunca-usado",
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
        ...envioDaProposta({
          pedidoId: "q",
          quote: { id: "q", email: "" } as Quote,
          doc,
          idioma: "pt",
        }),
        pdf: Buffer.from("x"),
        porEnviar: null,
        agora: AGORA_DATA,
        idNovo: "p-nova",
      });
    const linha = novaLinha();
    // Uma proposta nova: o id e o instante são os que quem chama lhe deu.
    expect(linha).toMatchObject({ id: "p-nova", createdAt: AGORA_DATA.toISOString() });
    const primeira = { ...linha, ...versaoDaProposta(linha, [], AGORA_DATA) };
    expect(primeira.versaoNumero).toBe(1);
    // Pura: a linha que entrou não mudou.
    expect(linha.versaoNumero).toBeUndefined();

    const repetida = { ...linha, id: "outra" } as Proposal;
    const anteriores = propostasAnteriores(repetida, [primeira]);
    expect(anteriores.map((p) => p.id)).toEqual([primeira.id]);
    expect(versaoDaProposta(repetida, anteriores, AGORA_DATA).versaoNumero).toBe(1);

    const mudada = { ...linha, id: "terceira", total: 999 } as Proposal;
    const outras = propostasAnteriores(mudada, [
      primeira,
      { ...primeira, id: "v4", versaoNumero: 4 },
    ]);
    expect(versaoDaProposta(mudada, outras, AGORA_DATA).versaoNumero).toBe(5);
  });

  it("comAVersao: a linha carimbada, e as irmãs anteriores (sem ela, a mais recente primeiro)", () => {
    // O `versaoEm` é o instante que quem chama dá ao carimbo.
    const linha = montarAProposta({
      ...envioDaProposta({
        pedidoId: "q",
        quote: { id: "q", email: "" } as Quote,
        doc,
        idioma: "pt",
      }),
      pdf: Buffer.from("x"),
      porEnviar: null,
      agora: AGORA_DATA,
      idNovo: "p-nova",
    });
    const velha = {
      ...linha,
      versaoSelo: "selo-da-velha",
      id: "v1",
      createdAt: "2026-01-01T00:00:00.000Z",
      versaoNumero: 1,
      total: 1,
    };
    const nova = {
      ...linha,
      versaoSelo: "selo-da-nova",
      id: "v2",
      createdAt: "2026-02-01T00:00:00.000Z",
      versaoNumero: 2,
      total: 2,
    };
    const { proposal, anteriores } = comAVersao(linha, [velha, linha, nova], AGORA_DATA);
    expect(anteriores.map((p) => p.id)).toEqual(["v2", "v1"]);
    // A linha INTEIRA, intacta, com os três campos da versão por cima — e o
    // selo é o do conteúdo dela, não o de uma irmã.
    expect(proposal).toEqual({
      ...linha,
      versaoNumero: 3,
      versaoEm: "2026-11-17T12:00:00.000Z",
      versaoSelo: seloDoConteudo(linha),
    });
    // E o selo COMPARA-SE com o da irmã mais recente: com o mesmo conteúdo,
    // a versão não sobe e a data fica a do conteúdo (a dela).
    const igual = {
      ...nova,
      versaoSelo: seloDoConteudo(linha),
      versaoEm: "2026-02-01T00:00:00.000Z",
    };
    expect(comAVersao(linha, [velha, igual], AGORA_DATA).proposal).toMatchObject({
      versaoNumero: 2,
      versaoEm: "2026-02-01T00:00:00.000Z",
      versaoSelo: seloDoConteudo(linha),
    });
    // Pura: a linha que entrou não ganhou a versão.
    expect(linha.versaoNumero).toBeUndefined();
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
