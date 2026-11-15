import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  chaveDaVersao,
  esvaziarPdfsFinais,
  estadoDosPdfsFinais,
  faltasPassageiras,
  pdfFinalDaVersao,
  type RelatorioDoPdf,
} from "./proposal-preview-cache";

function relatorio(missingImages = 0, bytes = 10): RelatorioDoPdf {
  return { pdf: Buffer.alloc(bytes) as Buffer<ArrayBuffer>, missingImages, truncations: [] };
}

beforeEach(() => esvaziarPdfsFinais());

describe("pdfFinalDaVersao", () => {
  it("desenha uma vez por versão", async () => {
    const desenhar = vi.fn(async () => relatorio());
    const a = await pdfFinalDaVersao("k", desenhar);
    const b = await pdfFinalDaVersao("k", desenhar);
    expect(desenhar).toHaveBeenCalledTimes(1);
    expect(a.daMemoria).toBe(false);
    expect(b.daMemoria).toBe(true);
    expect(b.relatorio).toBe(a.relatorio);
  });

  it("dois pedidos ao mesmo tempo esperam pelo mesmo desenho", async () => {
    let soltar: (r: RelatorioDoPdf) => void = () => {};
    const desenhar = vi.fn(() => new Promise<RelatorioDoPdf>((r) => (soltar = r)));
    const a = pdfFinalDaVersao("k", desenhar);
    const b = pdfFinalDaVersao("k", desenhar);
    soltar(relatorio());
    const [ra, rb] = await Promise.all([a, b]);
    expect(desenhar).toHaveBeenCalledTimes(1);
    expect(rb.relatorio).toBe(ra.relatorio);
  });

  it("um desenho com fotos em falta não fica guardado", async () => {
    const desenhar = vi.fn(async () => relatorio(2));
    await pdfFinalDaVersao("k", desenhar);
    await pdfFinalDaVersao("k", desenhar);
    expect(desenhar).toHaveBeenCalledTimes(2);
    expect(estadoDosPdfsFinais().entradas).toBe(0);
  });

  it("as que passam do TECTO de fotos não impedem de guardar (menor n.º 1, 14/11)", async () => {
    const desenhar = vi.fn(async () => ({ ...relatorio(10), faltasPeloTecto: 10 }));
    await pdfFinalDaVersao("k", desenhar);
    await pdfFinalDaVersao("k", desenhar);
    expect(desenhar).toHaveBeenCalledTimes(1);
  });

  it("uma ESCOLHIDA cortada pelo tecto não se guarda (2.ª revisão de 14/11, importante n.º 1)", async () => {
    const desenhar = vi.fn(async () => ({
      ...relatorio(10),
      faltasPeloTecto: 10,
      faltasPeloTectoQueTravam: 1,
    }));
    await pdfFinalDaVersao("k", desenhar);
    await pdfFinalDaVersao("k", desenhar);
    expect(desenhar).toHaveBeenCalledTimes(2);
    expect(estadoDosPdfsFinais().entradas).toBe(0);
  });

  it("faltasPassageiras tira as sabidas e as do tecto", () => {
    expect(faltasPassageiras({ missingImages: 5 })).toBe(5);
    expect(faltasPassageiras({ missingImages: 5, faltasSabidas: 2, faltasPeloTecto: 3 })).toBe(0);
    expect(faltasPassageiras({ missingImages: 6, faltasPeloTecto: 3 })).toBe(3);
  });

  it("um desenho que falhou não fica, nem fica a meio", async () => {
    const desenhar = vi.fn(async () => {
      throw new Error("armazenamento em baixo");
    });
    await expect(pdfFinalDaVersao("k", desenhar)).rejects.toThrow();
    const depois = vi.fn(async () => relatorio());
    await pdfFinalDaVersao("k", depois);
    expect(depois).toHaveBeenCalledTimes(1);
  });

  it("a validade faz parte da versão", () => {
    expect(chaveDaVersao("abc", "2099-01-01")).not.toBe(chaveDaVersao("abc", "2099-01-02"));
  });
});
