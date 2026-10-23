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
vi.mock("@/lib/biblioteca-fotos-store", () => ({
  formasDeCaminhos: async (paths: readonly string[]) =>
    new Map(paths.filter((p) => naBiblioteca.has(p)).map((p) => [p, naBiblioteca.get(p)!])),
}));

const { renderStoredEditorialPdfWithReport, fotosDoEditorialDoDocumento } =
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
