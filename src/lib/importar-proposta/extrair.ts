import "server-only";
import { FicheiroIlegivel, pareceZip } from "./zip";
import { lerTextosDoZip } from "./zip-node";
import { lerDocx } from "./docx";
import { lerPptx } from "./pptx";
import type { ConteudoImportado, FormatoImportado } from "./tipos";

/**
 * Do ficheiro ao conteúdo: confere o tipo pelos BYTES (não pelo nome, que se
 * muda à mão) e chama o leitor certo.
 *
 * Os formatos antigos (.doc, .ppt) e os PDF são recusados com a frase que diz
 * o que fazer — abrir e guardar como .docx/.pptx — em vez de um «formato
 * inválido» que não ajuda ninguém.
 */
export function porqueNaoE(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    return "Este é um ficheiro do Word ou do PowerPoint antigo (.doc ou .ppt). Abre-o e usa «Guardar como» .docx ou .pptx, e depois importa esse.";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return "Isto é um PDF. Para importar, usa o ficheiro original do Word (.docx) ou do PowerPoint (.pptx).";
  }
  if (!pareceZip(bytes)) {
    return "Este ficheiro não parece um documento do Word (.docx) nem do PowerPoint (.pptx).";
  }
  return null;
}

/** Qual dos dois é, pelo `[Content_Types].xml` e, à falta dele, pelas pastas. */
export function formatoDe(textos: Map<string, string>): FormatoImportado | null {
  const tipos = textos.get("[Content_Types].xml") ?? "";
  if (/wordprocessingml\.(document|template)/.test(tipos) || textos.has("word/document.xml")) {
    return "docx";
  }
  if (
    /presentationml\.(presentation|slideshow|template)/.test(tipos) ||
    textos.has("ppt/presentation.xml")
  ) {
    return "pptx";
  }
  return null;
}

export function extrairConteudo(bytes: Uint8Array): ConteudoImportado {
  const recusa = porqueNaoE(bytes);
  if (recusa) throw new FicheiroIlegivel(recusa);
  const textos = lerTextosDoZip(bytes);
  const formato = formatoDe(textos);
  if (formato === "docx") return lerDocx(textos);
  if (formato === "pptx") return lerPptx(textos);
  throw new FicheiroIlegivel(
    "Este ficheiro não parece um documento do Word (.docx) nem do PowerPoint (.pptx).",
  );
}
