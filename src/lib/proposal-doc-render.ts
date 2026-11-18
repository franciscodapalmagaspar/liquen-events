import "server-only";
import sharp from "sharp";
import { criarCachePorBytes } from "@/lib/cache-por-bytes";
import { guardarFotoEditorial, lerFotoEditorialGuardada } from "@/lib/fotos-editoriais-guardadas";
import { isPendingImage, type ProposalDoc, withProposalDefaults } from "@/lib/proposal-doc";
import type { DocTruncation } from "@/lib/pdf-editorial/cortes";
import { marcaDepoisDeMexer } from "@/lib/proposal-moodboard";
import { fetchProposalImageBytes } from "@/lib/proposal-storage";
import { log } from "@/lib/logger";
import { IDIOMA_POR_OMISSAO, type IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import {
  conteudoDoEditorial,
  planoDoEditorial,
  renderEditorialPdf,
  type FontesDasFotos,
  type FotosDoPdf,
  type Medida,
} from "@/lib/pdf-editorial/montar";
import { marcaDeFotoEmFalta } from "@/lib/pdf-editorial/embutir";
import { semAsQueFaltam } from "@/lib/pdf-editorial/sem-as-que-faltam";
import { refsQueJaNaoExistem, type OpcoesDaPergunta } from "@/lib/proposta-fotos-verificacao";
import {
  CHAVE_DA_CAPA,
  FOTOS_NO_TECTO_DO_PDF,
  fotosEscolhidasDoDocumento,
  fotosNoTectoDoPdf,
  preenchida,
} from "@/lib/fotos-escolhidas";
import { aFaltaDaCapaTrava, haFotoNaInspiracao } from "@/lib/pdf-editorial/regra-da-capa";
import type { ConteudoWeb } from "@/lib/pdf-editorial/conteudo-web";
import { formasDeCaminhosOuErro } from "@/lib/biblioteca-fotos-store";
import { focoAutomatico, LADO_PAGINA, pixeisDaCaixa, type Foco } from "@/lib/pdf-editorial/imagens";
import { FOLHA } from "@/lib/pdf-editorial/moldura";

// Bounds on image resolution, so a doc with a huge number of image refs can't
// fan out unbounded concurrent fetches (memory/CPU DoS during render) or embed
// an unreasonable number of images. Each fetch is itself host-restricted, timed
// out and size-capped in fetchProposalImageBytes.
//
// Este limite é também o teto do trabalho do sharp: o gerador só redimensiona
// fotos que passaram por aqui, uma de cada vez (os desenhos são sequenciais),
// e reaproveita por conteúdo a mesma foto desenhada mais do que uma vez. Ou
// seja, no máximo MAX_IMAGES_PER_DOC redimensionamentos e nunca mais do que um
// em simultâneo — bem dentro de FETCH_CONCURRENCY.
const MAX_IMAGES_PER_DOC = FOTOS_NO_TECTO_DO_PDF;
const FETCH_CONCURRENCY = 4;

/**
 * Quantos mood boards se resolvem ao mesmo tempo.
 *
 * O total de downloads em voo é este número vezes {@link FETCH_CONCURRENCY} —
 * ver o bloco «OS MOOD BOARDS DEIXAM DE ESPERAR UNS PELOS OUTROS» para a conta
 * de memória que o fixa em dois.
 */
const BOARDS_EM_PARALELO = 2;

/** Resolve `fn` over `items` with at most `limit` in flight at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * Substitui cada referência de imagem (capa, mood boards e fotografias das
 * páginas) por base64, para o gerador — que não sabe o que é armazenamento — a
 * poder embutir. Cada foto vem do ORIGINAL, reduzida a {@link LADO_EDITORIAL}
 * ({@link fotoEditorial}): no desenho editorial uma foto pode ocupar a página
 * inteira.
 */
async function resolveImages(
  doc: ProposalDoc,
  /**
   * `faltam`: as que SE SABE que já não existem (`refsQueJaNaoExistem`) — não
   * se vão buscar, e saem como uma foto cujos bytes não vieram. É a mesma
   * fonte com que o plano do estúdio e a página do casal as tiram antes do
   * motor (`semAsQueFaltam`): os três vêem o mesmo documento, mesmo quando
   * sobra uma derivada guardada de uma foto que foi para a Reciclagem.
   */
  opcoes: { faltam?: ReadonlySet<string> } = {},
): Promise<{
  doc: ProposalDoc;
  missing: number;
  /**
   * Das `missing`, as que nem se foram buscar por se SABER que faltam
   * (`opcoes.faltam`), uma por pedido. Repetir o desenho não as traz.
   */
  sabidas: string[];
  /**
   * Das `missing`, as que ficaram de fora por passarem do tecto
   * `MAX_IMAGES_PER_DOC`. São faltas CERTAS: o mesmo documento passa sempre do
   * tecto pelo mesmo número, por isso desenhar outra vez não as traz.
   */
  peloTecto: number;
  /**
   * Das `peloTecto`, as de fotografias escolhidas à mão (ou da capa): o PDF
   * sai incompleto, e não se guarda (2.ª revisão de 14/11, importante n.º 1).
   */
  peloTectoQueTravam: number;
  refs: NonNullable<FontesDasFotos["refs"]>;
}> {
  /**
   * ── QUE FOTOGRAFIAS CABEM NO TECTO, DECIDIDO ANTES DE IR BUSCAR NADA ─────
   *
   * Revisão de 14/11, menor n.º 1: o tecto era um contador gasto à medida que
   * as idas ao armazenamento COMEÇAVAM, e com dois mood boards em paralelo o
   * mesmo documento de 91 fotos dava três PDFs diferentes. O corte decide-se
   * antes, e é sempre o mesmo.
   *
   * E a 2.ª revisão de 14/11 (importante n.º 1) mudou O QUE se conta e QUEM
   * cabe primeiro — a regra vive em `fotosNoTectoDoPdf` (`fotos-escolhidas.ts`),
   * a mesma que a Conferência e a rota do envio usam para travar: fotos
   * DIFERENTES (cada uma descarrega-se uma vez só, `jaPedidas`), e primeiro a
   * capa e as escolhidas à mão, depois os mood boards pela ordem do documento.
   * Abaixo de MAX_IMAGES_PER_DOC fotos diferentes cabem todas, e nada muda.
   *
   * O plano do estúdio e a página web do casal NÃO aplicam o tecto — ver o
   * comentário de `fotosNoTectoDoPdf`.
   */
  const noTecto = fotosNoTectoDoPdf(doc, {
    comPaginas: true,
    tecto: MAX_IMAGES_PER_DOC,
  });
  const dentroDoTecto = noTecto.dentro;
  // As escolhidas de fora E as fotos de um board que ficou sem nenhuma (3.ª
  // revisão de 14/11, importante n.º 1): com qualquer delas o PDF não está
  // completo e não se guarda.
  const queTravam = noTecto.queTravam;
  const sabidas: string[] = [];
  let peloTecto = 0;
  /** Das `peloTecto`, os lugares de fotografias que ELA escolheu (ou da capa). */
  let peloTectoQueTravam = 0;
  // Quantas fotos foram PEDIDAS e não entraram. Uma proposta com fotos a menos
  // seguia para o cliente sem ninguém dar por isso; agora quem chama fica a
  // saber e pode dizê-lo. Ver o cabeçalho `X-Fotos-Em-Falta` na rota.
  let missing = 0;

  /** Uma foto já resolvida. */
  interface Resolvida {
    ref: string;
    bytes: Buffer;
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A MESMA FOTOGRAFIA NÃO SE DESCARREGA DUAS VEZES
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Um caminho pode aparecer mais do que uma vez no mesmo documento: a mesma
   * foto em dois mood boards (que é um gesto de um clique no estúdio: duplicar
   * um board), ou a mesma foto num board e numa página.
   *
   * Sem memória, cada uma dessas voltas são 2,6 MB descarregados outra vez para
   * dar exactamente os mesmos bytes.
   *
   * ── PORQUE É QUE GUARDA A PROMESSA E NÃO OS BYTES ────────────────────────
   *
   * Porque com os boards a correr em paralelo dois pedidos da mesma foto podem
   * partir ao mesmo tempo, e uma memória de RESULTADOS só os apanharia depois
   * de ambos terem descarregado — que é precisamente o caso que se quer evitar.
   * Guardando a promessa, o segundo espera pelo primeiro.
   *
   * ── E PORQUE É QUE NÃO GUARDA AS FALHAS ──────────────────────────────────
   *
   * Guarda. Uma foto que não está no armazenamento não vai passar a estar a
   * meio desta geração, e voltar a pedi-la são três tentativas com esperas —
   * até vinte e quatro segundos por foto, num pedido que tem vinte para tudo.
   * É a diferença entre uma proposta lenta e uma proposta que não abre.
   */
  const jaPedidas = new Map<string, ReturnType<typeof fetchProposalImageBytes>>();
  const bytesDoOriginal = (ref: string) => {
    const emCurso = jaPedidas.get(ref);
    if (emCurso) return emCurso;
    const nova = fetchProposalImageBytes(ref);
    jaPedidas.set(ref, nova);
    return nova;
  };

  const buscar = async (ref: string): Promise<Resolvida | null> => {
    const reduzida = await fotoEditorial(ref, bytesDoOriginal);
    return reduzida ? { ref, bytes: reduzida } : null;
  };

  /** `buscar` com o tecto de imagens por documento e a contagem das que faltam. */
  const buscarComTecto = async (ref: string): Promise<Resolvida | null> => {
    if (!dentroDoTecto.has(ref)) {
      // O tecto também é uma perda silenciosa: uma proposta com mais de
      // MAX_IMAGES_PER_DOC fotos perdia as últimas sem aviso. Conta como
      // falta (o aviso continua a dizê-lo), mas CERTA, não passageira: uma
      // segunda passagem esbarrava no mesmo tecto (revisão de 14/11, menor n.º 1).
      missing++;
      peloTecto++;
      if (queTravam.has(ref)) peloTectoQueTravam++;
      return null;
    }
    if (opcoes.faltam?.has(ref)) {
      sabidas.push(ref);
      missing++;
      return null;
    }
    const r = await buscar(ref);
    if (!r) missing++;
    return r;
  };

  // A capa tem 2 POSIÇÕES fixas. Uma referência vazia — ou que não resolve —
  // fica "" NA SUA POSIÇÃO em vez de desaparecer: compactar a lista fazia a
  // foto escolhida para a DIREITA sair impressa à esquerda. Um lugar vazio não
  // gasta orçamento de imagens (nem sequer chega a ser buscado).
  const cover = (
    await mapLimit(
      (doc.coverImages ?? []).map((ref) => ({ ref })),
      FETCH_CONCURRENCY,
      async ({ ref }) => (preenchida(ref) ? await buscarComTecto(ref) : null),
    )
  ).map((r) => (r ? r.bytes.toString("base64") : ""));
  const refsDaCapa = (doc.coverImages ?? []).map((ref) => ref || null);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS MOOD BOARDS DEIXAM DE ESPERAR UNS PELOS OUTROS
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Estava escrito aqui, e era verdade: «um board de cada vez, para o total em
   * voo não passar de FETCH_CONCURRENCY». O que a frase não dizia é o preço.
   *
   * MEDIDO na proposta de que ela se queixou: quarenta e seis fotografias
   * espalhadas por seis boards, quatro downloads em voo. Entre um board e o
   * seguinte a fila ESVAZIA-SE — as últimas três fotografias de um board
   * correm sozinhas enquanto três lugares ficam parados à espera —, e isso
   * acontece seis vezes. É tempo de parede pago para nada.
   *
   * Passam a correr DOIS boards ao mesmo tempo, com quatro downloads cada. O
   * total em voo continua a ter tecto — passa a ser oito em vez de quatro — e
   * a fila deixa de secar na fronteira de cada board.
   *
   * ── PORQUE É QUE SÃO DOIS, E NÃO SEIS ────────────────────────────────────
   *
   * Memória. Cada original anda pelos 2,6 MB e é descodificado para um bitmap
   * de ~10 MB quando o `sharp` lhe toca. Oito em voo são ~21 MB de bytes
   * crus, que uma função de servidor aguenta; trinta seriam ~78 MB mais os
   * bitmaps, e uma geração que estoura de memória não é mais rápida — é uma
   * proposta que não abre.
   *
   * ── E A ORDEM NÃO MUDA ───────────────────────────────────────────────────
   *
   * O `mapLimit` devolve pela ordem de entrada, não pela de chegada. O
   * documento sai com os boards exactamente na ordem em que ela os arrumou —
   * byte a byte o mesmo PDF, só que mais cedo.
   */
  const moodBoards = await mapLimit(doc.moodBoards ?? [], BOARDS_EM_PARALELO, async (mb) => {
    // TODAS são buscadas, mesmo as que passam da lotação do collage.
    //
    // Cortá-las aqui pouparia downloads, e foi a primeira coisa que escrevi —
    // mas mudava duas contas em silêncio: o tecto de imagens por documento
    // deixava de as contar, e o gerador deixava de poder dizer QUAL o mood
    // board que ficou com fotos de fora (`Mood board Cerimónia — 4 fotos`).
    // A poupança seria de um caso que o estúdio não deixa acontecer; a perda
    // de aviso seria real. Só o TAMANHO de cada ficheiro muda aqui.
    const obtidas = await mapLimit(
      mb.images,
      FETCH_CONCURRENCY,
      // Uma referência VAZIA não é uma foto que faltou: é um lugar que nunca
      // teve foto nenhuma. Ir buscá-la falhava sempre e somava ao contador —
      // e o estúdio dizia «1 foto em falta» numa proposta que estava inteira.
      // Um aviso que toca sem razão é um aviso que se deixa de ler. (A capa já
      // tinha esta guarda; os mood boards não.)
      (ref) => (preenchida(ref) ? buscarComTecto(ref) : Promise.resolve(null)),
    );

    const vivas: Resolvida[] = [];
    /** Para onde foi cada foto depois de as que faltaram saírem da lista. */
    const paraOndeFoi: (number | null)[] = obtidas.map((r) => {
      if (!r) return null;
      vivas.push(r);
      return vivas.length - 1;
    });
    /**
     * ── A MARCA VEM ATRÁS DA COMPACTAÇÃO ──────────────────────────────────
     *
     * `images` é reescrito sem as que faltaram, e um índice que apontava para a
     * quinta posição de uma lista que encolheu passa a apontar para OUTRA
     * fotografia: a página sai com a foto errada em grande e ninguém lhe tocou.
     * É o mesmo cuidado — e a mesma função — que o estúdio usa em todo o lado
     * onde as fotos mexem.
     */
    const principal = marcaDepoisDeMexer(mb, (antigo) => paraOndeFoi[antigo] ?? null);
    return {
      board: { ...mb, images: vivas.map((r) => r.bytes.toString("base64")), principal },
      refs: vivas.map((r) => r.ref),
    };
  });

  /**
   * As fotografias que ELA escolheu para as páginas (`fotosDasPaginas`). Só o
   * desenho editorial as tem. Cada uma no seu lugar; a que não se deixar
   * buscar fica vazia — e a página volta a escolher sozinha.
   */
  const paginas: Record<string, { fotos: string[]; focos?: ({ x: number; y: number } | null)[] }> =
    {};
  const refsDasPaginas: Record<string, (string | null)[]> = {};
  for (const [chave, e] of Object.entries(doc.fotosDasPaginas ?? {})) {
    // Os lugares vazios (`""`, «automático») FICAM: a posição é o lugar na
    // página (na paleta, o 6.º é o painel) e o foco de cada uma é o dela.
    const lista = e?.fotos ?? [];
    const obtidas = await mapLimit(lista, FETCH_CONCURRENCY, (ref) =>
      preenchida(ref) ? buscarComTecto(ref) : Promise.resolve(null),
    );
    // A que ela escolheu e NÃO se deixou buscar não volta a ser `""` (que é
    // «automático»): fica marcada, e o desenho deixa-lhe o lugar vazio em
    // vez de pôr lá outra em silêncio (14/11, `embutir.ts`).
    paginas[chave] = {
      ...e,
      fotos: obtidas.map((r, k) =>
        r
          ? r.bytes.toString("base64")
          : lista[k] && lista[k].trim()
            ? marcaDeFotoEmFalta(lista[k])
            : "",
      ),
    };
    refsDasPaginas[chave] = lista.map((ref, k) => (obtidas[k] ? ref : null));
  }

  return {
    doc: {
      ...doc,
      coverImages: cover,
      moodBoards: moodBoards.map((m) => m.board),
      fotosDasPaginas: paginas,
    },
    missing,
    sabidas,
    peloTecto,
    peloTectoQueTravam,
    refs: { capa: refsDaCapa, temas: moodBoards.map((m) => m.refs), paginas: refsDasPaginas },
  };
}

/**
 * O lado maior a que uma foto chega ao desenho editorial.
 *
 * O desenho pede no máximo 1 800 px (uma foto que ocupa a página inteira —
 * `pdf-editorial/imagens.ts`). Reduzir logo à chegada é o que deixa oitenta
 * originais de 2,6 MB caberem na memória de uma função: cada um passa a umas
 * centenas de KB antes de o próximo chegar.
 */
const LADO_EDITORIAL = 1800;
/** A qualidade JPEG da redução editorial. */
const QUALIDADE_EDITORIAL = 86;
/**
 * A receita da redução, que entra na chave da versão guardada: mudar o lado
 * ou a qualidade gera chaves novas, e uma versão velha nunca é servida.
 */
const RECEITA_EDITORIAL = `editorial-${LADO_EDITORIAL}-q${QUALIDADE_EDITORIAL}-rot`;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FOTOGRAFIA JÁ REDUZIDA FICA EM MEMÓRIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada desenho ia buscar o ORIGINAL de cada fotografia ao armazenamento (2 a
 * 3 MB) e reduzia-o a 1 800 px com o `sharp` — outra vez, a cada descarga, a
 * cada envio, para os mesmíssimos bytes. Numa proposta de sessenta fotos é a
 * maior parte do tempo de um desenho que não seja o primeiro.
 *
 * Guarda-se a versão reduzida (umas centenas de KB) pelo caminho da foto. É
 * honesto por construção: o caminho de uma fotografia nesta casa nunca muda de
 * conteúdo (ver `cache-das-fotos.ts`: `<pasta>/<uuid>.jpg`, e trocar uma foto
 * grava um caminho novo). Só os caminhos do armazenamento entram — um
 * `data:` ou um endereço assinado não são chaves que valha a pena guardar.
 *
 * O tecto é por bytes (~64 MB, umas duzentas fotos) e esquece primeiro o que
 * se usou há mais tempo. Uma foto que falhou não fica: a falha é passageira.
 */
const fotosEditoriais = criarCachePorBytes<Buffer>({
  tecto: 64 * 1024 * 1024,
  maximoPorEntrada: 4 * 1024 * 1024,
  tamanho: (b) => b.length,
});

function guardavel(ref: string): boolean {
  return !!ref && !ref.startsWith("data:") && !/^https?:\/\//i.test(ref) && ref.includes("/");
}

async function fotoEditorial(
  ref: string,
  original: (ref: string) => Promise<Buffer | null>,
): Promise<Buffer | null> {
  const guardar = guardavel(ref);
  if (guardar) {
    const ja = fotosEditoriais.ler(ref);
    if (ja) return ja;
    // Fora da memória: a versão reduzida que uma instância anterior guardou
    // no armazenamento (3/11 — ver `fotos-editoriais-guardadas.ts`). Os mesmos
    // bytes, sem descarregar o original nem gastar processador a reduzi-lo.
    const guardada = await lerFotoEditorialGuardada(ref, RECEITA_EDITORIAL);
    if (guardada) {
      fotosEditoriais.guardar(ref, guardada);
      return guardada;
    }
  }
  const bytes = await original(ref);
  if (!bytes) return null;
  const reduzida = await reduzirParaEditorial(bytes);
  // Só se guarda o que o `sharp` conseguiu reduzir: se falhou, `reduzirParaEditorial`
  // devolve os bytes como vieram, e esses podem ser de 10 MB.
  if (guardar && reduzida !== bytes) {
    fotosEditoriais.guardar(ref, reduzida);
    await guardarFotoEditorial(ref, RECEITA_EDITORIAL, reduzida);
  }
  return reduzida;
}

/**
 * Os bytes que o PDF editorial desenha para esta fotografia — os mesmos de
 * `resolveImages` (a versão reduzida a {@link LADO_EDITORIAL},
 * guardada). A paleta da proposta online e a sugestão do «Fazer proposta»
 * (`lib/paleta-do-pdf.ts`) lêem ESTES, para darem as cores do PDF.
 */
export function bytesDaFotoNoPdf(ref: string): Promise<Buffer | null> {
  return fotoEditorial(ref, fetchProposalImageBytes);
}

/** Só para os testes. */
export function esvaziarFotosEditoriais(): void {
  fotosEditoriais.esvaziar();
}

async function reduzirParaEditorial(bytes: Buffer): Promise<Buffer> {
  try {
    return await sharp(bytes, { failOn: "none" })
      .rotate()
      .resize(LADO_EDITORIAL, LADO_EDITORIAL, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: QUALIDADE_EDITORIAL })
      .toBuffer();
  } catch {
    // O desenho volta a tentar ler estes bytes e, se falharem lá, conta a foto
    // como não desenhada — o aviso chega na mesma.
    return bytes;
  }
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O DESENHO EDITORIAL — O QUE SEGUE PARA O CASAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * O mesmo caminho do de cima (os textos fixos, as fotografias do armazenamento,
 * o relatório do que falta e do que ficou cortado), com o desenho novo de
 * `pdf-editorial/`. Ela aprovou-o («Sim, passa a enviar o novo»): é o que o
 * estúdio descarrega, o que segue no envio, e o que o link do casal desenha
 * quando não há ficheiro guardado. O de cima fica, sem uso nas rotas, até ela
 * enviar algumas propostas no desenho novo.
 */
export async function renderStoredEditorialPdfWithReport(
  doc: ProposalDoc,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
  /**
   * `soPaginas`: só estas páginas — ver `renderEditorialPdf`.
   *
   * `memoria`: a pergunta «que fotografias já não existem» aceita a listagem
   * guardada há pouco, e partilha a que estiver em curso (revisão de 14/11,
   * 2.ª, importante n.º 1). SÓ os rascunhos e a pré-visualização real — cada
   * página desenhada perguntava de novo, ~150 listagens por minuto a editar.
   * O envio e a porta do casal ficam sem ela: perguntam sempre de fresco.
   */
  opcoes: {
    rascunho?: boolean;
    soPaginas?: readonly number[];
    memoria?: boolean;
    /**
     * As que se sabe que faltam, já perguntadas por quem chama — para a chave
     * de quem guarda o desenho e o próprio desenho usarem a MESMA resposta
     * (`pagina-do-rascunho`, revisão de 14/11, menor n.º 4). Sem ela,
     * pergunta-se aqui.
     */
    faltam?: ReadonlySet<string>;
  } = {},
): Promise<{
  pdf: Buffer<ArrayBuffer>;
  missingImages: number;
  /**
   * Das `missingImages`, as que SE SABE que já não existem (foram para a
   * Reciclagem, saíram do armazenamento): uma segunda passagem não as traz,
   * por isso não se repete o desenho por causa delas (revisão de 14/11, 2.ª,
   * importante n.º 2). As restantes são passageiras até prova em contrário.
   */
  faltasSabidas: number;
  /**
   * Das sabidas, as das fotografias que ELA escolheu e que o PDF desenharia
   * (`fotosEscolhidasDoDocumento`; a capa pela regra `aFaltaDaCapaTrava`): o
   * PDF sai com o lugar vazio, e não é um documento completo. Uma foto de mood
   * board sabida em falta NÃO conta — o motor faz o mosaico sem ela, como o
   * estúdio e a página do casal já mostram.
   */
  faltasSabidasQueTravam: number;
  /**
   * Das `missingImages`, as que passaram do tecto de fotografias por documento.
   * Também são certas: repetir o desenho não as traz, e o desenho não muda por
   * isso pode guardar-se (revisão de 14/11, menor n.º 1).
   */
  faltasPeloTecto: number;
  /**
   * Das `faltasPeloTecto`, as de fotografias que ELA escolheu (ou da capa).
   * O PDF sai sem elas, e por isso NÃO é um documento completo: não se guarda
   * em lado nenhum (2.ª revisão de 14/11, importante n.º 1). O envio já travou
   * antes (`oQueFaltaParaEnviar`, `fotos-a-mais`).
   */
  faltasPeloTectoQueTravam: number;
  truncations: DocTruncation[];
  /** Que fotografia foi para cada página — o mesmo que `fotosDoEditorialDoDocumento`. */
  fotos: FotosDoPdf;
  /** As páginas do PDF inteiro, mesmo com `soPaginas`. */
  paginas: number;
}> {
  const { memoria, faltam: jaPerguntadas, ...doDesenho } = opcoes;
  const withDefaults = withProposalDefaults(doc);
  const faltam =
    jaPerguntadas ?? (await fotosQueSeSabeQueFaltam(withDefaults, { memoria: !!memoria }));
  const {
    doc: resolved,
    missing,
    sabidas,
    peloTecto,
    peloTectoQueTravam,
    refs,
  } = await resolveImages(withDefaults, { faltam });
  const medidas = await medidasDaBiblioteca(caminhosDoDocumento(withDefaults));
  const { bytes, truncations, undrawnImages, fotos, paginas, fotosEscolhidasEmFalta } =
    await renderEditorialPdf(resolved, idioma, doDesenho, { refs, medidas });
  if (fotosEscolhidasEmFalta.length > 0) {
    // Já contadas em `missing` (a resolução não as encontrou). O aviso diz
    // QUAIS, e que o lugar saiu vazio — nunca com outra foto.
    log.warn("pdf editorial: fotos escolhidas que já não existem — o lugar saiu vazio", {
      fotos: fotosEscolhidasEmFalta,
    });
  }
  // A CAPA escolhida que não se deixou buscar (revisão de 14/11, n.º 3). O
  // desenho da capa não muda — cai para a melhor deitada da inspiração, como
  // sempre que a dela não serve —, mas isto não pode passar em silêncio: fica
  // registado aqui, e o envio já travou antes (`fotosEscolhidasQueFaltam`
  // conta a capa na mesma lista das páginas).
  const iCapa = (withDefaults.coverImages ?? []).findIndex((c) => c && c.trim());
  if (iCapa >= 0 && !resolved.coverImages?.[iCapa]) {
    log.warn("pdf editorial: a fotografia de capa escolhida já não existe — saiu outra", {
      capa: withDefaults.coverImages[iCapa],
    });
  }
  const travam = sabidas.length > 0 ? escolhidasQueTravam(withDefaults, faltam, medidas) : null;
  return {
    pdf: Buffer.from(bytes),
    missingImages: missing + undrawnImages,
    faltasSabidas: sabidas.length,
    faltasSabidasQueTravam: travam ? sabidas.filter((r) => travam.has(r)).length : 0,
    faltasPeloTecto: peloTecto,
    faltasPeloTectoQueTravam: peloTectoQueTravam,
    truncations,
    fotos,
    paginas,
  };
}

/**
 * Das fotografias que se sabe que faltam, as que ela ESCOLHEU e que o PDF
 * desenharia — a mesma lista do travão do envio (`fotosEscolhidasDoDocumento`)
 * e a mesma regra da capa (`aFaltaDaCapaTrava`), com as medidas do desenho.
 */
function escolhidasQueTravam(
  withDefaults: ProposalDoc,
  faltam: ReadonlySet<string>,
  medidas: ReadonlyMap<string, Medida>,
): Set<string> {
  const saida = new Set<string>();
  for (const f of fotosEscolhidasDoDocumento(withDefaults)) {
    if (!faltam.has(f.ref)) continue;
    if (f.chave !== CHAVE_DA_CAPA) {
      saida.add(f.ref);
      continue;
    }
    const haOutra = haFotoNaInspiracao(withDefaults, (r) => faltam.has(r));
    if (aFaltaDaCapaTrava(medidas.get(f.ref), withDefaults.capaMesmoAssim, haOutra)) {
      saida.add(f.ref);
    }
  }
  return saida;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS MESMAS MEDIDAS PARA O PDF E PARA AS MINIATURAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O álbum escolhe os separadores e os painéis pelos PIXÉIS de cada fotografia.
 * Para a miniatura do estúdio mostrar a mesma escolha que o PDF, os dois têm de
 * comparar as fotos pelos mesmos números — senão uma foto de 1 800 × 1 200 e
 * outra de 1 800 × 1 201 trocam de lugar entre um e outro.
 *
 * A regra é uma só: a medida guardada na biblioteca de fotografias (largura e
 * altura do ficheiro, gravadas ao carregar), à escala a que o desenho a usa
 * (`LADO_EDITORIAL`); sem ela, a da fotografia reduzida que o desenho usa. O
 * desenho tem essa em mão; o plano sem desenho (`fotosDoEditorialDoDocumento`)
 * vai buscá-la — é a mesma, e fica em memória para o desenho a seguir.
 */
function reduzidaParaOEditorial(w: number, h: number): Medida {
  const escala = Math.min(1, LADO_EDITORIAL / Math.max(w, h));
  return { w: Math.round(w * escala), h: Math.round(h * escala) };
}

/**
 * As referências de todas as fotografias que o desenho editorial pode usar —
 * caminhos do armazenamento e também `data:` ou endereços, que o desenho
 * também aceita (e que a biblioteca não conhece: medem-se dos bytes).
 */
function caminhosDoDocumento(doc: ProposalDoc): string[] {
  return [
    ...new Set(
      [
        ...(doc.coverImages ?? []),
        ...(doc.moodBoards ?? []).flatMap((b) => b.images ?? []),
        ...Object.values(doc.fotosDasPaginas ?? {}).flatMap((e) => e?.fotos ?? []),
      ].filter((r): r is string => !!r && r.trim() !== "" && !isPendingImage(r)),
    ),
  ];
}

async function medidasDaBiblioteca(refs: readonly string[]): Promise<Map<string, Medida>> {
  // Uma leitura falhada FALHA o desenho — ver `formasDeCaminhosOuErro`.
  const formas = await formasDeCaminhosOuErro(refs.filter(guardavel));
  const saida = new Map<string, Medida>();
  for (const [ref, f] of formas) saida.set(ref, reduzidaParaOEditorial(f.largura, f.altura));
  return saida;
}

/**
 * Que fotografia vai para cada lugar de cada página do PDF editorial, sem o
 * desenhar — é o que as miniaturas do estúdio mostram. `doc` é o rascunho como
 * o estúdio o tem, com os caminhos do armazenamento.
 */
export async function fotosDoEditorialDoDocumento(
  doc: ProposalDoc,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): Promise<FotosDoPdf> {
  return (await planoDoEditorialDoDocumento(doc, idioma)).fotos;
}

/**
 * O mesmo, e as referências das fotografias de onde o PDF tira a paleta
 * (`daPaleta`, pela ordem do PDF) — o que a rota `fotos-do-pdf` responde ao
 * estúdio, para a sugestão de cores dele ser a do PDF (13/11).
 */
export async function planoDoEditorialDoDocumento(
  doc: ProposalDoc,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): Promise<{ fotos: FotosDoPdf; daPaleta: string[] | null }> {
  const withDefaults = withProposalDefaults(doc);
  const [medidas, faltam] = await Promise.all([
    medidasDoDocumento(withDefaults),
    // Com memória curta: esta rota corre ~2,5 s depois de cada gesto no
    // estúdio. O travão do envio pergunta sempre de fresco.
    fotosQueSeSabeQueFaltam(withDefaults, { memoria: true }),
  ]);
  return planoDoEditorial(semAsQueFaltam(withDefaults, faltam), idioma, medidas);
}

/**
 * O conteúdo de cada secção, com as fotografias que o PDF escolhe — o que a
 * proposta online (`proposta/[token]`) desenha. Ver `conteudoDoEditorial`.
 */
export async function conteudoWebDoDocumento(
  doc: ProposalDoc,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
  /**
   * As que se sabe que faltam, quando quem chama já perguntou (a página do
   * casal pergunta uma vez e usa a resposta para o conteúdo e para as fotos
   * assinadas). Sem elas, pergunta-se aqui.
   */
  faltam?: ReadonlySet<string>,
): Promise<ConteudoWeb> {
  const withDefaults = withProposalDefaults(doc);
  const [medidas, quais] = await Promise.all([
    medidasDoDocumento(withDefaults),
    faltam ?? fotosQueSeSabeQueFaltam(withDefaults),
  ]);
  return conteudoDoEditorial(semAsQueFaltam(withDefaults, quais), idioma, medidas);
}

/**
 * As fotografias do documento que SE SABE que já não existem — a fonte única
 * do PDF, do plano do estúdio e da página do casal (ver `semAsQueFaltam`).
 * «Não sei» (uma pasta que não responde) não tira nada. Nunca lança.
 */
export function fotosQueSeSabeQueFaltam(
  withDefaults: ProposalDoc,
  opcoes: OpcoesDaPergunta = {},
): Promise<Set<string>> {
  return refsQueJaNaoExistem(caminhosDoDocumento(withDefaults), opcoes);
}

/**
 * As medidas de todas as fotografias do documento: as da biblioteca, e as
 * que lá não estão lidas do próprio ficheiro — as mesmas que o desenho usa.
 */
async function medidasDoDocumento(withDefaults: ProposalDoc): Promise<Map<string, Medida>> {
  const caminhos = caminhosDoDocumento(withDefaults);
  const medidas = await medidasDaBiblioteca(caminhos);
  const faltam = caminhos.filter((r) => !medidas.has(r));
  await mapLimit(faltam, FETCH_CONCURRENCY, async (ref) => {
    const reduzida = await fotoEditorial(ref, fetchProposalImageBytes);
    if (!reduzida) return;
    try {
      const m = await sharp(reduzida, { failOn: "none" }).metadata();
      if (m.width && m.height) medidas.set(ref, { w: m.width, h: m.height });
    } catch {
      /* não se deixa ler: fica sem medida, como o desenho a deixaria */
    }
  });
  return medidas;
}

/**
 * O enquadramento que o PDF escolheria sozinho para esta fotografia na CAPA —
 * a mesma conta, com os mesmos bytes e o mesmo tamanho que o desenho usa
 * (`reduzirParaEditorial` e a caixa da folha inteira em `LADO_PAGINA`, com a
 * densidade por omissão do `fotoNaCaixa`).
 *
 * É o que deixa o estúdio mostrar, na caixa da capa, o recorte que vai sair —
 * e é a partir dele que ela arrasta, se não gostar. `null` se a fotografia não
 * se deixar ler: o estúdio mostra o centro e não promete nada.
 */
export async function focoAutomaticoDaCapa(ref: string): Promise<Foco | null> {
  const reduzida = await fotoEditorial(ref, fetchProposalImageBytes);
  if (!reduzida) return null;
  const { w, h } = pixeisDaCaixa(FOLHA.w, FOLHA.h, LADO_PAGINA, 1.7);
  return focoAutomatico(reduzida, w, h);
}
