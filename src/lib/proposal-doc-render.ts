import "server-only";
import sharp from "sharp";
import { criarCachePorBytes } from "@/lib/cache-por-bytes";
import {
  isPendingImage,
  MOOD_BOARD_MAX_IMAGES,
  type MoodBoard,
  type ProposalDoc,
  withProposalDefaults,
} from "@/lib/proposal-doc";
import {
  caixasDaCapa,
  caixasDoCollage,
  renderProposalDocPdfWithReport,
  type CaixaPdf,
  type DocTruncation,
} from "@/lib/proposal-doc-pdf";
import {
  alturaDaLegenda,
  caixasDoMoodboard,
  linhasDaLegendaAprox,
  ASPETO_POR_OMISSAO,
} from "@/lib/proposal-geometria";
import { layoutDoBoard, marcaDepoisDeMexer, ordemDasFotos } from "@/lib/proposal-moodboard";
import {
  fetchProposalCoverBytes,
  fetchProposalImageBytes,
  fetchProposalThumbBytes,
  uploadProposalCover,
} from "@/lib/proposal-storage";
import {
  aspetoDaImagem,
  derivadaDaCapa,
  pixelsForBox,
  type TargetPixels,
} from "@/lib/proposal-image";
import { TECTO_DA_ROTA_MS } from "@/lib/custo-do-pdf";
import { log } from "@/lib/logger";
import { IDIOMA_POR_OMISSAO, type IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import {
  fotosDoEditorial,
  renderEditorialPdf,
  type FontesDasFotos,
  type FotosDoPdf,
  type Medida,
} from "@/lib/pdf-editorial/montar";
import { formasDeCaminhos } from "@/lib/biblioteca-fotos-store";
import { focoAutomatico, LADO_PAGINA, pixeisDaCaixa, type Foco } from "@/lib/pdf-editorial/imagens";
import { FOLHA } from "@/lib/pdf-editorial/moldura";

/**
 * Lado maior das miniaturas que o navegador fabrica no carregamento
 * (`THUMB_EDGE`, em `image-prep.ts`).
 *
 * Está aqui repetido em vez de importado porque o `image-prep.ts` é código de
 * NAVEGADOR e não pode ser puxado para dentro de um módulo `server-only`. Serve
 * só para uma coisa: não ir buscar uma miniatura que de certeza não chega. Se
 * um dia divergir, o pior que acontece é uma ida ao Storage desperdiçada — a
 * decisão final é sempre tomada com as dimensões REAIS do ficheiro, em
 * {@link cobre}, nunca com este número.
 */
const MINIATURA_LADO = 400;

/**
 * A miniatura chega para preencher a caixa, ou ia ser AMPLIADA?
 *
 * Mede-se, não se presume. Uma miniatura tem 400 px no lado maior, mas o lado
 * menor depende da fotografia: numa foto 3:2 são 267 px, numa panorâmica 3:1
 * são 133. A célula precisa dos dois lados — o recorte é `cover` —, por isso
 * uma regra sobre o lado maior deixaria passar exactamente as fotos mais
 * compridas, ampliadas e moles.
 *
 * O `sharp` lê isto do CABEÇALHO, sem descodificar a imagem: são microssegundos
 * sobre um buffer de 20 KB.
 *
 * A orientação EXIF conta: o `resizeToBox` chama `.rotate()`, portanto uma foto
 * de telemóvel deitada sai com os lados TROCADOS face ao que o cabeçalho diz.
 * Comparar sem isso rejeitaria (ou aceitaria) a miniatura pela razão errada.
 */
async function cobre(bytes: Buffer, alvo: TargetPixels): Promise<boolean> {
  try {
    const m = await sharp(bytes).metadata();
    let largura = m.width ?? 0;
    let altura = m.height ?? 0;
    if ((m.orientation ?? 1) >= 5) [largura, altura] = [altura, largura];
    return largura >= alvo.width && altura >= alvo.height;
  } catch {
    // Ilegível: não se arrisca: segue o original.
    return false;
  }
}

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
const MAX_IMAGES_PER_DOC = 80;
const FETCH_CONCURRENCY = 4;

/**
 * Quantos mood boards se resolvem ao mesmo tempo.
 *
 * O total de downloads em voo é este número vezes {@link FETCH_CONCURRENCY} —
 * ver o bloco «OS MOOD BOARDS DEIXAM DE ESPERAR UNS PELOS OUTROS» para a conta
 * de memória que o fixa em dois.
 */
const BOARDS_EM_PARALELO = 2;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CAIXA DE CADA FOTO DE UM MOOD BOARD, PELA ORDEM DO ARRAY
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma caixa por posição de `mb.images`: aquela onde ESSA fotografia vai ser
 * desenhada. `aspectos` é a forma de cada uma, também pela ordem do array, e
 * `null` onde ainda não foi medida.
 *
 * A geometria é a do gerador ({@link caixasDoMoodboard}) e não a grelha fixa do
 * arranjo em destaque: são cinco disposições, e medir todas pela do destaque
 * ficava ABAIXO da caixa real logo em «filas» com quatro fotos (previa 266×299
 * px, a caixa pede 452×301).
 *
 * ── E o desenho não desenha pela ordem do array ────────────────────────────
 * Duas coisas que uma medição posição a posição não via:
 *
 * · **a permuta**. A foto marcada como principal é desenhada na PRIMEIRA caixa
 *   ({@link ordemDasFotos}, a mesma função do gerador e do estúdio). Medir cada
 *   foto pelo lugar que ocupa no array pedia à sexta uma miniatura de célula
 *   pequena e desenhava-a na caixa de 56% da mancha.
 * · **o corte**. Só as primeiras {@link MOOD_BOARD_MAX_IMAGES} são desenhadas —
 *   e o corte é feito DEPOIS da permuta, portanto uma foto marcada em décimo
 *   primeiro lugar entra na página na mesma.
 *
 * A que não é desenhada leva a MENOR caixa da página. Não é por elegância: é
 * para não ficar SEM caixa nenhuma. Uma caixa a `null` é, em {@link buscar}, o
 * sinal de «isto é a CAPA» — e uma foto de mood board que fosse por aí pagava o
 * recorte da tira alta e uma escrita no armazenamento para uma fotografia que
 * nem sequer é impressa.
 */
function caixasDoDesenho(mb: MoodBoard, aspectos: readonly (number | null)[]): CaixaPdf[] {
  const legenda = alturaDaLegenda(linhasDaLegendaAprox(mb.annotation));
  const desenhadas = ordemDasFotos(mb).slice(0, MOOD_BOARD_MAX_IMAGES);
  const caixas = caixasDoMoodboard(
    layoutDoBoard(mb),
    desenhadas.map((i) => aspectos[i] ?? ASPETO_POR_OMISSAO),
    legenda,
    mb.enquadramento === "forma-da-foto",
  );
  const menor = caixas.reduce<CaixaPdf | undefined>(
    (m, c) => (!m || c.w * c.h < m.w * m.h ? c : m),
    undefined,
  );
  // Sem caixa nenhuma (uma composição que não fechou) fica a mancha inteira —
  // `caixasDoCollage(1)` é exactamente isso. É o majorante trivial: erra para o
  // lado de descarregar grande de mais, que é o lado invisível.
  const recurso = menor ?? caixasDoCollage(1, legenda)[0];
  const porFoto = mb.images.map(() => recurso);
  desenhadas.forEach((i, d) => {
    if (caixas[d]) porFoto[i] = caixas[d];
  });
  return porFoto;
}

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
 * ════════════════════════════════════════════════════════════════════════════
 * CADA FOTO À MEDIDA DA CAIXA ONDE VAI SER DESENHADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Substitui cada referência de imagem (capa + mood boards) por base64, para o
 * gerador — que não sabe o que é armazenamento — a poder embutir.
 *
 * ── O que isto arruma ─────────────────────────────────────────────────────
 * Até aqui descarregava sempre o ORIGINAL: 2200 px, ~576 KB. Uma célula
 * pequena de mood board é desenhada com ~266 px. Eram 28× os bytes pela rede e
 * ~30× os pixéis a descodificar, para o `sharp` deitar fora 97% deles logo a
 * seguir — e ainda a segurar tudo isso em memória ao mesmo tempo, que é a
 * razão pela qual uma proposta cheia chegava a ficar sem memória e a cair para
 * o caminho de recurso (o PDF de 3,31 MB do PDF-BEFORE.md).
 *
 * Agora pergunta-se primeiro ONDE a foto vai ser desenhada — `caixasDaCapa` e
 * `caixasDoMoodboard`, as mesmas funções que o desenho usa — e pede-se o
 * tamanho que essa caixa justifica.
 *
 * ── Porquê duas passagens ─────────────────────────────────────────────────
 * A caixa de uma foto de mood board depende da FORMA de todas as fotos da
 * página (é isso que faz uma vertical sair vertical em vez de recortada), e a
 * forma só se conhece depois de descarregar. Depende também de QUANTAS
 * entraram: uma foto que falhe faz as restantes crescer.
 *
 * Por isso:
 *   1.ª  busca-se o que se acha que chega — a caixa medida com a disposição e a
 *        ordem verdadeiras (estão no documento) e a forma por omissão, que é a
 *        única coisa que ainda não se sabe. Isto diz quais existem.
 *   2.ª  com as sobreviventes e as formas MEDIDAS, corre-se a mesma geometria
 *        que o gerador vai correr e verifica-se cada foto contra a caixa onde
 *        ela vai mesmo ser desenhada. A que ficar curta é rebuscada em original.
 *
 * A garantia mora na 2.ª: é lá que a caixa é a verdadeira, e é lá que uma
 * miniatura que ia ser ampliada é apanhada. A 1.ª é só uma aposta a poupar
 * bytes — errá-la custa uma ida ao armazenamento de 20 KB, nunca uma foto mole.
 */
async function resolveImages(
  doc: ProposalDoc,
  /**
   * `originais`: cada foto vem do ORIGINAL, reduzida a {@link LADO_EDITORIAL}.
   * É o caminho do desenho editorial, onde uma foto pode ocupar a página
   * inteira e as caixas não são as do desenho antigo — a escolha entre
   * miniatura e original, aqui em baixo, mede-se contra caixas que lá não
   * existem.
   */
  opcoes: { originais?: boolean } = {},
): Promise<{ doc: ProposalDoc; missing: number; refs: NonNullable<FontesDasFotos["refs"]> }> {
  let remaining = MAX_IMAGES_PER_DOC;
  // Quantas fotos foram PEDIDAS e não entraram. Uma proposta com fotos a menos
  // seguia para o cliente sem ninguém dar por isso; agora quem chama fica a
  // saber e pode dizê-lo. Ver o cabeçalho `X-Fotos-Em-Falta` na rota.
  let missing = 0;

  /** Uma foto já resolvida, e se o que temos é o ORIGINAL ou uma miniatura. */
  interface Resolvida {
    ref: string;
    bytes: Buffer;
    /** `true` quando não há mais nada maior para onde subir. */
    original: boolean;
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A MESMA FOTOGRAFIA NÃO SE DESCARREGA DUAS VEZES
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Um caminho pode aparecer mais do que uma vez no mesmo documento: a mesma
   * foto em dois mood boards (que é um gesto de um clique no estúdio: duplicar
   * um board), e a MESMA foto pedida duas vezes dentro do mesmo board — a 1.ª
   * passagem aceita a miniatura, a 2.ª mede a caixa verdadeira, vê que ela ficou
   * curta e vai buscar o original.
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

  /**
   * Busca uma foto, preferindo a derivada que serve `caixa`.
   *
   * `caixa` a `null` é a CAPA, e tem um caminho próprio: as suas tiras correm de
   * topo a fundo da A4 e pedem ~617×1323 px, onde nenhuma miniatura de 400 px
   * chega. Ver {@link buscarCapa}.
   */
  const buscar = async (ref: string, caixa: CaixaPdf | null): Promise<Resolvida | null> => {
    if (opcoes.originais) {
      const reduzida = await fotoEditorial(ref, bytesDoOriginal);
      return reduzida ? { ref, bytes: reduzida, original: true } : null;
    }
    if (!caixa) return buscarCapa(ref);
    const alvo = pixelsForBox(caixa.w, caixa.h, "collage");
    // Só se vai buscar a miniatura quando ela PODE servir. Acima do lado dela
    // não há sequer hipótese, e a ida seria deitada fora.
    if (Math.max(alvo.width, alvo.height) <= MINIATURA_LADO) {
      const mini = await fetchProposalThumbBytes(ref);
      if (mini && (await cobre(mini, alvo))) return { ref, bytes: mini, original: false };
    }
    const bytes = await bytesDoOriginal(ref);
    return bytes ? { ref, bytes, original: true } : null;
  };

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A CAPA — a derivada primeiro, e escrita da primeira vez que faltar
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A tira da capa é a fatia mais cara do documento: recortar 617×1323 px a
   * partir do original custa ~250 ms de `sharp`, e há duas tiras, desenhadas na
   * capa e na contracapa. Isso era pago EM CADA geração de PDF, para sempre,
   * para produzir sempre exactamente os mesmos bytes.
   *
   * Aqui pergunta-se primeiro se a derivada já existe. Se existe: 0,1 ms (o
   * `resizeToBox` reconhece os pixéis e devolve-os intactos) e ~100 KB pela rede
   * em vez de ~576 KB.
   *
   * ── E se não existir, faz-se AGORA e guarda-se ────────────────────────────
   * Isto é o que evita ter de migrar seja o que for. As fotos já carregadas — e
   * as da Biblioteca de Temas, que são escolhidas para capa e não passam pelo
   * carregamento de propostas — não têm derivada nenhuma; a primeira proposta
   * que as use escreve-a, e a partir daí ninguém volta a pagar.
   *
   * E não custa nada a ESTA geração: o recorte ia acontecer na mesma, uns
   * milissegundos à frente, dentro do desenho. Só se faz mais cedo, guarda-se, e
   * entregam-se os mesmos bytes que o desenho ia produzir. O único custo extra é
   * a escrita, que é melhor esforço e tem tecto de tempo.
   *
   * A ordem — derivada, original, derivar — nunca deixa a capa sem foto: cada
   * degrau só desce quando o de cima não deu.
   */
  const buscarCapa = async (ref: string): Promise<Resolvida | null> => {
    const caixa = caixasDaCapa()[0];
    const alvo = caixa ? pixelsForBox(caixa.w, caixa.h, "cover") : null;
    if (alvo) {
      const pronta = await fetchProposalCoverBytes(ref);
      // Mede-se antes de confiar: uma derivada de uma versão anterior da
      // geometria seria uma foto ampliada na primeira página da proposta.
      if (pronta && (await cobre(pronta, alvo))) return { ref, bytes: pronta, original: true };
    }
    const bytes = await bytesDoOriginal(ref);
    if (!bytes) return null;
    const derivada = await derivadaDaCapa(bytes);
    if (!derivada) return { ref, bytes, original: true };
    // Melhor esforço: se a escrita falhar, a proposta sai na mesma com estes
    // bytes e a próxima geração volta a tentar.
    await uploadProposalCover(ref, derivada);
    return { ref, bytes: derivada, original: true };
  };

  /** `buscar` com o tecto de imagens por documento e a contagem das que faltam. */
  const buscarComTecto = async (ref: string, caixa: CaixaPdf | null): Promise<Resolvida | null> => {
    if (remaining <= 0) {
      // O tecto também é uma perda silenciosa: uma proposta com mais de
      // MAX_IMAGES_PER_DOC fotos perdia as últimas sem aviso.
      missing++;
      return null;
    }
    remaining--;
    const r = await buscar(ref, caixa);
    if (!r) missing++;
    return r;
  };

  // A capa tem 2 POSIÇÕES fixas. Uma referência vazia — ou que não resolve —
  // fica "" NA SUA POSIÇÃO em vez de desaparecer: compactar a lista fazia a
  // foto escolhida para a DIREITA sair impressa à esquerda. Um lugar vazio não
  // gasta orçamento de imagens (nem sequer chega a ser buscado).
  const cover = (
    await mapLimit(doc.coverImages ?? [], FETCH_CONCURRENCY, async (ref) =>
      ref ? await buscarComTecto(ref, null) : null,
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
    /**
     * ── 1.ª PASSAGEM: A MELHOR MEDIDA QUE HÁ SEM AS FOTOS EM MÃO ───────────
     *
     * A disposição, a ordem de desenho e a legenda são conhecidas aqui — estão
     * no documento. O que falta são as FORMAS, que só se sabem depois de
     * descarregar; usa-se a forma por omissão, a mesma que o estúdio usa
     * enquanto não mediu ({@link ASPETO_POR_OMISSAO}).
     *
     * ── E porque é que isto não é um majorante ───────────────────────────
     * Porque, sem as formas, um majorante a sério é a MANCHA INTEIRA: medido,
     * uma panorâmica no meio de nove verticais leva 661 dos 706 pontos de
     * largura da mancha em «fila única», e em «filas» chega aos 706 — e QUALQUER
     * uma das dez pode ser essa. Pedir a mancha para todas as fotos era voltar a
     * descarregar o original de todas: os megabytes e a memória que este módulo
     * existe para não gastar (ver o cabeçalho).
     *
     * Por isso esta passagem só decide se a miniatura PODE servir. Quem garante
     * que serve MESMO é a 2.ª, com as formas medidas: errar aqui custa uma ida
     * ao armazenamento de 20 KB deitada fora, e nunca uma foto ampliada.
     */
    const previstas = caixasDoDesenho(
      mb,
      mb.images.map(() => null),
    );
    const obtidas = await mapLimit(
      mb.images.map((ref, i) => ({ ref, caixa: previstas[i] })),
      FETCH_CONCURRENCY,
      // Uma referência VAZIA não é uma foto que faltou: é um lugar que nunca
      // teve foto nenhuma. Ir buscá-la falhava sempre e somava ao contador —
      // e o estúdio dizia «1 foto em falta» numa proposta que estava inteira.
      // Um aviso que toca sem razão é um aviso que se deixa de ler. (A capa já
      // tinha esta guarda; os mood boards não.)
      ({ ref, caixa }) => (ref ? buscarComTecto(ref, caixa) : Promise.resolve(null)),
    );

    /**
     * ── 2.ª PASSAGEM: O DESENHO VERDADEIRO ────────────────────────────────
     *
     * Os bytes estão em mão, portanto as FORMAS são conhecidas — o `sharp` lê-as
     * do cabeçalho em microssegundos. A partir daqui a geometria é a mesma que o
     * gerador vai correr: mesma disposição, mesmas formas, mesma altura de
     * legenda, mesma permutação. É isto que fecha o buraco — uma miniatura que a
     * 1.ª passagem aceitou para uma caixa que afinal é maior (porque uma foto
     * falhou e as outras cresceram, ou porque a página tem verticais e as filas
     * ficam mais altas) é apanhada aqui e sobe ao original.
     */
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
    const mbFinal: MoodBoard = { ...mb, images: vivas.map((r) => r.ref), principal };
    const formas = await Promise.all(vivas.map((r) => aspetoDaImagem(r.bytes)));
    const reais = caixasDoDesenho(mbFinal, formas);
    const finais = await mapLimit(
      vivas.map((r, i) => ({ r, caixa: reais[i] })),
      FETCH_CONCURRENCY,
      async ({ r, caixa }) => {
        // Já é o original: não há mais nada maior para onde subir.
        if (r.original) return r.bytes;
        const alvo = pixelsForBox(caixa.w, caixa.h, "collage");
        if (await cobre(r.bytes, alvo)) return r.bytes;
        // Ficou curta. Sobe-se ao original; se ELE falhar agora, fica-se com a
        // miniatura — uma foto mole é melhor do que uma foto que desaparece de
        // uma proposta.
        return (await bytesDoOriginal(r.ref)) ?? r.bytes;
      },
    );

    // A marca reindexada segue com o board: o gerador vai permutar por ela.
    return {
      board: { ...mb, images: finais.map((b) => b.toString("base64")), principal },
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
  if (opcoes.originais) {
    for (const [chave, e] of Object.entries(doc.fotosDasPaginas ?? {})) {
      // Os lugares vazios (`""`, «automático») FICAM: a posição é o lugar na
      // página (na paleta, o 6.º é o painel) e o foco de cada uma é o dela.
      const lista = e?.fotos ?? [];
      const obtidas = await mapLimit(lista, FETCH_CONCURRENCY, (ref) =>
        ref && ref.trim() ? buscarComTecto(ref, null) : Promise.resolve(null),
      );
      paginas[chave] = { ...e, fotos: obtidas.map((r) => (r ? r.bytes.toString("base64") : "")) };
      refsDasPaginas[chave] = lista.map((ref, k) => (obtidas[k] ? ref : null));
    }
  }

  return {
    doc: {
      ...doc,
      coverImages: cover,
      moodBoards: moodBoards.map((m) => m.board),
      ...(opcoes.originais ? { fotosDasPaginas: paginas } : {}),
    },
    missing,
    refs: { capa: refsDaCapa, temas: moodBoards.map((m) => m.refs), paginas: refsDasPaginas },
  };
}

/**
 * Turn a STORED `ProposalDoc` (image fields hold Storage paths, not bytes) into
 * a print-ready PDF: fill the studio's fixed boilerplate, resolve every image
 * reference to inline base64, then render.
 *
 * Shared by the admin generate/preview route and the public portal PDF route so
 * both produce byte-for-byte the same document from the same stored doc.
 */
export async function renderStoredProposalDocPdf(
  doc: ProposalDoc,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): Promise<Buffer<ArrayBuffer>> {
  return (await renderStoredProposalDocPdfWithReport(doc, idioma)).pdf;
}

/**
 * Como `renderStoredProposalDocPdf`, mas diz também o que o PDF não leva:
 *
 * - `missingImages` — fotos PEDIDAS que não entraram: as que não resolveram do
 *   armazenamento (ou passaram do tecto de imagens por documento) MAIS as que
 *   resolveram e que o gerador não conseguiu desenhar. É uma AVARIA: a
 *   correcção é voltar a tentar ou recarregar a foto.
 * - `truncations` — conteúdo que chegou inteiro e que o DESENHO não mostra
 *   todo (a sétima foto de um mood board, a terceira linha do "Local"…). É uma
 *   ESCOLHA de composição a morder o conteúdo: a correcção é editorial —
 *   tirar uma foto, criar outro mood board, encurtar um texto.
 *
 * Ficam separadas de propósito. Somá-las dava um número maior mas mais pobre:
 * a mensagem "N fotos não entraram" ficaria errada para texto cortado, e a
 * pessoa deixaria de saber se tem de recarregar alguma coisa ou de reescrever.
 * O que as une — e é o que interessa — é que ambas TÊM DE APARECER no aviso
 * antes de a proposta seguir para o cliente.
 */
export async function renderStoredProposalDocPdfWithReport(
  doc: ProposalDoc,
  /**
   * A língua em que o DOCUMENTO fala — só atravessa daqui para o gerador.
   *
   * Este ficheiro resolve FOTOS, e as fotos não têm língua: a resolução, os
   * tamanhos pedidos ao armazenamento e a contagem do que falta são exactamente
   * os mesmos nas duas línguas. O valor por omissão é o do gerador, e é o mesmo
   * pela mesma razão — quem já chamava isto continua a receber o que recebia.
   */
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): Promise<{ pdf: Buffer<ArrayBuffer>; missingImages: number; truncations: DocTruncation[] }> {
  // Fill the studio's fixed boilerplate (condições, observações, faseamento,
  // cancelamento) + event-token substitution so the caller only supplies what
  // varies per event.
  const withDefaults = withProposalDefaults(doc);
  /**
   * ── O RELÓGIO ARRANCA AQUI ──────────────────────────────────────────────
   *
   * Daqui para baixo está tudo o que a função gasta: as idas ao armazenamento
   * e o desenho. É o número que se compara com o tecto da rota — ver o aviso
   * no fim desta função.
   */
  const comecou = Date.now();
  const { doc: resolved, missing } = await resolveImages(withDefaults);
  // As duas contagens não se sobrepõem: o gerador só vê as fotos que
  // RESOLVERAM (as outras já foram descartadas aqui e contadas em `missing`),
  // por isso uma foto em falta nunca é também contada como cortada.
  const {
    bytes: pdfBytes,
    truncations,
    undrawnImages,
  } = await renderProposalDocPdfWithReport(resolved, idioma);
  // A foto que RESOLVEU e que o gerador não conseguiu desenhar (um WebP antigo
  // da biblioteca, bytes corrompidos) some-se aqui às que nem chegaram: para
  // quem vai enviar a proposta é a mesma coisa — uma foto que o cliente devia
  // ver e não vê, com a mesma correcção (tentar de novo, ou recarregá-la). Sem
  // esta soma era a perda MAIS invisível de todas: a foto existia, descarregava
  // bem, e desaparecia calada no desenho.
  const emFalta = missing + undrawnImages;
  if (emFalta > 0) {
    log.error("proposal-doc-render: PDF gerado com fotos EM FALTA", null, {
      emFalta,
      naoResolvidas: missing,
      naoDesenhadas: undrawnImages,
      ref: doc.ref,
    });
  }
  if (truncations.length > 0) {
    log.error("proposal-doc-render: PDF gerado com conteúdo CORTADO", null, {
      cortado: truncations.map((t) => `${t.where}: -${t.dropped} ${t.unit}`),
      ref: doc.ref,
    });
  }
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * QUANTO FALTAVA PARA A FUNÇÃO SER MORTA — MEDIDO, E NÃO ADIVINHADO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * As duas rotas que redesenham este documento para o CASAL declaram
   * `maxDuration = 20`. Ao fim desses vinte segundos a plataforma mata a
   * função, e o que aparece do outro lado não é um erro que se perceba: é um
   * pedido que falha sem dizer porquê, na página onde o casal ia ver a
   * proposta. Nunca se observou a acontecer — o que existe é a aritmética
   * (7,6 s de desenho para 80 fotografias, mais 6 a 12 s de armazenamento) a
   * dizer que a proposta grande está encostada ao tecto.
   *
   * Este registo é a diferença entre saber isso no dia em que acontecer a ela
   * e saber antes. Custa dois `Date.now()` e uma comparação, e o caminho
   * normal — uma proposta de seis a catorze fotografias, dois a cinco
   * segundos — não escreve nada.
   *
   * Três quartos do tecto e não o tecto inteiro: quando a conta JÁ não cabe,
   * não há registo nenhum para ler — a função foi morta a meio.
   */
  const demorou = Date.now() - comecou;
  if (demorou >= TECTO_DA_ROTA_MS * 0.75) {
    log.warn("proposal-doc-render: a geração está a encostar-se ao tecto da rota", {
      ms: demorou,
      tectoMs: TECTO_DA_ROTA_MS,
      fotos:
        withDefaults.coverImages.filter(Boolean).length +
        withDefaults.moodBoards.reduce((s, b) => s + (b.images?.length ?? 0), 0),
      ref: doc.ref,
    });
  }
  return { pdf: Buffer.from(pdfBytes), missingImages: emFalta, truncations };
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
  }
  const bytes = await original(ref);
  if (!bytes) return null;
  const reduzida = await reduzirParaEditorial(bytes);
  // Só se guarda o que o `sharp` conseguiu reduzir: se falhou, `reduzirParaEditorial`
  // devolve os bytes como vieram, e esses podem ser de 10 MB.
  if (guardar && reduzida !== bytes) fotosEditoriais.guardar(ref, reduzida);
  return reduzida;
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
      .jpeg({ quality: 86 })
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
  opcoes: { rascunho?: boolean } = {},
): Promise<{
  pdf: Buffer<ArrayBuffer>;
  missingImages: number;
  truncations: DocTruncation[];
  /** Que fotografia foi para cada página — o mesmo que `fotosDoEditorialDoDocumento`. */
  fotos: FotosDoPdf;
}> {
  const withDefaults = withProposalDefaults(doc);
  const { doc: resolved, missing, refs } = await resolveImages(withDefaults, { originais: true });
  const medidas = await medidasDaBiblioteca(caminhosDoDocumento(withDefaults));
  const { bytes, truncations, undrawnImages, fotos } = await renderEditorialPdf(
    resolved,
    idioma,
    opcoes,
    { refs, medidas },
  );
  return { pdf: Buffer.from(bytes), missingImages: missing + undrawnImages, truncations, fotos };
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
  const formas = await formasDeCaminhos(refs.filter(guardavel));
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
  const withDefaults = withProposalDefaults(doc);
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
  return fotosDoEditorial(withDefaults, idioma, medidas);
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
