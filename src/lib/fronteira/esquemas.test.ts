/**
 * Os esquemas da fronteira contra as formas REAIS (fase 6).
 *
 * As formas vêm de duas fontes, e nenhuma tem dados de clientes:
 *  · a base, medida a 17/11 só por TIPOS (`jsonb_typeof` de cada campo, sem um
 *    único valor) — ver o cabeçalho de `pedido-guardado.ts`;
 *  · os corpos que os ecrãs mandam HOJE, copiados do código que os escreve
 *    (o nome do ficheiro vai ao lado de cada um).
 *
 * A regra de ferro: nada que funcione hoje pode ser acusado. Um esquema que
 * acusasse estes casos encheria o registo de falsos alarmes a cada gesto dela.
 */
import { describe, it, expect, expectTypeOf, vi } from "vitest";
import type { z } from "zod";
import { log } from "@/lib/logger";
import { mapper } from "@/lib/quotes-store";
import { __esquecerDesviosDitos } from "./observar";
import { __esquecerVersoesConferidas } from "./pedido-guardado";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { esquemaDoPedidoGuardado } from "./pedido-guardado";
import { esquemaDoDocumentoQueChega } from "./documento-da-proposta";
import {
  esquemaDoCorpoDaProposta,
  esquemaDoCorpoDoModeloDeEmail,
  esquemaDoCorpoDoModeloDeProposta,
  esquemaDoCorpoDoRascunho,
} from "./corpos-das-rotas";
import { esquemaDoCorpo } from "@/lib/orcamento/envio/corpo-do-pedido";

const desvios = (r: { success: boolean; error?: z.ZodError }) =>
  r.success ? [] : r.error!.issues.map((i) => `${i.path.join(".")}:${i.code}`);

/** Os campos que os 46 pedidos têm TODOS (medido). */
const minimo = {
  id: "LIQ-1",
  status: "cotado",
  submittedAt: "2026-05-01T10:00:00.000Z",
  name: "Nome",
  email: "x@y.pt",
  phone: "",
  date: "2027-06-01",
  location: "Évora",
  notes: "",
};

describe("o pedido guardado (quotes.data)", () => {
  it("um pedido do formulário do site, com tudo", () => {
    const r = esquemaDoPedidoGuardado.safeParse({
      ...minimo,
      category: "casamento",
      eventType: "casamento",
      guests: 120,
      urgency: "standard",
      packageTier: "completo",
      locationType: "lisboa",
      priceBreakdown: { total: 1 },
      addons: [],
      quotedPrice: 3000,
      activityLog: [{ at: "x" }],
      tags: ["vip"],
    });
    expect(desvios(r)).toEqual([]);
  });

  it("um pedido criado à mão, sem os campos do formulário (24 de 46 na base)", () => {
    expect(desvios(esquemaDoPedidoGuardado.safeParse(minimo))).toEqual([]);
  });

  it("os `null` e o `guests` em texto que a base tem", () => {
    const r = esquemaDoPedidoGuardado.safeParse({
      ...minimo,
      category: null,
      eventType: null,
      budgetRange: null,
      assignedTo: null,
      lostReason: null,
      guests: "150",
      locationType: "",
      packageTier: "",
      archived: true,
    });
    expect(desvios(r)).toEqual([]);
  });

  it("os estados que a base tem passam todos; um estado inventado não", () => {
    for (const status of ["pendente", "a_preparar", "cotado", "aceite"]) {
      expect(esquemaDoPedidoGuardado.safeParse({ ...minimo, status }).success).toBe(true);
    }
    expect(desvios(esquemaDoPedidoGuardado.safeParse({ ...minimo, status: "ganho" }))).toEqual([
      "status:invalid_value",
    ]);
  });
});

describe("o documento da proposta à entrada", () => {
  it("o documento de uma proposta guardada (as formas das 52 da base)", () => {
    const r = esquemaDoDocumentoQueChega.safeParse({
      template: "decoracao",
      ref: "PO",
      clientNames: "A & B",
      eventType: "Casamento",
      eventDate: "3 de julho de 2027",
      location: "Évora",
      guests: "150 pax",
      ceremony: "",
      time: "",
      serviceGroups: [{ title: "Cerimónia", items: [{ label: "Arco", desc: "" }] }],
      moodBoards: [{ title: "Cerimónia", images: ["temas/a.jpg"] }],
      cronograma: [],
      budgetItems: ["Decoração"],
      budgetItemsEn: ["Decor"],
      budgetAmounts: [null, 3000],
      budgetArtigos: [null, "flores"],
      budgetCosts: [null],
      budgetSubpontos: [null],
      budgetExtras: [{ label: "Extra", valueText: "100 €" }],
      budgetExtrasSomam: false,
      budgetRows: [],
      budgetNote: "",
      totalAmount: 3000,
      totalVatMode: "acrescer",
      totalLabel: "Total",
      totalText: "",
      totalEstimatedText: "",
      coverImages: ["capa.jpg"],
      fotosDasPaginas: {},
      traducoesFeitas: {},
      repartoPorArtigo: {},
      validUntil: "2027-01-01",
      validUntilDays: 60,
      capaMesmoAssim: true,
      kmDeslocacao: 12,
      carrinhasDeslocacao: 1,
      focoDaCapa: { x: 0.5, y: 0.5 },
      ordemExplicita: "arrumada-a-mao",
      intencao: "um campo que o esquema não conhece",
      incluido: ["a"],
      cancelamento: ["b"],
    });
    expect(desvios(r)).toEqual([]);
  });

  /**
   * Prova, AO COMPILAR, que tudo o que o tipo `ProposalDoc` aceita o esquema
   * também aceita — sem isto, o modo de observar acusaria documentos certos.
   * (O contrário não vale nem tem de valer: o esquema é largo de propósito.)
   */
  it("o tipo ProposalDoc cabe no esquema", () => {
    type Simples<T> = T extends readonly (infer U)[]
      ? Simples<U>[]
      : T extends object
        ? { [K in keyof T]: Simples<T[K]> }
        : T;
    expectTypeOf<Simples<ProposalDoc>>().toExtend<z.input<typeof esquemaDoDocumentoQueChega>>();
  });
});

describe("os corpos que os ecrãs mandam hoje", () => {
  it("o envio e a pré-visualização do estúdio (ProposalStudio → proposta-doc)", () => {
    const doc = { ref: "PO", clientNames: "A & B", moodBoards: [], serviceGroups: [] };
    for (const corpo of [
      { mode: "preview", doc, idioma: "pt" },
      { mode: "preview", doc, idioma: "en", rascunho: true },
      {
        mode: "send",
        doc,
        idioma: "pt",
        mensagem: "",
        corpo: "Olá {{link_proposta}}",
        assunto: "A proposta",
        modelo: "proposta-enviada",
        pdfVisto: "chave",
        porEmail: false,
        cortesConfirmados: true,
        fotosEmFaltaConfirmadas: 3,
      },
    ]) {
      expect(desvios(esquemaDoCorpo.safeParse(corpo))).toEqual([]);
    }
  });

  it("a gravação automática e a importação (gravar.ts, ImportarProposta.tsx)", () => {
    const doc = { ref: "", clientNames: "", moodBoards: [] };
    expect(desvios(esquemaDoCorpoDoRascunho.safeParse({ doc, baseUpdatedAt: null }))).toEqual([]);
    expect(
      desvios(
        esquemaDoCorpoDoRascunho.safeParse({
          doc,
          baseUpdatedAt: "2026-11-17T10:00:00.000Z",
          campos: ["moodBoards"],
          base: { moodBoards: [] },
        }),
      ),
    ).toEqual([]);
  });

  it("o estado das propostas, e o «Anular» (Propostas.tsx, Acompanhamento.tsx)", () => {
    for (const corpo of [
      { status: "aceite", respondedAt: "2026-11-17T10:00:00.000Z", actor: "Catarina" },
      { status: "enviada", respondedAt: "", actor: "Catarina" },
      { followUpAt: "2026-12-01", followUpNote: "ligar" },
      { followUpAt: null, followUpNote: null },
      { status: "rejeitada", lostReason: "preco", lostNote: "" },
      { lostReason: null, lostNote: null, versaoEscolhida: null },
      { versaoEscolhida: "extras" },
    ]) {
      expect(desvios(esquemaDoCorpoDaProposta.safeParse(corpo))).toEqual([]);
    }
  });

  it("os modelos de email (EmailTemplates.tsx)", () => {
    const corpo = {
      key: "proposta-enviada",
      name: "Proposta",
      subject: "A proposta",
      body: "<p>Olá</p>",
    };
    expect(desvios(esquemaDoCorpoDoModeloDeEmail.safeParse(corpo))).toEqual([]);
  });

  it("os modelos de proposta (ModelosParciais.tsx, ProposalStudio.tsx)", () => {
    for (const corpo of [
      { nome: "Arco", tipo: "grupo", grupo: { title: "Cerimónia", items: [] } },
      { nome: "Boho", tipo: "moodboard", moodboard: { title: "Boho", images: [] } },
      { nome: "Casamento", tipo: "completo", doc: { ref: "", moodBoards: [] }, origem: "A & B" },
    ]) {
      expect(desvios(esquemaDoCorpoDoModeloDeProposta.safeParse(corpo))).toEqual([]);
    }
  });
});

describe("a leitura do quotes-store (o antigo `r.data as Quote`)", () => {
  it("devolve o MESMO objecto, bata ou não bata — e só o que não bate é dito", () => {
    __esquecerDesviosDitos();
    __esquecerVersoesConferidas();
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    const bom = { ...minimo };
    expect(mapper.fromRow({ data: bom })).toBe(bom);
    expect(aviso).not.toHaveBeenCalled();
    const antigo = { ...minimo, id: "LIQ-ANTIGO", status: "ganho", name: undefined };
    expect(mapper.fromRow({ data: antigo })).toBe(antigo);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso.mock.calls[0][1]).toMatchObject({ id: "LIQ-ANTIGO" });
    aviso.mockRestore();
  });

  it("cada versão de um pedido confere-se UMA vez: ler outra vez não volta a pagar o esquema", () => {
    __esquecerVersoesConferidas();
    const conferir = vi.spyOn(esquemaDoPedidoGuardado, "safeParse");
    const v1 = { ...minimo, id: "LIQ-2", lastUpdated: "2026-11-17T10:00:00.000Z" };
    for (let i = 0; i < 20; i++) mapper.fromRow({ data: { ...v1 } });
    expect(conferir).toHaveBeenCalledTimes(1);
    // Gravar muda o `lastUpdated`: a versão nova confere-se.
    mapper.fromRow({ data: { ...v1, lastUpdated: "2026-11-17T11:00:00.000Z" } });
    expect(conferir).toHaveBeenCalledTimes(2);
    conferir.mockRestore();
  });
});
