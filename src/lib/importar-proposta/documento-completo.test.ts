import { describe, it, expect } from "vitest";
import { docx, pptx, zip, JPEG_FALSO } from "./fabricar.testkit";
import { lerTextosDoZip } from "./zip-node";
import {
  documentoEmTexto,
  LeituraIncompleta,
  lerDocxCompleto,
  lerPptxCompleto,
} from "./documento-completo";

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
const r = (t: string) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;

/** Um Word com o que o leitor simples deixa de fora: cabeçalho, rodapé, caixa de texto, legenda. */
function wordCompleto(): Uint8Array {
  const corpo = [
    `<w:p>${r("Proposta TESTE")}</w:p>`,
    // Uma caixa de texto, escrita duas vezes (Choice e Fallback), como o Word faz.
    `<w:p>${r("Antes da caixa")}<w:r><mc:AlternateContent><mc:Choice><w:drawing><w:txbxContent><w:p>${r("Dentro da caixa")}</w:p></w:txbxContent></w:drawing></mc:Choice><mc:Fallback><w:pict><w:txbxContent><w:p>${r("Dentro da caixa")}</w:p></w:txbxContent></w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>`,
    `<w:p><w:r><w:drawing><wp:docPr id="1" descr="Arco TESTE"/><a:graphic><a:graphicData><a:blip r:embed="rIdImg1"/></a:graphicData></a:graphic></w:drawing></w:r></w:p>`,
    `<w:p><w:pPr><w:pStyle w:val="Legenda"/></w:pPr>${r("Figura 1 — arco")}</w:p>`,
    `<w:p><w:del><w:r><w:delText>apagado</w:delText></w:r></w:del>${r("Ficou")}</w:p>`,
    `<w:tbl><w:tr><w:tc><w:p>${r("Flores")}</w:p><w:p>${r("da época")}</w:p></w:tc><w:tc><w:p>${r("300,00 €")}</w:p></w:tc></w:tr></w:tbl>`,
  ].join("");
  return zip({
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "word/document.xml": `<?xml version="1.0"?><w:document ${W}><w:body>${corpo}<w:sectPr/></w:body></w:document>`,
    "word/styles.xml": `<?xml version="1.0"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Legenda"><w:name w:val="caption"/></w:style></w:styles>`,
    "word/_rels/document.xml.rels":
      '<?xml version="1.0"?><Relationships><Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/arco.jpeg"/><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
    "word/header1.xml": `<?xml version="1.0"?><w:hdr ${W}><w:p>${r("Líquen TESTE — papel timbrado")}</w:p></w:hdr>`,
    "word/footer1.xml": `<?xml version="1.0"?><w:ftr ${W}><w:p>${r("NIF 000000000")}</w:p></w:ftr>`,
    "word/media/arco.jpeg": JPEG_FALSO,
  });
}

describe("ler tudo — Word", () => {
  it("lê o corpo, a caixa de texto (uma vez), a tabela, a imagem com descrição e legenda, o cabeçalho e o rodapé", () => {
    const d = lerDocxCompleto(lerTextosDoZip(wordCompleto()));
    const textos = d.unidades.map((u) =>
      u.tipo === "paragrafo"
        ? u.texto
        : u.tipo === "linha-de-tabela"
          ? u.celulas.join("|")
          : `IMG:${u.caminho}`,
    );
    expect(textos).toEqual([
      "Proposta TESTE",
      "Antes da caixa",
      "Dentro da caixa",
      "IMG:word/media/arco.jpeg",
      "Figura 1 — arco",
      "Ficou",
      "Flores\nda época|300,00 €",
      "Líquen TESTE — papel timbrado",
      "NIF 000000000",
    ]);
    const im = d.unidades.find((u) => u.tipo === "imagem")!;
    expect(im).toMatchObject({
      imagem: "im1",
      descricao: "Arco TESTE",
      legenda: "Figura 1 — arco",
    });
    expect(d.partes.map((p) => p.tipo)).toEqual(["corpo", "cabecalho", "rodape"]);
    expect(d.contagem.origem).toEqual(d.contagem.representacao);
    expect(d.contagem.origem.imagens).toBe(1);
  });

  it("a representação em texto leva os ids e as marcas", () => {
    const t = documentoEmTexto(
      lerDocxCompleto(lerTextosDoZip(docx([{ h: 1, t: "Cerimónia" }, { li: "Arco" }]))),
    );
    expect(t).toMatch(/\[p1\] \(título nível 1, estilo|\[p1\] \(título nível 1/);
    expect(t).toMatch(/\[p2\] \(lista nível 0\) Arco/);
  });
});

describe("ler tudo — PowerPoint", () => {
  it("lê os escondidos (marcados), as notas do orador, a tabela e as imagens pela ordem da apresentação", () => {
    const bytes = pptx([
      { titulo: "Ana TESTE & Rui", imagens: ["capa.jpeg"] },
      { titulo: "Escondido TESTE", texto: ["não mostrado"], escondido: true },
      { titulo: "Orçamento", tabela: [["Flores", "300,00 €"]] },
    ]);
    const textos = lerTextosDoZip(bytes);
    // Notas do orador no diapositivo 1 (ficheiro slide3.xml — a fábrica nomeia ao contrário).
    textos.set(
      "ppt/slides/_rels/slide3.xml.rels",
      textos
        .get("ppt/slides/_rels/slide3.xml.rels")!
        .replace(
          "</Relationships>",
          '<Relationship Id="rN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
        ),
    );
    textos.set(
      "ppt/notesSlides/notesSlide1.xml",
      '<p:notes xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>1</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Lembrar: cliente quer peónias</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>',
    );
    const d = lerPptxCompleto(textos);
    expect(d.partes.map((p) => [p.id, p.escondido ?? false])).toEqual([
      ["d1", false],
      ["d2", true],
      ["d3", false],
    ]);
    const notas = d.unidades.filter((u) => u.tipo === "paragrafo" && u.papel === "notas");
    expect(notas.map((u) => (u as { texto: string }).texto)).toEqual([
      "Lembrar: cliente quer peónias",
    ]);
    expect(d.unidades.some((u) => u.tipo === "paragrafo" && u.texto === "não mostrado")).toBe(true);
    expect(
      d.unidades.some((u) => u.tipo === "linha-de-tabela" && u.celulas[1] === "300,00 €"),
    ).toBe(true);
    expect(d.imagens).toEqual([{ id: "im1", caminho: "ppt/media/capa.jpeg", ocorrencias: 1 }]);
    expect(documentoEmTexto(d)).toMatch(/\[d2\] Diapositivo 2 \(ESCONDIDO\)/);
  });

  it("FALHA quando a representação não bate com o ficheiro (texto numa forma que o leitor não percorre)", () => {
    const textos = lerTextosDoZip(pptx([{ titulo: "Proposta TESTE" }]));
    const c = "ppt/slides/slide1.xml";
    // Um conector com texto: o leitor não o lê, a contagem simples conta-o.
    textos.set(
      c,
      textos
        .get(c)!
        .replace(
          "</p:spTree>",
          "<p:cxnSp><p:txBody><a:p><a:r><a:t>Total 999,00 €</a:t></a:r></a:p></p:txBody></p:cxnSp></p:spTree>",
        ),
    );
    expect(() => lerPptxCompleto(textos)).toThrow(LeituraIncompleta);
  });
});
