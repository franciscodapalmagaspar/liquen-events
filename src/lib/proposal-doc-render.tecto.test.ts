import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TECTO DE FOTOS DO PDF EDITORIAL — FOTOS DIFERENTES, E AS DELA PRIMEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 2.ª revisão de 14/11, importante n.º 1. O tecto contava LUGARES (a mesma
 * foto em dois boards gastava dois), e cortava pela ordem do documento — capa,
 * mood boards, e só no fim as fotografias que ela escolheu à mão para as
 * páginas. Uma escolhida saía antes de uma de mood board, e o PDF guardava-se.
 *
 * O desenho é de mentira aqui (só interessa o que a resolução lhe entrega);
 * as fotografias são fabricadas — nenhuma foto de cliente entra num teste.
 */

vi.setConfig({ testTimeout: 60_000 });

const pedidas = new Set<string>();
let foto: Buffer;
vi.mock("@/lib/proposal-storage", () => ({
  fetchProposalImageBytes: async (ref: string) => {
    pedidas.add(ref);
    return foto;
  },
  fetchProposalThumbBytes: async () => null,
  fetchProposalCoverBytes: async () => null,
  uploadProposalCover: async () => false,
}));
vi.mock("@/lib/fotos-editoriais-guardadas", () => ({
  lerFotoEditorialGuardada: async () => null,
  guardarFotoEditorial: async () => {},
}));
vi.mock("@/lib/biblioteca-fotos-store", () => ({
  formasDeCaminhos: async () => new Map(),
  formasDeCaminhosOuErro: async () => new Map(),
}));
vi.mock("@/lib/proposta-fotos-verificacao", () => ({
  refsQueJaNaoExistem: async () => new Set<string>(),
}));
/** O documento que o desenho RECEBEU, já com as fotos resolvidas. */
const recebidos: ProposalDoc[] = [];
vi.mock("@/lib/pdf-editorial/montar", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pdf-editorial/montar")>()),
  renderEditorialPdf: async (d: ProposalDoc) => {
    recebidos.push(d);
    return {
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      truncations: [],
      undrawnImages: 0,
      fotos: {},
      paginas: 1,
      fotosEscolhidasEmFalta: [],
    };
  },
}));

const { renderStoredEditorialPdfWithReport, esvaziarFotosEditoriais } =
  await import("./proposal-doc-render");

function doc(p: Partial<ProposalDoc>): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO TESTE",
    clientNames: "TESTE Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2099",
    location: "TESTE Évora",
    serviceGroups: [{ title: "Decoração", items: [{ label: "Cerimónia" }] }],
    budgetItems: ["Decor"],
    totalText: "3000,00 € + IVA",
    coverImages: [],
    moodBoards: [],
    ...p,
  } as ProposalDoc);
}

/** `n` boards de dez, com fotografias de `prefixo`. */
const boards = (n: number, fotoDe: (b: number, k: number) => string) =>
  Array.from({ length: n }, (_, b) => ({
    title: `Tema ${b}`,
    images: Array.from({ length: 10 }, (_, k) => fotoDe(b, k)),
  }));

beforeEach(async () => {
  pedidas.clear();
  recebidos.length = 0;
  esvaziarFotosEditoriais();
  foto ??= await sharp({ create: { width: 40, height: 30, channels: 3, background: "#7c854b" } })
    .jpeg()
    .toBuffer();
});

describe("o tecto de fotos do PDF editorial", () => {
  it("conta fotos DIFERENTES: 90 lugares de 45 fotos cabem todos", async () => {
    // Cada foto aparece em dois boards — o gesto de duplicar um board.
    const r = await renderStoredEditorialPdfWithReport(
      doc({ moodBoards: boards(9, (b, k) => `TESTE/f${(b * 10 + k) % 45}.jpg`) }),
    );
    expect(r.faltasPeloTecto).toBe(0);
    expect(r.missingImages).toBe(0);
    expect(pedidas.size).toBe(45);
  });

  it("a foto escolhida para uma página cabe antes das dos mood boards", async () => {
    const r = await renderStoredEditorialPdfWithReport(
      doc({
        coverImages: ["TESTE/capa.jpg"],
        moodBoards: boards(9, (b, k) => `TESTE/b${b}f${k}.jpg`),
        fotosDasPaginas: { indice: { fotos: ["TESTE/escolhida.jpg"] } },
      }),
    );
    expect(pedidas.has("TESTE/capa.jpg")).toBe(true);
    expect(pedidas.has("TESTE/escolhida.jpg")).toBe(true);
    // 92 diferentes, tecto de 80: saem as 12 últimas dos mood boards.
    expect(r.faltasPeloTecto).toBe(12);
    expect(r.faltasPeloTectoQueTravam).toBe(0);
    expect(pedidas.has("TESTE/b8f9.jpg")).toBe(false);
    expect(pedidas.has("TESTE/b7f7.jpg")).toBe(true);
    // E chega ao desenho como bytes, não como lugar vazio.
    const indice = recebidos[0].fotosDasPaginas?.indice?.fotos?.[0] ?? "";
    expect(indice.length).toBeGreaterThan(100);
  });

  it("uma escolhida que mesmo assim não cabe conta à parte — é o que impede de guardar", async () => {
    // 85 temas sem fotos, cada um com a SUA foto escolhida (a página do tema
    // tem um lugar), e a capa: 86 escolhidas, 6 a mais.
    const temas = Array.from({ length: 85 }, (_, i) => ({ title: `Tema ${i}`, images: [] }));
    const fotosDasPaginas = Object.fromEntries(
      temas.map((_, i) => [`tema:${i}`, { fotos: [`TESTE/t${i}.jpg`] }]),
    );
    const r = await renderStoredEditorialPdfWithReport(
      doc({ coverImages: ["TESTE/capa.jpg"], moodBoards: temas, fotosDasPaginas }),
    );
    expect(pedidas.has("TESTE/capa.jpg")).toBe(true);
    expect(r.faltasPeloTecto).toBe(6);
    expect(r.faltasPeloTectoQueTravam).toBe(6);
  });
});
