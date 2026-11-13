import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  alternarFoto,
  dimensoesDoCabecalho,
  escolhaPorOmissao,
  fotosASubir,
  fotosDoFicheiro,
  MAX_FOTOS_POR_IMPORTACAO,
  inflarNoNavegador,
  tipoDaImagem,
} from "./no-navegador";
import { crc32, zip } from "./fabricar.testkit";
import { escreverZip } from "./zip";

/** Um cabeçalho de PNG com estas dimensões (o resto não interessa aqui). */
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
}

/** Um cabeçalho de JPEG (APP0 e depois SOF0) com estas dimensões. */
function jpeg(w: number, h: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0,
    4,
    0,
    0,
    0xff,
    0xc0,
    0,
    11,
    8,
    h >> 8,
    h & 255,
    w >> 8,
    w & 255,
    3,
    0,
    0,
    0,
  ]);
}

describe("as fotografias, no navegador", () => {
  it("lê as dimensões pelo cabeçalho", () => {
    expect(dimensoesDoCabecalho(png(1600, 900))).toEqual({ w: 1600, h: 900 });
    expect(dimensoesDoCabecalho(jpeg(2000, 1333))).toEqual({ w: 2000, h: 1333 });
    expect(dimensoesDoCabecalho(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("só aceita os formatos que o estúdio carrega", () => {
    expect(tipoDaImagem("ppt/media/a.JPG")).toBe("image/jpeg");
    expect(tipoDaImagem("word/media/b.png")).toBe("image/png");
    expect(tipoDaImagem("ppt/media/c.emf")).toBeNull();
    expect(tipoDaImagem("ppt/media/d.tiff")).toBeNull();
  });

  it("tira as fotos pela ordem, e deixa de fora ícones, formatos e o que falta", async () => {
    const z = zip({
      "ppt/media/grande.jpeg": jpeg(2400, 1600),
      "ppt/media/logo.png": png(120, 60),
      "ppt/media/desenho.emf": new Uint8Array([1, 2, 3]),
      "ppt/media/outra.png": png(800, 1200),
    });
    const r = await fotosDoFicheiro(z, [
      "ppt/media/outra.png",
      "ppt/media/grande.jpeg",
      "ppt/media/logo.png",
      "ppt/media/desenho.emf",
      "ppt/media/naoexiste.jpg",
    ]);
    expect(r.fotos.map((f) => [f.caminho, f.ficheiro.type, f.largura])).toEqual([
      ["ppt/media/outra.png", "image/png", 800],
      ["ppt/media/grande.jpeg", "image/jpeg", 2400],
    ]);
    expect(r.deFora).toEqual([
      { caminho: "ppt/media/logo.png", motivo: "pequena" },
      { caminho: "ppt/media/desenho.emf", motivo: "formato" },
      { caminho: "ppt/media/naoexiste.jpg", motivo: "ilegivel" },
    ]);
  });

  it("o descompressor do navegador tem tecto", async () => {
    const zeros = new Uint8Array(200_000);
    const cru = new Uint8Array(deflateRawSync(zeros));
    await expect(inflarNoNavegador(cru, 1000)).rejects.toThrow();
    expect((await inflarNoNavegador(cru, 300_000)).length).toBe(200_000);
  });

  it("uma foto que mente no tamanho e rebenta o tecto fica de fora, sem partir as outras", async () => {
    const grande = new Uint8Array(200_000);
    const z = escreverZip([
      {
        nome: "ppt/media/bomba.jpg",
        metodo: 8,
        crc32: crc32(grande),
        tamanhoReal: 10,
        dados: new Uint8Array(deflateRawSync(grande)),
      },
    ]);
    const r = await fotosDoFicheiro(z, ["ppt/media/bomba.jpg"], (c) => inflarNoNavegador(c, 1000));
    expect(r.fotos).toEqual([]);
    expect(r.deFora[0].motivo).toBe("ilegivel");
  });
});

describe("o tecto de fotografias por importação", () => {
  const f = (caminho: string, seccao: string, destino: "capa" | "moodboard" = "moodboard") => ({
    caminho,
    seccao,
    destino,
  });
  // A capa, 6 da Cerimónia, 4 das Mesas, 3 do Bar = 14.
  const fotos = [
    f("capa", "Capa", "capa"),
    ...Array.from({ length: 6 }, (_, i) => f(`c${i}`, "Cerimónia")),
    ...Array.from({ length: 4 }, (_, i) => f(`m${i}`, "Mesas")),
    ...Array.from({ length: 3 }, (_, i) => f(`b${i}`, "Bar")),
  ];
  const todas = new Set(fotos.map((x) => x.caminho));

  it("é de 8", () => {
    expect(MAX_FOTOS_POR_IMPORTACAO).toBe(8);
  });

  it("por omissão: a capa e as primeiras de cada secção, à vez, até 8", () => {
    expect(escolhaPorOmissao(fotos, todas)).toEqual([
      "capa",
      "c0",
      "m0",
      "b0",
      "c1",
      "m1",
      "b1",
      "c2",
    ]);
  });

  it("só escolhe as que o navegador conseguiu ler", () => {
    const semAlgumas = new Set([...todas].filter((c) => c !== "capa" && c !== "m0"));
    const e = escolhaPorOmissao(fotos, semAlgumas);
    expect(e).toHaveLength(8);
    expect(e).not.toContain("capa");
    expect(e).not.toContain("m0");
  });

  it("a 9.ª não liga; tirar uma deixa pôr outra", () => {
    const oito = new Set(escolhaPorOmissao(fotos, todas));
    expect(alternarFoto(oito, "c5")).toBeNull();
    const sete = alternarFoto(oito, "c0")!;
    expect(sete.size).toBe(7);
    expect(alternarFoto(sete, "c5")?.size).toBe(8);
  });

  it("nunca sobem mais de 8, mesmo que o conjunto traga mais", () => {
    expect(fotosASubir(fotos, todas).map((x) => x.caminho)).toEqual(
      fotos.slice(0, 8).map((x) => x.caminho),
    );
  });
});
