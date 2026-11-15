import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { PDFDocument, PDFName, PDFRawStream, PDFArray } from "pdf-lib";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF DESMONTADO — AS IMAGENS À PARTE, O RESTO NUM «ESQUELETO» (fase 2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `docs/ARQUIVO-DE-PDFS.md`, §6 e §7. 98 % dos bytes de um PDF de proposta são
 * JPEG embutidas TAL E QUAL (`DCTDecode`): o `pdf-lib` grava os bytes que o
 * `sharp` fez, sem os reinterpretar. Cortam-se essas sequências do ficheiro,
 * guardam-se pelo resumo do conteúdo (a mesma foto, na mesma caixa, em duas
 * versões da mesma proposta é a MESMA sequência — guarda-se uma vez), e o que
 * sobra é o esqueleto (~35 KB comprimido).
 *
 * Remontar é concatenar: o esqueleto, e em cada corte os bytes da imagem.
 * Não se reinterpreta nada, por isso não depende do código do desenho, das
 * fontes, das fotos nem do `sharp` — só destes bytes.
 *
 * ── A PROVA ──────────────────────────────────────────────────────────────
 *
 * Um desmontado só vale se a remontagem der o `sha256` do PDF original. Isso
 * prova-se NO MOMENTO ({@link provar}), a partir do esqueleto SERIALIZADO (o
 * que vai para o armazenamento, comprimido) — e não da estrutura em memória.
 *
 * Este módulo não toca no armazenamento: é puro, para se poder testar e usar
 * no script de recolha. O armazenamento está em `arquivo.ts`.
 */

/** O que abre um esqueleto serializado: o formato e a versão. */
const MAGIA = "LQESQ1\n";

/** Uma imagem mais pequena do que isto fica no esqueleto: não vale um ficheiro. */
export const MINIMO_POR_IMAGEM = 2048;

/** Um corte: onde estava, quanto media, e o resumo dos bytes. */
export interface Corte {
  /** A posição no PDF ORIGINAL. */
  pos: number;
  tamanho: number;
  sha256: string;
}

export interface Desmontado {
  /** O resumo do PDF inteiro — o que a remontagem tem de dar. */
  pdfSha256: string;
  pdfBytes: number;
  cortes: Corte[];
  /** As imagens, pelo resumo (uma vez cada, mesmo que apareçam duas vezes). */
  imagens: Map<string, Buffer>;
  /** O esqueleto serializado e comprimido: o que vai para o armazenamento. */
  esqueleto: Buffer;
}

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** As sequências de bytes das JPEG embutidas no PDF, pela ordem dos objectos. */
async function jpegsEmbutidas(pdf: Uint8Array): Promise<Uint8Array[]> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false, ignoreEncryption: true });
  const saida: Uint8Array[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (obj.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
    const filtro = obj.dict.get(PDFName.of("Filter"));
    const dct =
      filtro === PDFName.of("DCTDecode") ||
      (filtro instanceof PDFArray &&
        filtro.size() === 1 &&
        filtro.get(0) === PDFName.of("DCTDecode"));
    if (!dct) continue;
    if (obj.contents.length >= MINIMO_POR_IMAGEM) saida.push(obj.contents);
  }
  return saida;
}

/** O cabeçalho e o resto, serializados e comprimidos. */
function serializar(
  cabecalho: { sha256: string; bytes: number; cortes: [number, number, string][] },
  resto: Buffer,
): Buffer {
  const topo = Buffer.from(`${MAGIA}${JSON.stringify({ v: 1, ...cabecalho })}\n`, "utf8");
  // `gzipSync` grava a data a zero: o mesmo PDF dá o mesmo esqueleto.
  return gzipSync(Buffer.concat([topo, resto]), { level: 9 });
}

/** O que um esqueleto diz de si: o PDF que remonta, e os cortes. */
export interface EsqueletoLido {
  pdfSha256: string;
  pdfBytes: number;
  cortes: Corte[];
  resto: Buffer;
}

/** Lê um esqueleto serializado. Lança se não tiver a forma. */
export function lerEsqueleto(serializado: Uint8Array): EsqueletoLido {
  const cru = gunzipSync(serializado);
  if (cru.subarray(0, MAGIA.length).toString("utf8") !== MAGIA) {
    throw new Error("esqueleto: formato desconhecido");
  }
  const fim = cru.indexOf(0x0a, MAGIA.length);
  if (fim < 0) throw new Error("esqueleto: cabeçalho partido");
  const c = JSON.parse(cru.subarray(MAGIA.length, fim).toString("utf8")) as {
    v: number;
    sha256: string;
    bytes: number;
    cortes: [number, number, string][];
  };
  if (c.v !== 1) throw new Error(`esqueleto: versão ${c.v} desconhecida`);
  return {
    pdfSha256: c.sha256,
    pdfBytes: c.bytes,
    cortes: c.cortes.map(([pos, tamanho, sha]) => ({ pos, tamanho, sha256: sha })),
    resto: cru.subarray(fim + 1),
  };
}

/**
 * Desmonta um PDF. Não prova nada: para isso, {@link provar}.
 *
 * Cada JPEG é procurada no ficheiro e cortada na PRIMEIRA ocorrência que não
 * se sobreponha a um corte já feito. Não precisa de ser inequívoca: o que se
 * corta numa posição são exactamente esses bytes, e é isso que se repõe lá.
 */
export async function desmontarPdf(pdf: Uint8Array): Promise<Desmontado> {
  const bytes = Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength);
  const cortes: Corte[] = [];
  const imagens = new Map<string, Buffer>();
  const ocupado: [number, number][] = [];
  const sobrepoe = (a: number, b: number) => ocupado.some(([x, y]) => a < y && x < b);

  for (const jpeg of await jpegsEmbutidas(pdf)) {
    const agulha = Buffer.from(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
    let pos = bytes.indexOf(agulha);
    while (pos >= 0 && sobrepoe(pos, pos + agulha.length)) {
      pos = bytes.indexOf(agulha, pos + 1);
    }
    if (pos < 0) continue;
    const resumo = sha256(agulha);
    cortes.push({ pos, tamanho: agulha.length, sha256: resumo });
    ocupado.push([pos, pos + agulha.length]);
    if (!imagens.has(resumo)) imagens.set(resumo, Buffer.from(agulha));
  }
  cortes.sort((a, b) => a.pos - b.pos);

  const pedacos: Buffer[] = [];
  let i = 0;
  for (const c of cortes) {
    pedacos.push(bytes.subarray(i, c.pos));
    i = c.pos + c.tamanho;
  }
  pedacos.push(bytes.subarray(i));

  const pdfSha256 = sha256(bytes);
  return {
    pdfSha256,
    pdfBytes: bytes.length,
    cortes,
    imagens,
    esqueleto: serializar(
      {
        sha256: pdfSha256,
        bytes: bytes.length,
        cortes: cortes.map((c) => [c.pos, c.tamanho, c.sha256]),
      },
      Buffer.concat(pedacos),
    ),
  };
}

/** Uma imagem pelo resumo, de onde estiver (memória, armazenamento). */
export type BuscarImagem = (sha256: string) => Promise<Uint8Array | null> | Uint8Array | null;

/** A remontagem não deu o PDF original. Nunca se serve um PDF assim. */
export class RemontagemFalhou extends Error {}

/**
 * Remonta o PDF a partir do esqueleto serializado e das imagens.
 *
 * Confere cada imagem pelo resumo e o PDF inteiro pelo `sha256` do cabeçalho:
 * um byte trocado em qualquer sítio lança {@link RemontagemFalhou}, e nunca
 * devolve um PDF diferente do que foi desmontado.
 */
export async function remontarPdf(esqueleto: Uint8Array, buscar: BuscarImagem): Promise<Buffer> {
  const e = lerEsqueleto(esqueleto);
  const saida = Buffer.allocUnsafe(e.pdfBytes);
  let escrito = 0;
  let lido = 0;
  for (const c of e.cortes) {
    const antes = c.pos - escrito;
    if (antes < 0 || lido + antes > e.resto.length)
      throw new RemontagemFalhou("cortes fora de ordem");
    e.resto.copy(saida, escrito, lido, lido + antes);
    escrito += antes;
    lido += antes;
    const img = await buscar(c.sha256);
    if (!img || img.length !== c.tamanho || sha256(img) !== c.sha256) {
      throw new RemontagemFalhou(`imagem ${c.sha256.slice(0, 12)} em falta ou diferente`);
    }
    saida.set(img, escrito);
    escrito += c.tamanho;
  }
  const falta = e.resto.length - lido;
  if (escrito + falta !== e.pdfBytes) throw new RemontagemFalhou("tamanho diferente");
  e.resto.copy(saida, escrito, lido);
  if (sha256(saida) !== e.pdfSha256) throw new RemontagemFalhou("sha256 diferente");
  return saida;
}

/**
 * A prova, no momento: a remontagem do esqueleto SERIALIZADO, com as imagens
 * deste desmontado, dá o `sha256` esperado (o do PDF original, ou o selado)?
 * Nunca lança.
 */
export async function provar(d: Desmontado, esperado = d.pdfSha256): Promise<boolean> {
  try {
    const remontado = await remontarPdf(d.esqueleto, (s) => d.imagens.get(s) ?? null);
    return sha256(remontado) === esperado && d.pdfSha256 === esperado;
  } catch {
    return false;
  }
}

/** As imagens que um conjunto de esqueletos cita — as que nenhuma limpeza pode levar. */
export function imagensCitadasPor(esqueletos: Iterable<Uint8Array>): Set<string> {
  const citadas = new Set<string>();
  for (const s of esqueletos) for (const c of lerEsqueleto(s).cortes) citadas.add(c.sha256);
  return citadas;
}
