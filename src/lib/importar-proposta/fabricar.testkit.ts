import { deflateRawSync } from "node:zlib";
import { escreverZip, type EntradaCrua } from "./zip";

/**
 * Fábrica de .docx e .pptx PEQUENOS para os testes — escritos aqui, com dados
 * inventados. Nunca um documento verdadeiro de uma cliente no repositório.
 */

const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABELA[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function entrada(nome: string, conteudo: string | Uint8Array, guardar = false): EntradaCrua {
  const dados = typeof conteudo === "string" ? new TextEncoder().encode(conteudo) : conteudo;
  return {
    nome,
    metodo: guardar ? 0 : 8,
    crc32: crc32(dados),
    tamanhoReal: dados.length,
    dados: guardar ? dados : new Uint8Array(deflateRawSync(dados)),
  };
}

/** As imagens vão GUARDADAS (sem deflate), como o Office faz muitas vezes —
 *  e é o que deixa o teste do ecrã correr sem descompressor. */
export function zip(ficheiros: Record<string, string | Uint8Array>): Uint8Array {
  return escreverZip(Object.entries(ficheiros).map(([n, c]) => entrada(n, c, /\/media\//.test(n))));
}

/** Um «JPEG» de mentira: só os bytes do início, que chegam para o que se testa. */
export const JPEG_FALSO = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type ParagrafoDocx =
  | string
  | { h: 1 | 2; t: string }
  | { b: string }
  | { li: string; nivel?: number }
  | { img: string }
  | { tabela: string[][] };

const W =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

/** Um .docx com estes parágrafos. As imagens ficam em `word/media/<nome>`. */
export function docx(paragrafos: ParagrafoDocx[], opcoes: { estilos?: boolean } = {}): Uint8Array {
  const rels: string[] = [];
  const media: Record<string, Uint8Array> = {};
  const corpo = paragrafos
    .map((p) => {
      if (typeof p === "string")
        return `<w:p><w:r><w:t xml:space="preserve">${esc(p)}</w:t></w:r></w:p>`;
      if ("h" in p) {
        return `<w:p><w:pPr><w:pStyle w:val="Ttulo${p.h}"/></w:pPr><w:r><w:t>${esc(p.t)}</w:t></w:r></w:p>`;
      }
      if ("b" in p) return `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${esc(p.b)}</w:t></w:r></w:p>`;
      if ("li" in p) {
        return `<w:p><w:pPr><w:numPr><w:ilvl w:val="${p.nivel ?? 0}"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${esc(p.li)}</w:t></w:r></w:p>`;
      }
      if ("img" in p) {
        const id = `rIdImg${rels.length + 1}`;
        rels.push(
          `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${p.img}"/>`,
        );
        media[`word/media/${p.img}`] = JPEG_FALSO;
        return `<w:p><w:r><w:drawing><a:graphic><a:graphicData><a:blip r:embed="${id}"/></a:graphicData></a:graphic></w:drawing></w:r></w:p>`;
      }
      const linhas = p.tabela
        .map(
          (l) =>
            `<w:tr>${l.map((c) => `<w:tc><w:p><w:r><w:t>${esc(c)}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`,
        )
        .join("");
      return `<w:tbl>${linhas}</w:tbl>`;
    })
    .join("");
  const estilos =
    opcoes.estilos === false
      ? ""
      : `<?xml version="1.0"?><w:styles ${W}><w:style w:type="paragraph" w:styleId="Ttulo1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Ttulo2"><w:name w:val="heading 2"/></w:style></w:styles>`;
  return zip({
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${corpo}<w:sectPr/></w:body></w:document>`,
    ...(estilos ? { "word/styles.xml": estilos } : {}),
    "word/_rels/document.xml.rels": `<?xml version="1.0"?><Relationships>${rels.join("")}</Relationships>`,
    ...media,
  });
}

export interface DiapositivoDeTeste {
  titulo?: string;
  /** Texto numa caixa de conteúdo: cada linha é um marcador. */
  marcadores?: string[];
  /** Texto numa caixa solta (sem marcadores). */
  texto?: string[];
  imagens?: string[];
  escondido?: boolean;
  tabela?: string[][];
}

const P =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

/**
 * Um .pptx com estes diapositivos. Os ficheiros chamam-se ao contrário da
 * ordem (o 1.º é `slide<N>.xml`) — para provar que a ordem vem da apresentação.
 */
export function pptx(diapositivos: DiapositivoDeTeste[]): Uint8Array {
  const ficheiros: Record<string, string | Uint8Array> = {
    "[Content_Types].xml":
      '<?xml version="1.0"?><Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
  };
  const ids: string[] = [];
  const presRels: string[] = [];
  const n = diapositivos.length;
  diapositivos.forEach((d, i) => {
    const num = n - i;
    const rid = `rId${i + 10}`;
    ids.push(`<p:sldId id="${256 + i}" r:id="${rid}"/>`);
    presRels.push(`<Relationship Id="${rid}" Target="slides/slide${num}.xml"/>`);
    const rels: string[] = [];
    const formas: string[] = [];
    if (d.titulo) {
      formas.push(
        `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Título"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${esc(d.titulo)}</a:t></a:r></a:p></p:txBody></p:sp>`,
      );
    }
    if (d.marcadores) {
      formas.push(
        `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Conteúdo"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:txBody>${d.marcadores
          .map((m) => {
            const nivel = m.startsWith("  ") ? ' lvl="1"' : "";
            return `<a:p><a:pPr${nivel}/><a:r><a:t>${esc(m.trim())}</a:t></a:r></a:p>`;
          })
          .join("")}</p:txBody></p:sp>`,
      );
    }
    if (d.texto) {
      formas.push(
        `<p:sp><p:nvSpPr><p:cNvPr id="4" name="Caixa"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:txBody>${d.texto
          .map((t) => `<a:p><a:r><a:rPr sz="1400"/><a:t>${esc(t)}</a:t></a:r></a:p>`)
          .join("")}</p:txBody></p:sp>`,
      );
    }
    if (d.tabela) {
      formas.push(
        `<p:graphicFrame><a:graphic><a:graphicData><a:tbl>${d.tabela
          .map(
            (l) =>
              `<a:tr>${l.map((c) => `<a:tc><a:txBody><a:p><a:r><a:t>${esc(c)}</a:t></a:r></a:p></a:txBody></a:tc>`).join("")}</a:tr>`,
          )
          .join("")}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`,
      );
    }
    for (const im of d.imagens ?? []) {
      const id = `rIdI${rels.length + 1}`;
      rels.push(`<Relationship Id="${id}" Target="../media/${im}"/>`);
      ficheiros[`ppt/media/${im}`] = JPEG_FALSO;
      formas.push(`<p:pic><p:blipFill><a:blip r:embed="${id}"/></p:blipFill></p:pic>`);
    }
    ficheiros[`ppt/slides/slide${num}.xml`] =
      `<?xml version="1.0"?><p:sld ${P}${d.escondido ? ' show="0"' : ""}><p:cSld><p:spTree>${formas.join("")}</p:spTree></p:cSld></p:sld>`;
    ficheiros[`ppt/slides/_rels/slide${num}.xml.rels`] =
      `<?xml version="1.0"?><Relationships>${rels.join("")}</Relationships>`;
  });
  ficheiros["ppt/presentation.xml"] =
    `<?xml version="1.0"?><p:presentation ${P}><p:sldIdLst>${ids.join("")}</p:sldIdLst></p:presentation>`;
  ficheiros["ppt/_rels/presentation.xml.rels"] =
    `<?xml version="1.0"?><Relationships>${presRels.join("")}</Relationships>`;
  return zip(ficheiros);
}
