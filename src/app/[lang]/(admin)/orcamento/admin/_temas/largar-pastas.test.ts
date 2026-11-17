import { describe, expect, it } from "vitest";
import {
  MAX_DROP_ENTRIES,
  MAX_DROP_FILES,
  expandDropEntries,
  isImageFile,
  readDropEntries,
} from "./largar-pastas";

/** Um ficheiro largado, com o `type` que o sistema lhe deu (às vezes vazio). */
const ficheiro = (nome: string, type = "") => new File(["x"], nome, { type });

/** Uma entrada de ficheiro; `falha` simula o erro do `file()` (permissões, ficheiro apagado). */
function entradaDeFicheiro(nome: string, falha = false): FileSystemEntry {
  return {
    isFile: true,
    isDirectory: false,
    name: nome,
    file: (ok: (f: File) => void, erro: (e: unknown) => void) =>
      falha ? erro(new Error("sem acesso")) : ok(ficheiro(nome, "image/jpeg")),
  } as unknown as FileSystemEntry;
}

/**
 * Uma pasta cujo leitor devolve os lotes dados, um por chamada, e depois [] —
 * como o `readEntries` dos browsers, que dá ~100 de cada vez.
 */
function pasta(lotes: () => FileSystemEntry[][]): FileSystemEntry {
  return {
    isFile: false,
    isDirectory: true,
    name: "pasta",
    createReader: () => {
      const fila = lotes();
      return {
        readEntries: (ok: (e: FileSystemEntry[]) => void) => ok(fila.shift() ?? []),
      };
    },
  } as unknown as FileSystemEntry;
}

describe("isImageFile", () => {
  it("aceita pelo tipo", () => {
    expect(isImageFile(ficheiro("x", "image/png"))).toBe(true);
  });

  it("aceita pela extensão quando o tipo vem vazio (HEIC, câmaras)", () => {
    for (const n of ["a.HEIC", "b.heif", "c.jpeg", "d.JPG", "e.tif", "f.tiff", "g.webp"]) {
      expect(isImageFile(ficheiro(n))).toBe(true);
    }
  });

  it("recusa o que não é imagem", () => {
    for (const n of ["notas.txt", "video.mov", "proposta.pdf", "foto.jpg.zip", "jpg"]) {
      expect(isImageFile(ficheiro(n))).toBe(false);
    }
  });
});

describe("readDropEntries", () => {
  it("sem a API (jsdom, browsers antigos) devolve []", () => {
    expect(readDropEntries(null)).toEqual([]);
    expect(readDropEntries({} as DataTransfer)).toEqual([]);
  });

  it("lê as entradas e salta o que não é ficheiro ou rebenta", () => {
    const e1 = entradaDeFicheiro("a.jpg");
    const items = [
      { webkitGetAsEntry: () => e1 },
      { webkitGetAsEntry: () => null },
      {
        webkitGetAsEntry: () => {
          throw new Error("texto arrastado");
        },
      },
      {},
    ];
    const dt = { items: Object.assign(items, { length: items.length }) } as unknown as DataTransfer;
    expect(readDropEntries(dt)).toEqual([e1]);
  });
});

describe("expandDropEntries", () => {
  it("lê o readEntries até vir vazio: 300 fotos em três lotes chegam todas", async () => {
    const lote = (i: number) =>
      Array.from({ length: 100 }, (_, j) => entradaDeFicheiro(`f${i}-${j}.jpg`));
    const r = await expandDropEntries([pasta(() => [lote(0), lote(1), lote(2)])]);
    expect(r.files).toHaveLength(300);
    expect(r.capped).toBe(false);
  });

  it("um ficheiro que não se lê fica de fora, sem parar os outros", async () => {
    const r = await expandDropEntries([
      entradaDeFicheiro("a.jpg"),
      entradaDeFicheiro("b.jpg", true),
      entradaDeFicheiro("c.jpg"),
    ]);
    expect(r.files.map((f) => f.name)).toEqual(["a.jpg", "c.jpg"]);
    expect(r.capped).toBe(false);
  });

  it("uma pasta cujo leitor falha conta como vazia", async () => {
    const quebrada = {
      isFile: false,
      isDirectory: true,
      name: "x",
      createReader: () => ({
        readEntries: (_ok: unknown, erro: (e: unknown) => void) => erro(new Error("negado")),
      }),
    } as unknown as FileSystemEntry;
    expect(await expandDropEntries([quebrada])).toEqual({ files: [], capped: false });
  });

  it(`pára nos ${MAX_DROP_FILES} ficheiros e diz que parou`, async () => {
    const muitos = Array.from({ length: MAX_DROP_FILES + 7 }, (_, i) =>
      entradaDeFicheiro(`f${i}.jpg`),
    );
    const r = await expandDropEntries([pasta(() => [muitos])]);
    expect(r.files).toHaveLength(MAX_DROP_FILES);
    expect(r.capped).toBe(true);
  });

  it(`um atalho circular pára nas ${MAX_DROP_ENTRIES} entradas, em vez de nunca acabar`, async () => {
    // Uma pasta que se contém a si própria (um atalho que aponta para cima).
    const circular: FileSystemEntry = pasta(() => [[circular]]);
    const r = await expandDropEntries([circular]);
    expect(r.files).toEqual([]);
    expect(r.capped).toBe(true);
  });
});
