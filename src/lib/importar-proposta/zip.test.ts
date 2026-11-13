import { describe, it, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import {
  emagrecerParaEnvio,
  escreverZip,
  FicheiroIlegivel,
  lerDirectorio,
  MAX_ENTRADAS,
  pareceZip,
} from "./zip";
import { lerTextosDoZip, MAX_XML_POR_ENTRADA } from "./zip-node";
import { crc32, entrada, JPEG_FALSO, zip } from "./fabricar.testkit";

describe("o leitor de ZIP", () => {
  it("lê as entradas, comprimidas e guardadas, e devolve o texto", () => {
    const z = escreverZip([
      entrada("a.xml", "<a>olá</a>"),
      entrada("pasta/b.rels", "<b/>", true),
      entrada("ppt/media/x.jpeg", JPEG_FALSO, true),
    ]);
    expect(pareceZip(z)).toBe(true);
    expect(lerDirectorio(z).map((e) => e.nome)).toEqual([
      "a.xml",
      "pasta/b.rels",
      "ppt/media/x.jpeg",
    ]);
    const textos = lerTextosDoZip(z);
    expect(textos.get("a.xml")).toBe("<a>olá</a>");
    expect(textos.get("pasta/b.rels")).toBe("<b/>");
    // As imagens não são texto: o servidor nem as descomprime.
    expect(textos.has("ppt/media/x.jpeg")).toBe(false);
  });

  it("recusa o que não é ZIP, com uma frase em português", () => {
    expect(() => lerDirectorio(new TextEncoder().encode("isto não é um zip"))).toThrow(
      FicheiroIlegivel,
    );
    expect(() => lerDirectorio(new Uint8Array(0))).toThrow(/Word/);
  });

  it("recusa um ZIP cortado a meio", () => {
    const z = zip({ "a.xml": "<a/>".repeat(100) });
    expect(() => lerDirectorio(z.subarray(0, z.length - 10))).toThrow(FicheiroIlegivel);
    expect(() => lerDirectorio(z.subarray(0, 40))).toThrow(FicheiroIlegivel);
  });

  it("recusa posições que saem do ficheiro (directório adulterado)", () => {
    const z = zip({ "a.xml": "<a/>" });
    const mau = z.slice();
    // A posição do directório central, no registo do fim, aponta para fora.
    new DataView(mau.buffer).setUint32(mau.length - 6, 0x7fffffff, true);
    expect(() => lerDirectorio(mau)).toThrow(FicheiroIlegivel);
  });

  it("recusa entradas cifradas (documento com palavra-passe)", () => {
    const e = entrada("a.xml", "<a/>");
    const z = escreverZip([e]);
    const v = new DataView(z.buffer);
    // O bit 0 das flags, no directório central.
    const fim = z.length - 22;
    const central = v.getUint32(fim + 16, true);
    v.setUint16(central + 8, 1, true);
    expect(() => lerDirectorio(z)).toThrow(/palavra-passe/);
  });

  it("recusa ZIP64 e entradas a mais", () => {
    const z = zip({ "a.xml": "<a/>" });
    const v = new DataView(z.buffer);
    v.setUint16(z.length - 22 + 10, 0xffff, true);
    expect(() => lerDirectorio(z)).toThrow(/grande demais/);
    const muitos = escreverZip(
      Array.from({ length: MAX_ENTRADAS + 1 }, (_, i) => entrada(`x${i}.xml`, "<a/>", true)),
    );
    expect(() => lerDirectorio(muitos)).toThrow(/partes a mais/);
  });

  it("corta uma bomba de ZIP sem a descomprimir inteira", () => {
    // 20 MB de zeros comprimem para ~20 KB — e diz-se, mentindo, que são 10 bytes.
    const zeros = new Uint8Array(MAX_XML_POR_ENTRADA + 4 * 1024 * 1024);
    const comprimido = new Uint8Array(deflateRawSync(zeros));
    const bomba = escreverZip([
      {
        nome: "word/document.xml",
        metodo: 8,
        crc32: crc32(zeros),
        tamanhoReal: 10,
        dados: comprimido,
      },
    ]);
    expect(bomba.length).toBeLessThan(100_000);
    expect(() => lerTextosDoZip(bomba)).toThrow(/texto a mais/);
  });

  it("recusa um tamanho declarado acima do tecto antes de descomprimir", () => {
    const bomba = escreverZip([
      {
        nome: "a.xml",
        metodo: 8,
        crc32: 0,
        tamanhoReal: MAX_XML_POR_ENTRADA + 1,
        dados: new Uint8Array([3, 0]),
      },
    ]);
    expect(() => lerTextosDoZip(bomba)).toThrow(/texto a mais/);
  });

  it("um deflate estragado dá «danificado», não um erro do zlib", () => {
    const z = escreverZip([
      {
        nome: "a.xml",
        metodo: 8,
        crc32: 0,
        tamanhoReal: 5,
        dados: new Uint8Array([0xff, 0xff, 0xff]),
      },
    ]);
    expect(() => lerTextosDoZip(z)).toThrow(/danificado/);
  });

  it("emagrecer deixa só o texto, e o resultado continua a ler-se igual", () => {
    const grande = new Uint8Array(200_000).fill(7);
    const z = escreverZip([
      entrada("word/document.xml", "<w:document>texto</w:document>"),
      entrada("word/_rels/document.xml.rels", "<Relationships/>"),
      entrada("word/media/image1.jpeg", grande, true),
    ]);
    const magro = emagrecerParaEnvio(z);
    expect(magro.length).toBeLessThan(2000);
    expect(lerDirectorio(magro).map((e) => e.nome)).toEqual([
      "word/document.xml",
      "word/_rels/document.xml.rels",
    ]);
    expect(lerTextosDoZip(magro).get("word/document.xml")).toBe("<w:document>texto</w:document>");
  });
});
