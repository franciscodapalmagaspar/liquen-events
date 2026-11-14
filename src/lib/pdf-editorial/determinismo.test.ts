import { createHash } from "node:crypto";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O MESMO DOCUMENTO DÁ O MESMO PDF, BYTE A BYTE (14/11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * É a base do «arquivo com prova» (`docs/ARQUIVO-DE-PDFS.md`): só se pode
 * deixar de guardar o PDF de uma proposta se ele se refizer IGUAL a partir do
 * documento, e só se prova comparando o `sha256` com o que ficou selado.
 *
 * Medido antes da correcção: duas gerações do mesmo documento davam 16 a 18
 * imagens com o número do objecto trocado — embutiam-se pela ordem em que a
 * preparação de cada uma ACABAVA. Aqui a preparação leva um atraso ao acaso,
 * como o do armazenamento em produção, para a ordem de chegada mudar de uma
 * geração para a outra; o PDF não pode mudar com ela.
 *
 * As fotografias são fabricadas — nenhuma foto de cliente entra num teste.
 */

vi.setConfig({ testTimeout: 180_000 });

vi.mock("@/lib/fotos-editoriais-guardadas", () => ({
  lerFotoEditorialGuardada: async () => null,
  guardarFotoEditorial: async () => undefined,
}));

vi.mock("./preparadas-guardadas", async (original) => {
  const real = await original<typeof import("./preparadas-guardadas")>();
  return {
    ...real,
    prepararGuardado: async (...a: Parameters<typeof real.prepararGuardado>) => {
      const feita = await real.prepararGuardado(...a);
      await new Promise((r) => setTimeout(r, Math.random() * 25));
      return feita;
    },
  };
});

const { renderEditorialPdf } = await import("./montar");

const CORES = ["#7a8a6a", "#c9a37a", "#5a6a7a", "#8a5a4a", "#4a7a6a", "#a08ab0", "#b0a060"];
let FOTOS: string[] = [];

beforeAll(async () => {
  FOTOS = await Promise.all(
    CORES.map(async (cor, i) => {
      const [w, h] = [
        [900, 600],
        [500, 750],
        [700, 700],
      ][i % 3];
      // Um degradé por foto, para cada uma ser uma imagem diferente no PDF.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cor}"/><stop offset="1" stop-color="#222"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
      const b = await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
      return b.toString("base64");
    }),
  );
});

function docDeTeste(): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "TESTE",
    clientNames: "TESTE Ana Sousa & TESTE Rui Matos",
    eventType: "Casamento",
    eventDate: "8 de julho de 2028",
    location: "Évora · Exterior",
    guests: "50 a 100",
    ceremony: "Civil",
    coverImages: [FOTOS[0]],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral e Decoração",
        items: [{ label: "Decoração Cerimónia" }, { label: "Decoração Mesas Jantar" }],
      },
    ],
    moodBoards: [
      { title: "Decoração Cerimónia", images: FOTOS.slice(1, 4) },
      { title: "Mesas de Jantar", images: FOTOS.slice(3), annotation: "TESTE nota." },
    ],
    budgetItems: ["Decoração Cerimónia", "Decoração Mesas Jantar"],
    totalLabel: "Valor Total Decoração",
    totalText: "3.200,00 € + IVA",
    totalAmount: 3200,
    totalVatMode: "acrescer",
    vatRate: 0.23,
    depositPercent: 30,
    validUntil: "2026-11-27",
  } as ProposalDoc);
}

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("o PDF editorial é determinístico", () => {
  it("com a mesma data de criação, duas gerações dão o mesmo sha256", async () => {
    const criadoEm = new Date("2026-11-14T10:00:00Z");
    const a = await renderEditorialPdf(docDeTeste(), "pt", { criadoEm });
    const b = await renderEditorialPdf(docDeTeste(), "pt", { criadoEm });
    expect(a.undrawnImages).toBe(0);
    expect(a.paginas).toBeGreaterThan(8);
    expect(sha(b.bytes)).toBe(sha(a.bytes));
  });

  it("a data de criação é a que se pede, ao segundo", async () => {
    const criadoEm = new Date("2026-10-23T18:04:05Z");
    const { bytes } = await renderEditorialPdf(docDeTeste(), "pt", { criadoEm });
    const { PDFDocument } = await import("pdf-lib");
    const lido = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(lido.getCreationDate()?.toISOString()).toBe("2026-10-23T18:04:05.000Z");
    expect(lido.getModificationDate()?.toISOString()).toBe("2026-10-23T18:04:05.000Z");
  });
});
