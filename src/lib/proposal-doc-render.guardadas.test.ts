import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * A fotografia reduzida a 1 800 px fica também GUARDADA (3/11): uma instância
 * nova da função — memória vazia — usa a versão guardada em vez de voltar a
 * descarregar o original e a reduzi-lo. Foi assim que a conta da Vercel passou
 * o limite de processador: o mesmo trabalho, refeito em cada instância nova.
 */
const fetchProposalImageBytes = vi.fn<(ref: string) => Promise<Buffer | null>>();
vi.mock("@/lib/proposal-storage", () => ({
  fetchProposalImageBytes: (ref: string) => fetchProposalImageBytes(ref),
  fetchProposalThumbBytes: async () => null,
  fetchProposalCoverBytes: async () => null,
  uploadProposalCover: async () => false,
}));

/** O armazenamento fingido: uma chave por (receita, caminho). */
const guardadas = new Map<string, Buffer>();
vi.mock("@/lib/fotos-editoriais-guardadas", () => ({
  lerFotoEditorialGuardada: async (ref: string, receita: string) =>
    guardadas.get(`${receita}|${ref}`) ?? null,
  guardarFotoEditorial: async (ref: string, receita: string, bytes: Buffer) => {
    guardadas.set(`${receita}|${ref}`, bytes);
  },
}));

const { renderStoredEditorialPdfWithReport, esvaziarFotosEditoriais } =
  await import("./proposal-doc-render");

function doc(imagens: string[]): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO TESTE",
    clientNames: "TESTE Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2099",
    location: "TESTE Évora",
    guests: "80 pax",
    serviceGroups: [{ title: "Decoração", items: [{ label: "Cerimónia" }] }],
    moodBoards: [{ title: "Cerimónia", images: imagens }],
    budgetItems: ["Decor"],
    totalLabel: "Valor Total Decoração",
    totalText: "3000,00 € + IVA",
    coverImages: ["", ""],
  });
}

let foto: Buffer;

beforeEach(async () => {
  esvaziarFotosEditoriais();
  guardadas.clear();
  fetchProposalImageBytes.mockReset();
  foto ??= await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: { r: 124, g: 133, b: 75 } },
  })
    .jpeg()
    .toBuffer();
});

describe("as fotografias reduzidas ficam guardadas fora da memória", () => {
  it("uma instância nova usa a versão guardada e não volta ao original", async () => {
    fetchProposalImageBytes.mockResolvedValue(foto);
    const d = doc(["proposal-assets/q1/a.jpg", "proposal-assets/q1/b.jpg"]);
    await renderStoredEditorialPdfWithReport(d, "pt");
    expect(fetchProposalImageBytes).toHaveBeenCalledTimes(2);
    expect(guardadas.size, "a versão reduzida não ficou guardada").toBe(2);
    // Já reduzida: menor do que o original, e no máximo 1 800 px.
    const reduzida = [...guardadas.values()][0];
    const m = await sharp(reduzida).metadata();
    expect(Math.max(m.width ?? 0, m.height ?? 0)).toBeLessThanOrEqual(1800);

    // Instância nova: a memória da função foi-se, o armazenamento ficou.
    esvaziarFotosEditoriais();
    const segundo = await renderStoredEditorialPdfWithReport(d, "pt");
    expect(fetchProposalImageBytes, "voltou a descarregar o original").toHaveBeenCalledTimes(2);
    expect(segundo.missingImages).toBe(0);
  });

  it("uma imagem embutida (data:) não vai para o armazenamento", async () => {
    const embutida = `data:image/jpeg;base64,${foto.toString("base64")}`;
    const d = doc([embutida]);
    await renderStoredEditorialPdfWithReport(d, "pt");
    expect(guardadas.size).toBe(0);
  });
});
