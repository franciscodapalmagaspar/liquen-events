import { describe, expect, it } from "vitest";
import {
  expandDropEntries,
  isImageFile,
  MAX_DROP_ENTRIES,
  MAX_DROP_FILES,
  readDropEntries,
} from "./largar-pastas";

const ficheiro = (name: string, type = "") => new File(["x"], name, { type });

/** Uma entrada de ficheiro como a do browser (`FileSystemFileEntry`). */
function entradaDeFicheiro(f: File, falha = false): FileSystemEntry {
  return {
    isFile: true,
    isDirectory: false,
    name: f.name,
    file: (ok: (f: File) => void, erro: () => void) => (falha ? erro() : ok(f)),
  } as unknown as FileSystemEntry;
}

/** Uma pasta cujo `readEntries` devolve as entradas em lotes de `porLote`,
 *  como o Chrome (que devolve no máximo ~100 de cada vez). */
function pasta(filhos: FileSystemEntry[], porLote = 100): FileSystemEntry {
  return {
    isFile: false,
    isDirectory: true,
    name: "pasta",
    createReader: () => {
      let i = 0;
      return {
        readEntries: (ok: (e: FileSystemEntry[]) => void) => {
          const lote = filhos.slice(i, i + porLote);
          i += porLote;
          ok(lote);
        },
      };
    },
  } as unknown as FileSystemEntry;
}

describe("isImageFile", () => {
  it("aceita pelo tipo", () => {
    expect(isImageFile(ficheiro("a.bin", "image/png"))).toBe(true);
  });

  it("aceita HEIC e ficheiros de câmara sem tipo, pela extensão", () => {
    for (const n of ["IMG_1.HEIC", "x.heif", "y.JPG", "z.jpeg", "w.tif", "v.tiff", "u.webp"]) {
      expect(isImageFile(ficheiro(n)), n).toBe(true);
    }
  });

  it("recusa o que não é imagem", () => {
    expect(isImageFile(ficheiro("notas.pdf", "application/pdf"))).toBe(false);
    expect(isImageFile(ficheiro("sem-extensao"))).toBe(false);
    expect(isImageFile(ficheiro("foto.jpg.txt", "text/plain"))).toBe(false);
  });
});

describe("readDropEntries", () => {
  it("sem a API (jsdom, browsers antigos) devolve vazio, e não rebenta", () => {
    expect(readDropEntries(null)).toEqual([]);
    expect(readDropEntries({} as DataTransfer)).toEqual([]);
  });

  it("lê as entradas, e salta o que não é ficheiro ou lança", () => {
    const e1 = entradaDeFicheiro(ficheiro("a.jpg"));
    const items = [
      { webkitGetAsEntry: () => e1 },
      { webkitGetAsEntry: () => null },
      {},
      {
        webkitGetAsEntry: () => {
          throw new Error("texto arrastado");
        },
      },
    ];
    const dt = { items: Object.assign(items, { length: items.length }) } as unknown as DataTransfer;
    expect(readDropEntries(dt)).toEqual([e1]);
  });
});

describe("expandDropEntries", () => {
  it("abre pastas dentro de pastas, e lê os lotes até virem vazios (300 fotos, não 100)", async () => {
    const fotos = Array.from({ length: 300 }, (_, i) => entradaDeFicheiro(ficheiro(`f${i}.jpg`)));
    const r = await expandDropEntries([pasta([pasta(fotos)])]);
    expect(r.files).toHaveLength(300);
    expect(r.capped).toBe(false);
  });

  it("um ficheiro que não se deixa ler fica de fora, sem parar os outros", async () => {
    const r = await expandDropEntries([
      entradaDeFicheiro(ficheiro("a.jpg"), true),
      entradaDeFicheiro(ficheiro("b.jpg")),
    ]);
    expect(r.files.map((f) => f.name)).toEqual(["b.jpg"]);
  });

  it(`pára no tecto de ${MAX_DROP_FILES} ficheiros, e diz que parou`, async () => {
    const muitas = Array.from({ length: MAX_DROP_FILES + 10 }, (_, i) =>
      entradaDeFicheiro(ficheiro(`f${i}.jpg`)),
    );
    const r = await expandDropEntries(muitas);
    expect(r.files).toHaveLength(MAX_DROP_FILES);
    expect(r.capped).toBe(true);
  });

  it(`pára de percorrer acima de ${MAX_DROP_ENTRIES} entradas (árvores patológicas)`, async () => {
    // Pastas vazias não somam ficheiros: só o tecto das ENTRADAS as pára.
    const vazias = Array.from({ length: MAX_DROP_ENTRIES + 5 }, () => pasta([]));
    const r = await expandDropEntries(vazias);
    expect(r.files).toHaveLength(0);
    expect(r.capped).toBe(true);
  });

  it("nada largado, nada lido", async () => {
    expect(await expandDropEntries([])).toEqual({ files: [], capped: false });
  });
});
