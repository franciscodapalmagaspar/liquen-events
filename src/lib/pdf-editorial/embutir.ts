import type { PDFDocument, PDFImage } from "pdf-lib";

/**
 * Embute uma JPEG ou um PNG.
 *
 * Copia para um `Uint8Array` que começa no princípio da imagem: um `Buffer`
 * pequeno do Node vive a meio de uma reserva partilhada, e o `JpegEmbedder` do
 * pdf-lib lê a partir do princípio da RESERVA («SOI not found in JPEG»). É a
 * mesma armadilha que o gerador antigo documenta em `embedImage`.
 */
export async function embedImagem(pdf: PDFDocument, cru: Buffer): Promise<PDFImage | null> {
  const bytes = new Uint8Array(cru);
  const jpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  try {
    return jpg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FOTO ESCOLHIDA QUE JÁ NÃO EXISTE (14/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Em `fotosDasPaginas`, um lugar vazio (`""`) é «automático». Uma foto que ELA
 * escolheu e que não se deixou buscar (foi para a Reciclagem, por exemplo)
 * chegava ao desenho também como `""` — e a página escolhia OUTRA em silêncio.
 * Aconteceu em propostas enviadas a 6/11 e 12/11 (`docs/ARQUIVO-DE-PDFS.md`,
 * §3). A regra (`.claude/rules/propostas.md`): o PDF mostra exactamente o que
 * está no «Fazer proposta» — nunca uma foto diferente.
 *
 * Por isso a resolução escreve `em-falta:<caminho>` nesse lugar, e o desenho
 * guarda-lhe o sítio vazio em vez de o dar ao automático.
 */
export const PREFIXO_FOTO_EM_FALTA = "em-falta:";

/** Este lugar tem uma foto escolhida que não se deixou buscar? */
export const eFotoEmFalta = (dado: string | null | undefined): boolean =>
  typeof dado === "string" && dado.startsWith(PREFIXO_FOTO_EM_FALTA);

/** O lugar de uma foto escolhida que falta, com o caminho dela. */
export const marcaDeFotoEmFalta = (ref: string) => `${PREFIXO_FOTO_EM_FALTA}${ref}`;

/** Os bytes de uma foto do documento — base64, com ou sem o prefixo `data:`. */
export function bytesDaFoto(dado: string | null | undefined): Buffer | null {
  if (!dado || eFotoEmFalta(dado)) return null;
  const virgula = dado.startsWith("data:") ? dado.indexOf(",") : -1;
  const b64 = virgula >= 0 ? dado.slice(virgula + 1) : dado;
  try {
    const b = Buffer.from(b64, "base64");
    return b.length ? b : null;
  } catch {
    return null;
  }
}
