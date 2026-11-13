import { describe, it, expect } from "vitest";
import { extrairConteudo, porqueNaoE } from "./extrair";
import { lerXml, descendentes, decodificar } from "./xml";
import { docx, pptx, zip } from "./fabricar.testkit";
import { FicheiroIlegivel } from "./zip";

describe("o XML", () => {
  it("decodifica entidades e ignora um DOCTYPE (sem entidades declaradas)", () => {
    expect(decodificar("a &amp; b &#233; &#xE7; &lt;")).toBe("a & b é ç <");
    const raiz = lerXml('<!DOCTYPE x [<!ENTITY a "aaaa">]><r><t>&a;&amp;</t></r>');
    const t = descendentes(raiz, "t")[0];
    expect(t.filhos.join("")).toBe("&a;&");
  });

  it("aguenta XML mal fechado e muito fundo sem rebentar", () => {
    expect(() => lerXml("<a><b><c>texto</a></zzz>")).not.toThrow();
    const fundo = "<x>".repeat(5000) + "fim" + "</x>".repeat(5000);
    expect(() => descendentes(lerXml(fundo), "x")).not.toThrow();
  });
});

describe("o .docx", () => {
  it("lê títulos de estilo (também no Word português), listas, tabelas e imagens", () => {
    const c = extrairConteudo(
      docx([
        "Proposta de Decoração",
        "Ana Teste & Rui Exemplo",
        { img: "capa.jpeg" },
        { h: 1, t: "Decoração da Cerimónia" },
        { li: "Arco de flores" },
        { li: "com eucalipto", nivel: 1 },
        { li: "Passadeira" },
        { img: "cerimonia1.jpeg" },
        { img: "cerimonia2.png" },
        { h: 1, t: "Orçamento" },
        {
          tabela: [
            ["Decoração da cerimónia", "1.200,00 €"],
            ["Total", "3.000,00 € + IVA"],
          ],
        },
      ]),
    );
    expect(c.formato).toBe("docx");
    expect(c.seccoes.map((s) => s.titulo)).toEqual(["", "Decoração da Cerimónia", "Orçamento"]);
    expect(c.seccoes[0].imagens).toEqual(["word/media/capa.jpeg"]);
    expect(c.seccoes[1].blocos).toEqual([
      { tipo: "item", texto: "Arco de flores", nivel: 0 },
      { tipo: "item", texto: "com eucalipto", nivel: 1 },
      { tipo: "item", texto: "Passadeira", nivel: 0 },
    ]);
    expect(c.seccoes[1].imagens).toEqual([
      "word/media/cerimonia1.jpeg",
      "word/media/cerimonia2.png",
    ]);
    expect(c.seccoes[2].blocos[0]).toEqual({
      tipo: "tabela",
      linhas: [
        ["Decoração da cerimónia", "1.200,00 €"],
        ["Total", "3.000,00 € + IVA"],
      ],
    });
  });

  it("sem estilos de título, usa as linhas curtas a negrito — e avisa", () => {
    const c = extrairConteudo(
      docx(["Introdução qualquer.", { b: "Mesas" }, "Centros baixos", "Velas"], { estilos: false }),
    );
    expect(c.seccoes.map((s) => s.titulo)).toEqual(["", "Mesas"]);
    expect(c.avisos.join(" ")).toMatch(/negrito/);
  });

  it("com estilos de título, um negrito solto NÃO parte a secção", () => {
    const c = extrairConteudo(docx([{ h: 1, t: "Mesas" }, { b: "Nota" }, "Centros"]));
    expect(c.seccoes.map((s) => s.titulo)).toEqual(["Mesas"]);
  });

  it("um .docx sem document.xml é recusado", () => {
    const z = zip({
      "[Content_Types].xml": "<Types>wordprocessingml.document</Types>",
      "word/styles.xml": "<x/>",
    });
    expect(() => extrairConteudo(z)).toThrow(FicheiroIlegivel);
  });
});

describe("o .pptx", () => {
  it("segue a ordem da apresentação, lê títulos, marcadores, tabelas e imagens, e salta os escondidos", () => {
    const c = extrairConteudo(
      pptx([
        { titulo: "Casamento Ana & Rui", texto: ["12 de setembro de 2026"], imagens: ["capa.jpg"] },
        { titulo: "Escondido", escondido: true },
        {
          titulo: "Cerimónia",
          marcadores: ["Arco floral", "  com rosas", "Cadeiras"],
          imagens: ["a.jpg", "b.jpg"],
        },
        {
          titulo: "Orçamento",
          tabela: [
            ["Cerimónia", "900 €"],
            ["Total", "2.500 €"],
          ],
        },
      ]),
    );
    expect(c.formato).toBe("pptx");
    expect(c.seccoes.map((s) => s.titulo)).toEqual([
      "Casamento Ana & Rui",
      "Cerimónia",
      "Orçamento",
    ]);
    expect(c.seccoes.map((s) => s.origem)).toEqual([
      "Diapositivo 1",
      "Diapositivo 3",
      "Diapositivo 4",
    ]);
    expect(c.seccoes[0].imagens).toEqual(["ppt/media/capa.jpg"]);
    expect(c.seccoes[0].blocos).toEqual([
      { tipo: "paragrafo", texto: "12 de setembro de 2026", tamanho: 14 },
    ]);
    expect(c.seccoes[1].blocos).toEqual([
      { tipo: "item", texto: "Arco floral", nivel: 0 },
      { tipo: "item", texto: "com rosas", nivel: 1 },
      { tipo: "item", texto: "Cadeiras", nivel: 0 },
    ]);
    expect(c.seccoes[1].imagens).toEqual(["ppt/media/a.jpg", "ppt/media/b.jpg"]);
    expect(c.seccoes[2].blocos[0].tipo).toBe("tabela");
    expect(c.avisos).toEqual(["Um diapositivo estava escondido e ficou de fora."]);
  });
});

describe("os bytes mágicos", () => {
  it("recusa Word/PowerPoint antigos e PDF com o que fazer", () => {
    expect(porqueNaoE(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).toMatch(/Guardar como/);
    expect(porqueNaoE(new TextEncoder().encode("%PDF-1.7"))).toMatch(/PDF/);
    expect(porqueNaoE(new TextEncoder().encode("olá"))).toMatch(/não parece/);
    expect(porqueNaoE(docx(["x"]))).toBeNull();
  });

  it("um ZIP que não é Office é recusado", () => {
    expect(() => extrairConteudo(zip({ "outro.xml": "<a/>" }))).toThrow(/não parece/);
  });
});
