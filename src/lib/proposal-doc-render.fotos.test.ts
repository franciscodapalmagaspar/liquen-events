import { beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O ESTÚDIO PERGUNTA É O QUE O PDF DESENHA — PELO CAMINHO DE VERDADE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `fotosDoEditorialDoDocumento` (o que a rota `fotos-do-pdf` responde às
 * miniaturas) e `renderStoredEditorialPdfWithReport` (o PDF que segue) têm de
 * pôr as MESMAS fotografias nas mesmas páginas. Aqui pelo caminho inteiro:
 * fotos do armazenamento (simulado) de tamanhos diferentes, umas com a medida
 * guardada na biblioteca e outras sem ela, e uma `data:` dentro do rascunho.
 *
 * Fotografias fabricadas aqui — nenhuma foto de cliente entra num teste.
 */

vi.setConfig({ testTimeout: 240_000 });

const bytesPorRef = new Map<string, Buffer>();
vi.mock("@/lib/proposal-storage", () => ({
  fetchProposalImageBytes: async (ref: string) =>
    ref.startsWith("data:")
      ? Buffer.from(ref.slice(ref.indexOf(",") + 1), "base64")
      : (bytesPorRef.get(ref) ?? null),
  fetchProposalThumbBytes: async () => null,
  fetchProposalCoverBytes: async () => null,
  uploadProposalCover: async () => false,
}));
/** A biblioteca sabe a medida de METADE das fotos — a outra metade mede-se dos bytes. */
const naBiblioteca = new Map<string, { largura: number; altura: number }>();
/** A base de dados recusa a leitura das medidas (como a 9/11). */
let leituraFalha = false;
vi.mock("@/lib/biblioteca-fotos-store", () => {
  const formas = async (paths: readonly string[]) =>
    new Map(paths.filter((p) => naBiblioteca.has(p)).map((p) => [p, naBiblioteca.get(p)!]));
  return {
    formasDeCaminhos: formas,
    formasDeCaminhosOuErro: async (paths: readonly string[]) => {
      if (leituraFalha) throw new Error("JWT issued at future");
      return formas(paths);
    },
  };
});

/**
 * O que o armazenamento diz que já não existe (`refsQueJaNaoExistem`) — a
 * fonte única do PDF, do plano e da página do casal. Vazio por omissão.
 */
const NoArmazenamento = vi.hoisted(() => ({ faltam: new Set<string>() }));
vi.mock("@/lib/proposta-fotos-verificacao", () => ({
  refsQueJaNaoExistem: async (refs: readonly string[]) =>
    new Set(refs.filter((r) => NoArmazenamento.faltam.has(r))),
}));

const { renderStoredEditorialPdfWithReport, fotosDoEditorialDoDocumento, conteudoWebDoDocumento } =
  await import("./proposal-doc-render");

const FORMAS: [number, number][] = [
  [2400, 1600],
  [1600, 2400],
  [3000, 2000],
  [2000, 2000],
  [1200, 1800],
  [4000, 2667],
  [2048, 1536],
  [1536, 2048],
  [2600, 1733],
  [1800, 2700],
  [900, 600],
  [3200, 2133],
];
const ref = (i: number) => `proposal-assets/TESTE/f${i}.jpg`;
let dataUri = "";

beforeAll(async () => {
  for (const [i, [w, h]] of FORMAS.entries()) {
    const b = await sharp({
      create: { width: w, height: h, channels: 3, background: { r: 60 + i * 10, g: 90, b: 70 } },
    })
      .jpeg({ quality: 50 })
      .toBuffer();
    bytesPorRef.set(ref(i), b);
    if (i % 2 === 0) naBiblioteca.set(ref(i), { largura: w, altura: h });
  }
  dataUri = `data:image/jpeg;base64,${(
    await sharp({ create: { width: 1500, height: 1000, channels: 3, background: "#556677" } })
      .jpeg({ quality: 50 })
      .toBuffer()
  ).toString("base64")}`;
});

function doc(p: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO TESTE",
    clientNames: "TESTE Maria & TESTE Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2099",
    location: "TESTE Évora",
    serviceGroups: [{ title: "Decoração", items: [{ label: "Cerimónia" }] }],
    moodBoards: [
      { title: "Cerimónia", images: [ref(0), ref(1), ref(2), dataUri] },
      { title: "Cocktail", images: [ref(3), ref(4), ref(5)] },
      { title: "Mesas de Jantar", images: [ref(6), ref(7), ref(8), ref(9)] },
    ],
    budgetItems: ["Decor"],
    totalText: "3000,00 € + IVA",
    coverImages: [ref(10)],
    ...p,
  } as ProposalDoc);
}

describe("as miniaturas e o PDF que segue: as mesmas fotografias", () => {
  it("sem escolhas dela", async () => {
    const d = doc();
    const pdf = await renderStoredEditorialPdfWithReport(d, "pt");
    const plano = await fotosDoEditorialDoDocumento(d, "pt");
    expect(plano).toEqual(pdf.fotos);
    expect(pdf.missingImages).toBe(0);
  });

  it("com escolhas dela — e uma fotografia que não está em tema nenhum", async () => {
    const d = doc({
      fotosDasPaginas: {
        "separador:cocktail": { fotos: [ref(11)] },
        total: { fotos: [ref(9)] },
      },
    });
    const pdf = await renderStoredEditorialPdfWithReport(d, "pt");
    const plano = await fotosDoEditorialDoDocumento(d, "pt");
    expect(plano).toEqual(pdf.fotos);
    expect(pdf.fotos.total.map((f) => f.ref)).toEqual([ref(9)]);
  });
});

describe("uma foto escolhida que já não existe não é trocada por outra (14/11)", () => {
  it("o lugar fica dela, conta como em falta, e o aviso diz qual", async () => {
    const d = doc({ fotosDasPaginas: { indice: { fotos: ["proposal-assets/TESTE/foi.jpg"] } } });
    const pdf = await renderStoredEditorialPdfWithReport(d, "pt");
    expect(pdf.fotos.indice).toEqual([{ ref: "proposal-assets/TESTE/foi.jpg", emFalta: true }]);
    expect(pdf.missingImages).toBe(1);
  });

  /**
   * Revisão de 14/11, n.º 3: a CAPA escolhida que não se deixa buscar. O
   * desenho da capa não muda (sai a melhor deitada, como sempre que a dela não
   * serve) — mas não em silêncio: fica registado, e o envio trava antes
   * (`fotosEscolhidasQueFaltam` conta a capa na mesma lista).
   */
  it("a capa escolhida em falta fica registada (o desenho da capa não muda)", async () => {
    const { log } = await import("@/lib/logger");
    const aviso = vi.spyOn(log, "warn");
    try {
      const pdf = await renderStoredEditorialPdfWithReport(
        doc({ coverImages: ["proposal-assets/TESTE/capa-foi.jpg"] }),
        "pt",
      );
      expect(pdf.fotos.capa[0].ref).not.toBe("proposal-assets/TESTE/capa-foi.jpg");
      expect(aviso).toHaveBeenCalledWith(
        expect.stringMatching(/fotografia de capa escolhida já não existe/),
        { capa: "proposal-assets/TESTE/capa-foi.jpg" },
      );
    } finally {
      aviso.mockRestore();
    }
  });
});

describe("uma leitura falhada das medidas não troca fotografias (9/11)", () => {
  // Ela: «alterei agora uma palavra e ele alterou uma foto». Sem as medidas
  // da biblioteca o desenho media as fotos reduzidas, e duas de medidas quase
  // iguais trocavam de lugar. Agora o desenho FALHA em vez de escolher outras.
  it("o desenho falha em vez de sair com outra escolha", async () => {
    leituraFalha = true;
    try {
      await expect(renderStoredEditorialPdfWithReport(doc(), "pt")).rejects.toThrow();
    } finally {
      leituraFalha = false;
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FOTO NA RECICLAGEM: PLANO, PDF E PÁGINA DO CASAL ESCOLHEM O MESMO (14/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Revisão de 14/11, importante n.º 1. A linha da `biblioteca_fotos` fica
 * quando a foto vai para a Reciclagem (com a medida), por isso o motor sem
 * bytes a dava como presente: o plano punha-a na capa e nos separadores, o
 * PDF (sem bytes) punha outras, e a página do casal tirava-a DEPOIS do motor
 * e escolhia outras ainda. Agora os três tiram-na ANTES (`semAsQueFaltam`).
 */
describe("plano, PDF e página do casal escolhem as mesmas fotos quando uma foto já não existe", () => {
  const CAPA_FOI = "proposal-assets/TESTE/capa-reciclagem.jpg";
  const BOARD_FOI = "proposal-assets/TESTE/board-reciclagem.jpg";
  /** Na Reciclagem, mas com a derivada guardada: os bytes ainda vinham. */
  const COM_BYTES = "proposal-assets/TESTE/derivada-ficou.jpg";

  beforeAll(async () => {
    // A medida fica na biblioteca (a linha não se apaga) — e são as maiores
    // deitadas do documento: as que o álbum escolheria para tudo.
    naBiblioteca.set(CAPA_FOI, { largura: 5000, altura: 3333 });
    naBiblioteca.set(BOARD_FOI, { largura: 5200, altura: 3466 });
    naBiblioteca.set(COM_BYTES, { largura: 5400, altura: 3600 });
    bytesPorRef.set(
      COM_BYTES,
      await sharp({ create: { width: 2700, height: 1800, channels: 3, background: "#884422" } })
        .jpeg({ quality: 50 })
        .toBuffer(),
    );
  });

  it("capa, mood board e uma com bytes ainda guardados: os três dizem o mesmo", async () => {
    NoArmazenamento.faltam = new Set([CAPA_FOI, BOARD_FOI, COM_BYTES]);
    try {
      const d = doc({
        coverImages: [CAPA_FOI],
        moodBoards: [
          { title: "Cerimónia", images: [BOARD_FOI, ref(0), ref(1), ref(2)], principal: 0 },
          { title: "Cocktail", images: [ref(3), COM_BYTES, ref(4), ref(5)] },
          { title: "Mesas de Jantar", images: [ref(6), ref(7), ref(8), ref(9)] },
        ],
      });
      const pdf = await renderStoredEditorialPdfWithReport(d, "pt");
      const plano = await fotosDoEditorialDoDocumento(d, "pt");
      const web = await conteudoWebDoDocumento(d, "pt");

      expect(plano).toEqual(pdf.fotos);
      const usadas = JSON.stringify(pdf.fotos);
      for (const r of [CAPA_FOI, BOARD_FOI, COM_BYTES]) {
        expect(usadas).not.toContain(r);
        expect(JSON.stringify(web)).not.toContain(r);
      }
      // A capa da página do casal é a do PDF — e tem fundo.
      expect(pdf.fotos.capa[0].ref).toBeTruthy();
      expect(web.capa.fundo?.ref).toBe(pdf.fotos.capa[0].ref);
      // A contracapa e a citação também.
      const fechoNoPdf = Object.entries(pdf.fotos).find(([k]) => k.startsWith("contracapa"))?.[1];
      if (fechoNoPdf?.[0]?.ref) expect(web.fecho.fundo?.ref).toBe(fechoNoPdf[0].ref);
      const citacaoNoPdf = Object.entries(pdf.fotos).find(([k]) => k.startsWith("citacao"))?.[1];
      if (citacaoNoPdf?.[0]?.ref) expect(web.citacao?.foto?.ref ?? null).toBe(citacaoNoPdf[0].ref);
    } finally {
      NoArmazenamento.faltam = new Set();
    }
  });

  it("uma escolhida à mão que foi para a Reciclagem: o lugar fica vazio nos três", async () => {
    NoArmazenamento.faltam = new Set([COM_BYTES]);
    try {
      const d = doc({ fotosDasPaginas: { indice: { fotos: [COM_BYTES] } } });
      const pdf = await renderStoredEditorialPdfWithReport(d, "pt");
      const plano = await fotosDoEditorialDoDocumento(d, "pt");
      expect(plano).toEqual(pdf.fotos);
      expect(pdf.fotos.indice).toEqual([{ ref: COM_BYTES, emFalta: true }]);
    } finally {
      NoArmazenamento.faltam = new Set();
    }
  });
});
