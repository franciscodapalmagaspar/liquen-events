import "server-only";
import path from "node:path";
import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS DO PDF COMO IMAGENS, DESENHADAS AQUI E NÃO NO TELEMÓVEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela (22/10): «quero que tornes extremamente rápido quando se
 * carrega no botão para ver a proposta online… ao carregar aparecer logo».
 *
 * A primeira versão desenhava o PDF no browser, com o pdf.js. MEDIDO num
 * telemóvel com 4G e o processador ÷4 (`next start`): a primeira página
 * chegava aos 3,4 s, e quase nada disso era a rede — eram 149 KB de leitor e
 * 382 KB de trabalhador a descarregar e a compilar, e depois o desenho, tudo
 * no processador mais lento da cadeia.
 *
 * Aqui o servidor desenha cada página UMA vez, com o mesmo pdf.js (a mesma
 * leitura do ficheiro, as mesmas letras embutidas), e o telemóvel recebe uma
 * fotografia: o que um browser faz mais depressa do que qualquer outra coisa.
 * A página continua a ser o PDF — o mesmo ficheiro que segue em anexo, lido
 * pelo mesmo motor —, só deixa de ser desenhada à mão do cliente.
 *
 * MEDIDO aqui (uma proposta TESTE, 1600 px de largura): 100–200 ms por página.
 *
 * O que fica guardado, e onde:
 *   · o documento aberto, por chave do conteúdo, para as várias páginas do
 *     mesmo casal não o abrirem de novo cada uma (as três últimas);
 *   · cada imagem já feita, até um tecto de memória.
 * Uma revisão da proposta muda a chave (`chaveDoPdf`), e nada de uma versão
 * serve a outra.
 */

/** As larguras que se desenham. Um pedido com outra cai na mais próxima acima. */
export const LARGURAS = [800, 1200, 1600] as const;
export type Largura = (typeof LARGURAS)[number];

export function larguraPedida(pedida: number): Largura {
  for (const l of LARGURAS) if (pedida <= l) return l;
  return LARGURAS[LARGURAS.length - 1];
}

/** Qualidade do WebP: acima disto o ficheiro cresce sem se ver diferença no ecrã. */
const QUALIDADE = 82;
const DOCUMENTOS_ABERTOS = 3;
const TECTO_IMAGENS = 64 * 1024 * 1024;

type Aberto = { doc: PDFDocumentProxy; proporcoes: number[] };
/**
 * ── UM DOCUMENTO EM USO NÃO SE FECHA (registos de 16/11) ─────────────────
 *
 * «Rendering cancelled, page 1», quatro vezes numa tarde. O estúdio pede
 * várias páginas ao mesmo tempo, e no rascunho cada página é um documento com
 * chave própria. Só ficam `DOCUMENTOS_ABERTOS`: o que chegava a seguir fechava
 * o mais velho com `destroy()` — que ainda estava a ser desenhado —, e o pdf.js
 * cancelava esse desenho. Não era o browser a desistir: era o servidor a
 * cancelar-se a si próprio, e o pedido respondia 500.
 *
 * Cada entrada conta quem a está a usar. Posta de parte, só se fecha quando o
 * último acabar; a memória continua com o mesmo tecto, só que o fecho espera.
 */
type Entrada = { promessa: Promise<Aberto>; emUso: number; despejada: boolean };
const abertos = new Map<string, Entrada>();
const imagens = new Map<string, Buffer>();
let bytesEmImagens = 0;

function fechar(entrada: Entrada): void {
  void entrada.promessa.then((a) => a.doc.loadingTask.destroy()).catch(() => undefined);
}

function carregarPdfjs() {
  // A versão «legacy», como o `proposta-de-pdf/leitura.ts`: é a que corre em
  // Node, e é com ela que o pdf.js encontra o `@napi-rs/canvas` para desenhar.
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

/**
 * As letras-padrão do PDF (Helvetica, Times…) não vêm dentro do ficheiro: as
 * propostas antigas, desenhadas com as do pdf-lib, ficavam sem texto nenhum.
 * O pdf.js lê-as daqui, do disco.
 */
const LETRAS_PADRAO = path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/");

function entrada(chave: string, obterBytes: () => Promise<Uint8Array>): Entrada {
  const ja = abertos.get(chave);
  if (ja) {
    abertos.delete(chave);
    abertos.set(chave, ja);
    return ja;
  }
  const promessa = (async () => {
    const [pdfjs, bytes] = await Promise.all([carregarPdfjs(), obterBytes()]);
    // Uma cópia: o pdf.js fica com o buffer que recebe.
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      standardFontDataUrl: LETRAS_PADRAO,
    }).promise;
    const proporcoes: number[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const vista = (await doc.getPage(i)).getViewport({ scale: 1 });
      proporcoes.push(vista.width / vista.height);
    }
    return { doc, proporcoes };
  })();
  const nova: Entrada = { promessa, emUso: 0, despejada: false };
  abertos.set(chave, nova);
  // Uma abertura falhada não fica guardada: o pedido seguinte tenta de novo.
  promessa.catch(() => {
    if (abertos.get(chave) === nova) abertos.delete(chave);
  });
  while (abertos.size > DOCUMENTOS_ABERTOS) {
    const [maisVelha, velha] = abertos.entries().next().value!;
    abertos.delete(maisVelha);
    velha.despejada = true;
    if (velha.emUso === 0) fechar(velha);
  }
  return nova;
}

/**
 * Usa o documento de `chave` durante `trabalho`. A contagem sobe ANTES de se
 * esperar pela abertura — senão um despejo entre a abertura e o uso fechava-o
 * debaixo de quem o ia usar.
 */
async function comDocumento<T>(
  chave: string,
  obterBytes: () => Promise<Uint8Array>,
  trabalho: (a: Aberto) => Promise<T>,
): Promise<T> {
  const e = entrada(chave, obterBytes);
  e.emUso += 1;
  try {
    return await trabalho(await e.promessa);
  } finally {
    e.emUso -= 1;
    if (e.despejada && e.emUso === 0) fechar(e);
  }
}

/** Quantas páginas, e a forma de cada uma (largura ÷ altura). */
export async function formasDasPaginas(
  chave: string,
  obterBytes: () => Promise<Uint8Array>,
): Promise<number[]> {
  return comDocumento(chave, obterBytes, async (a) => a.proporcoes);
}

/** O texto de cada página, para o leitor de ecrã — a imagem é só imagem. */
export async function textoDasPaginas(
  chave: string,
  obterBytes: () => Promise<Uint8Array>,
): Promise<string[]> {
  return comDocumento(chave, obterBytes, async ({ doc }) => {
    const textos: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const conteudo = await (await doc.getPage(i)).getTextContent();
      textos.push(
        conteudo.items
          .map((x) => ("str" in x ? x.str : ""))
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      );
    }
    return textos;
  });
}

/** A página `n` (a contar de 1) em WebP, ou `null` se não existir. */
export async function imagemDaPagina(
  chave: string,
  obterBytes: () => Promise<Uint8Array>,
  n: number,
  largura: Largura,
): Promise<Buffer | null> {
  const id = `${chave}:${n}:${largura}`;
  const feita = imagens.get(id);
  if (feita) {
    imagens.delete(id);
    imagens.set(id, feita);
    return feita;
  }
  const webp = await comDocumento(chave, obterBytes, async ({ doc }) => {
    if (!Number.isInteger(n) || n < 1 || n > doc.numPages) return null;
    const pagina = await doc.getPage(n);
    const vista = pagina.getViewport({ scale: largura / pagina.getViewport({ scale: 1 }).width });
    // Em Node a fábrica do pdf.js dá telas do `@napi-rs/canvas`, que sabem
    // codificar WebP sozinhas (e fora da linha principal).
    const fabrica = doc.canvasFactory as {
      create(w: number, h: number): { canvas: { encode(f: "webp", q: number): Promise<Buffer> } };
    };
    const { canvas } = fabrica.create(Math.floor(vista.width), Math.floor(vista.height));
    await pagina.render({ canvas: canvas as unknown as HTMLCanvasElement, viewport: vista })
      .promise;
    pagina.cleanup();
    return canvas.encode("webp", QUALIDADE);
  });
  if (!webp) return null;

  imagens.set(id, webp);
  bytesEmImagens += webp.length;
  while (bytesEmImagens > TECTO_IMAGENS && imagens.size > 1) {
    const [maisVelha, b] = imagens.entries().next().value!;
    imagens.delete(maisVelha);
    bytesEmImagens -= b.length;
  }
  return webp;
}
