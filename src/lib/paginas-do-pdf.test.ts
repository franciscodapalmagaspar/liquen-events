import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";

vi.mock("server-only", () => ({}));

import { formasDasPaginas, imagemDaPagina, larguraPedida, textoDasPaginas } from "./paginas-do-pdf";

/**
 * As páginas do PDF desenhadas no servidor — ver `paginas-do-pdf.ts`. Um PDF
 * pequeno feito aqui (com uma letra-padrão, que é o caso das propostas antigas
 * e o que fica sem texto se o pdf.js não encontrar as `standard_fonts`).
 */
async function umPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const letra = await doc.embedFont(StandardFonts.Helvetica);
  for (const t of ["Primeira TESTE", "Segunda TESTE"]) {
    const p = doc.addPage([1123, 794]);
    p.drawText(t, { x: 100, y: 400, size: 60, font: letra });
  }
  return doc.save();
}

describe("as páginas do PDF como imagens", () => {
  it("a largura pedida cai na desenhada mais próxima acima", () => {
    expect(larguraPedida(390)).toBe(800);
    expect(larguraPedida(1000)).toBe(1200);
    expect(larguraPedida(5000)).toBe(1600);
  });

  it("conta as páginas, diz a forma e o texto de cada uma", async () => {
    const bytes = await umPdf();
    const obter = vi.fn(async () => bytes);
    expect(await formasDasPaginas("t1", obter)).toEqual([1123 / 794, 1123 / 794]);
    expect(await textoDasPaginas("t1", obter)).toEqual(["Primeira TESTE", "Segunda TESTE"]);
    // O documento abre-se uma vez só.
    expect(obter).toHaveBeenCalledTimes(1);
  });

  it("desenha a página em WebP na largura pedida, e guarda-a", async () => {
    const obter = vi.fn(umPdf);
    const webp = await imagemDaPagina("t2", obter, 1, 800);
    expect(webp!.subarray(0, 4).toString()).toBe("RIFF");
    expect(webp!.subarray(8, 12).toString()).toBe("WEBP");
    expect(webp!.readUInt32LE(4)).toBeGreaterThan(1000); // não é uma folha vazia
    expect(await imagemDaPagina("t2", obter, 1, 800)).toBe(webp);
    expect(obter).toHaveBeenCalledTimes(1);
  });

  it("uma página que não existe dá null", async () => {
    expect(await imagemDaPagina("t3", umPdf, 3, 800)).toBeNull();
    expect(await imagemDaPagina("t3", umPdf, 0, 800)).toBeNull();
  });

  it("as rotas mandam o desenhador com elas (o `require` do pdf.js não se vê)", () => {
    const config = readFileSync("next.config.ts", "utf8");
    // `*` e não `[token]`: a chave é um padrão, e os parênteses rectos não casam.
    expect(config).toMatch(
      /"\/api\/proposta\/\*\/pagina\/\*": \[\s*"\.\/node_modules\/@napi-rs\/canvas\/\*\*\/\*",\s*"\.\/node_modules\/@napi-rs\/canvas-linux-x64-gnu\/\*\*\/\*",\s*"\.\/node_modules\/pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs"/,
    );
    expect(config).toMatch(
      /"\/api\/proposta\/\*\/paginas": \["\.\/node_modules\/pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs"\]/,
    );
  });
});
