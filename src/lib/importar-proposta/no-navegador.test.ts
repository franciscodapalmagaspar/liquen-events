import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  alternarFoto,
  quantasNovas,
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

describe("o tecto de fotografias NOVAS por importação", () => {
  const f = (caminho: string, seccao: string, destino: "capa" | "moodboard" = "moodboard") => ({
    caminho,
    seccao,
    destino,
  });
  // A capa, 12 da Cerimónia, 8 das Mesas, 4 do Bar = 25.
  const fotos = [
    f("capa", "Capa", "capa"),
    ...Array.from({ length: 12 }, (_, i) => f(`c${i}`, "Cerimónia")),
    ...Array.from({ length: 8 }, (_, i) => f(`m${i}`, "Mesas")),
    ...Array.from({ length: 4 }, (_, i) => f(`b${i}`, "Bar")),
  ];
  const todas = new Set(fotos.map((x) => x.caminho));

  it("é de 200 (13/11): quem manda de facto é o travão do espaço (`fotosQueCabem`)", () => {
    expect(MAX_FOTOS_POR_IMPORTACAO).toBe(200);
  });

  // O tecto efectivo chega de fora (o travão do espaço); estes casos usam 20.
  const T = 20;

  it("por omissão: a capa e as primeiras de cada secção, à vez, até 20", () => {
    const e = escolhaPorOmissao(fotos, todas, undefined, T);
    expect(e).toHaveLength(20);
    expect(e.slice(0, 7)).toEqual(["capa", "c0", "m0", "b0", "c1", "m1", "b1"]);
  });

  it("só escolhe as que o navegador conseguiu ler", () => {
    const semAlgumas = new Set([...todas].filter((c) => c !== "capa" && c !== "m0"));
    const e = escolhaPorOmissao(fotos, semAlgumas, undefined, T);
    expect(e).toHaveLength(20);
    expect(e).not.toContain("capa");
    expect(e).not.toContain("m0");
  });

  it("a 21.ª nova não liga; tirar uma deixa pôr outra", () => {
    const vinte = new Set(escolhaPorOmissao(fotos, todas, undefined, T));
    const fora = fotos.map((x) => x.caminho).find((c) => !vinte.has(c))!;
    expect(alternarFoto(vinte, fora, undefined, T)).toBeNull();
    const dezanove = alternarFoto(vinte, "c0", undefined, T)!;
    expect(dezanove.size).toBe(19);
    expect(alternarFoto(dezanove, fora, undefined, T)?.size).toBe(20);
  });

  it("nunca sobem mais de 20, mesmo que o conjunto traga mais", () => {
    expect(fotosASubir(fotos, todas, undefined, T).map((x) => x.caminho)).toEqual(
      fotos.slice(0, 20).map((x) => x.caminho),
    );
  });

  it("25 fotografias, 10 já guardadas: ficam as 25 escolhidas e sobem só as 15 novas", () => {
    const existentes = new Set(fotos.slice(0, 10).map((x) => x.caminho));
    const escolhidas = new Set(escolhaPorOmissao(fotos, todas, existentes, T));
    expect(escolhidas.size).toBe(25);
    expect(quantasNovas(escolhidas, existentes)).toBe(15);
    const sobem = fotosASubir(fotos, escolhidas, existentes, T);
    expect(sobem).toHaveLength(15);
    expect(sobem.some((x) => existentes.has(x.caminho))).toBe(false);
  });

  it("uma já guardada liga sempre, mesmo com o tecto de novas cheio", () => {
    const existentes = new Set(["b3"]);
    const cheias = new Set(
      fotos
        .filter((x) => x.caminho !== "b3")
        .slice(0, 20)
        .map((x) => x.caminho),
    );
    expect(quantasNovas(cheias, existentes)).toBe(20);
    expect(alternarFoto(cheias, "b3", existentes, T)?.has("b3")).toBe(true);
  });
});
