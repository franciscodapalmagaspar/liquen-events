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

/**
 * ── E OS POSTOS DE PARTE TAMBÉM CONTAM (revisão de 17/11) ───────────────
 *
 * Um documento posto de parte enquanto é usado sai do mapa, mas continua
 * aberto na memória até o último acabar. Sem contar esses, uma rajada de
 * pedidos lentos abria documentos sem fim. O tecto é GLOBAL — os do mapa mais
 * os postos de parte ainda em uso —, e quem chega com ele cheio espera que um
 * feche: cada fecho acorda quem espera, e a espera tem prazo (ver abaixo).
 */
const TECTO_DE_DOCUMENTOS = DOCUMENTOS_ABERTOS * 2;
let postosDeParteEmUso = 0;
const aEsperarVaga: (() => void)[] = [];

function documentosVivos(): number {
  return abertos.size + postosDeParteEmUso;
}

/**
 * ── E A ESPERA TEM PRAZO (2.ª revisão de 17/11) ─────────────────────────
 *
 * «Nunca bloqueia para sempre» era verdade só se cada documento em uso acabasse.
 * Três postos de parte pendurados (um armazenamento que não responde, um
 * desenho preso) seguravam a fila inteira, e todos os outros pedidos ficavam
 * à espera até a função morrer aos 60 s. Agora quem espera desiste aos 15 s
 * com `SemVagaParaDocumentos` (as rotas respondem 503, «tenta outra vez»), e
 * um pedido cortado pelo browser sai logo da fila (`PedidoCortado`), sem abrir
 * um documento para ninguém.
 */
export const PRAZO_DA_VAGA_MS = 15_000;

/** A fila de documentos esteve cheia durante todo o prazo. */
export class SemVagaParaDocumentos extends Error {
  constructor() {
    super("Sem vaga para abrir o documento: tenta outra vez.");
    this.name = "SemVagaParaDocumentos";
  }
}

/** Quem pediu foi-se embora enquanto esperava na fila. */
export class PedidoCortado extends Error {
  constructor() {
    super("O pedido foi cortado enquanto esperava na fila.");
    this.name = "PedidoCortado";
  }
}

export type OpcoesDoPedido = { signal?: AbortSignal };

function cabe(chave: string): boolean {
  return abertos.has(chave) || documentosVivos() < TECTO_DE_DOCUMENTOS;
}

/**
 * Espera UMA vez que um documento feche — ou o prazo `fim`, ou o corte. Quem
 * acorda volta a ver se cabe: ver `comDocumento`.
 */
function esperarUmFecho(fim: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new PedidoCortado());
  return new Promise<void>((seguir, desistir) => {
    const acordar = () => {
      limpar();
      seguir();
    };
    const sair = (erro: Error) => {
      limpar();
      const i = aEsperarVaga.indexOf(acordar);
      if (i >= 0) aEsperarVaga.splice(i, 1);
      desistir(erro);
    };
    const cortado = () => sair(new PedidoCortado());
    const relogio = setTimeout(
      () => sair(new SemVagaParaDocumentos()),
      Math.max(0, fim - Date.now()),
    );
    function limpar() {
      clearTimeout(relogio);
      signal?.removeEventListener("abort", cortado);
    }
    aEsperarVaga.push(acordar);
    signal?.addEventListener("abort", cortado, { once: true });
  });
}

function fechar(entrada: Entrada): void {
  void entrada.promessa.then((a) => a.doc.loadingTask.destroy()).catch(() => undefined);
}

/** Abriu-se lugar: quem espera volta a ver se já cabe. */
function acordarQuemEspera(): void {
  for (const acordar of aEsperarVaga.splice(0)) acordar();
}

/** Um posto de parte que estava em uso acabou: fecha-se, e acorda quem espera. */
function fecharPostoDeParte(entrada: Entrada): void {
  postosDeParteEmUso -= 1;
  fechar(entrada);
  acordarQuemEspera();
}

/** Para os testes: o que a memória diz que tem, e o que tem de facto. */
export function medidasDaMemoria(): { bytesEmImagens: number; somaReal: number; vivos: number } {
  let somaReal = 0;
  for (const b of imagens.values()) somaReal += b.length;
  return { bytesEmImagens, somaReal, vivos: documentosVivos() };
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
    if (abertos.get(chave) === nova) {
      abertos.delete(chave);
      acordarQuemEspera();
    }
  });
  while (abertos.size > DOCUMENTOS_ABERTOS) {
    const [maisVelha, velha] = abertos.entries().next().value!;
    abertos.delete(maisVelha);
    velha.despejada = true;
    if (velha.emUso === 0) fechar(velha);
    else postosDeParteEmUso += 1;
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
  signal?: AbortSignal,
  fim: number = Date.now() + PRAZO_DA_VAGA_MS,
): Promise<T> {
  if (signal?.aborted) throw new PedidoCortado();
  // A verificação e a contagem ficam no MESMO tique (revisão independente de
  // 17/11): um fecho acorda todos os que esperam, e com um `await` entre ver
  // que cabe e entrar, vários passavam pelo mesmo lugar livre e o tecto
  // ultrapassava-se. Assim o primeiro a acordar toma-o, e os outros voltam a
  // esperar.
  while (!cabe(chave)) {
    if (Date.now() >= fim) throw new SemVagaParaDocumentos();
    await esperarUmFecho(fim, signal);
    // Cortado no mesmo instante em que acordou: o `acordar` já tirou o
    // ouvinte do corte, e sem isto abria-se um documento para ninguém.
    if (signal?.aborted) throw new PedidoCortado();
  }
  const e = entrada(chave, obterBytes);
  e.emUso += 1;
  try {
    return await trabalho(await e.promessa);
  } finally {
    e.emUso -= 1;
    if (e.despejada && e.emUso === 0) fecharPostoDeParte(e);
  }
}

/** Quantas páginas, e a forma de cada uma (largura ÷ altura). */
export async function formasDasPaginas(
  chave: string,
  obterBytes: () => Promise<Uint8Array>,
  { signal }: OpcoesDoPedido = {},
): Promise<number[]> {
  return comDocumento(chave, obterBytes, async (a) => a.proporcoes, signal);
}

/** O texto de cada página, para o leitor de ecrã — a imagem é só imagem. */
export async function textoDasPaginas(
  chave: string,
  obterBytes: () => Promise<Uint8Array>,
  { signal }: OpcoesDoPedido = {},
): Promise<string[]> {
  return comDocumento(
    chave,
    obterBytes,
    async ({ doc }) => {
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
    },
    signal,
  );
}

/**
 * Os desenhos a meio, por página: dois pedidos da mesma página ao mesmo tempo
 * (o estúdio e a pré-carga das vizinhas) esperam pelo MESMO desenho. Desenhar
 * duas vezes a mesma página do mesmo documento em paralelo punha o `cleanup()`
 * de um debaixo do desenho do outro, e contava os bytes duas vezes para o
 * tecto (revisão de 17/11).
 */
const aDesenhar = new Map<string, DesenhoEmCurso>();

/**
 * Um desenho a meio. O OBJECTO é a identidade da vez: quem o pôs no mapa só o
 * tira de lá se ainda for o seu — entretanto outro pedido pode ter largado
 * este e começado um desenho novo da mesma página.
 */
type DesenhoEmCurso = { readonly pagina: Promise<Buffer | null> };

/** Tira o desenho do mapa, mas só se ainda for esta vez. */
function largarSeAindaFor(id: string, vez: DesenhoEmCurso): void {
  if (aDesenhar.get(id) === vez) aDesenhar.delete(id);
}

/** A página `n` (a contar de 1) em WebP, ou `null` se não existir. */
export async function imagemDaPagina(
  chave: string,
  obterBytes: () => Promise<Uint8Array>,
  n: number,
  largura: Largura,
  { signal }: OpcoesDoPedido = {},
): Promise<Buffer | null> {
  const id = `${chave}:${n}:${largura}`;
  // O prazo é DESTE pedido, também quando se junta ao desenho de outro.
  const fim = Date.now() + PRAZO_DA_VAGA_MS;
  for (;;) {
    const feita = imagens.get(id);
    if (feita) {
      imagens.delete(id);
      imagens.set(id, feita);
      return feita;
    }
    const emCurso = aDesenhar.get(id);
    if (emCurso) {
      try {
        return await esperarComSinal(emCurso.pagina, signal);
      } catch (erro) {
        // O desenho partilhado era de outro pedido, que foi cortado na fila
        // ou chegou ao fim do SEU prazo: este continua cá, com o prazo dele
        // por gastar, e pede-o de novo.
        const deOutro =
          (erro instanceof PedidoCortado && !signal?.aborted) ||
          (erro instanceof SemVagaParaDocumentos && Date.now() < fim);
        if (deOutro) {
          largarSeAindaFor(id, emCurso);
          continue;
        }
        throw erro;
      }
    }
    const vez: DesenhoEmCurso = {
      pagina: desenharPagina(chave, obterBytes, n, largura, id, signal, fim),
    };
    aDesenhar.set(id, vez);
    try {
      return await vez.pagina;
    } finally {
      largarSeAindaFor(id, vez);
    }
  }
}

/** Espera pelo desenho de outro pedido, mas sai logo se ESTE for cortado. */
function esperarComSinal<T>(promessa: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promessa;
  if (signal.aborted) return Promise.reject(new PedidoCortado());
  return new Promise<T>((seguir, desistir) => {
    const cortado = () => desistir(new PedidoCortado());
    signal.addEventListener("abort", cortado, { once: true });
    promessa.then(
      (v) => {
        signal.removeEventListener("abort", cortado);
        seguir(v);
      },
      (e) => {
        signal.removeEventListener("abort", cortado);
        desistir(e);
      },
    );
  });
}

async function desenharPagina(
  chave: string,
  obterBytes: () => Promise<Uint8Array>,
  n: number,
  largura: Largura,
  id: string,
  signal: AbortSignal | undefined,
  fim: number,
): Promise<Buffer | null> {
  const webp = await comDocumento(
    chave,
    obterBytes,
    async ({ doc }) => {
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
    },
    signal,
    fim,
  );
  if (!webp) return null;

  // Só se soma o que ainda lá não está: a mesma página guardada duas vezes
  // deixava a conta acima do que a memória tem de facto.
  const entretanto = imagens.get(id);
  if (entretanto) return entretanto;
  imagens.set(id, webp);
  bytesEmImagens += webp.length;
  while (bytesEmImagens > TECTO_IMAGENS && imagens.size > 1) {
    const [maisVelha, b] = imagens.entries().next().value!;
    imagens.delete(maisVelha);
    bytesEmImagens -= b.length;
  }
  return webp;
}
