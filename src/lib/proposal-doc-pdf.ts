import "server-only";
import {
  PDFDocument,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
  setCharacterSpacing,
  type PDFFont,
  type PDFPage,
  type PDFImage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { SITE } from "@/lib/site";
import {
  achatarLogotipo,
  aspetoDaImagem,
  imageContentKey,
  resizeToBox,
  transcodificarParaJpeg,
  type ImagePlacement,
} from "@/lib/proposal-image";
import {
  type ProposalDoc,
  type MoodBoard,
  MOOD_BOARD_MAX_IMAGES,
  depositPercentOf,
  resolveValidUntil,
} from "@/lib/proposal-doc";
import { ordemDeSaida, eAOrdemEscrita } from "@/lib/proposal-ordem";
import { ordemDasFotos } from "@/lib/proposal-moodboard";
import { eurDocumento, milharesComPonto, montanteNaLingua, round2 } from "@/lib/money";
import {
  normalizarValor,
  ressalvaDoValor,
  somaDosExtrasSemIva,
  totaisDaProposta,
} from "@/lib/proposal-budget";
import { LOGO_DARK_PNG_B64, LOGO_WHITE_PNG_B64 } from "@/lib/proposal-assets";
import {
  CARLITO_REGULAR_TTF_B64,
  CARLITO_BOLD_TTF_B64,
  CARLITO_ITALIC_TTF_B64,
} from "@/lib/proposal-fonts";
import { opcionaisDe, totaisDasVersoes } from "@/lib/orcamento/versoes-da-proposta";
import { textoParaFonte } from "@/lib/pdf-text";
import {
  alturaDaLegenda,
  caixasDoMoodboard,
  layoutSugerido,
  caixasDaCapa,
  caixasDoCollage,
  PAGINA_W,
  PAGINA_H,
  PAGINA_M,
  TOPO_DAS_FOTOS,
  TEXTO_DO_MOODBOARD as TXT,
  type CaixaPdf,
} from "@/lib/proposal-geometria";
import { log } from "@/lib/logger";
import {
  blocosFixosNaLingua,
  camposDoEventoNaLingua,
  referenciaNaLingua,
  rotuloDoTotalNaLingua,
  textosDaProposta,
  type CampoDoEvento,
} from "@/lib/proposal-doc-textos";
import { IDIOMA_POR_OMISSAO, type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";
import { docNaLingua } from "@/lib/proposal-doc-bilingue";

/**
 * A DATA POR EXTENSO mudou-se para `proposal-doc-textos.ts`, com o resto do que
 * o documento diz por si.
 *
 * Os meses eram abreviados («out.») e passaram a por extenso porque a única
 * data que passa por aqui é a validade da proposta — «Esta proposta é válida
 * até 11 de outubro de 2026» — e três linhas acima, nas Condições Gerais, o
 * mesmo documento escreve «no dia 29 de maio de 2027», que é texto dela. Duas
 * datas na mesma folha com dois formatos diferentes é a marca de duas mãos a
 * escrever o mesmo papel; e é por isso, também, que a forma inglesa põe o dia à
 * frente (ver lá o porquê).
 *
 * O motor de leitura aceita as duas formas (`[a-zç]{3,10}` em `campos.ts`),
 * portanto a ida e volta em português continua a devolver a data.
 */

/**
 * O SEPARADOR DE MILHARES DESTA FOLHA É O PONTO — e hoje o de todas.
 *
 * O `eurDoc` e o `milharesComPonto` nasceram aqui, privados, porque o problema
 * era desta folha: o «Valor Total» é texto escrito por ela, e ela escreve-o
 * como toda a gente escreve em Portugal («12.300,00 €»), enquanto o `Intl` de
 * pt-PT escrevia «12 300,00 €» — ou «2460,00 €», sem separador nenhum, porque
 * só agrupa a partir de cinco dígitos. Os dois lado a lado, no mesmo quadro.
 *
 * O mesmo defeito estava, sem ninguém dar por ele, na factura (base com espaço,
 * IVA sem nada, total com espaço — TUDO na mesma coluna) e no email que leva
 * esta proposta em anexo («7.890,00 €» no PDF, «7890,00 €» no email). Por isso
 * o formatador mudou-se para o `money.ts`, ao lado do `eur`, e passou a ser o
 * de todos os artefactos que o cliente lê. A decisão continua a ser a mesma —
 * o que mudou foi o âmbito; o raciocínio inteiro está escrito lá.
 *
 * O `milharesComPonto` continua a ser usado À PARTE do `eurDocumento` nos
 * sítios em que o valor é TEXTO DELA (o «Valor Total» escrito à mão, o valor
 * de um adicional): aí não há número nenhum para formatar, só pontuação para
 * acertar com a do resto da folha.
 */

/**
 * A taxa de IVA como se escreve ao lado do valor: 0,23 → «23%», 0,06 → «6%».
 *
 * Com casas decimais quando as tem (0,235 → «23,5%»), e com a vírgula do
 * português. O rótulo diz a taxa de propósito: «IVA» sozinho obriga quem lê a
 * saber qual foi aplicada, e uma proposta com taxa reduzida deixava de se poder
 * conferir a partir do papel.
 */
const percentagemDoIva = (taxa: number): string =>
  `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(round2(taxa * 100))}%`;

// ── Landscape A4 ── (a fonte é `proposal-geometria`, partilhada com o estúdio)
const W = PAGINA_W;
const H = PAGINA_H;
const M = PAGINA_M; // page margin — generous editorial whitespace, let the page breathe
/**
 * O CHÃO DA MANCHA — abaixo disto não se escreve.
 *
 * Um número só, para todas as secções. Era `M + 6` numas e `M + 24` noutras, e
 * havia secções (o cronograma) onde simplesmente não havia chão nenhum: o texto
 * continuava a ser desenhado para baixo, para fora da folha, sem erro e sem
 * aviso. O rodapé é desenhado em `M - 26`; isto fica bem acima dele.
 */
const CHAO = M + 6;
// Max text measure: long lines (~120+ chars edge-to-edge) are the biggest "DIY"
// tell. Cap body copy near the 45–75 char ideal.
const MEASURE = 430;

// ── Type scale (one display, one subtitle, one body, one caption) ──
const T_DISPLAY = 20; // section titles (serif)
const T_SUB = 13; // sub-section / group titles (serif)
const T_BODY = 10; // body copy
const T_CAPTION = 7.5; // eyebrows / captions (uppercase)

// ── Qualidade das imagens ──
// O orçamento de pixéis por sítio (capa vs célula de mood board) e o encode
// vivem em `@/lib/proposal-image`, com o raciocínio de DPI. Aqui só se diz ONDE
// cada foto é desenhada; quantos pixéis isso vale é decidido lá.

// ── Brand palette ──
// Moss/gold are deliberately rare now — quiet ink & grey type on white carry the
// interior; a single gold hairline marks the one accent moment (the total).
const INK = rgb(0.165, 0.149, 0.125); // #2a2620
const MUTED = rgb(0.42, 0.4, 0.36);
const FAINT = rgb(0.55, 0.53, 0.49);
const DARK = rgb(0.047, 0.055, 0.043); // #0c0e0b
const LINE = rgb(0.886, 0.871, 0.835); // #e2ded5

interface Fonts {
  reg: PDFFont;
  bold: PDFFont;
  serif: PDFFont;
  serifB: PDFFont;
  serifIt: PDFFont;
}

// ── O que o DESENHO deixa de fora ──
//
// O documento tem limites de composição: a página de mood board desenha 6
// fotos, a descrição do mood board 5 linhas, cada campo do evento 2 linhas, o
// nome na capa 2 linhas. Até aqui, o que passava desses limites desaparecia sem
// deixar rasto: as fotos tinham sido carregadas, tinham sido descarregadas do
// armazenamento com sucesso, e simplesmente não eram desenhadas.
//
// É a MESMA perda que a contagem de "fotos em falta" foi criada para apanhar
// (uma proposta seguiu para um noivo com fotos a menos e ninguém deu por isso),
// só que por outro caminho: ali a foto não chegou, aqui chegou e não coube.
// Por isso é contada — mas SEPARADA de `missingImages`, porque a causa e a
// correcção são outras: em falta = avaria, tenta-se de novo; cortado = escolha
// editorial, tira-se uma foto ou encurta-se o texto.
// Descrição sob o collage. O tecto vive na geometria, com o resto das medidas
// da página — a pré-visualização do estúdio corta no mesmo sítio.
const MAX_ANNOTATION_LINES = TXT.legenda.maxLinhas;

/* ═══════════════════════════════════════════════════════════════════════════
   A GEOMETRIA DO COLLAGE, SEPARADA DO DESENHO
   ═══════════════════════════════════════════════════════════════════════════

   Estas duas funções não desenham nada: dizem apenas ONDE, e com que tamanho,
   cada fotografia vai ser posta na página. Estavam dentro do `drawCollage`, em
   linha com o desenho.

   Saíram de lá por uma razão concreta. Quem vai BUSCAR as fotos ao
   armazenamento (`proposal-doc-render.ts`) precisa de saber o tamanho da caixa
   ANTES de descarregar seja o que for — é isso que lhe permite pedir a
   miniatura de 400 px para uma célula de 266 px em vez do original de 2200 px
   e 576 KB. Sem isto, a única forma de saber o tamanho era desenhar, e a
   única forma de desenhar era já ter descarregado tudo.

   Ter a geometria em DOIS sítios (uma cópia aqui, outra no resolvedor) seria
   pior do que não a ter: divergiriam, e o sintoma seria uma fotografia
   ampliada e desfocada numa proposta, meses depois, sem ninguém perceber
   porquê. Por isso é uma função só, e é esta que o desenho usa.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A geometria mudou-se para `@/lib/proposal-geometria` — o mesmo raciocínio de
 * cima, com um terceiro leitor: o ESTÚDIO, no browser, que precisa de mostrar
 * cada foto com a forma que ela vai ter no documento. Este ficheiro é
 * `server-only`, portanto nada do lado do cliente lhe pode tocar; a geometria
 * não é, e continua a ser uma função só.
 *
 * Reexportado aqui para que quem já importava daqui — e os testes que substituem
 * este módulo — continue a funcionar sem saber que a casa mudou.
 */
export { caixasDaCapa, caixasDoCollage, type CaixaPdf };
const MAX_EVENT_FIELD_LINES = 2; // cada campo da faixa de detalhes
/** O nome do casal na capa: TRÊS linhas, e não duas — ver o bloco «A CAPA NÃO
 *  CORTA O NOME DO CASAL». */
const MAX_COVER_NAME_LINES = 3;
/** Até onde o nome encolhe antes de partir. Era 26, e era aí que ele era
 *  cortado a meio; a 18 continua a ser o maior texto da folha. */
const COVER_NAME_MIN = 18;
/** As linhas de baixo da capa (tipo/data, local): duas, e o corpo mínimo. */
const MAX_COVER_LINE_LINES = 2;
const COVER_LINE_MIN = 8.5;
/** O título e o subtítulo de um mood board: duas linhas, e até onde encolhem.
 *  Ver o bloco «O CABEÇALHO DE UM MOOD BOARD CABE NA FOLHA». */
const MAX_BOARD_HEAD_LINES = 2;
const BOARD_TITLE_MIN = 14;
const BOARD_SUB_MIN = 9.5;

/** Uma perda por COMPOSIÇÃO: o conteúdo chegou inteiro ao gerador e o desenho
 *  não o mostra todo. Estruturada (e não uma frase feita) para o estúdio poder
 *  escrever a mensagem no idioma da interface e somar o que quiser. */
export interface DocTruncation {
  /** Onde, em pt-PT, como aparece ao utilizador: `Mood board «Cerimónia»`. */
  where: string;
  /** Quantas unidades ficaram por desenhar (nunca 0 — o que cabe não se anota). */
  dropped: number;
  /** O que se perdeu, para a frase concordar em número e género. */
  unit: "fotos" | "linhas";
}

/** Regista uma truncagem (ignora `dropped <= 0`, que é o caso normal). */
type NoteTruncation = (where: string, dropped: number, unit: DocTruncation["unit"]) => void;

/* ═══════════════════════════════════════════════════════════════════════════
   UMA SÓ ORDEM PARA O DOCUMENTO INTEIRO
   ═══════════════════════════════════════════════════════════════════════════

   ── O QUE FOI PARA A CLIENTE ─────────────────────────────────────────────
   Na proposta da Tara e do Marty, a lista de Serviços (pág. 02) dizia
   Cerimónia → Complementos → Cocktail → Jantar e o quadro do Orçamento
   (pág. 11) dizia Cerimónia → Cocktail → Jantar → Complementos. As mesmas
   quatro rubricas, o mesmo documento, duas ordens.

   ── PORQUE É QUE DIVERGEM ────────────────────────────────────────────────
   Porque são DUAS LISTAS ESCRITAS À MÃO, sem nada que as ligue:
   `serviceGroups` são grupos com itens (rótulo + descrição) e `budgetItems` é
   um array de nomes soltos — e os mood boards são uma TERCEIRA lista, com os
   títulos das páginas de inspiração. No estúdio nascem juntas: ao abrir uma
   proposta, os pontos que o casal marcou no pedido semeiam de uma vez o
   primeiro grupo de serviços E as linhas do orçamento, pela mesma ordem (ver
   `seedDefaults`, em ProposalStudio). A partir daí são editores separados:
   acrescentar uma linha ao orçamento não acrescenta um serviço, e arrastar um
   serviço não arrasta a linha. Basta uma alteração num dos lados para as duas
   ordens se separarem — e nada no sistema o dizia.

   ── O QUE SE FAZ AQUI, E O QUE NÃO SE FAZ ────────────────────────────────
   NÃO se fundem as listas: continuam a ser três, escritas por ela, cada uma
   com o seu conteúdo. O que passa a haver é uma FONTE ÚNICA DE ORDENAÇÃO —
   a lista de Serviços, que é a primeira que o casal lê — e o orçamento e os
   mood boards saem por essa ordem. Ela muda a ordem num sítio (arrastando os
   serviços) e o documento inteiro segue.

   Três travas, porque isto mexe num documento que vai para clientes:

     · **Sem correspondência, sem mudança.** Uma rubrica que não case com
       nenhum serviço não é movida: herda o lugar da anterior, ficando colada
       aos vizinhos com que ela a escreveu. Um documento onde nada case sai
       exactamente como saía.
     · **A comparação é conservadora.** Compara-se o nome sem acentos, sem
       maiúsculas e sem as palavras que não distinguem nada («Decor»,
       «Decoração», «Design Floral», artigos e preposições): «Decor Cerimónia»,
       «Decoração Cerimónia» e «Cerimónia» são a mesma rubrica. Se um nome
       casar com DOIS serviços à mesma distância, não casa com nenhum — na
       dúvida, não se mexe.
     · **Diz o que fez.** Toda a reordenação sai no relatório
       (`reordenacoes`) e nos registos, com as duas ordens à frente uma da
       outra. Isto não pode acontecer em silêncio.

   ── O QUE FALTA, E NÃO SE PODE FAZER DAQUI ───────────────────────────────
   Este ficheiro é `server-only`: o estúdio não o pode importar, portanto a
   lista do editor continua a mostrar a ordem em que ela escreveu as linhas,
   mesmo quando o PDF as imprime por outra. A correcção de fundo é a mesma que
   resolveria isto de raiz — as rubricas passarem a ser UMA lista com
   identidade estável, e o orçamento e os mood boards apontarem para ela — e
   vive no estúdio (`src/app/**`), fora do alcance desta frente.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Uma lista do documento que saiu por uma ordem diferente daquela em que está
 * escrita. Estruturada, como as truncagens, para quem mostra escrever a frase.
 */
export interface ReordenacaoDoDocumento {
  /** Onde, em pt-PT: `Orçamento`, `Mood boards`. */
  onde: string;
  /** A ordem escrita no documento. */
  de: string[];
  /** A ordem impressa — a dos Serviços. */
  para: string[];
}

/* As quatro peças da ordenação — `chaveDeRubrica`, `ordemDosCapitulos`,
   `lugarNaOrdem` e `porOrdemDosCapitulos` — viviam aqui e mudaram-se para
   `proposal-ordem.ts`. Este ficheiro é `server-only`, e enquanto a regra
   morou cá dentro o estúdio não a podia ler: o editor mostrava a ordem
   escrita, o PDF imprimia a dos Serviços, e a divergência que ela reportou
   continuou a ver-se no ecrã onde se trabalha. A regra é a mesma, sem uma
   linha de lógica alterada; o que mudou foi o sítio, para os dois lados a
   lerem. Ver o cabeçalho de lá. */

/**
 * Regista uma foto que CHEGOU inteira ao gerador e que não foi possível
 * DESENHAR (bytes corrompidos, ou um formato que nem o sharp nem o `pdf-lib`
 * aceitam).
 *
 * Não é uma truncagem: não há aqui escolha de composição nenhuma a morder o
 * conteúdo — é uma AVARIA, exactamente da mesma família da foto que não resolve
 * do armazenamento, e a correcção é a mesma (voltar a tentar, ou recarregar a
 * foto). Por isso soma-se às FOTOS EM FALTA e não ao conteúdo cortado.
 *
 * Recebe o base64 da foto para as contar por CONTEÚDO: a mesma foto escolhida
 * para os dois lados da capa é desenhada quatro vezes (capa + contracapa) e
 * falharia quatro vezes — dizer "4 fotos em falta" quando é uma só seria mandar
 * o estúdio procurar fotos que não existem.
 */
type NoteUndrawn = (b64: string) => void;

// ── Refined palette additions for the redesign ──
const CREAM = rgb(0.968, 0.957, 0.933); // #f7f4ee — warm off-white on the dark cover
const GOLD = rgb(0.541, 0.416, 0.114); // #8a6a1d — accent hairlines / eyebrows on light
const CREAM_DIM = rgb(0.72, 0.74, 0.71); // muted cream/sage for sub-text on dark

/** Embed image bytes into the PDF, trying JPEG then PNG by their magic bytes and
 *  never throwing. Returns null when the bytes are neither (so a bad image is
 *  simply omitted instead of failing the whole document). `embedJpg`/`embedPng`
 *  are awaited so a rejection (e.g. "SOI not found in JPEG") is caught here.
 *
 *  Último recurso: bytes que não são JPEG nem PNG são CONVERTIDOS para JPEG
 *  pelo sharp e embutidos assim. O `pdf-lib` só sabe embutir estes dois
 *  formatos, e a biblioteca do estúdio tem WebP a sério lá dentro (as fotos do
 *  Pinterest) — sem esta conversão, essas fotos não eram desenhadas de todo e
 *  ficava um buraco na página de inspiração. */
async function embedImage(doc: PDFDocument, cru: Buffer): Promise<PDFImage | null> {
  /**
   * UM `Buffer` DO NODE NEM SEMPRE COMEÇA NO PRINCÍPIO DA SUA MEMÓRIA.
   *
   * Abaixo de 4 KB, o `Buffer.from` serve-se de uma reserva partilhada: o
   * conteúdo é o esperado, mas vive a meio de um bloco maior — `byteOffset` não
   * é zero. O `JpegEmbedder` do `pdf-lib` faz `new DataView(bytes.buffer)` e
   * ignora esse deslocamento, portanto lê o princípio do BLOCO em vez do
   * princípio da imagem e recusa-a com «SOI not found in JPEG».
   *
   * Copiar para um `Uint8Array` que começa onde a imagem começa custa uns
   * poucos KB e fecha a porta. Atinge só ficheiros pequenos — o caminho
   * principal vem do sharp, que devolve sempre deslocamento zero — mas uma foto
   * pequena que desaparece é uma foto que desaparece.
   */
  const bytes = new Uint8Array(cru);
  const isJpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
  if (isJpg) {
    try {
      return await doc.embedJpg(bytes);
    } catch {
      /* fall through */
    }
  }
  if (isPng) {
    try {
      return await doc.embedPng(bytes);
    } catch {
      /* fall through */
    }
  }
  // Unknown/none of the magic bytes matched — last-resort attempts, still guarded.
  try {
    return await doc.embedJpg(bytes);
  } catch {
    /* fall through */
  }
  try {
    return await doc.embedPng(bytes);
  } catch {
    /* fall through */
  }
  // Nem JPEG nem PNG: o sharp lê WebP, AVIF, TIFF, GIF… — converte-se para
  // JPEG baseline e embute-se isso. Guardado como tudo o resto: uma foto que
  // nem assim entra é omitida, nunca deita abaixo o documento.
  try {
    const jpeg = await transcodificarParaJpeg(cru);
    if (jpeg) return await doc.embedJpg(jpeg);
  } catch {
    /* segue para o `null` */
  }
  return null;
}

/** Draw `img` to COVER the box (x,y,w,h) — the same visual result as CSS
 *  `object-fit: cover`: scaled to fill, centred, and the overflow clipped away.
 *  Uses pdf-lib's low-level content-stream clipping (pushGraphicsState → a
 *  rectangular clip path → drawImage → popGraphicsState). Because the image is
 *  scaled by a SINGLE factor `max(w/iw, h/ih)`, its aspect ratio is always
 *  preserved — it can never be stretched, only cropped by the clip. */
function drawImageCover(
  page: PDFPage,
  img: PDFImage,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.max(w / img.width, h / img.height); // fill, don't fit
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2; // centre the overflow
  const dy = y + (h - dh) / 2;
  page.pushOperators(
    pushGraphicsState(),
    moveTo(x, y),
    lineTo(x + w, y),
    lineTo(x + w, y + h),
    lineTo(x, y + h),
    closePath(),
    clip(),
    endPath(),
  );
  page.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
  page.pushOperators(popGraphicsState());
}

/**
 * Cache de imagens JÁ EMBUTIDAS neste documento, por CONTEÚDO + caixa de
 * destino. A capa é desenhada duas vezes (página 1 e contracapa) e a mesma foto
 * pode ser escolhida para os dois lados: sem isto, a mesma fotografia era
 * redimensionada pelo sharp e escrita no PDF até quatro vezes. Guarda-se a
 * Promise (não o resultado) para que dois desenhos simultâneos da mesma foto
 * partilhem o mesmo trabalho.
 */
type EmbedCache = Map<string, Promise<PDFImage | null>>;

/** Corre `make` uma só vez por `key` dentro deste documento. */
function once(cache: EmbedCache, key: string, make: () => Promise<PDFImage | null>) {
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = make();
  cache.set(key, pending);
  return pending;
}

/** Recorta uma imagem base64 para a caixa (x,y,w,h) de `page` e desenha-a.
 *
 *  Caminho principal: `resizeToBox` recorta ao aspeto EXATO da caixa, com os
 *  pixéis que o sítio (`placement`) justifica, e reencoda em JPEG baseline —
 *  desenhar isso às medidas da caixa não pode distorcer. Recurso (sharp
 *  indisponível/falhado): embute-se o ORIGINAL e desenha-se com `drawImageCover`,
 *  que preserva o aspeto por recorte — parece igual e continua a não poder
 *  esticar (era o bug das "fotos esticadas"). Nunca lança.
 *
 *  DEVOLVE se desenhou mesmo. Quem chama TEM de usar isto: a moldura fina do
 *  collage só pode ser desenhada por cima de uma foto que exista, e uma foto que
 *  não se consegue desenhar tem de ser contada como foto em falta. Um rectângulo
 *  de contorno vazio num PDF que vai para o cliente é pior do que não haver
 *  caixa nenhuma — foi assim que uma proposta seguiu com 6 molduras e 2 fotos.
 *
 *  As duas coisas são distintas e ambas contam: uma foto que sai pelo CAMINHO
 *  DE RECURSO foi desenhada (devolve `true`, leva moldura) e avisa
 *  `aoUsarRecurso` — saiu, apenas saiu pesada; só a foto que não se consegue
 *  desenhar de todo devolve `false`, e essa não avisa ninguém por aqui. */
async function drawCoverImage(
  doc: PDFDocument,
  page: PDFPage,
  b64: string,
  x: number,
  y: number,
  w: number,
  h: number,
  placement: ImagePlacement,
  cache: EmbedCache,
  /** Chamado quando esta foto entra pelo caminho de recurso (sem redimensionar). */
  aoUsarRecurso?: () => void,
): Promise<boolean> {
  const raw = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  let input: Buffer;
  try {
    input = Buffer.from(raw, "base64");
  } catch {
    return false;
  }
  if (input.length < 32) return false;

  // A chave inclui a caixa: a mesma foto na capa e numa célula de mood board
  // são embutidas com resoluções diferentes, logo são objetos diferentes.
  const content = imageContentKey(input);
  const box = `${Math.round(w)}x${Math.round(h)}:${placement}`;

  const img = await once(cache, `${content}@${box}`, async () => {
    const cropped = await resizeToBox(input, w, h, placement);
    return cropped ? await embedImage(doc, cropped) : null;
  });
  if (img) {
    // Recortada ao aspeto exato da caixa — desenhar às medidas dela não estica.
    page.drawImage(img, { x, y, width: w, height: h });
    return true;
  }

  // Recurso: embutir o ORIGINAL e ajustar por recorte (nunca esticar). Também
  // vai a cache — sem isto, uma foto que o sharp não consiga tratar era escrita
  // por inteiro no ficheiro tantas vezes quantas fosse desenhada.
  //
  // ── ISTO TEM DE SE VER ────────────────────────────────────────────────────
  // Este caminho foi desenhado para o PDF sair sempre, e cumpre — cumpre até
  // demais: um PDF verdadeiro de 3,31 MB chegou com as fotos a 266–576 DPI
  // quando o `PLACEMENT_DPI` manda 130–160, porque TODAS entraram por aqui e
  // ninguém deu por nada. Medido: com este código, as caixas produzem
  // exactamente 130 e 160 (ver PDF-BEFORE.md).
  //
  // Falhar em silêncio é o defeito. Contar não corrige a causa, mas põe-na à
  // vista: quem gerar uma proposta passa a saber que ela saiu pesada, e o
  // registo diz porquê.
  //
  // ── E TEM DE PASSAR PELO SHARP, NEM QUE SEJA SÓ PARA RODAR ────────────────
  // O `pdf-lib` lê o tamanho de um JPEG no marcador SOF e não faz ideia do que
  // seja a orientação EXIF. Uma foto tirada com o telemóvel ao alto vem
  // guardada deitada, com uma etiqueta a dizer «roda-me» — e por este caminho
  // era embutida tal como está: DEITADA na página, e recortada contra o eixo
  // errado, que é a segunda maneira de uma foto sair «desconfigurada».
  //
  // `transcodificarParaJpeg` faz `.rotate()` (e achata a transparência), e é
  // barato comparado com o que se está a evitar. Só se ISSO falhar é que se
  // embute o original em bruto — o último dos últimos recursos.
  aoUsarRecurso?.();
  const orig = await once(cache, `${content}@original`, async () => {
    const direito = await transcodificarParaJpeg(input);
    if (direito) {
      const img = await embedImage(doc, direito);
      if (img) return img;
    }
    return embedImage(doc, input);
  });
  if (orig) {
    drawImageCover(page, orig, x, y, w, h);
    return true;
  }
  // Não há foto nenhuma para esta caixa. Quem chamou não desenha a moldura e
  // conta-a como em falta.
  return false;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TEXTO ESPAÇADO É UM TEXTO, E NÃO UMA FILA DE LETRAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «LÍQUEN EVENTS» no rodapé e «INSPIRAÇÃO» por cima de cada mood board eram
 * desenhados GLIFO A GLIFO — um `drawText` por letra, com a posição calculada à
 * mão. Funcionava no papel e não funcionava em mais lado nenhum:
 *
 *   · procurar «Líquen» DENTRO do PDF não encontrava nada (medido: zero
 *     ocorrências nos oito ficheiros do relatório) — cada letra é uma corrida
 *     de texto isolada, e nenhum motor de busca junta corridas;
 *   · copiar do visualizador dava «L Í Q U E N   E V E N T S»;
 *   · e cada palavra custava treze operadores de texto em vez de um, em todas
 *     as páginas do documento.
 *
 * O PDF tem um operador para isto desde sempre — `Tc`, o espaçamento entre
 * caracteres — e a pdf-lib exporta-o (`setCharacterSpacing`). É estado
 * gráfico, por isso vai entre um `q` e um `Q`: sem eles, o espaçamento ficava
 * ligado para o resto da página e o corpo do texto saía todo esparramado.
 *
 * ── A LARGURA CONTINUA A SER A MESMA ──────────────────────────────────────
 * O `Tc` acrescenta o espaço DEPOIS de cada glifo, incluindo o último: o
 * avanço total é `largura + espaçamento × n`. Para centrar, o que interessa é
 * a tinta — `largura + espaçamento × (n − 1)` —, que é exactamente a conta que
 * o desenho letra a letra já fazia. A palavra fica onde estava.
 */
function larguraEspacada(font: PDFFont, texto: string, size: number, tracking: number): number {
  const n = [...texto].length;
  return font.widthOfTextAtSize(texto, size) + tracking * Math.max(0, n - 1);
}

/** Desenha `texto` com espaçamento entre letras, numa só corrida de texto. */
function drawEspacado(
  p: PDFPage,
  texto: string,
  x: number,
  y: number,
  o: { font: PDFFont; size: number; color: ReturnType<typeof rgb>; tracking: number },
): void {
  p.pushOperators(pushGraphicsState(), setCharacterSpacing(o.tracking));
  p.drawText(texto, { x, y, font: o.font, size: o.size, color: o.color });
  p.pushOperators(popGraphicsState());
}

/**
 * ── ONDE O DESENHO CORTA, O PAPEL DI-LO ────────────────────────────────────
 *
 * A composição tem limites — o nome da capa, os campos do evento, a legenda de
 * um mood board — e o que passava deles acabava a meio da frase, sem sinal
 * nenhum: «… ao casal. Linha». Quem lê não tem como distinguir «o texto acabou»
 * de «o texto foi cortado», e é a mesma folha que vai para o cliente.
 *
 * O relatório de truncagens continua a contar tudo (é o que o estúdio lê antes
 * de enviar); as reticências são para quem só tem o papel.
 */
const RETICENCIAS = "…";

/** `texto` cortado à largura pedida, com «…» a dizer que foi cortado. */
function comReticencias(
  font: PDFFont,
  texto: string,
  size: number,
  maxWidth: number,
  tracking = 0,
): string {
  const safe = textoParaFonte(font, texto);
  if (larguraEspacada(font, safe, size, tracking) <= maxWidth) return safe;
  const cauda = textoParaFonte(font, RETICENCIAS);
  let corte = safe;
  while (corte.length > 1 && larguraEspacada(font, corte + cauda, size, tracking) > maxWidth) {
    corte = corte.slice(0, -1);
  }
  // Sem a pontuação nem o espaço que ficaram pendurados no sítio do corte.
  return corte.replace(/[\s.,;:·—–-]+$/u, "") + cauda;
}

/**
 * Quebra `texto` e corta a `maxLinhas`, com «…» na última quando sobrou texto.
 *
 * Devolve também quantas linhas ficaram de fora, para quem chama as poder
 * anotar no relatório — cortar em silêncio é o defeito, não a solução.
 */
function quebrarComReticencias(
  font: PDFFont,
  texto: string,
  size: number,
  maxWidth: number,
  maxLinhas: number,
  tracking = 0,
): { linhas: string[]; cortadas: number } {
  const todas = wrap(font, texto, size, maxWidth, tracking);
  if (todas.length <= maxLinhas) return { linhas: todas, cortadas: 0 };
  const linhas = todas.slice(0, maxLinhas);
  const resto = todas.slice(maxLinhas).join(" ").trim();
  // A última linha fica com o que couber dela mais o princípio do que se
  // perdeu, e acaba em «…»: é o sinal de que há texto a seguir.
  linhas[maxLinhas - 1] = comReticencias(
    font,
    `${linhas[maxLinhas - 1]} ${resto}`.trim(),
    size,
    maxWidth,
    tracking,
  );
  return { linhas, cortadas: todas.length - maxLinhas };
}

function wrap(
  font: PDFFont,
  rawText: string,
  size: number,
  maxWidth: number,
  /** O espaçamento entre letras, quando a linha vai ser desenhada espaçada.
   *  Sem ele, uma capitular espaçada media-se estreita e desenhava-se larga —
   *  foi assim que a linha do tipo e da data escorreu para fora do painel da
   *  capa por cima das fotografias. */
  tracking = 0,
): string[] {
  // Sanitiza para WinAnsi antes de medir/quebrar — descrições e notas do
  // documento podem trazer caracteres que a Helvetica não codifica.
  const text = textoParaFonte(font, rawText);
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (larguraEspacada(font, test, size, tracking) > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

/**
 * Quebra com RECUO DE PRIMEIRA LINHA — a primeira linha mais curta do que as
 * seguintes, porque tem o rótulo a negro a ocupar-lhe o princípio.
 *
 * É a quebra das linhas de um serviço. Antes, TODAS as linhas eram quebradas à
 * largura da primeira (a que sobra depois do rótulo) e as seguintes eram
 * desenhadas mais à esquerda — o que lhes deixava largura a sobrar e nunca a
 * faltar. Estava escrito no código que era «conservador de propósito», e o
 * resultado no papel era uma mancha irregular: medido, uma linha a acabar em
 * x=1154 e a seguinte em x=731, um buraco de 35% da largura no meio de um
 * parágrafo.
 *
 * Medir cada linha à largura a que ela é DESENHADA não é menos conservador: é
 * a mesma regra do resto do ficheiro — a altura que se mede é a altura que se
 * desenha —, aplicada também à largura.
 */
function wrapComRecuo(
  font: PDFFont,
  rawText: string,
  size: number,
  larguraDaPrimeira: number,
  larguraDasSeguintes: number,
): string[] {
  const text = textoParaFonte(font, rawText);
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      // Só a PRIMEIRA linha de todas leva o recuo: é a única que é desenhada à
      // frente do rótulo. Um parágrafo seguinte já começa à esquerda.
      const largura = out.length === 0 ? larguraDaPrimeira : larguraDasSeguintes;
      if (font.widthOfTextAtSize(test, size) > largura && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

/** Como {@link renderProposalDocPdfWithReport}, mas só os bytes — para quem não
 *  tem a quem dar o relatório (a pré-visualização de desenvolvimento). */
export async function renderProposalDocPdf(
  doc: ProposalDoc,
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): Promise<Uint8Array> {
  return (await renderProposalDocPdfWithReport(doc, idioma)).bytes;
}

/**
 * Gera o PDF E diz o que o desenho deixou de fora:
 *
 * - `truncations` — conteúdo que chegou inteiro e que a COMPOSIÇÃO não mostra
 *   todo (ver {@link DocTruncation}).
 * - `undrawnImages` — fotos distintas que chegaram e que não foi possível
 *   desenhar (ver {@link NoteUndrawn}). São fotos EM FALTA, e quem chama
 *   soma-as à contagem que já existe.
 * - `semRedimensionar` — fotos que FORAM desenhadas, mas pelo caminho de
 *   recurso, com o original embutido. Não faltam ao cliente; o PDF é que sai
 *   pesado a abrir e a percorrer.
 * - `reordenacoes` — listas que saíram por ordem diferente da que está escrita
 *   no documento, para o casal não ler duas ordens da mesma coisa (ver
 *   {@link ReordenacaoDoDocumento}). Vazio é o normal: quer dizer que o
 *   orçamento e os mood boards já estavam pela ordem dos serviços.
 *
 * As duas últimas não se confundem: uma foto ou não sai (`undrawnImages`) ou
 * sai pesada (`semRedimensionar`) — nunca as duas.
 *
 * O relatório sai daqui, e não de uma contagem feita por fora, porque só aqui
 * se sabe: as linhas dependem das métricas da fonte embutida e da largura da
 * caixa onde o texto é desenhado, e só aqui se descobre que uma foto não se
 * consegue embutir. Calculá-lo noutro sítio era garantir que um dia deixava de
 * coincidir com o que sai impresso.
 */
export async function renderProposalDocPdfWithReport(
  doc: ProposalDoc,
  /**
   * A língua em que o DOCUMENTO fala — a moldura, não o conteúdo dela.
   *
   * Por omissão português: quem já chamava isto continua a desenhar exactamente
   * o que desenhava. Ver `proposal-doc-textos.ts` para o que se traduz e o que
   * sai tal e qual.
   */
  idioma: IdiomaDaProposta = IDIOMA_POR_OMISSAO,
): Promise<{
  bytes: Uint8Array;
  truncations: DocTruncation[];
  undrawnImages: number;
  semRedimensionar: number;
  reordenacoes: ReordenacaoDoDocumento[];
}> {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O DOCUMENTO PORTUGUÊS — GUARDADO ANTES DE MAIS NADA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * É o documento como ela o escreveu, e é ele que manda em duas coisas que a
   * projecção não pode tocar:
   *
   *  1. A ORDEM. Ver o bloco «UMA SÓ ORDEM PARA O DOCUMENTO INTEIRO» — a ordem
   *     é calculada pelos NOMES dos serviços, e uma rubrica traduzida deixa de
   *     casar com o serviço português. Calculada sobre o documento inglês, um
   *     documento meio traduzido saía com o orçamento e os mood boards por
   *     outra ordem, em silêncio, e só no PDF do casal inglês.
   *  2. OS AVISOS. O relatório de truncagens e de reordenações é lido no
   *     estúdio, que é português — pela mesma razão que o `pt` aqui em baixo
   *     existe.
   */
  const docPt = doc;
  /**
   * A prosa dela na língua pedida — o que ela traduziu entra no lugar do
   * português, o que não traduziu fica como está, sem marca nenhuma no papel.
   *
   * A projecção é AQUI e não em cada rota: são cinco os caminhos que desenham
   * (a pré-visualização do estúdio, o envio, o link do casal, o portal e a
   * pré-visualização de desenvolvimento), e projectar em cada um era garantir
   * que um dia um deles se esquecia. É o mesmo ponto onde a língua já entra
   * para os blocos fixos.
   *
   * Em português devolve o MESMO objecto, por referência: o caminho de omissão
   * não faz cópia nenhuma nem desenha nada de diferente.
   */
  doc = docNaLingua(doc, idioma);
  /** O que o documento diz por si, na língua pedida. */
  const t = textosDaProposta(idioma);
  /**
   * Os mesmos textos em português — para os AVISOS.
   *
   * O relatório de truncagens e de reordenações é lido no estúdio, que é
   * português, e não pode mudar de língua porque o PDF de um casal saiu em
   * inglês: «Campo «Venue» cortado» manda quem lê procurar um rótulo que não
   * existe no editor.
   */
  const pt = textosDaProposta("pt");
  /** As notas, condições e observações — traduzidas só quando são as da casa. */
  const fixos = blocosFixosNaLingua(doc, idioma);
  /**
   * A data, o tipo, a cerimónia e o número de convidados — traduzidos só quando
   * ainda são o que o estúdio lá pôs (ver `proposal-doc-textos.ts`).
   *
   * Não substituem o `doc`: os avisos e os registos continuam a citar a proposta
   * pelos campos em que ela foi escrita, que são os que ela vê no editor.
   */
  const evento = camposDoEventoNaLingua(doc, idioma);
  /**
   * O DINHEIRO NA LÍNGUA DO DOCUMENTO.
   *
   * Numa folha inglesa «4.600,00 €» escreve-se «€4,600.00». Passa por aqui TUDO
   * o que é montante — as nossas contas e os campos que ela escreve à mão —,
   * porque converter só metade punha as duas pontuações na mesma coluna do
   * mesmo quadro. Em português é a identidade: a folha portuguesa não muda um
   * carácter. Ver `montantesEmIngles`.
   */
  const dinheiro = (texto: string) => montanteNaLingua(milharesComPonto(texto), idioma);
  const eurDoc = (n: number, moeda?: string) => dinheiro(eurDocumento(n, moeda));
  /** A referência que corre no topo — na língua do documento se foi o estúdio a
   *  compô-la, tal e qual se foi ela a escrevê-la. */
  const refImpressa = referenciaNaLingua(doc, idioma);
  const truncations: DocTruncation[] = [];
  /** As listas que saíram por ordem diferente da escrita — ver o bloco «UMA SÓ
   *  ORDEM PARA O DOCUMENTO INTEIRO». Vazio é o normal. */
  const reordenacoes: ReordenacaoDoDocumento[] = [];
  /**
   * Quantas fotos entraram SEM serem redimensionadas.
   *
   * Zero é o normal. Qualquer outro número quer dizer que o `sharp` falhou e
   * que o PDF saiu com as fotos em tamanho de armazenamento — pesado a abrir e
   * a percorrer. Era exactamente isto que estava a acontecer sem ninguém saber.
   */
  let semRedimensionar = 0;
  const contarRecurso = () => {
    semRedimensionar++;
  };
  const note: NoteTruncation = (where, dropped, unit) => {
    if (dropped > 0) truncations.push({ where, dropped, unit });
  };
  // Por CONTEÚDO: a mesma foto que falha em vários sítios é uma foto, não
  // várias (ver NoteUndrawn).
  const undrawn = new Set<string>();
  const noteUndrawn: NoteUndrawn = (b64) => {
    undrawn.add(b64);
  };

  const pdf = await PDFDocument.create();
  // Uma foto = um redimensionamento e um objeto no ficheiro, por muitas vezes
  // que seja desenhada (ver EmbedCache). Vive só durante este documento.
  const images: EmbedCache = new Map();
  /** Desenha uma foto do documento E conta-a nas duas contagens: quando não sai
   *  de todo (`noteUndrawn`) e quando sai pelo caminho de recurso, sem
   *  redimensionar (`contarRecurso`). Usar sempre isto em vez de
   *  `drawCoverImage` direto: é o que garante que uma foto que não se desenha
   *  nunca fica invisível para quem vai enviar a proposta, e que um PDF que
   *  saiu pesado o diz. */
  const photo = async (
    p: PDFPage,
    b64: string,
    x: number,
    y: number,
    w: number,
    h: number,
    placement: ImagePlacement,
  ): Promise<boolean> => {
    const drawn = await drawCoverImage(pdf, p, b64, x, y, w, h, placement, images, contarRecurso);
    if (!drawn) noteUndrawn(b64);
    return drawn;
  };
  pdf.registerFontkit(fontkit);
  // Carlito — a free, metric-compatible twin of Microsoft Calibri, the font the
  // studio's real "PO Decoração" sample proposals are set in. Embedding it (from
  // base64 WOFF, like the logos) means the generated PDF matches those samples
  // instead of mixing Helvetica + Times (neither of which appears in the
  // samples). One family, used everywhere; subset:true keeps only drawn glyphs.
  const carlito = (b64: string) => pdf.embedFont(Buffer.from(b64, "base64"), { subset: true });
  const reg = await carlito(CARLITO_REGULAR_TTF_B64);
  const bold = await carlito(CARLITO_BOLD_TTF_B64);
  const italic = await carlito(CARLITO_ITALIC_TTF_B64);
  // The layout still names "serif"/"serifB"/"serifIt" slots for its elegant
  // moments; in the sample proposals those are simply Calibri regular/bold/
  // italic, so every slot now resolves to Carlito — one consistent typeface.
  const f: Fonts = { reg, bold, serif: reg, serifB: bold, serifIt: italic };
  /**
   * O logótipo das PÁGINAS DE CONTEÚDO entra achatado contra branco, sem canal
   * alfa, e à resolução a que é desenhado.
   *
   * Antes disto ia como PNG com máscara alfa, composto em todas as páginas e a
   * 720 DPI — a única transparência do documento e a única coisa em resolução
   * absurda (as fotografias vão a 130–160). Compor transparência é das
   * operações mais caras num visualizador de PDF, e estava a ser paga uma vez
   * por página para desenhar uma marca que assenta sobre branco chapado.
   *
   * ── Porque é que só esta, e não a da capa ────────────────────────────────
   * O `sharp` compõe em luz linear, e o resultado sai um nível abaixo da cor
   * pedida: medido no ficheiro, a caixa do logótipo dava 11,13,10 onde o painel
   * escuro da capa dá 12,14,11. Contra o verde-escuro isso desenhava um
   * RECTÂNGULO visível à volta da marca; contra BRANCO PURO não há desvio
   * nenhum, porque 255 não tem para onde subir.
   *
   * Por isso achata-se a das páginas de conteúdo — que são 10 das 12
   * utilizações, e portanto quase todo o ganho — e deixa-se a da capa com o
   * canal alfa. Duas composições de transparência em vez de doze, e a capa
   * continua exactamente com o aspecto que ela aprovou.
   *
   * Se o `sharp` falhar, volta-se ao PNG original: o documento sai na mesma,
   * apenas sem esta melhoria.
   */
  const logoDarkPng = Buffer.from(LOGO_DARK_PNG_B64, "base64");
  const logoDarkChato = await achatarLogotipo(logoDarkPng, { r: 255, g: 255, b: 255 }, 72);
  const logoDark = await pdf.embedPng(logoDarkChato ?? logoDarkPng);
  // A da capa mantém a transparência, pela razão acima.
  const logoWhite = await pdf.embedPng(Buffer.from(LOGO_WHITE_PNG_B64, "base64"));

  // Sanitiza no ponto de desenho: campos do documento (nomes, descrições…) podem
  // conter caracteres que o WinAnsi/Helvetica não codifica (→ drawText lança).
  const text = (
    p: PDFPage,
    s: string,
    x: number,
    y: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) =>
    p.drawText(textoParaFonte(o.font ?? f.reg, s), {
      x,
      y,
      font: o.font ?? f.reg,
      size: o.size ?? 10,
      color: o.color ?? INK,
    });

  const textRight = (
    p: PDFPage,
    s: string,
    xR: number,
    y: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const fn = o.font ?? f.reg;
    const safe = textoParaFonte(fn, s);
    const sz = o.size ?? 10;
    p.drawText(safe, {
      x: xR - fn.widthOfTextAtSize(safe, sz),
      y,
      font: fn,
      size: sz,
      color: o.color ?? INK,
    });
  };

  // Centred text helper (used on the cover).
  const textCenter = (
    p: PDFPage,
    s: string,
    cx: number,
    y: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; tracking?: number } = {},
  ) => {
    const fn = o.font ?? f.reg;
    const safe = textoParaFonte(fn, s);
    const sz = o.size ?? 10;
    if (o.tracking) {
      // Capitulares espaçadas — UMA corrida de texto, com o `Tc` do PDF a
      // abrir as letras. Ver `drawEspacado`: é o que as torna pesquisáveis.
      drawEspacado(p, safe, cx - larguraEspacada(fn, safe, sz, o.tracking) / 2, y, {
        font: fn,
        size: sz,
        color: o.color ?? INK,
        tracking: o.tracking,
      });
      return;
    }
    p.drawText(safe, {
      x: cx - fn.widthOfTextAtSize(safe, sz) / 2,
      y,
      font: fn,
      size: sz,
      color: o.color ?? INK,
    });
  };

  // Content-page header: small colour logo top-left, running ref top-right — kept
  // light and quiet so it never competes with the page's content.
  const header = (p: PDFPage) => {
    const lw = 72;
    const lh = (logoDark.height / logoDark.width) * lw;
    p.drawImage(logoDark, { x: M, y: H - M - lh + 6, width: lw, height: lh });
    textRight(p, refImpressa, W - M, H - M - 2, { size: 8, color: FAINT });
  };

  /** Os rodapés à espera do número de folhas — ver o bloco dentro do `footer`. */
  const rodapesPorNumerar: { p: PDFPage; folha: number }[] = [];

  // Calm footer: a pale hairline, quiet brand + email, plain page number. Called
  // on every content page so the document reads as one considered, paginated piece.
  const footer = (p: PDFPage) => {
    p.drawLine({
      start: { x: M, y: M - 12 },
      end: { x: W - M, y: M - 12 },
      thickness: 0.5,
      color: LINE,
    });
    drawEspacado(p, textoParaFonte(f.bold, "LÍQUEN EVENTS"), M, M - 26, {
      font: f.bold,
      size: 6.5,
      color: FAINT,
      tracking: 1.4,
    });
    textRight(p, SITE.email, W - M, M - 26, { size: 7, color: FAINT });
    /**
     * ── «01 DE 09», E NÃO «01» ─────────────────────────────────────────────
     *
     * O número da folha sozinho não diz nada a quem imprime: com «01» não se
     * sabe se o documento tem nove folhas ou vinte e uma, nem se chegaram
     * todas. Falta o denominador — e o denominador só se sabe no fim.
     *
     * Por isso o rodapé fica com o SÍTIO marcado e é escrito na volta final,
     * quando as páginas já existem todas (ver `rodapesPorNumerar`). É a única
     * coisa deste documento que precisa de uma segunda passagem, e é barata:
     * a pdf-lib guarda as páginas em memória até ao `save`.
     *
     * O número é o da FOLHA, contado a partir da capa: é o que se conta na
     * mão. A capa e a contracapa não levam rodapé, mas contam — «02 de 09» na
     * primeira folha de conteúdo é verdade, «01 de 07» não era.
     */
    rodapesPorNumerar.push({ p, folha: pdf.getPageCount() });
  };

  // A page frame = header + footer, returning the starting y for the body.
  const frame = (p: PDFPage): number => {
    header(p);
    footer(p);
    return H - M - 84;
  };

  // Quiet uppercase eyebrow/label — pale grey by default so it whispers rather
  // than shouts. The one consistent "voice" for small labels across the document.
  const eyebrow = (p: PDFPage, s: string, x: number, y: number, color = FAINT, size?: number) => {
    const sz = size ?? T_CAPTION;
    // Uma corrida de texto com o espaçamento do PDF — ver `drawEspacado`.
    drawEspacado(p, textoParaFonte(f.bold, s.toUpperCase()), x, y, {
      font: f.bold,
      size: sz,
      color,
      tracking: 2,
    });
  };
  /**
   * ── AS SECÇÕES SÃO NUMERADAS, COMO NA FOLHA DELA ──────────────────────────
   *
   * «1. Apresentação», «2. Serviços», «3. Orçamento Proposto». É assim que a
   * proposta que ela envia há anos numera os capítulos, e é o que dá ao casal
   * uma maneira de falar do documento ao telefone («no ponto 3…»).
   *
   * O número é CONTADO e não escrito: as secções que existem variam com o
   * modelo — a de Organização tem cronograma e a de Decoração não —, e dois
   * números escritos à mão davam, mais cedo ou mais tarde, o defeito que a
   * folha antiga tem e que não se copia: «2. Serviços» seguido de «2. Serviços
   * Disponibilizados», duas secções com o mesmo número na mesma página.
   *
   * Conta-se por ORDEM DE DESENHO, que é a ordem por que se lê.
   */
  let seccoesNumeradas = 0;
  const numerada = (titulo: string) => `${++seccoesNumeradas}. ${titulo}`;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O DINHEIRO DO DOCUMENTO — CALCULADO UMA VEZ, PARA AS DUAS FOLHAS
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A folha do orçamento e a folha do fecho falavam do mesmo dinheiro e
   * calculavam-no cada uma por sua conta — uma em base, a outra em bruto —, e
   * foi assim que a proposta da Tara e do Marty saiu a dizer 2.950,79 € numa
   * página e 3.025,80 € (907,74 + 2.118,06) na outra. Agora é um só objecto,
   * lido duas vezes e calculado nenhuma: ver `totaisDaProposta`.
   */
  const totais = totaisDaProposta(doc, depositPercentOf(doc));

  /**
   * ── A VERIFICAÇÃO ANTES DE GERAR (avisa, não bloqueia) ────────────────────
   *
   * Palavras dela: «uma proposta que não sai é pior do que uma proposta com um
   * aviso». Por isso isto não deita nada abaixo — regista, e o PDF sai na mesma.
   * O que se verifica é o que falhou a sério: que o subtotal e os adicionais
   * somam o TOTAL, que o TOTAL e o IVA somam o total a pagar, e que o sinal e o
   * saldo somam o total a pagar. Se um dia voltar a haver uma conversão a mais
   * pelo caminho, o cêntimo aparece aqui e não no PDF da cliente.
   */
  if (!totais.fecha) {
    log.error("proposal-doc-pdf: as somas do documento não fecham", null, {
      ref: doc.ref,
      porque: totais.porQueNaoFecha.join("; "),
      totais: {
        servicos: totais.servicos,
        adicionais: totais.adicionais,
        total: totais.total,
        iva: totais.iva,
        aPagar: totais.aPagar,
        sinal: totais.sinal,
        saldo: totais.saldo,
      },
    });
  }

  // Section header: a small quiet eyebrow, the serif title, and a very thin, short
  // pale hairline. No colour, no weight — the title alone carries the section.
  const sectionHeader = (p: PDFPage, kicker: string, title: string, y: number): number => {
    eyebrow(p, kicker, M, y);
    text(p, title, M, y - 24, { font: f.serifB, size: T_DISPLAY, color: INK });
    p.drawLine({
      start: { x: M, y: y - 36 },
      end: { x: M + 32, y: y - 36 },
      thickness: 0.6,
      color: LINE,
    });
    return y - 58;
  };

  // ── Page 1 — Cover ──
  {
    const p = pdf.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: DARK });

    const hasImgs = !!(doc.coverImages[0] || doc.coverImages[1]);
    if (hasImgs) {
      // Two side photos flanking a centre band — the editorial "gatefold" look.
      const panelW = W * 0.34;
      const sideW = (W - panelW) / 2;
      const left = doc.coverImages[0];
      const right = doc.coverImages[1];
      // A capa não leva moldura (foi retirada a pedido), por isso uma foto que
      // não saia não deixa cá rectângulo nenhum — mas continua a ser uma foto
      // que o cliente devia ter visto e não vê, logo é contada. E o `photo`
      // encaminha também a contagem do caminho de recurso: a capa é a maior
      // caixa do documento, é a que mais pesa quando entra sem redimensionar.
      if (left) await photo(p, left, 0, 0, sideW, H, "cover");
      if (right) await photo(p, right, sideW + panelW, 0, sideW, H, "cover");
      p.drawRectangle({ x: sideW, y: 0, width: panelW, height: H, color: DARK });
    }

    const cx = W / 2;
    // No border frame around the cover — removed on request for a cleaner,
    // edge-to-edge look (the two side photos run to the trim).

    // White logo, upper area.
    const lw = 148;
    const lh = (logoWhite.height / logoWhite.width) * lw;
    p.drawImage(logoWhite, { x: cx - lw / 2, y: H - 150, width: lw, height: lh });

    // Eyebrow (gold small-caps) + gold rule.
    const kicker = doc.template === "organizacao" ? t.capaOrganizacao : t.capaDecoracao;
    textCenter(p, kicker.toUpperCase(), cx, 336, {
      font: f.bold,
      size: 9,
      color: rgb(0.72, 0.6, 0.34),
      tracking: 3.2,
    });
    p.drawRectangle({ x: cx - 26, y: 324, width: 52, height: 1.1, color: rgb(0.72, 0.6, 0.34) });

    /* ═══════════════════════════════════════════════════════════════════════
       A CAPA NÃO CORTA O NOME DO CASAL
       ═══════════════════════════════════════════════════════════════════════

       Com «Maria da Conceição Gonçalves Ançã & Jean-François Ålström-Nørgaard»,
       a capa imprimia

           Maria da Conceição
           Gonçalves Ançã &

       — o noivo desaparecia e a capa ACABAVA NUM «&». O nome encolhia de 52
       para 26 e era cortado às duas linhas; o corte era anotado no relatório,
       que é lido no estúdio, e o PDF saía na mesma.

       Três degraus, por esta ordem, e nenhum deles deixa o nome a meio:

        1. ENCOLHER até 18 (era 26). Os oito pontos que faltavam são a
           diferença entre caber e não caber na esmagadora maioria dos nomes
           compridos — 61 caracteres cabem em duas linhas a 18.
        2. TRÊS LINHAS em vez de duas. A capa tem lugar: entre a régua dourada
           (324) e a linha do tipo/data (214) há 110 pontos, e três linhas a 18
           ocupam 38.
        3. E só se nem assim couber, O NOME MAIS CURTO — «Maria &
           Jean-François» em vez de meio nome seguido de um «&» solto. Um nome
           encurtado lê-se como uma escolha; um nome cortado lê-se como avaria.

       Continua a ser anotado no relatório, porque continua a faltar conteúdo à
       folha — o que deixa de haver é uma capa errada. */
    /** O primeiro nome de cada lado do «&» — o nome por que o casal se trata. */
    const nomeCurtoDoCasal = (completo: string): string => {
      const lados = completo.split(/\s*&\s*/).filter((l) => l.trim());
      if (lados.length < 2) return "";
      const curto = lados.map((l) => l.trim().split(/\s+/)[0]).join(" & ");
      return curto === completo.trim() ? "" : curto;
    };
    // Sanitiza para WinAnsi ANTES de medir: widthOfTextAtSize lança em glifos
    // fora do WinAnsi (emoji/CJK num nome de cliente), o que rebentaria o PDF
    // inteiro aqui na capa em vez de degradar graciosamente.
    const names = textoParaFonte(f.serif, doc.clientNames || "");
    const maxNameW = (hasImgs ? W * 0.34 : W * 0.72) - 16;
    let nameSize = 52;
    while (nameSize > COVER_NAME_MIN && f.serif.widthOfTextAtSize(names, nameSize) > maxNameW)
      nameSize -= 2;
    if (f.serif.widthOfTextAtSize(names, nameSize) > maxNameW) {
      const inteiro = wrap(f.serif, names, nameSize, maxNameW);
      let linhas = inteiro;
      if (linhas.length > MAX_COVER_NAME_LINES) {
        const curto = nomeCurtoDoCasal(names);
        const doCurto = curto ? wrap(f.serif, curto, nameSize, maxNameW) : [];
        if (doCurto.length && doCurto.length <= MAX_COVER_NAME_LINES) linhas = doCurto;
      }
      // O que ainda assim não couber é cortado — mas com «…», que é o que
      // distingue «o nome acabou» de «o nome foi cortado».
      if (linhas.length > MAX_COVER_NAME_LINES) {
        const corte = quebrarComReticencias(
          f.serif,
          linhas.join(" "),
          nameSize,
          maxNameW,
          MAX_COVER_NAME_LINES,
        );
        linhas = corte.linhas;
      }
      note("Nome na capa", inteiro.length - linhas.length, "linhas");
      // O bloco fica centrado no MESMO sítio, seja com duas linhas ou com três:
      // 278 é onde a primeira das duas era desenhada.
      const avanco = nameSize * 1.05;
      let ny = 278 + ((linhas.length - 2) * avanco) / 2;
      for (const ln of linhas) {
        textCenter(p, ln, cx, ny, { font: f.serif, size: nameSize, color: CREAM });
        ny -= avanco;
      }
    } else {
      textCenter(p, names, cx, 262, { font: f.serif, size: nameSize, color: CREAM });
    }

    /* ═══════════════════════════════════════════════════════════════════════
       AS TRÊS LINHAS DA CAPA CABEM NO PAINEL ESCURO
       ═══════════════════════════════════════════════════════════════════════

       O nome já tinha largura máxima e quebra; o tipo, a data e o local não
       tinham NADA. Eram desenhados centrados, sem medida e sem quebra, e
       escorriam para os dois lados por cima das duas fotografias da capa —
       medido pela sonda de transbordos, num caso com um local por extenso:

           p1  x 155.6 → 686.3   «Casamento civil com cerimónia simbólica…»
           p1  x 162.0 → 679.9   «Herdade da Fonte Santa de Vale de Água…»

       O painel escuro tem 286 pontos. Estas duas linhas ocupavam 530 e 518,
       ilegíveis por cima das fotos — e um local com o nome de uma herdade por
       extenso chega lá sozinho.

       Passam a ter a MESMA regra do nome: a largura do painel, encolher, e
       quebrar em duas linhas antes de cortar. E o bloco desce como cresce — a
       linha do local segue a última linha do tipo/data, em vez de lhe ficar por
       cima. */
    /** Uma linha centrada da capa: encolhe, quebra, e nunca sai do painel. */
    const linhaDaCapa = (
      texto: string,
      base: number,
      o: { font: PDFFont; size: number; color: ReturnType<typeof rgb>; tracking?: number },
      onde: string,
    ): number => {
      const tracking = o.tracking ?? 0;
      let size = o.size;
      const cabe = (t: string, sz: number) =>
        larguraEspacada(o.font, textoParaFonte(o.font, t), sz, tracking) <= maxNameW;
      // ── O CASO NORMAL SAI TAL E QUAL ────────────────────────────────────
      // A linha que já cabia é desenhada COMO ELA A ESCREVEU, sem passar pela
      // quebra: o `wrap` parte por espaços e volta a juntar com UM só, e isso
      // comia o «   ·   » largo que separa o tipo da data em todas as capas.
      // Encolher e quebrar é o caminho de excepção, não o de todos os dias.
      if (cabe(texto, size)) {
        textCenter(p, texto, cx, base, {
          font: o.font,
          size,
          color: o.color,
          tracking: o.tracking,
        });
        return base;
      }
      while (size > COVER_LINE_MIN && !cabe(texto, size)) size -= 0.5;
      // A quebra mede COM o espaçamento entre letras — é assim que a linha vai
      // ser desenhada, e medir sem ele era o que a punha por cima das fotos.
      const { linhas, cortadas } = quebrarComReticencias(
        o.font,
        texto,
        size,
        maxNameW,
        MAX_COVER_LINE_LINES,
        tracking,
      );
      note(onde, cortadas, "linhas");
      let y = base;
      for (const ln of linhas) {
        textCenter(p, ln, cx, y, { font: o.font, size, color: o.color, tracking: o.tracking });
        y -= size * 1.25;
      }
      // Onde a linha seguinte pode começar: a base menos o que este bloco gastou.
      return base - (linhas.length - 1) * size * 1.25;
    };

    // `.trim()` nas três linhas, e não a caixa em bruto: um campo com um espaço
    // lá dentro é «verdadeiro» para o `if` — foi assim que o «Note:» sozinho
    // chegou ao fundo do orçamento. Aqui o «·» entre o tipo e a data ficaria a
    // separar coisa nenhuma, no meio da capa.
    const sub = [evento.eventType, evento.eventDate]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join("   ·   ");
    let capaY = 214;
    if (sub)
      capaY = linhaDaCapa(
        sub,
        capaY,
        { font: f.reg, size: 11, color: CREAM_DIM, tracking: 1.4 },
        "Tipo e data na capa",
      );
    if ((doc.location ?? "").trim())
      linhaDaCapa(
        doc.location.trim(),
        capaY - 20,
        { font: f.serifIt, size: 11, color: FAINT },
        "Local na capa",
      );
  }

  // ── Page 2 — Apresentação + Serviços ──
  {
    const org = doc.template === "organizacao";
    let p = pdf.addPage([W, H]);
    frame(p);
    let y = H - M - 64;
    const ensure = (need: number) => {
      if (y - need < CHAO) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
    };
    y = sectionHeader(p, t.sobretituloApresentacao, numerada(t.tituloApresentacao), y);

    /* ═══════════════════════════════════════════════════════════════════════
       A APRESENTAÇÃO É UMA LISTA, E A LISTA É A DELA
       ═══════════════════════════════════════════════════════════════════════

       Era uma folha inteira: o nome do casal em corpo 20, um parágrafo de
       boas-vindas e os campos numa GRELHA de quatro colunas com as legendas em
       capitulares espaçadas. A folha dela é outra coisa — uma linha por campo,
       «Rótulo: valor», o rótulo a negro e o valor em texto normal, tudo por
       cima dos serviços NA MESMA PÁGINA.

       ── O PARÁGRAFO DE BOAS-VINDAS SAIU ────────────────────────────────────
       Não existe na folha dela, e era ele que pagava a segunda folha: medido,
       quatro linhas de 17 pontos mais 26 de ar — 94 pontos, quando o que
       faltava para a secção dos Serviços caber aqui eram 40. E não se perde
       nenhuma palavra ao casal: o e-mail que leva a proposta já abre com ela
       («Foi um gosto conhecer a sua visão. Preparámos uma proposta à medida do
       seu evento», em `email-templates-store.ts`) e a contracapa fecha com a
       mesma voz («Por nos deixarem fazer parte deste momento»). Duas
       boas-vindas na mesma proposta eram uma a mais; a que sai é a que a folha
       de referência não tem.

       ── OS CAMPOS SÃO TODOS OPCIONAIS ──────────────────────────────────────
       Uma proposta sem hora não pode desenhar «Hora:» seguido de nada. A ordem
       é a dela; a hora e os wedding planners, que a folha dela não tem, vêm no
       fim, ao pé da cerimónia, que é a família a que pertencem. */
    const CAMPO_CORPO = 11;
    /** Avanço de uma linha para a seguinte. Com 16 e o ar de baixo, os oito
     *  campos do caso mais cheio deixam os Serviços a caber nesta folha. */
    const CAMPO_AVANCO = 16;
    /** A entrelinha de um campo que precisou de duas linhas. */
    const CAMPO_ENTRELINHA = CAMPO_CORPO + 3;
    /** O ar entre o último campo e a legenda dos Serviços. */
    const AR_ENTRE_SECCOES = 26;
    /** A medida da lista — a mesma das notas do orçamento (550), e não a folha
     *  toda: um «Local:» com o nome de uma herdade e a morada não tem de correr
     *  706 pontos até à margem direita para se ler. */
    const CAMPO_MEDIDA = MEASURE + 120;

    /** Cada campo é a sua CHAVE e o seu valor: o rótulo impresso sai do
     *  dicionário da língua, e o aviso de truncagem do português (ver `pt`). */
    type Campo = [chave: CampoDoEvento, valor: string];
    const campos: Campo[] = [
      [org ? "cliente" : "noivos", doc.clientNames],
      ...(org ? [] : ([["evento", evento.eventType]] as Campo[])),
      ["data", evento.eventDate],
      ["local", doc.location],
      ["convidados", evento.guests],
      ["servico", doc.servico ?? ""],
      ...(org
        ? []
        : ([
            ["cerimonia", evento.ceremony ?? ""],
            // `evento.time` e não `doc.time`: a hora também se traduz («16h00»
            // → «4 p.m.»), e era o último pedaço de português que ficava numa
            // proposta inglesa. O que não for um relógio vem de lá como ela o
            // escreveu — ver `horaEmIngles`.
            ["hora", evento.time ?? ""],
          ] as Campo[])),
    ];
    // Um «Hora:» seguido de nada não é um campo por preencher: é um erro
    // impresso numa folha que vai para o cliente.
    const details = campos.filter(([, v]) => (v ?? "").trim().length > 0);

    /* ── OS VALORES ALINHAM TODOS NA MESMA COLUNA ──────────────────────────
       Cada valor começava logo a seguir ao SEU rótulo, e quando um campo
       passava a duas linhas a segunda alinhava pelo fim desse rótulo: «Número
       de Convidados:» continuava em x=277 e «Cerimónia:» em x=193. Duas
       continuações, dois recuos diferentes, nenhum alinhado a nada — e a
       apresentação, que é uma lista de «rótulo: valor», lia-se como texto solto
       em vez de um quadro.

       Mede-se o rótulo mais largo UMA vez e é aí que todos os valores começam.
       É o que a folha dela faz, e é o que faz uma lista parecer uma lista. */
    const vx =
      M +
      Math.max(
        0,
        ...details.map(([chave]) =>
          f.bold.widthOfTextAtSize(textoParaFonte(f.bold, `${t.campos[chave]}:  `), CAMPO_CORPO),
        ),
      );
    for (const [chave, valor] of details) {
      const marca = `${t.campos[chave]}:`;
      // Duas linhas por campo — um local com nome comprido ("Herdade da …,
      // Reguengos de Monsaraz") pede três e perdia o resto. O que passa disso é
      // anotado E leva «…»: quem só tem o papel não tinha como saber que o
      // campo estava cortado.
      const corte = quebrarComReticencias(
        f.reg,
        valor,
        CAMPO_CORPO,
        M + CAMPO_MEDIDA - vx,
        MAX_EVENT_FIELD_LINES,
      );
      note(`Campo «${pt.campos[chave]}»`, corte.cortadas, "linhas");
      const linhas = corte.linhas;
      ensure(CAMPO_AVANCO + (linhas.length - 1) * CAMPO_ENTRELINHA);
      text(p, marca, M, y, { font: f.bold, size: CAMPO_CORPO, color: INK });
      linhas.forEach((ln, j) => {
        text(p, ln, vx, y - j * CAMPO_ENTRELINHA, { size: CAMPO_CORPO, color: INK });
      });
      y -= CAMPO_AVANCO + (linhas.length - 1) * CAMPO_ENTRELINHA;
    }
    if (details.length) y -= AR_ENTRE_SECCOES;

    /* ═══════════════════════════════════════════════════════════════════════
       ONDE A PÁGINA PARTE — E ONDE NÃO PODE PARTIR
       ═══════════════════════════════════════════════════════════════════════

       Ela abriu uma proposta de três serviços e encontrou o cabeçalho
       «Serviços» sozinho no fundo de uma página, sem nada por baixo; e, mais à
       frente, uma página do corpo com UMA frase e mais nada.

       A causa era sempre a mesma: decidia-se mudar de página com uma medida
       MENOR do que aquilo que se ia desenhar a seguir.

         · o cabeçalho da secção era desenhado sem verificação nenhuma;
         · o título do grupo reservava 30 pt — o título e uma linha;
         · a descrição partia LINHA A LINHA, portanto podia deixar uma sozinha.

       A regra passa a ser uma só, e é a que a secção «Condições Gerais» deste
       mesmo ficheiro já usava: MEDIR O BLOCO INTEIRO ANTES DE O DESENHAR. Um
       serviço ou cabe onde está, ou começa na página seguinte — nunca metade.

       O preço é algum espaço em branco no fundo de algumas páginas. É o preço
       certo: um pouco mais de branco lê-se como desenho, uma frase órfã lê-se
       como erro. */
    const descSize = org ? 9.5 : T_BODY;
    const DESC_X = M + 24;
    /* ── A MEDIDA DE LEITURA DA LISTA DE SERVIÇOS ──────────────────────────
       A descrição de um serviço era quebrada a `W − M − dx`: da margem
       esquerda à margem direita da folha, que numa A4 AO BAIXO são 706 pontos
       e, a corpo 10, à volta de 110 caracteres por linha.

       O próprio ficheiro escreve, na definição do `MEASURE`, que «long lines
       (~120+ chars edge-to-edge) are the biggest DIY tell» — e a lista de
       Serviços era, com a legenda dos mood boards, a linha mais comprida do
       documento. As duas medidas mais longas da folha eram precisamente as que
       o comentário manda não deixar acontecer.

       550 é a medida que a apresentação, as notas do orçamento e agora a
       legenda já usam: o documento passa a ter UMA medida para o texto corrido.
       O que isto custa é altura — mais linhas por serviço —, e é por isso que
       está medido no relatório. */
    const MEDIDA_DOS_SERVICOS = MEASURE + 120;
    /** Onde a mancha do texto de um serviço acaba. */
    const DESC_FIM = DESC_X + MEDIDA_DOS_SERVICOS;
    /* ── A LISTA TEM DE SE LER COMO LISTA ──────────────────────────────────
       O avanço depois da PRIMEIRA linha de um serviço era 16 e o das seguintes
       15. Um ponto — e ao contrário: um serviço de uma linha era seguido de 16
       e a última linha de um serviço de três era seguida de 15. Ou seja, o
       branco entre DUAS LINHAS DO MESMO SERVIÇO e o branco entre DOIS SERVIÇOS
       eram, na prática, o mesmo branco.

       É isso que faz uma lista ler-se como lista, e não é só estética: o leitor
       de PDF desta casa (`proposta-de-pdf`) remonta os serviços a partir dos
       saltos verticais, precisamente porque «uma lista composta deixa mais
       espaço entre dois itens do que entre duas linhas do mesmo item». Sem
       essa diferença, ele tem de adivinhar por outra via — se a linha de cima
       está cheia — e uma medida de leitura mais curta deixa de a encher.

       Agora são dois números diferentes e o maior é o que separa serviços: 15
       entre linhas, mais 4 de ar entre serviços. Custa três pontos por
       serviço. */
    const AVANCO_N = descSize + 5; // avanço de uma linha para a seguinte
    const AR_ENTRE_ITENS = 4; // o ar a mais que separa dois serviços
    const ALTURA_TITULO = 22; // avanço depois do título de um grupo
    /** Nunca menos de duas linhas de cada lado de uma quebra. */
    const MIN_LINHAS = 2;

    /**
     * As linhas de um item, medidas EXACTAMENTE como vão ser desenhadas.
     *
     * É a única função que quebra o texto: a altura que se mede é a altura que
     * se desenha, por construção. Medir num sítio e desenhar noutro é como isto
     * se estragou da primeira vez.
     *
     * As linhas seguintes são desenhadas em `DESC_X` e são quebradas à largura
     * que TÊM aí — ver `wrapComRecuo`. Eram quebradas à largura da primeira (a
     * que sobra depois do rótulo) e desenhadas mais à esquerda, o que lhes
     * deixava largura a sobrar: uma linha acabava em x=1154 e a seguinte em
     * x=731, um buraco de 35% da largura no meio do parágrafo.
     */
    const medirItem = (it: { label?: string; desc?: string }) => {
      /**
       * ── UM SERVIÇO SEM RÓTULO NÃO PODE DEITAR ABAIXO A GERAÇÃO ───────────
       *
       * `label` é obrigatório no tipo e o estúdio escreve-o sempre. Mas o que
       * chega a esta função não vem do tipo: vem do `doc` que o corpo do pedido
       * traz (`/api/orcamento/[id]/proposta-doc` valida a `ref` e os nomes, e
       * mais nada), de um rascunho antigo do `localStorage`, de uma cópia de
       * segurança restaurada ou de um documento relido de um PDF. Sem rótulo,
       * o `it.label.trim()` daqui de baixo atirava um `TypeError` — e o que ela
       * via era «Erro ao gerar a proposta: Cannot read properties of undefined
       * (reading 'trim')».
       *
       * É a MESMA avaria que o `withProposalDefaults` já contorna um degrau
       * acima, e com a mesma nota escrita: «a missing array would throw
       * "undefined is not iterable" → generic 500 "erro ao gerar"». Aqui é um
       * campo em vez de um array; a regra é a mesma — o que falta lê-se como
       * vazio, e o vazio já tem caminho.
       */
      const rotulo = (it.label ?? "").trim();
      // SÓ RÓTULO TAMBÉM SE PARTE — achado n.º 2 da auditoria. Era medido como
      // UMA linha (`[it.label]`): o «Enter» que ela escreveu e a linha comprida
      // demais eram desenhados em várias, e a linha seguinte ficava por cima.
      // A altura que se mede tem de ser a altura que se desenha.
      if (!it.desc) {
        return {
          lab: "",
          dx: DESC_X,
          lines: wrap(f.reg, it.label ?? "", descSize, MEDIDA_DOS_SERVICOS),
        };
      }
      // SEM RÓTULO NÃO HÁ DOIS PONTOS. Uma linha de serviço só com descrição
      // desenhava o separador à mesma e saía «: Floral arch.» — uma frase a
      // começar por dois pontos, que se lê como software estragado. O rótulo é
      // opcional (ela escreve linhas que são só uma frase), a pontuação que o
      // acompanha é que não pode sobreviver-lhe.
      if (!rotulo) {
        return { lab: "", dx: DESC_X, lines: wrap(f.reg, it.desc, descSize, MEDIDA_DOS_SERVICOS) };
      }
      // Sanitiza aqui também: `lab` é medido diretamente com
      // widthOfTextAtSize (que lança em glifos fora do WinAnsi).
      const lab = textoParaFonte(f.bold, `${it.label}: `);
      const dx = DESC_X + f.bold.widthOfTextAtSize(lab, descSize);
      return {
        lab,
        dx,
        lines: wrapComRecuo(f.reg, it.desc, descSize, DESC_FIM - dx, MEDIDA_DOS_SERVICOS),
      };
    };
    const alturaItem = (n: number) => n * AVANCO_N + AR_ENTRE_ITENS;
    /** A altura de uma página inteira de corpo — o tecto do que se pode exigir
     *  a um `ensure`. Sem isto, um item mais alto do que uma página pedia uma
     *  página nova para sempre. */
    const COLUNA = H - M - 64 - CHAO;
    /** O que o `sectionHeader` consome antes de devolver o `y` do corpo. */
    const ALTURA_CABECALHO = 58;

    const desenharItem = (it: { label: string; desc?: string }) => {
      const { lab, dx, lines } = medirItem(it);
      /**
       * O marcador desta lista é o DELA: um ponto redondo cheio, que se vê.
       *
       * Era um ponto de 1,2 de raio na cor mais pálida da paleta — 2,4 pontos
       * de tinta clara ao lado de um rótulo a negro de corpo 10, que à vista
       * desaparecia e no papel desaparece de vez. Na folha dela o marcador é um
       * disco escuro do tamanho de um «o». 1,5 e o cinzento do texto secundário
       * ficam a meio caminho: lê-se como lista sem competir com o rótulo.
       *
       * Só nesta lista, e de propósito: as listas de corpo 9 do fecho (notas,
       * condições) continuam com o ponto pequeno, que é o que lhes assenta.
       */
      p.drawCircle({ x: M + 12, y: y + 3, size: 1.5, color: MUTED });
      if (lab) text(p, lab, DESC_X, y, { font: f.bold, size: descSize });
      text(p, lines[0] ?? "", lab ? dx : DESC_X, y, { size: descSize });
      y -= AVANCO_N;
      for (let i = 1; i < lines.length; i++) {
        /**
         * Só chega aqui um item mais alto do que uma página inteira — raro, mas
         * possível numa descrição muito longa. Reserva-se espaço para DUAS
         * linhas enquanto houver duas por escrever: assim a quebra nunca deixa
         * uma linha sozinha à espera das outras na página seguinte.
         */
        ensure(AVANCO_N * Math.min(lines.length - i, MIN_LINHAS));
        text(p, lines[i], DESC_X, y, { size: descSize });
        y -= AVANCO_N;
      }
      y -= AR_ENTRE_ITENS;
    };

    /**
     * A altura de um GRUPO INTEIRO — o título e todos os seus serviços.
     *
     * É esta a unidade por que a secção parte: ela pediu que, quando não caiba
     * tudo numa folha, se parta «por grupos inteiros, nunca a meio de uma
     * lista». Um grupo com cinco serviços partido ao terceiro lê-se como um
     * descuido; o mesmo grupo inteiro na folha seguinte lê-se como um capítulo.
     *
     * O ar que se deixa DEPOIS do grupo (os 8 pontos lá em baixo) não entra na
     * conta: não é tinta e não tem de caber na folha — o mesmo raciocínio do
     * `FIM_MORTO` da cauda do orçamento.
     */
    /** Um grupo sem título não gasta a linha do título — ver `tituloDoGrupo`. */
    const alturaDoGrupo = (g: {
      letter?: string;
      title?: string;
      items: { label?: string; desc?: string }[];
    }) =>
      (tituloDoGrupo(g) ? ALTURA_TITULO : 0) +
      g.items.reduce((h, it) => h + alturaItem(medirItem(it).lines.length), 0);
    /**
     * A linha de título de um grupo existe? Nem sempre: ela escreve grupos sem
     * nome, com os serviços a seguir uns aos outros. Sem isto, o desenho gastava
     * a linha à mesma — vinte e dois pontos de branco entre dois serviços, no
     * meio da lista, sem nada escrito.
     */
    function tituloDoGrupo(g: { letter?: string; title?: string }): boolean {
      return !!((g.letter ?? "").trim() || (g.title ?? "").trim());
    }

    /**
     * O cabeçalho «Serviços» viaja com o primeiro grupo INTEIRO — e, quando o
     * primeiro grupo é maior do que uma folha, pelo menos com o título dele e o
     * primeiro serviço. Um cabeçalho no fundo de uma página não é conteúdo — é
     * uma página desperdiçada com ar de erro.
     */
    /**
     * ── UM GRUPO SEM SERVIÇOS NÃO É UM CAPÍTULO, É UM TÍTULO SOLTO ─────────
     *
     * O estúdio deixa acrescentar um grupo e passar à frente sem lhe pôr nada
     * dentro (o mesmo gesto que deixa uma rubrica em branco). Aqui isso saía
     * como um cabeçalho em serifa, sozinho, com trinta pontos de branco por
     * baixo e mais nada — a mesma coisa que o «Note:» sem nota e a linha a
     * começar por dois pontos, uma secção acima.
     *
     * É a regra que os mood boards já seguem («skip empty boards — never show a
     * client a placeholder»): sem conteúdo, não há página, não há cabeçalho.
     * O que se guarda para o papel é o que tem alguma coisa por baixo.
     */
    /** Um serviço tem alguma coisa para dizer? Sem rótulo nem descrição, o
     *  desenho punha um marcador redondo e uma linha em branco ao lado dele. */
    const temTexto = (it: { label?: string; desc?: string }) =>
      !!((it?.label ?? "").trim() || (it?.desc ?? "").trim());
    /**
     * Os grupos como vão ser DESENHADOS — já sem o que está em branco.
     *
     * Filtra-se ANTES de medir e não no meio do desenho, porque é a altura
     * medida que decide onde a página parte: medir um grupo com cinco serviços
     * e desenhar três é como as notas do orçamento acabavam por cima do rodapé.
     */
    const grupos = doc.serviceGroups
      .map((g) => ({ ...g, items: (g.items ?? []).filter(temTexto) }))
      .filter((g) => g.items.length > 0);

    const primeiroGrupo = grupos[0];
    ensure(ALTURA_CABECALHO + (primeiroGrupo ? Math.min(alturaDoGrupo(primeiroGrupo), COLUNA) : 0));
    y = sectionHeader(p, t.sobretituloServicos, numerada(t.tituloServicos), y);

    for (const g of grupos) {
      // O grupo ou cabe onde está, ou começa INTEIRO na página seguinte. Só um
      // grupo maior do que uma folha se parte — e mesmo esse leva o título com
      // o primeiro serviço.
      const abre = g.items[0];
      const todo = alturaDoGrupo(g);
      ensure(
        todo <= COLUNA
          ? todo
          : ALTURA_TITULO + (abre ? Math.min(alturaItem(medirItem(abre).lines.length), COLUNA) : 0),
      );
      // Group title in serif; the ordinal marker stays quiet grey, not coloured.
      if (tituloDoGrupo(g)) {
        if (g.letter) text(p, g.letter, M, y, { font: f.serifB, size: T_SUB, color: MUTED });
        const letterW = g.letter
          ? f.serifB.widthOfTextAtSize(textoParaFonte(f.serifB, g.letter) + " ", T_SUB)
          : 0;
        text(p, g.title, M + letterW, y, {
          font: f.serifB,
          size: T_SUB,
          color: INK,
        });
        y -= ALTURA_TITULO;
      }
      for (const it of g.items) {
        const altura = alturaItem(medirItem(it).lines.length);
        // Cabe inteiro? Então ou fica onde está, ou muda de página INTEIRO.
        if (altura <= COLUNA) ensure(altura);
        desenharItem(it);
      }
      y -= 8;
    }
  }

  // ── Cronograma de Organização (Organização template) ──
  /**
   * ── UMA FASE SEM TAREFAS É UM TÍTULO SOZINHO ────────────────────────────
   *
   * Mesma regra dos grupos de serviços, uma secção acima, e pela mesma razão:
   * «6-12 meses antes do casamento» com nada por baixo lê-se como um erro
   * nosso, não como uma fase por planear. E uma tarefa em branco punha um
   * marcador redondo com uma linha vazia ao lado.
   *
   * Filtra-se AQUI, antes de a página existir: um cronograma inteiro em branco
   * abria uma folha nova só com o cabeçalho «Cronograma» e mais nada — que é a
   * versão grande do mesmo defeito.
   */
  const fasesDoCronograma = (doc.cronograma ?? [])
    .map((fase) => ({ ...fase, items: (fase.items ?? []).filter((it) => (it ?? "").trim()) }))
    .filter((fase) => fase.items.length > 0);
  if (fasesDoCronograma.length) {
    let p = pdf.addPage([W, H]);
    frame(p);
    let y = H - M - 64;
    /**
     * ════════════════════════════════════════════════════════════════════════
     * O CRONOGRAMA ESCREVIA PARA FORA DA FOLHA
     * ════════════════════════════════════════════════════════════════════════
     *
     * A única verificação era por FASE, e media só o título. Dentro do ciclo
     * das tarefas — e dentro do ciclo das linhas de cada tarefa — não havia
     * nenhuma: o `y` descia e o desenho continuava. Medido numa fase com 40
     * tarefas: doze delas desenhadas ABAIXO do rodapé, a última em `y = -664`.
     *
     * Não saíam cortadas nem davam erro. Desapareciam. E a contagem de
     * truncagens, que existe precisamente para dizer o que a composição não
     * mostra, não as via — porque ninguém lhe tinha dito que isto acontecia.
     *
     * É a mesma regra dos serviços aqui em cima: mede-se o bloco antes de o
     * desenhar, e o título de uma fase viaja com a primeira tarefa.
     */
    const ensure = (need: number) => {
      if (y - need < CHAO) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
    };
    const COLUNA = H - M - 64 - CHAO;
    const linhasDa = (it: string) => wrap(f.reg, it, T_BODY, MEASURE + 120);

    y = sectionHeader(p, t.sobretituloCronograma, numerada(t.tituloCronograma), y);
    for (const phase of fasesDoCronograma) {
      const abre = phase.items[0];
      // Uma fase sem nome não gasta a linha do nome: eram vinte pontos de
      // branco a separar tarefas, com nada escrito lá dentro.
      const comTitulo = !!(phase.title ?? "").trim();
      ensure((comTitulo ? 20 : 0) + (abre ? Math.min(linhasDa(abre).length * 15, COLUNA) : 0));
      if (comTitulo) {
        text(p, phase.title, M, y, { font: f.serifB, size: T_SUB, color: INK });
        y -= 20;
      }
      for (const it of phase.items) {
        const lines = linhasDa(it);
        const altura = lines.length * 15;
        // Uma tarefa não se parte a meio se couber inteira numa página.
        if (altura <= COLUNA) ensure(altura);
        p.drawCircle({ x: M + 12, y: y + 3, size: 1.2, color: FAINT });
        for (const [i, ln] of lines.entries()) {
          // Só para a tarefa gigante que não cabe numa página: nunca deixa uma
          // linha sozinha à espera das outras na página seguinte.
          if (i > 0) ensure(15 * Math.min(lines.length - i, 2));
          text(p, ln, M + 24, y, { size: T_BODY });
          y -= 15;
        }
      }
      y -= 14;
    }
  }

  /**
   * A ORDEM DO DOCUMENTO, uma só, tirada da lista de Serviços — a primeira que
   * o casal lê. É esta que o quadro do orçamento e as páginas de inspiração
   * seguem daqui para baixo. Ver `proposal-ordem.ts`, incluindo o que se faz
   * quando não há correspondência.
   *
   * `ordemDeSaida` é a mesma função que o estúdio chama para desenhar as duas
   * listas no ecrã — é isso, e só isso, que garante que o que ela arruma é o
   * que sai impresso. Num documento que ela já arrumou à mão
   * (`ordemExplicita`), devolve a ordem escrita e não toca em nada.
   *
   * ── E CALCULA-SE SOBRE O DOCUMENTO PORTUGUÊS ──────────────────────────
   * `docPt` e não `doc`: a ordem é dada pelos NOMES, e numa proposta bilingue
   * metade dos nomes pode estar traduzida e a outra metade não. Sobre o
   * documento inglês, as chaves deixavam de casar, o «sem correspondência não
   * se mexe» entrava, e o orçamento e os mood boards saíam por outra ordem só
   * no PDF inglês — que ninguém confere, porque quem confere lê o português.
   *
   * Os índices servem os dois documentos porque `docNaLingua` nunca
   * acrescenta, remove nem reordena: só troca strings no sítio. Esse invariante
   * está pinado em `proposal-doc-bilingue.test.ts`, e é o que torna estas duas
   * linhas seguras.
   */
  const ordemDosBoards = ordemDeSaida(docPt, docPt.moodBoards, (b) => b.title ?? "");
  const ordemDasLinhasDoOrcamento = ordemDeSaida(docPt, docPt.budgetItems, (s) => s);
  /** Anota uma lista que saiu por ordem diferente da que está escrita. */
  const notaDeOrdem = (onde: string, rotulos: string[], indices: number[]) => {
    if (eAOrdemEscrita(indices)) return;
    reordenacoes.push({
      onde,
      de: [...rotulos],
      para: indices.map((idx) => rotulos[idx]),
    });
  };

  /* ═══════════════════════════════════════════════════════════════════════════
     O CABEÇALHO DE UM MOOD BOARD CABE NA FOLHA
     ═══════════════════════════════════════════════════════════════════════════

     O título era desenhado a corpo 24 numa linha só, sem medida e sem quebra —
     e o subtítulo a 13, com o mesmo nada. Medido pela sonda de transbordos, com
     um título de 124 caracteres:

         p3  x 68.0 → 848.2   «Decoração Floral Integral da Cerimónia, do Copo
                               d'Água…»  passa a margem direita em 74,3 pt

     A folha tem 841,89 de largura. O título não passava a margem: passava O
     PAPEL. Onde ele acaba não há nada — nem margem, nem folha.

     ── A BANDA ONDE ISTO VIVE ─────────────────────────────────────────────────
     O cabeçalho de uma página de inspiração é uma faixa fechada dos dois lados:
     por cima está o sobretítulo («INSPIRAÇÃO»), por baixo está o topo da
     primeira fila de fotografias. São sessenta pontos, e é aí que o título e o
     subtítulo têm de caber.

     Três degraus, por esta ordem:

      1. ENCOLHER até caber numa linha (24 → 14 no título, 13 → 9,5 no
         subtitulo). É o degrau que resolve o caso medido: 124 caracteres cabem
         a 21 pontos, numa linha, sem partir nada.
      2. QUEBRAR em duas linhas, à medida da mancha.
      3. DESCER o bloco inteiro até onde as fotografias deixarem — e, se ainda
         assim não couber, ir tirando linhas (com «…», que diz que foram
         tiradas).

     ── E O CASO NORMAL SAI EXACTAMENTE ONDE SAÍA ────────────────────────────
     O bloco é ancorado pela ÚLTIMA linha e cresce PARA CIMA. Com um título e um
     subtítulo de uma linha cada, as duas linhas de base dão 451,28 e 431,28 —
     os mesmos números que a geometria escreve e que a pré-visualização do
     estúdio lê. Uma miniatura que deixasse de ser fiel é pior do que não haver
     miniatura nenhuma. */
  const cabecalhoDoBoard = (pg: PDFPage, titulo: string, subtitulo: string, boardName: string) => {
    const LARGURA = W - 2 * M;
    /** O tecto: a linha de base do sobretítulo, menos o ar que os separa. */
    const TECTO = TXT.sobretitulo.base - 3.5;
    /** O chão: o topo da primeira fila de fotografias, com um fio de ar. */
    const CHAO_DO_BOARD = TOPO_DAS_FOTOS + 4;
    const temSub = !!subtitulo;
    /** Onde assenta a ÚLTIMA linha do bloco — a de sempre. O bloco cresce para
     *  cima a partir daqui, e por isso o caso normal não se mexe um ponto. */
    const baseHistorica = temSub ? TXT.subtitulo.base : TXT.titulo.base;

    /** Quantas linhas dá este texto neste corpo. */
    const linhasEm = (texto: string, size: number) => wrap(f.serifIt, texto, size, LARGURA).length;

    // O subtítulo encolhe pelo seu lado: é o texto secundário da página, e a
    // altura que ele ocupa é o que sobra para o título.
    let sSize = TXT.subtitulo.tamanho;
    while (temSub && sSize > BOARD_SUB_MIN && linhasEm(subtitulo, sSize) > MAX_BOARD_HEAD_LINES) {
      sSize -= 0.5;
    }
    const sub = temSub
      ? quebrarComReticencias(f.serifIt, subtitulo, sSize, LARGURA, MAX_BOARD_HEAD_LINES)
      : { linhas: [] as string[], cortadas: 0 };
    /** O ar entre a última linha do título e a primeira do subtítulo. Nos
     *  corpos de omissão dá os 20 pontos que separam as duas linhas de base. */
    const AR = sSize + 7;
    const alturaDoSub = temSub ? (sub.linhas.length - 1) * sSize * 1.2 + AR : 0;

    /** O bloco cabe na banda com este corpo e este número de linhas? E quanto
     *  é que tem de descer para lá caber? */
    const naBanda = (size: number, linhas: number) => {
      const acima = alturaDoSub + (linhas - 1) * size * 1.2;
      // `size * 0.8` é a altura da maiúscula mais a folga — o que a linha de
      // cima ocupa ACIMA da sua linha de base.
      const topo = baseHistorica + acima + size * 0.8;
      const descida = Math.min(
        Math.max(0, topo - TECTO),
        Math.max(0, baseHistorica - CHAO_DO_BOARD),
      );
      return { cabe: topo - descida <= TECTO, descida };
    };

    // O título fica no MAIOR corpo em que caiba — na largura E na banda. Descer
    // até ao mínimo por causa da largura, quando o que apertava era a altura,
    // dava um título de 14 pontos com a palavra «Dia» sozinha na segunda linha.
    let tSize = TXT.titulo.tamanho;
    while (
      tSize > BOARD_TITLE_MIN &&
      (linhasEm(titulo, tSize) > MAX_BOARD_HEAD_LINES ||
        !naBanda(tSize, linhasEm(titulo, tSize)).cabe)
    ) {
      tSize -= 0.5;
    }
    const tit = quebrarComReticencias(f.serifIt, titulo, tSize, LARGURA, MAX_BOARD_HEAD_LINES);
    const { descida } = naBanda(tSize, tit.linhas.length);

    note(`Título do mood board ${boardName}`, tit.cortadas, "linhas");
    note(`Subtítulo do mood board ${boardName}`, sub.cortadas, "linhas");

    const baseUltima = baseHistorica - descida;
    let y = baseUltima + alturaDoSub + (tit.linhas.length - 1) * tSize * 1.2;
    for (const ln of tit.linhas) {
      text(pg, ln, M, y, { font: f.serifIt, size: tSize, color: INK });
      y -= tSize * 1.2;
    }
    let ys = baseUltima + (sub.linhas.length - 1) * sSize * 1.2;
    for (const ln of sub.linhas) {
      text(pg, ln, M, ys, { font: f.serifIt, size: sSize, color: MUTED });
      ys -= sSize * 1.2;
    }
  };

  // ── Mood board pages (skip empty boards — never show a client a placeholder) ──
  // Os rótulos do relatório saem do documento PORTUGUÊS: quem o lê é o estúdio,
  // e é lá que ela vai procurar o board pelo nome que lhe deu.
  notaDeOrdem(
    "Mood boards",
    docPt.moodBoards.map((b) => b.title ?? ""),
    ordemDosBoards,
  );
  for (const bi of ordemDosBoards) {
    const mb = doc.moodBoards[bi];
    if (!mb.images || mb.images.length === 0) continue;
    const p = pdf.addPage([W, H]);
    frame(p);
    // As medidas vêm de `proposal-geometria` — as mesmas que a
    // pré-visualização do estúdio lê. Escritas aqui à mão, a miniatura que ela
    // vê e a página que sai divergiam sem ninguém dar por isso.
    // Em português a palavra é a da geometria — é lá que ela vive, ao lado da
    // medida a que é desenhada, e é de lá que a pré-visualização do estúdio a lê.
    eyebrow(
      p,
      t.sobretituloInspiracao ?? TXT.sobretitulo.texto,
      M,
      TXT.sobretitulo.base,
      undefined,
      TXT.sobretitulo.tamanho,
    );
    // Como o mood board se chama num aviso. Sem título, vale a posição — a que
    // ele ocupa NO DOCUMENTO e não a página por que saiu, porque é assim que
    // ela o encontra no estúdio, contado a partir de 1.
    //
    // Pelo título PORTUGUÊS, mesmo num PDF inglês: o aviso é lido no estúdio, e
    // «Ceremony Decoration cortado» manda-a procurar um board que ali não
    // existe com esse nome.
    const tituloPt = (docPt.moodBoards[bi]?.title ?? "").trim();
    const boardName = tituloPt ? `«${tituloPt}»` : `${bi + 1}`;
    // O subtítulo, quando existe. Na proposta feita à mão é o «Ramo de Noiva (a
    // definir com a Noiva)» por baixo de «Complementos dos Noivos»: o título diz
    // o capítulo, o subtítulo diz o que aquelas fotos são e o que ainda está por
    // decidir. Na mesma serifa da marca — a manuscrita da folha antiga não se
    // replica.
    cabecalhoDoBoard(p, mb.title ?? "", (mb.subtitulo ?? "").trim(), boardName);
    await drawCollage(
      pdf,
      p,
      mb,
      f,
      textFns(text, textRight),
      images,
      boardName,
      note,
      noteUndrawn,
      contarRecurso,
    );
  }

  // ── Orçamento ──
  {
    // Branch on TEMPLATE, not on whether rows exist — an Organização proposal
    // with no priced rows must never fall into the Decoração reserva wording.
    const orgT = doc.template === "organizacao";
    let p = pdf.addPage([W, H]);
    frame(p);
    let y = H - M - 64;
    y = sectionHeader(p, t.sobretituloOrcamento, numerada(t.tituloOrcamento), y);

    /**
     * UM MARCADOR POR SUBSTITUIR NÃO É UM VALOR.
     *
     * «[Valor Total]» é o que o estúdio semeia no campo enquanto a proposta não
     * tem preço. A Conferência já o procura antes do envio — mas o aviso é a
     * montante e é dispensável: quem gerar o PDF sem passar por ela levava o
     * marcador para o papel, e numa proposta INGLESA chegava em português por
     * cima. Entre a Conferência e a folha não havia mais nada.
     *
     * Cai no mesmo «—» que um total vazio já desenha: é o que diz «ainda não há
     * preço» sem dizer ao cliente que recebeu um modelo por preencher. Só o
     * marcador INTEIRO conta — um valor que ela escreva com parênteses rectos
     * lá dentro continua a sair como o escreveu.
     */
    const semMarcador = (v: string) => (/^\[[^\]]*\]$/.test(v.trim()) ? "" : v);
    /* A ressalva que ela escreve num valor («… (a confirmar consoante a
       distância final)») vive agora em `proposal-budget.ts`, partilhada com a
       PÁGINA do casal — que passou a precisar exactamente da mesma regra. Duas
       folhas do mesmo documento a decidir isto de maneiras diferentes foi o
       defeito; a função é a mesma, sem uma vírgula de diferença. */
    const totalStr = semMarcador(orgT ? (doc.totalEstimatedText ?? "") : doc.totalText);
    /* O rótulo do total de Decoração é um campo do estúdio, e nasce preenchido
       («Valor Total Decoração»): traduz-se enquanto for o que lá nasceu, e sai
       tal e qual assim que ela lhe mexer (ver `rotuloDoTotalNaLingua`).

       ── PORQUE É QUE ELE NÃO É O RÓTULO DO NÚMERO GRANDE ────────────────────
       Foi proposto (A9 do IDEIAS-PDF.md): «Valor Total Decoração 5.904,00 €»
       em vez de «Total a pagar», por o campo dela nunca chegar ao papel quando
       há um total estruturado. NÃO SE FEZ, e a razão é a objecção C2 do próprio
       relatório, que se confirma ao olhar para a folha:

       O número grande é o último degrau de uma escada que diz «TOTAL (sem
       IVA)», «IVA (23%)» e «Total a pagar». Cada um desses rótulos diz a
       UNIDADE do número que tem ao lado — é isso que os torna uma escada e não
       três valores. «Valor Total Decoração» não diz unidade nenhuma: encostado
       ao fundo da mesma escada, lê-se como um QUARTO número, e o casal fica
       sem saber qual é o que transfere. É exactamente o defeito que esta escada
       veio corrigir (ver a nota da proposta da Tara e do Marty, aqui em baixo).

       E não é uma decisão de composição: é dela. A pergunta — «quer o seu
       rótulo no número grande, ou quer o "Total a pagar" que não deixa
       dúvidas?» — tem de lhe ser feita, e a folha em que o rótulo dela JÁ sai
       (a proposta sem total estruturado) continua como estava. */
    const totalLbl = orgT ? t.totalEstimado : rotuloDoTotalNaLingua(doc, idioma);
    const boxW = MEASURE;
    const boxH = 50;
    // Flat, typographic total: a single thin gold hairline (the one accent moment
    // in the interior), a quiet grey label and the amount in serif ink. No fill.
    const drawTotal = (pg: PDFPage, ty: number, rotulo?: string, valor?: string) => {
      pg.drawLine({
        start: { x: M, y: ty },
        end: { x: M + boxW, y: ty },
        thickness: 1,
        color: GOLD,
      });
      text(pg, rotulo ?? totalLbl, M, ty - 26, { font: f.serifB, size: 13, color: INK });
      // O total também passa pelo normalizador: quando o texto foi GERADO pelo
      // estúdio (que usa o mesmo `eur` que nós) vem com espaço inquebrável, e
      // ficaria a discordar dos números que desenhamos por baixo dele.
      const amount = dinheiro(valor ?? (totalStr || "—"));
      const amountSafe = textoParaFonte(f.serifB, amount);
      pg.drawText(amountSafe, {
        x: M + boxW - f.serifB.widthOfTextAtSize(amountSafe, 22),
        y: ty - 32,
        font: f.serifB,
        size: 22,
        color: INK,
      });
    };

    /* ═══════════════════════════════════════════════════════════════════════
       O CABEÇALHO DO QUADRO VIAJA COM O QUADRO
       ═══════════════════════════════════════════════════════════════════════

       Quando o quadro parte, a folha seguinte abria com uma rubrica solta: sem
       o «Item / Preço (€)», sem título de secção, sem nada que dissesse que
       aquilo era a continuação de um orçamento. Quem vira a página encontra uma
       frase no topo de uma folha branca.

       Agora o cabeçalho é uma função e é redesenhado em cada folha nova, com a
       palavra que diz de onde vem.

       ── PORQUE É QUE O «(cont.)» NÃO ESTÁ NO DICIONÁRIO ────────────────────
       É a MESMA abreviatura nas duas línguas — «cont.» de continuação e
       «cont.» de continued —, exactamente como a marca «extra» das linhas
       opcionais, que também é a mesma nas duas e está escrita no dicionário
       com o mesmo valor dos dois lados. */
    const cabecalhoDoQuadro = (continuacao = false) => {
      if (continuacao) {
        // Em capitulares pálidas, como todos os sobretítulos deste documento —
        // e não em serifa de corpo 13. Diz o mesmo e custa dez pontos a menos
        // de folha, que é o que decide se a cauda ainda cabe nesta página.
        eyebrow(p, `${t.tituloOrcamento} (cont.)`, M, y);
        y -= 12;
      }
      // Column header row — bold sentence-case (matching the studio's sample
      // proposals: "Item" / "Preço Estimado (€)"), one pale rule underneath.
      text(p, t.colunaItem, M, y, { font: f.serifB, size: 11, color: INK });
      textRight(p, orgT ? t.colunaPrecoEstimado : t.colunaPreco, M + boxW, y, {
        font: f.serifB,
        size: 11,
        color: INK,
      });
      y -= 14;
      p.drawLine({ start: { x: M, y }, end: { x: M + boxW, y }, thickness: 0.5, color: LINE });
      y -= 22;
    };
    /** O que o cabeçalho repetido gasta numa folha nova: a palavra, as duas
     *  legendas e a régua. */
    const ALTURA_DO_CABECALHO_CONT = 12 + 14 + 22;
    cabecalhoDoQuadro();

    /**
     * Muda de página quando o que vem a seguir não cabe acima do chão da mancha.
     *
     * O chão é o {@link CHAO} de toda a gente. Era `M + 30` só aqui — vinte e
     * quatro pontos de folha que esta secção não usava e as outras usavam, sem
     * nada que o justificasse. E não era inofensivo: são precisamente esses 24
     * pontos que decidiam se as notas e as condições de reserva cabiam atrás do
     * quadro ou empurravam uma folha inteira só para elas.
     */
    const budgetBreak = (need: number) => {
      if (y - need < CHAO) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
    };

    /* ═══════════════════════════════════════════════════════════════════════
       O QUADRO PARTE-SE COM REGRA DE VIÚVA E ÓRFÃ
       ═══════════════════════════════════════════════════════════════════════

       Cada linha decidia sozinha se cabia. Medido no caso longo, com quinze
       rubricas: a folha do orçamento levava as rubricas 1 a 14 e a seguinte
       abria com

           Rubrica de orçamento número 15

       sozinha, sem cabeçalho, sem título e sem marca de continuação. Fiz a
       conta: depois da rubrica 14 sobravam 90 pontos acima do chão e a linha
       seguinte pedia 20 — o chão está a 74. Faltaram QUATRO PONTOS.

       A regra passa a ser a das listas: nunca UMA linha sozinha numa folha. Se
       ao partir sobrasse uma, leva-se a anterior com ela.

       ── E É DECIDIDA PARA O QUADRO INTEIRO, NÃO LINHA A LINHA ──────────────
       Uma quebra que se desfaz obriga a refazer todas as que vêm a seguir: por
       isso reparte-se primeiro (sem desenhar nada), aplica-se a regra, e só
       depois se desenha. A repartição corre outra vez de cada vez que a regra
       muda uma quebra, porque mudar uma pode criar outra.

       ── O QUE NÃO SE CORRIGE, E PORQUÊ ────────────────────────────────────
       A viúva do outro lado — UMA rubrica sozinha no fundo da PRIMEIRA folha —
       não se corrige aqui: empurrá-la deixava o cabeçalho de secção e o
       «Item / Preço (€)» sozinhos numa folha, que é pior do que o defeito. E
       não acontece: o quadro abre com mais de 380 pontos livres, que dão para
       dezanove rubricas. */
    /** Nunca menos de duas rubricas numa folha de continuação. */
    const MIN_RUBRICAS = 2;
    interface LinhaDoQuadro {
      /** O que o `y` desce ao desenhar esta linha. */
      altura: number;
      /** O que tem de caber acima do chão para ela ser desenhada aqui. */
      reserva: number;
      desenhar: () => void;
    }
    const desenharQuadro = (linhas: LinhaDoQuadro[]) => {
      if (!linhas.length) return;
      const yInicial = y;
      const TOPO = H - M - 64;
      /** Que rubricas ficam em cada folha, dadas as quebras já forçadas. */
      const repartir = (forcadas: ReadonlySet<number>): number[][] => {
        const paginas: number[][] = [[]];
        let yy = yInicial;
        for (let i = 0; i < linhas.length; i++) {
          if (i > 0 && (forcadas.has(i) || yy - linhas[i].reserva < CHAO)) {
            paginas.push([]);
            yy = TOPO - ALTURA_DO_CABECALHO_CONT;
          }
          paginas[paginas.length - 1].push(i);
          yy -= linhas[i].altura;
        }
        return paginas;
      };
      const forcadas = new Set<number>();
      let paginas = repartir(forcadas);
      // Uma volta por rubrica é tecto de sobra: cada volta ou corrige uma folha
      // ou pára. Sem tecto, um caso que não convergisse ficava em ciclo.
      for (let volta = 0; volta < linhas.length; volta++) {
        const orfa = paginas.findIndex((pg, k) => k > 0 && pg.length < MIN_RUBRICAS);
        if (orfa < 0) break;
        const primeira = paginas[orfa][0];
        // Nunca se recua para a rubrica 0: isso mandava o quadro inteiro para a
        // folha seguinte e deixava o cabeçalho de secção sozinho.
        if (primeira - 1 <= 0 || forcadas.has(primeira - 1)) break;
        forcadas.add(primeira - 1);
        paginas = repartir(forcadas);
      }
      for (const [k, pagina] of paginas.entries()) {
        if (k > 0) {
          p = pdf.addPage([W, H]);
          frame(p);
          y = TOPO;
          cabecalhoDoQuadro(true);
        }
        for (const i of pagina) linhas[i].desenhar();
      }
    };

    // Reserve room on the right of each row for the price/value column so a long
    // item name wraps onto extra lines instead of running through the amount (and
    // on into the "Notas importantes" column). ~120pt covers "12.500,00 € + IVA".
    const PRICE_COL = 120;
    if (orgT) {
      const rubricas: LinhaDoQuadro[] = (doc.budgetRows ?? []).map((r) => {
        /**
         * ── A COLUNA DE PREÇO É A MESMA COLUNA DOS TOTAIS ──────────────────
         *
         * Esta é a única coluna do documento em que um valor ESCRITO POR ELA é
         * impresso linha a linha, e por baixo dela — à mesma direita, a vinte
         * pontos — vêm as nossas contas: «TOTAL (sem IVA)», «IVA», «Total a
         * pagar». Estava a sair em bruto, e isso dava as duas incoerências que
         * o `money.ts` inteiro existe para não haver:
         *
         *   · em PORTUGUÊS, «7890,00 €» (o que o `Intl` compõe nos milhares
         *     baixos, sem separador nenhum) por cima de «10.390,00 €»;
         *   · em INGLÊS, «2.500,00 €» por cima de «€10,390.00» — as duas
         *     convenções na mesma coluna do mesmo quadro, que é exactamente o
         *     que a nota de `montantesEmIngles` diz ser «pior do que não
         *     converter nada».
         *
         * Passa pelo `dinheiro` como tudo o resto que é montante nesta folha.
         *
         * ── «AINDA SEM PREÇO» DIZ-SE DE UMA MANEIRA SÓ ────────────────────
         *
         * «[Valor]» é o que o estúdio semeia numa linha por orçamentar, e não
         * pode chegar ao papel — nem em português por cima de uma folha
         * inglesa. Cai fora, e isso não muda.
         *
         * O que muda é o que fica no lugar dele. Saía um «—», e a célula
         * genuinamente VAZIA saía vazia: duas rubricas seguidas, a mesma
         * situação — ainda não há preço —, dois desenhos na mesma folha. Foi
         * medido na proposta de Organização do relatório, linhas 3 e 4.
         *
         * As duas passam a ser a mesma: EM BRANCO. Não é uma escolha entre
         * duas igualmente boas — o travessão numa coluna de dinheiro tanto se
         * lê como «zero» como «por definir», e a célula vazia é como esta folha
         * sai há anos. O que se corrigiu foi a incoerência, e corrigiu-se para
         * o lado que já era o dela.
         *
         * (O TOTAL continua a desenhar «—» quando não há número: ali a linha
         * existe e tem de dizer alguma coisa. Aqui a linha é a rubrica, e a
         * rubrica está escrita.)
         */
        const escrito = (r.price ?? "").trim();
        const preco = semMarcador(escrito).trim();
        /**
         * ── E O NOME DA RUBRICA CEDE-LHE A LARGURA QUE ELE PRECISAR ────────
         *
         * Os 120 pontos reservados à direita cobrem «12.500,00 € + IVA» (74
         * pontos, medido na Carlito a corpo 10,5) e mais nada: o valor é TEXTO
         * LIVRE, e «12.500,00 € + IVA (a confirmar)» mede 132 — doze pontos por
         * cima do nome da rubrica, se o nome for comprido ao ponto de encher a
         * sua coluna. Duas frases uma por cima da outra, num quadro de dinheiro.
         *
         * Mede-se o que VAI mesmo ser desenhado, com a fonte com que vai ser
         * desenhado, e é essa a largura que se tira ao nome. O caso normal não
         * muda um ponto — só um preço acima dos 120 aperta a coluna da esquerda.
         */
        const impresso = preco ? dinheiro(preco) : "";
        const larguraDoPreco = impresso
          ? f.reg.widthOfTextAtSize(textoParaFonte(f.reg, impresso), 10.5) + 12
          : 0;
        const lines = wrap(f.reg, r.item, 10.5, boxW - Math.max(PRICE_COL, larguraDoPreco));
        return {
          altura: lines.length * 15 + 5,
          reserva: Math.max(20, lines.length * 15),
          desenhar: () => {
            lines.forEach((ln, i) => {
              text(p, ln, M, y, { size: 10.5, color: INK });
              if (i === 0 && impresso) {
                textRight(p, impresso, M + boxW, y, { size: 10.5, color: MUTED });
              }
              y -= 15;
            });
            y -= 5;
          },
        };
      });
      desenharQuadro(rubricas);
    } else {
      // As linhas assinaladas como EXTRA saem marcadas, para o casal poder ler
      // a proposta uma vez e ver as duas versões nela. A marca é uma palavra à
      // direita e não uma segunda lista: partir o orçamento em dois quadros
      // fazia parecer duas propostas, que é precisamente o que isto vem
      // substituir. Ver `orcamento/versoes-da-proposta.ts`.
      // ── SEM MARCADORES ────────────────────────────────────────────────────
      // A folha antiga escreve as três rubricas do quadro como nomes, um por
      // linha, por baixo do cabeçalho «Item / Preço (€)»: «Design Floral e
      // Decor Jantar», «Decor Mesa Buffet», «Bouquet da Noiva». Não são uma
      // lista de tópicos, são as linhas de um quadro — e um quadro com pontinhos
      // à esquerda de cada linha lê-se como um sumário, não como um orçamento.
      // O cabeçalho e a régua por cima já dizem o que aquilo é.
      const marcas = opcionaisDe(doc);
      // ── E PELA ORDEM DOS SERVIÇOS ────────────────────────────────────────
      // O quadro imprime-se pela ordem da lista de Serviços (pág. 02), que é a
      // primeira que o casal lê — ver o bloco «UMA SÓ ORDEM PARA O DOCUMENTO
      // INTEIRO». A marca de «extra» viaja com a linha: é um array PARALELO, e
      // reordenar um sem o outro trocava as marcas de sítio, que é a única
      // maneira de isto poder mentir sobre dinheiro.
      const ordemDasLinhas = ordemDasLinhasDoOrcamento;
      notaDeOrdem("Orçamento", docPt.budgetItems, ordemDasLinhas);
      const rubricas: LinhaDoQuadro[] = [];
      ordemDasLinhas.forEach((i) => {
        const it = doc.budgetItems[i];
        /**
         * ── UMA RUBRICA EM BRANCO NÃO É UMA LINHA DO QUADRO ────────────────
         *
         * O estúdio deixa acrescentar uma linha e passar à frente sem lhe pôr
         * nome (é o mesmo gesto que deixa um grupo de serviços vazio). No papel
         * isso saía como vinte pontos de nada no meio do quadro — e, se a linha
         * estivesse assinalada como extra, saía a palavra «extra» à direita de
         * um nome que não existe. O casal lê uma linha de orçamento sem
         * rubrica; ninguém sabe o que ela custa nem o que é.
         *
         * `return` e não um `filter` sobre a lista: as marcas (`marcas[i]`)
         * são um ARRAY PARALELO, e mexer nos índices é a única maneira de este
         * quadro poder mentir sobre dinheiro — está escrito aqui em cima.
         */
        if (!(it ?? "").trim()) return;
        // Os 46 pontos reservados à direita são a largura da marca mais o ar
        // que a separa do nome — a marca é curta nas duas línguas («extra»), e
        // o teste de transbordos confirma-o.
        const lines = wrap(f.reg, it, 10.5, boxW - (marcas[i] ? 46 : 0));
        rubricas.push({
          altura: lines.length * 15 + 5,
          reserva: Math.max(20, lines.length * 15),
          desenhar: () => {
            lines.forEach((ln, j) => {
              text(p, ln, M, y, { size: 10.5, color: INK });
              if (j === 0 && marcas[i]) {
                textRight(p, t.marcaExtra, M + boxW, y, { size: 9, color: MUTED });
              }
              y -= 15;
            });
            y -= 5;
          },
        });
      });
      desenharQuadro(rubricas);
    }

    /* ── A RÉGUA ENTRE A ÚLTIMA RUBRICA E A SOMA ────────────────────────────
       «Decor Jantar» e «TOTAL (sem IVA)» colavam-se: quinze pontos de avanço
       entre a última linha do quadro e a primeira da soma, os mesmos quinze que
       separam duas rubricas. O total lia-se como mais uma linha do quadro — e
       é a linha que o casal procura primeiro.

       Um fio pálido à largura do quadro, com seis pontos de ar de cada lado:
       doze pontos ao todo, que é o preço de o quadro acabar antes de a soma
       começar. Sem rubricas nenhumas não se desenha nada — um fio a fechar um
       quadro vazio é tinta a dizer coisa nenhuma. */
    const houveRubricas = orgT
      ? (doc.budgetRows ?? []).length > 0
      : doc.budgetItems.some((it) => (it ?? "").trim());
    if (houveRubricas) {
      y -= 6;
      p.drawLine({
        start: { x: M, y: y + 8 },
        end: { x: M + boxW, y: y + 8 },
        thickness: 0.5,
        color: LINE,
      });
      y -= 6;
    }

    /**
     * ════════════════════════════════════════════════════════════════════════
     * O BLOCO DE TOTAIS — SEIS NÚMEROS, UMA SÓ UNIDADE, E TUDO A FECHAR
     * ════════════════════════════════════════════════════════════════════════
     *
     * ── O QUE FOI PARA A CLIENTE ────────────────────────────────────────────
     * Na proposta da Tara e do Marty, catorze páginas, esta folha dizia
     *
     *     Valor Total                   2.950,79 €
     *     Deslocação da Equipa Líquen       75,00 €
     *
     * e a folha do fecho dizia «Sinal 30% 907,74 €» e «Saldo 70% 2.118,06 €»,
     * que somam 3.025,80 €. Três números em três unidades diferentes: o «Valor
     * Total» saiu com o IVA lá dentro (daí ter-lhe desaparecido o «+ IVA» ao
     * lado) mas sem a deslocação, o sinal e o saldo saíram sobre o valor com
     * IVA e com ela, e nada disto estava escrito em lado nenhum. Pior: o
     * 2.950,79 tinha um cêntimo a menos — 2.950,79 + 75,00 = 3.025,79 ≠
     * 3.025,80 —, resto de uma dupla conversão que aqui se fazia (bruto ÷ 1,23
     * para tirar os adicionais, e o que sobrava × 1,23 outra vez para imprimir).
     *
     * A conta mudou de sítio: vive agora em `totaisDaProposta`, faz-se uma vez,
     * e o gerador não converte nada — só desenha. Ver lá o porquê ao cêntimo.
     *
     * ── A ORDEM É A DELA ────────────────────────────────────────────────────
     * Palavras dela, sobre o que quer ver: «subtotal dos serviços; valores
     * adicionais, com indicação explícita de que somam; TOTAL, a base sobre a
     * qual tudo é calculado; IVA; total a pagar». É esta a ordem, e cada linha
     * diz a unidade em que está — nenhum número desta folha aparece sozinho a
     * poder ser lido como preço final quando não é.
     *
     * ── PORQUE É QUE «TOTAL A PAGAR» DEIXOU DE SER OPCIONAL ────────────────
     * Esteve desligado por omissão, atrás de um interruptor no documento, com o
     * argumento
     * de que a folha feita à mão fecha em «Valor Total» e não tem bloco de
     * soma. O argumento caiu com esta proposta: a folha feita à mão também não
     * tinha o sinal em euros, e sem o «Total a pagar» impresso o casal não tem
     * como ligar os 2.950,79 desta página aos 3.025,80 da última. A soma que
     * ninguém escreve é a soma que o casal faz de cabeça — e faz mal.
     *
     * ── E SEM VALORES ADICIONAIS ───────────────────────────────────────────
     * Fica a folha de sempre: o número grande com o rótulo dela («Valor Total
     * Decoração»), o valor tal como o estúdio o compôs. É a folha que ela envia
     * há anos e que tem de caber numa página só — por isso as linhas do
     * subtotal e dos adicionais, que aí não teriam nada para dizer, não se
     * desenham. O que se garante nesse caso é o «+ IVA»: ver `comIvaDito`.
     */
    const extras = (doc.budgetExtras ?? []).filter(
      (e) => (e.label ?? "").trim() || (e.valueText ?? "").trim(),
    );
    /**
     * As linhas do bloco.
     *
     * ── PORQUE É QUE O SUBTOTAL É 11 E A SOMA É 12,5 ──────────────────────
     * Não é só peso tipográfico: o «Subtotal dos serviços» é a última linha do
     * QUADRO (é o total das linhas listadas por cima dele) e as duas de baixo
     * são a SOMA do documento. Quem lê o PDF de volta separa-os exactamente
     * assim — pela banda de corpo 9 a 12 em que o quadro vive (ver
     * `proposta-de-pdf/campos.ts`: «o número grande é 22 e as rubricas são 13, e
     * a banda serve para os deixar de fora»). Com as três no mesmo corpo, o
     * «TOTAL (sem IVA)» e o «IVA» voltavam de uma importação como se fossem dois
     * valores adicionais a mais, e a proposta importada ganhava 3.025,80 € de
     * deslocação.
     */
    const linhaDeTotal = (rotulo: string, valor: string, size: number, forte = false) => {
      text(p, rotulo, M, y, {
        font: forte ? f.serifB : f.reg,
        size,
        color: INK,
      });
      textRight(p, valor, M + boxW, y, {
        font: forte ? f.serifB : f.reg,
        size,
        color: INK,
      });
      y -= 18;
    };
    /** A régua fina que separa as parcelas da soma. */
    const reguaDeSoma = () => {
      p.drawLine({
        start: { x: M + boxW - 200, y: y + 10 },
        end: { x: M + boxW, y: y + 10 },
        thickness: 0.5,
        color: LINE,
      });
      y -= 6;
    };
    /**
     * O «+ IVA» que TEM de chegar ao PDF.
     *
     * O texto do total é escrito pelo estúdio a partir do modo em vigor, e em
     * «acresce» vem sempre com o «+ IVA» — mas é texto livre, e uma proposta
     * antiga (ou um total escrito à mão) pode não o trazer. Sem ele, um valor
     * de base lê-se como preço final: foi exactamente isso que aconteceu na
     * proposta da Tara e do Marty, e são 23% de diferença no que o casal
     * pensa que vai transferir.
     */
    // A detecção continua a aceitar o «+ IVA» português mesmo quando o
    // documento sai em inglês: o texto do total é DELA, e ela escreve-o em
    // português. Um «+ VAT» acrescentado a um total que já dizia «+ IVA» era o
    // mesmo aviso duas vezes, em duas línguas, na mesma linha.
    const comIvaDito = (texto: string) =>
      totais.modo === "acrescer" && !/\+\s*(iva|vat)/i.test(texto)
        ? `${texto} ${t.maisIva}`
        : texto;

    if (extras.length) {
      budgetBreak(30 + (extras.length + 4) * 18 + boxH);
      linhaDeTotal(
        orgT ? t.subtotalServicosEstimado : t.subtotalServicos,
        eurDoc(totais.servicos),
        11,
        true,
      );
      // ── OS ADICIONAIS, NA UNIDADE DO BLOCO ────────────────────────────────
      // O valor impresso é o que o adicional acrescenta à BASE, e não o número
      // cru que ela escreveu: «75,00 €» numa proposta que se lê com IVA vale
      // 60,98 € de base, e imprimir 75,00 aqui era pôr uma parcela que não soma
      // com as outras — o mesmo erro de unidades, uma linha mais abaixo.
      //
      // O que ela escreveu não se perde: quando o número cru é outro, vai entre
      // parênteses ao lado do nome. É lá que a informação pertence — a dizer o
      // que aquele valor era, não a fingir que é uma parcela desta soma.
      for (const ex of extras) {
        const cru = normalizarValor(ex.valueText);
        const base = somaDosExtrasSemIva([ex], { mode: totais.modo, vatRate: totais.taxa });
        /* ═════════════════════════════════════════════════════════════════
           A RESSALVA QUE ELA ESCREVE NUM VALOR É SEMPRE IMPRESSA
           ═════════════════════════════════════════════════════════════════

           Escrito no estúdio, num adicional:

               12.500,00 € + IVA (a confirmar consoante a distância final)

           O PDF imprimia «+ 12.500,00 €» e DEITAVA FORA a condição inteira. O
           número estava certo — o IVA é somado no bloco — mas a ressalva, que é
           sobre dinheiro e é dela, não chegava ao cliente.

           A causa: o texto dela só aparecia quando o número CRU diferia da base
           («75,00 €» numa proposta com IVA incluído vale 60,98 de base, e aí a
           folha dizia os dois). Quando não diferia, o ramo de baixo escrevia só
           o rótulo — e com ele ia tudo o que ela tinha escrito ao lado do
           número.

           Agora: o que ela escreveu ALÉM do número vai sempre para o papel, ao
           lado do nome, entre parênteses. É onde a informação pertence — a
           dizer o que aquele valor é, não a fingir que é uma parcela desta
           soma, que continua a ser a que fecha as contas.

           E é a mesma regra que o modelo de Organização já tinha: lá,
           «1.850,00 € + IVA (a confirmar)» é impresso inteiro na linha. A mesma
           frase, escrita pela mesma pessoa, era tratada de duas maneiras
           conforme o modelo. */
        const escritoDela = (ex.valueText ?? "").trim();
        const mostraTudo = cru === null || round2(cru) !== base;
        const aoLado = mostraTudo ? dinheiro(escritoDela) : ressalvaDoValor(escritoDela);
        const dito = aoLado ? `${ex.label} (${aoLado})` : ex.label;
        const lines = wrap(f.reg, dito, 10.5, boxW - PRICE_COL);
        budgetBreak(Math.max(18, lines.length * 14));
        lines.forEach((ln, i) => {
          text(p, ln, M, y, { size: 10.5, color: INK });
          // O «+» à frente do valor é a «indicação explícita de que somam» que
          // ela pediu: sem ele, uma parcela por baixo de um subtotal tanto pode
          // somar como descontar, e nada na folha o dizia.
          if (i === 0) {
            textRight(p, cru === null ? "—" : `+ ${eurDoc(base)}`, M + boxW, y, {
              size: 10.5,
              color: INK,
            });
          }
          y -= 14;
        });
        y -= 4;
      }
      y -= 4;
      reguaDeSoma();
      // O TOTAL: a base sobre a qual o IVA, o sinal e o saldo são calculados.
      linhaDeTotal(t.totalSemIva, eurDoc(totais.total), 12.5, true);
      linhaDeTotal(t.iva(percentagemDoIva(totais.taxa)), eurDoc(totais.iva), 12.5);
      budgetBreak(boxH + 24);
      y -= 6;
      // O número grande é o que o casal transfere — e é o mesmo, ao cêntimo,
      // que a folha do fecho parte em sinal e saldo.
      drawTotal(p, y, t.totalAPagar, eurDoc(totais.aPagar));
      /* ── O QUE ESTE BLOCO CUSTA, MEDIDO ────────────────────────────────────
         Setenta pontos a mais do que o quadro que aqui estava (o «Valor Total»,
         os adicionais, e nada mais). Numa proposta COM valores adicionais isso
         chega para a cauda — as «Notas importantes» e as «Condições de reserva»
         — passar inteira para a folha seguinte: na proposta da Tara e do Marty
         faltavam sessenta e sete pontos, e não há ar nenhum nesta folha para os
         dar (o caso da casa fecha com 1,3 pontos de folga).
         Não se aperta o bloco para os arranjar: um documento em que as contas
         não se vêem é o defeito que isto vem corrigir, e a cauda passa INTEIRA,
         que é a regra de quebra desta folha. A folha SEM adicionais — a que ela
         envia há anos e compara com a dela — continua a caber numa página. */
      y -= boxH + 6;
    } else if (totais.aPagar > 0) {
      /**
       * ── SEM VALORES ADICIONAIS, A MESMA FOLHA ────────────────────────────
       *
       * Pedido dela, com a proposta da Mariana e do João à frente: «quero
       * sempre que nas propostas apareça assim na parte do orçamento». Assim é
       * a escada — TOTAL (sem IVA), IVA, Total a pagar — e não um número
       * grande sozinho, que era o que saía a qualquer proposta sem deslocação
       * nem outros adicionais.
       *
       * O que estava antes deixava o casal com UM número e a unidade dele
       * escrita ao lado em texto livre («2.460,00 € + IVA»). Quem lê isso tem
       * de fazer os 23% de cabeça para saber o que vai transferir — e a folha
       * do fecho, essa, parte o valor COM IVA em sinal e saldo. Eram duas
       * páginas do mesmo documento a falar em unidades diferentes, que é o
       * defeito que este bloco já tinha vindo corrigir do outro lado.
       *
       * ── O SUBTOTAL NÃO ENTRA AQUI, E É DE PROPÓSITO ──────────────────────
       * «Subtotal dos serviços» é o total das linhas listadas por cima dele.
       * Sem adicionais, esse subtotal É o TOTAL: imprimir os dois era pôr o
       * mesmo número duas vezes, em duas linhas seguidas, com rótulos
       * diferentes — que é como se ensina alguém a desconfiar de uma conta.
       * A escada fica com os três degraus que dizem coisas diferentes.
       *
       * ── E QUANDO NÃO HÁ NÚMERO ───────────────────────────────────────────
       * Uma proposta a meio, ou com o total escrito «a definir», não tem euros
       * para somar (`aPagar` fica a zero). Aí não se inventa uma escada de
       * zeros: cai no ramo de baixo, que imprime o que o estúdio escreveu.
       */
      // Sem parcelas por cima, a régua de soma não separa nada: seriam doze
      // pontos de tinta a dizer «o que vem acima somou-se», numa folha onde
      // nada somou. E cada ponto conta — ver a nota da paginação mais abaixo.
      budgetBreak(30 + 3 * 18 + boxH);
      linhaDeTotal(t.totalSemIva, eurDoc(totais.total), 12.5, true);
      linhaDeTotal(t.iva(percentagemDoIva(totais.taxa)), eurDoc(totais.iva), 12.5);
      budgetBreak(boxH + 24);
      drawTotal(p, y, t.totalAPagar, eurDoc(totais.aPagar));
      y -= boxH + 6;
    } else {
      budgetBreak(boxH + 24 + 18);
      y -= 12;
      drawTotal(p, y, undefined, comIvaDito(totalStr || "—"));
      // `boxH` (50) já é folgado: a tinta do bloco — a régua dourada, o rótulo e
      // o número em corpo 22 — acaba treze pontos acima dele. Os vinte que aqui
      // estavam eram ar em cima de ar, e numa proposta SEM valores adicionais
      // (onde este bloco custa oitenta e seis pontos) eram eles que empurravam
      // as condições de reserva para uma segunda folha.
      y -= boxH + 6;
    }

    // ── A versão SEM os extras ─────────────────────────────────────────────
    // O total grande é a proposta inteira; por baixo dele, e só quando há
    // linhas assinaladas, a mesma proposta sem elas. É o que permite responder
    // ao "e sem isso, quanto fica?" sem uma segunda proposta a divergir desta.
    //
    // Um extra sem preço não se desconta, e nesse caso os dois números sairiam
    // iguais — melhor não desenhar nada do que desenhar duas vezes o mesmo
    // número com rótulos diferentes.
    //
    // ── O SEGUNDO NÚMERO TEM DE ESTAR NA UNIDADE DO PRIMEIRO ──────────────
    // Isto era `totaisDasVersoes(doc, doc.totalAmount ?? 0)`, e o `totalAmount`
    // só é a BASE em modo «acrescer»; em «IVA incluído» é o BRUTO. Como os
    // preços das linhas são sempre líquidos, a subtracção cruzava duas
    // unidades: numa proposta de base 10.000 € (total 12.300 €) com uma linha
    // extra de 2.000 €, saía «Sem os extras assinalados 10.300 €» quando o
    // correcto são 9.840 €. São 460 € oferecidos ao casal — impressos no PDF,
    // no número por que ele vai pedir o desconto, sem nada que o denunciasse.
    //
    // `comoOTotal` é a leitura na MESMA unidade em que o total grande está
    // impresso — líquida quando o documento diz «+ IVA», bruta quando diz «IVA
    // incluído». Ver `orcamento/versoes-da-proposta.ts`: é lá que a conta vive,
    // uma vez só, partilhada com o estúdio.
    const versoes = totaisDasVersoes(doc);
    if (versoes && versoes.comoOTotal.base > 0 && versoes.extras > 0) {
      const maisIva = totais.modo === "acrescer" ? ` ${t.maisIva}` : "";
      budgetBreak(40);
      text(p, t.semOsExtras, M, y, { size: 10.5, color: MUTED });
      textRight(p, `${eurDoc(versoes.comoOTotal.base)}${maisIva}`, M + boxW, y, {
        font: f.serif,
        size: 13,
        color: INK,
      });
      y -= 16;
      text(
        p,
        versoes.linhasExtra === 1 ? t.umaLinhaExtra : t.variasLinhasExtra(versoes.linhasExtra),
        M,
        y,
        { size: 9, color: MUTED },
      );
      y -= 22;
    }

    // O FASEAMENTO SAIU DESTA PÁGINA. Está agora com as condições gerais, na
    // secção «Faseamento do Pagamento» — que é onde a folha antiga o tem, e onde
    // já vivia a lista com as mesmas percentagens escritas por extenso. Ver lá o
    // porquê da percentagem sair de `depositPercentOf` e não de um «30%» à letra.

    // `.trim()` e não a caixa em bruto: uma nota com um espaço lá dentro é
    // «verdadeira» para o `if`, e saía «Note:» sozinho no fundo do orçamento —
    // um rótulo sem nada à frente numa folha que vai para o cliente. Acontece
    // nas duas línguas; apanhou-o o passeio do PDF inglês.
    if (doc.budgetNote?.trim()) {
      budgetBreak(30);
      for (const ln of wrap(f.reg, t.nota(doc.budgetNote), 9, boxW)) {
        text(p, ln, M, y, { size: 9, color: MUTED });
        y -= 13;
      }
    }

    /* ═══════════════════════════════════════════════════════════════════════
       AS NOTAS E AS CONDIÇÕES DE RESERVA — POR BAIXO DO QUADRO, NUMA COLUNA
       ═══════════════════════════════════════════════════════════════════════

       Estavam numa coluna estreita à direita do orçamento, ancorada no topo da
       primeira página. Ela abriu uma proposta gerada e disse que não estava
       igual à folha que envia há anos — e não estava: a folha dela é uma coluna
       de cima para baixo, «Notas Importantes» e «Condições de Reserva» POR
       BAIXO do quadro, por esta ordem (ver a página 7 da proposta de
       referência: x71 y312 e x71 y197, ambas encostadas à margem).

       A coluna da direita tinha 216 pontos de largura para texto de corpo 8,5 —
       nada era cortado (a quebra media a coluna certa), mas cabiam 45
       caracteres por linha, e uma nota de duas linhas passava a quatro. Pior:
       `bullets` desce o `y` e não conhece o chão da página. Medido, com listas
       longas: o «NÃO INCLUÍDO» a ser desenhado POR CIMA do rodapé e o resto a
       sair pela folha fora, sem erro e sem aviso — a mesma avaria que o
       cronograma tinha.

       Agora: uma coluna só, à largura do texto corrido, e cada bloco medido
       ANTES de ser desenhado. Um bloco ou cabe onde está, ou começa na página
       seguinte INTEIRO — nunca a meio de uma lista.

       ── PORQUE NÃO A LARGURA TODA DA FOLHA ─────────────────────────────────
       A folha é A4 ao baixo: entre margens são 706 pontos, que a corpo 9 dão
       ~155 caracteres por linha — o dobro do que se lê sem perder a linha, e o
       maior sinal de folha feita à pressa que este documento tem (ver MEASURE).
       550 pontos dão ~110 e chegam para a nota mais comprida da casa caber numa
       linha só. A folha antiga, essa, mede 480 pontos de mancha em A4 ao alto —
       está mais perto de 550 do que de 706. */
    const NOTAS_W = MEASURE + 120;
    const NOTAS_SIZE = 9;
    /**
     * A legenda de uma sub-rubrica NUNCA É MENOR DO QUE A SUA LISTA.
     *
     * Era: legenda de 7,5 com itens de 8,5 por baixo — uma rubrica mais pequena
     * do que aquilo que encabeça, que só passava despercebido porque estava
     * numa coluna estreita ao lado. Na folha antiga as duas são do mesmo corpo
     * (t8 e t8). Aqui a legenda fica meio ponto acima da lista: lê-se como
     * cabeçalho, e quem lê o documento de volta — que separa a lista da rubrica
     * pelo corpo — não perde as duas listas de condições de reserva.
     */
    const NOTAS_OLHO = NOTAS_SIZE + 0.5;
    /* ── O AR ENTRE BLOCOS É O QUE PAGA A FOLHA ─────────────────────────────
       Estes quatro números decidem, sozinhos, se a cauda cabe atrás do quadro
       no CASO DA CASA — as três notas, os dois incluídos e os dois não
       incluídos que vêm por omissão, que são os mesmos da proposta dela.

       Medido: com 18 de ar e 22 de avanço, a tinta da cauda ocupava 176 pontos
       e começava em y=230; acabava em y=54, vinte abaixo do chão da mancha. A
       folha partia-se em duas, cada uma com menos de metade cheia. Com estes
       números ocupa 156 e acaba em y=84 — dez pontos acima do chão.

       O que se aperta é o ar ENTRE secções, e só esse: o corpo da letra, a
       entrelinha e a medida do texto ficam onde estavam. Uma folha um pouco
       mais cerrada continua a ler-se como desenho; duas a meio gás, não.
       (A folha dela dá-se ao luxo de 64 e 73 pontos entre as rubricas porque o
       quadro dela, todo em corpo 8, acaba 107 pontos mais acima do que o
       nosso.) */
    const H_RUBRICA = 18; // avanço depois de uma rubrica em serifa (corpo 13)
    const H_OLHO = 12; // avanço depois de uma legenda em capitulares
    const AR = 6; // ar entre blocos (soma-se ao que a lista anterior já deixou)
    const AR_OLHOS = 4; // ar entre as duas legendas das condições de reserva

    /** O que `bullets` desce no `y` ao desenhar esta lista — medido com a MESMA
     *  quebra com que desenha. Medir num sítio e desenhar noutro é como a
     *  coluna da direita passava por cima do rodapé. */
    const avancoDaLista = (itens: readonly string[]) =>
      itens.reduce(
        (h, it) => h + wrap(f.reg, it, NOTAS_SIZE, NOTAS_W - 12).length * (NOTAS_SIZE + 3) + 3,
        0,
      );
    /**
     * O avanço que sobra DEPOIS da última tinta de uma lista: a descida da
     * última linha, mais o ar que a separaria de um item seguinte que não
     * existe. Não é tinta e não tem de caber na folha.
     *
     * Contá-lo custava quinze pontos por lista. É pouco, e foi o que bastou:
     * a cauda pedia uma folha nova por causa de um espaço em branco que ninguém
     * ia ver.
     */
    const FIM_MORTO = NOTAS_SIZE + 3 + 3;
    /** A altura de TINTA de uma lista — o que tem mesmo de caber acima do chão. */
    const alturaDeMarcadores = (itens: readonly string[]) =>
      Math.max(0, avancoDaLista(itens) - FIM_MORTO);
    /** A altura útil de uma página de orçamento — o tecto do que se pode exigir
     *  a uma quebra. Sem isto, uma lista maior do que uma página pedia uma
     *  página nova para sempre. */
    const COLUNA_ORC = H - M - 64 - CHAO;
    /** Este bloco cabe aqui, ou começa na página seguinte. */
    const bloco = (altura: number) => budgetBreak(Math.min(altura, COLUNA_ORC));
    const rubrica = (t: string) => {
      text(p, t, M, y, { font: f.serifB, size: T_SUB, color: INK });
      y -= H_RUBRICA;
    };
    /** A legenda em capitulares LEVA DOIS PONTOS, como na folha antiga
     *  («INCLUÍDO NA PROPOSTA:», «NÃO INCLUÍDO NO ORÇAMENTO:»). Não é enfeite:
     *  são os dois pontos que dizem que aquilo é um cabeçalho e não uma frase —
     *  é assim que o leitor de propostas antigas as distingue, e agora a nossa
     *  folha diz o mesmo da mesma maneira. */
    const olho = (t: string) => {
      eyebrow(p, t, M, y, MUTED, NOTAS_OLHO);
      y -= H_OLHO;
    };

    const temNotas = fixos.notasImportantes.length > 0;
    const temReserva = fixos.incluido.length > 0 || fixos.naoIncluido.length > 0;

    /* ── AS DUAS RUBRICAS VIAJAM JUNTAS ────────────────────────────────────
       A folha antiga mete o quadro, as «Notas Importantes» e as «Condições de
       Reserva» na MESMA página — e é A4 AO BAIXO, 842 × 595, exactamente a
       nossa folha (medido no ficheiro dela: «Page size: 842.04 x 595.56 pts»).
       Não há altura nenhuma a menos a justificar uma segunda folha: o caso da
       casa tem de caber, e cabe — ver o ar apertado aqui em cima.

       Quando não cabe mesmo (listas engordadas à mão), a cauda passa INTEIRA
       para a folha seguinte em vez de partir no meio: uma folha com o fim das
       notas e outra com o resto são duas a meio gás. E se nem numa folha
       inteira couber, os `bloco` de baixo partem-na por rubricas — nunca a meio
       de uma lista. */
    // Os avanços de todos os blocos, menos o fim morto do último: é a TINTA da
    // cauda inteira, do primeiro título à base da última linha.
    const conjunto =
      (temNotas ? AR + H_RUBRICA + avancoDaLista(fixos.notasImportantes) : 0) +
      (temReserva
        ? AR +
          H_RUBRICA +
          (fixos.incluido.length ? H_OLHO + avancoDaLista(fixos.incluido) : 0) +
          (fixos.naoIncluido.length ? AR_OLHOS + H_OLHO + avancoDaLista(fixos.naoIncluido) : 0)
        : 0);
    if (conjunto > 0) bloco(conjunto - FIM_MORTO);

    if (temNotas) {
      y -= AR;
      bloco(H_RUBRICA + alturaDeMarcadores(fixos.notasImportantes));
      rubrica(t.notasImportantes);
      y = bullets(p, fixos.notasImportantes, M, y, NOTAS_W, f, NOTAS_SIZE);
    }

    if (temReserva) {
      y -= AR;
      // O título «Condições de reserva» viaja com a primeira legenda e com a
      // primeira lista: um título sozinho no fundo de uma folha não é conteúdo.
      bloco(
        H_RUBRICA +
          (fixos.incluido.length
            ? H_OLHO + alturaDeMarcadores(fixos.incluido)
            : H_OLHO + alturaDeMarcadores(fixos.naoIncluido)),
      );
      rubrica(t.condicoesDeReserva);
      if (fixos.incluido.length) {
        olho(t.incluidoNaProposta);
        y = bullets(p, fixos.incluido, M, y, NOTAS_W, f, NOTAS_SIZE);
      }
      if (fixos.naoIncluido.length) {
        if (fixos.incluido.length) {
          y -= AR_OLHOS;
          bloco(H_OLHO + alturaDeMarcadores(fixos.naoIncluido));
        }
        olho(t.naoIncluidoNoOrcamento);
        y = bullets(p, fixos.naoIncluido, M, y, NOTAS_W, f, NOTAS_SIZE);
      }
    }
  }

  // ── Condições Gerais (two columns for a comfortable reading measure) ──
  {
    let p = pdf.addPage([W, H]);
    frame(p);
    const yTop = sectionHeader(p, t.sobretituloCondicoes, numerada(t.tituloCondicoes), H - M - 64);
    const gutter = 34;
    const colW = (W - 2 * M - gutter) / 2;
    const colX = [M, M + colW + gutter];
    let col = 0;
    let y = yTop;

    /* ═══════════════════════════════════════════════════════════════════════
       AS DUAS COLUNAS EQUILIBRAM-SE
       ═══════════════════════════════════════════════════════════════════════

       Enchia-se a coluna da esquerda até transbordar e o resto caía na direita.
       Com o texto da casa, medido: OITO cláusulas à esquerda e DUAS à direita —
       a esquerda descia até y=650 e a direita parava a 445. Duas colunas com o
       dobro de tinta numa delas não se leem como duas colunas: leem-se como
       uma coluna com um apêndice.

       Mede-se cada cláusula ANTES (com a mesma quebra com que vai ser
       desenhada, que é a regra desta folha) e escolhe-se o corte que deixa as
       duas metades mais parecidas — sem nunca passar a altura da coluna.

       ── SÓ QUANDO CABE EM DUAS COLUNAS ────────────────────────────────────
       Uma lista que precise de mais de uma folha volta ao comportamento de
       encher e transbordar: aí não há nada a equilibrar, há páginas a
       preencher, e um corte «bonito» na primeira folha só empurraria a última
       cláusula para uma folha nova. */
    const alturaDaClausula = (c: string) => wrap(f.reg, c, 9, colW - 14).length * 12 + 8;
    const alturas = fixos.condicoesGerais.map(alturaDaClausula);
    const somaTotal = alturas.reduce((a, b) => a + b, 0);
    const alturaDaColuna = yTop - (M + 4);
    /** Quantas cláusulas ficam na coluna da esquerda. `null` = não se equilibra
     *  (não cabe em duas colunas), enche-se como antes. */
    let corte: number | null = null;
    if (somaTotal <= 2 * alturaDaColuna) {
      let melhorDesvio = Infinity;
      let acumulado = 0;
      for (let i = 0; i < alturas.length; i++) {
        acumulado += alturas[i];
        if (acumulado > alturaDaColuna) break;
        // O resto tem de caber na coluna da direita — senão o «equilíbrio»
        // atirava cláusulas para uma folha nova.
        if (somaTotal - acumulado > alturaDaColuna) continue;
        const desvio = Math.abs(acumulado - (somaTotal - acumulado));
        if (desvio < melhorDesvio) {
          melhorDesvio = desvio;
          corte = i + 1;
        }
      }
    }

    for (const [i, c] of fixos.condicoesGerais.entries()) {
      const lines = wrap(f.reg, c, 9, colW - 14);
      const transborda = y - lines.length * 12 - 6 < M + 4;
      if (transborda || (corte !== null && col === 0 && i === corte)) {
        // Column full → next column, or a new page after the second column.
        if (col === 0) {
          col = 1;
          y = yTop;
        } else {
          p = pdf.addPage([W, H]);
          frame(p);
          col = 0;
          y = H - M - 64;
          // Numa folha nova volta-se a encher: o corte foi calculado para a
          // primeira, e aplicá-lo aqui partia a coluna no sítio errado.
          corte = null;
        }
      }
      const x = colX[col];
      p.drawCircle({ x: x + 3, y: y + 3, size: 1.2, color: FAINT });
      for (const ln of lines) {
        text(p, ln, x + 14, y, { size: 9 });
        y -= 12;
      }
      y -= 8;
    }
  }

  // ── Observações / Faseamento / Cancelamento / Contactos ──
  {
    let p = pdf.addPage([W, H]);
    frame(p);
    let y = H - M - 64;
    const maxW = MEASURE; // capped reading measure
    /** A altura útil desta página — o tecto do que se pode exigir a uma quebra. */
    const COLUNA_FECHO = H - M - 64 - (M + 24);
    /** `altura` é o BLOCO que vem a seguir ao título, e não os 40 pontos de
     *  «o título e uma linha» que aqui estavam: um título no fundo de uma folha
     *  com a sua lista na seguinte é o mesmo defeito dos serviços, um capítulo
     *  mais à frente do ficheiro. */
    const subHead = (title: string, altura = 16) => {
      if (y - 24 - Math.min(altura, COLUNA_FECHO) < M + 24) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
      text(p, title, M, y, { font: f.serifB, size: T_SUB, color: INK });
      y -= 24;
    };
    /** A altura de uma lista desta página, medida como vai ser desenhada. */
    const alturaDaLista = (items: readonly string[], size: number) =>
      items.reduce((h, it) => h + wrap(f.reg, it, size, maxW - 16).length * 12 + 6, 0);
    /** `remate` é desenhado ainda DENTRO da secção, antes do ar que a fecha —
     *  ver o faseamento, que junta os valores em euros à lista de percentagens
     *  sem os deixar a pairar entre duas rubricas. */
    const section = (
      title: string,
      items: string[],
      size = 9,
      remate?: { altura: number; desenhar: () => void },
    ) => {
      subHead(title, alturaDaLista(items, size) + (remate?.altura ?? 0));
      for (const it of items) {
        const lines = wrap(f.reg, it, size, maxW - 16);
        if (y - lines.length * 12 < M + 24) {
          p = pdf.addPage([W, H]);
          frame(p);
          y = H - M - 64;
        }
        p.drawCircle({ x: M + 3, y: y + 3, size: 1.2, color: FAINT });
        for (const ln of lines) {
          text(p, ln, M + 14, y, { size });
          y -= 12;
        }
        y -= 6;
      }
      remate?.desenhar();
      y -= 18;
    };

    // Próximos passos — the clear "what happens next", with the validity date.
    const validUntil = t.data(resolveValidUntil(doc));
    subHead(t.proximosPassos);
    for (const line of [t.passoAceitar, t.passoSinal, t.passoValidade(validUntil)]) {
      const lines = wrap(f.reg, line, 10, maxW - 16);
      p.drawCircle({ x: M + 3, y: y + 3, size: 1.2, color: FAINT });
      for (const ln of lines) {
        text(p, ln, M + 14, y, { size: 10 });
        y -= 14;
      }
      y -= 4;
    }
    y -= 18;

    section(t.observacoesGerais, fixos.observacoesGerais);
    /* ═════════════════════════════════════════════════════════════════════════
       O FASEAMENTO, COM OS VALORES A SÉRIO — AQUI, E NÃO NA FOLHA DO ORÇAMENTO
       ═════════════════════════════════════════════════════════════════════════

       Estes dois números estavam por baixo do total, na página do orçamento. Na
       folha antiga o faseamento não está lá: está com as condições, em
       «FASEAMENTO DO PAGAMENTO:» (página 9 da proposta de referência), que é
       exactamente esta rubrica — a mesma que já trazia as percentagens escritas
       por extenso, e só as percentagens.

       Mudaram de página, não se perderam: quanto é o sinal EM EUROS é a
       informação que a folha antiga não dá e que evita o telefonema a perguntar.
       Ficam onde a lista já falava deles, logo por baixo dela.

       A PERCENTAGEM SAI DE `depositPercentOf`, e não de um «30%» escrito à
       letra: há uma caixa editável no estúdio e são as rotas de facturação que a
       lêem quando emitem o sinal e o saldo. Numa proposta de 50% o documento
       dizia «Sinal 30% 3.000,00 €» num total de 10.000 €, o casal aceitava, e a
       factura do sinal saía a 5.000 € — o documento assinado e a factura emitida
       a discordarem em 2.000 €. Os montantes saem do mesmo resolvedor de
       dinheiro que a facturação usa, pela mesma razão. */
    const comValores = totais.aPagar > 0;
    section(t.faseamentoDoPagamento, fixos.faseamento, 9, {
      // As duas linhas viajam com a rubrica: são medidas ANTES de o título ser
      // desenhado, e não depois da lista — de outro modo apareciam sozinhas no
      // topo da folha seguinte, longe do cabeçalho que lhes dá sentido. A
      // terceira, a que diz a base, viaja com elas pela mesma razão: um sinal
      // sem a base de que saiu é meio número.
      altura: comValores ? 51 : 0,
      desenhar: () => {
        if (!comValores) return;
        const pct = totais.percentagemSinal;
        for (const [rotulo, valor, quando] of [
          [t.sinal(pct), totais.sinal, t.quandoSinal],
          [t.saldo(100 - pct), totais.saldo, t.quandoSaldo],
        ] as const) {
          text(p, `${rotulo}   ${eurDoc(valor)}`, M + 14, y, {
            font: f.serif,
            size: 10.5,
            color: INK,
          });
          textRight(p, quando, M + maxW, y, { size: 9, color: MUTED });
          y -= 17;
        }
        /**
         * ── A BASE DE CÁLCULO, DITA ────────────────────────────────────────
         *
         * Estas duas linhas estavam sozinhas. Na proposta da Tara e do Marty
         * somavam 3.025,80 € — o total COM IVA e COM a deslocação — enquanto a
         * folha do orçamento dizia «Valor Total 2.950,79 €». Dois números
         * legítimos, nenhum deles explicado, e nada no documento a ligá-los.
         *
         * A frase diz de onde saem, e diz o número: é a mesma palavra («total a
         * pagar») e o mesmo valor, ao cêntimo, que fecha o quadro do orçamento.
         */
        text(p, t.baseDoCalculo(eurDoc(totais.aPagar)), M + 14, y, { size: 9, color: MUTED });
        y -= 17;
      },
    });
    section(t.cancelamento, fixos.cancelamento);

    // Contactos
    subHead(t.contactos);
    eyebrow(p, t.email, M, y);
    text(p, SITE.email, M + 70, y, { size: 10.5, color: INK });
    y -= 18;
    eyebrow(p, t.telefone, M, y);
    text(p, SITE.phoneDisplay, M + 70, y, { size: 10.5, color: INK });
  }

  // ── Back cover — mirrors the front cover's gatefold so the document opens and
  //    closes on the same image: two side photos flanking a dark centre band,
  //    with a quiet closing note in the middle. ──
  {
    const p = pdf.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: DARK });

    const hasImgs = !!(doc.coverImages[0] || doc.coverImages[1]);
    if (hasImgs) {
      // Same gatefold geometry as page 1 so the covers bookend each other.
      const panelW = W * 0.34;
      const sideW = (W - panelW) / 2;
      const left = doc.coverImages[0];
      const right = doc.coverImages[1];
      // A capa não leva moldura (foi retirada a pedido), por isso uma foto que
      // não saia não deixa cá rectângulo nenhum — mas continua a ser uma foto
      // que o cliente devia ter visto e não vê, logo é contada. E o `photo`
      // encaminha também a contagem do caminho de recurso: a capa é a maior
      // caixa do documento, é a que mais pesa quando entra sem redimensionar.
      if (left) await photo(p, left, 0, 0, sideW, H, "cover");
      if (right) await photo(p, right, sideW + panelW, 0, sideW, H, "cover");
      p.drawRectangle({ x: sideW, y: 0, width: panelW, height: H, color: DARK });
    }

    // No border frame — removed on request, matching the front cover.

    const cx = W / 2;
    // Keep every line inside the centre band so text never spills onto the
    // photos; wrap to the band width when images flank the page.
    const bandW = (hasImgs ? W * 0.34 : W * 0.72) - 24;
    textCenter(p, t.obrigada, cx, H * 0.62, {
      font: f.bold,
      size: 9,
      color: rgb(0.72, 0.6, 0.34),
      tracking: 3,
    });
    let my = H * 0.56;
    for (const ln of wrap(f.serifIt, t.agradecimento, 13, bandW)) {
      textCenter(p, ln, cx, my, { font: f.serifIt, size: 13, color: CREAM });
      my -= 13 * 1.3;
    }
    const lw = 168;
    const lh = (logoWhite.height / logoWhite.width) * lw;
    p.drawImage(logoWhite, { x: cx - lw / 2, y: H * 0.3, width: lw, height: lh });
    let sy = H * 0.3 - 18;
    for (const ln of wrap(f.serifIt, t.slogan ?? SITE.slogan, 10.5, bandW)) {
      textCenter(p, ln, cx, sy, { font: f.serifIt, size: 10.5, color: CREAM_DIM });
      sy -= 10.5 * 1.3;
    }

    /* ═══════════════════════════════════════════════════════════════════════
       A PÁGINA ONDE O CASAL FECHA O DOCUMENTO DIZ COMO RESPONDER
       ═══════════════════════════════════════════════════════════════════════

       A contracapa era um agradecimento, o logótipo e o slogan: nem email, nem
       telefone, nem prazo. Quem chega ao fim de uma proposta de vinte mil euros
       e decide responder tem de voltar atrás quatro folhas — ou procurar o
       email antigo com que a recebeu.

       Duas linhas, em corpo pequeno e no cinzento discreto do slogan: como
       falar connosco, e até quando a proposta é a proposta. A VALIDADE é a
       mesma frase e a mesma data que os «Próximos Passos» dizem lá atrás — é o
       único elemento do documento que cria urgência, e estava perdida a meio de
       uma lista de três pontos.

       Não muda a identidade da folha: o painel escuro, a marca e o slogan ficam
       onde estavam, e isto vem por baixo, no ar que já lá estava. */
    let cy = sy - 20;
    const fecho = [
      `${SITE.email}   ·   ${SITE.phoneDisplay}`,
      t.passoValidade(t.data(resolveValidUntil(doc))),
    ];
    for (const linha of fecho) {
      for (const ln of wrap(f.reg, linha, 8.5, bandW)) {
        textCenter(p, ln, cx, cy, { font: f.reg, size: 8.5, color: CREAM_DIM });
        cy -= 12;
      }
      cy -= 6;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     A SEGUNDA PASSAGEM — SÓ O RODAPÉ, E SÓ PORQUE PRECISA DELA
     ═══════════════════════════════════════════════════════════════════════════

     O documento é composto numa passagem, da primeira folha à última, e é isso
     que o mantém simples. Uma coisa só não se consegue assim: quantas folhas
     tem o documento. Escreve-se agora, com as páginas todas feitas e antes do
     `save` — que é o único momento em que a resposta existe. */
  {
    const totalDeFolhas = String(pdf.getPageCount()).padStart(2, "0");
    for (const { p, folha } of rodapesPorNumerar) {
      textCenter(
        p,
        `${String(folha).padStart(2, "0")} ${t.deFolhas(totalDeFolhas)}`,
        W / 2,
        M - 26,
        { size: 7.5, color: FAINT },
      );
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     AS PROPRIEDADES DO DOCUMENTO — QUEM O ESCREVEU, E SOBRE QUEM
     ═══════════════════════════════════════════════════════════════════════════

     Estavam vazias, e um PDF com as propriedades vazias não fica neutro: fica
     assinado pela biblioteca que o desenhou. Abrir o ficheiro e ler «Autor:
     pdf-lib» num documento de vinte mil euros é a diferença entre uma empresa e
     um gerador — e é o que o cliente vê no separador do browser, no gestor de
     ficheiros e ao arquivar o anexo.

     Nada disto muda o papel: é o que está À VOLTA do papel. O título é o que
     aparece no separador; o assunto é o que um arquivo lê; as palavras-chave
     são o que uma busca no computador dela encontra. A língua é a do documento
     — um leitor de ecrã que a saiba pronuncia «Décoration» à francesa e
     «Decoração» à portuguesa por causa desta linha.
  */
  {
    const quem = (doc.clientNames ?? "").trim();
    // «Proposta · Decoração» / «Proposal · Planning» — a MESMA frase que a capa
    // imprime, e já traduzida. Um título escrito à parte era uma segunda
    // verdade sobre o que este documento é.
    const oQue = doc.template === "organizacao" ? t.capaOrganizacao : t.capaDecoracao;
    pdf.setTitle(quem ? `${oQue} — ${quem}` : oQue);
    pdf.setAuthor(SITE.name);
    pdf.setSubject(
      [oQue, quem, (evento.eventDate ?? "").trim(), (doc.location ?? "").trim()]
        .filter(Boolean)
        .join(" · "),
    );
    pdf.setKeywords([SITE.name, oQue, quem, doc.ref ?? ""].filter(Boolean));
    pdf.setCreator(SITE.name);
    pdf.setProducer(SITE.name);
    pdf.setLanguage(idioma === "en" ? "en-GB" : "pt-PT");
  }

  if (semRedimensionar > 0) {
    // ERRO e não aviso: o PDF sai, mas sai pesado a abrir e a percorrer, e até
    // aqui isso acontecia sem deixar rasto nenhum. Um PDF verdadeiro de
    // 3,31 MB chegou com as fotos a 266–576 DPI por este caminho.
    log.error("proposal-doc-pdf: fotos embutidas SEM redimensionar", null, {
      quantas: semRedimensionar,
      ref: doc.ref,
      porque:
        "o sharp falhou e usou-se o original. O PDF fica pesado a abrir. " + "Ver PDF-BEFORE.md.",
    });
  }
  // Uma reordenação não é um erro — é uma correcção — mas tem de ficar escrita
  // em algum lado: é conteúdo dela a sair por uma ordem que não é a que ela vê
  // no editor, e o dia em que isto surpreender alguém tem de haver um registo
  // com as duas ordens à frente uma da outra.
  if (reordenacoes.length > 0) {
    log.info("proposal-doc-pdf: listas alinhadas pela ordem dos Serviços", {
      ref: doc.ref,
      reordenacoes: reordenacoes.map(
        (r) => `${r.onde}: ${r.de.join(" → ")} ⇒ ${r.para.join(" → ")}`,
      ),
    });
  }
  return {
    bytes: await pdf.save(),
    truncations,
    undrawnImages: undrawn.size,
    semRedimensionar,
    reordenacoes,
  };
}

// Small helper factory so the collage function can reuse the closures.
function textFns(
  text: (p: PDFPage, s: string, x: number, y: number, o?: object) => void,
  textRight: (p: PDFPage, s: string, xR: number, y: number, o?: object) => void,
) {
  return { text, textRight };
}

/** Auto-layout collage of a mood board's images across the page body. */
async function drawCollage(
  pdf: PDFDocument,
  p: PDFPage,
  mb: MoodBoard,
  f: Fonts,
  fns: ReturnType<typeof textFns>,
  cache: EmbedCache,
  boardName: string,
  note: NoteTruncation,
  noteUndrawn: NoteUndrawn,
  /** Ver `renderProposalDocPdfWithReport`: conta as fotos que entram sem
   *  serem redimensionadas, para a proposta poder dizer que saiu pesada. */
  contarRecurso: () => void,
) {
  // Wrap the annotation (description + optional flower list) to the page measure
  // up front so the collage reserves exactly the height the caption needs. Capped
  // at 5 lines so a very long note never crowds out the photos — o que passa
  // disso é anotado, não desaparece calado.
  // A MEDIDA É A DO DOCUMENTO, e não a folha toda: 550 pontos em vez de 706 —
  // ~100 caracteres por linha em vez de ~150, que era a linha mais comprida
  // deste documento. Vive na geometria, ao lado do tecto de linhas, porque a
  // miniatura do estúdio tem de reservar às fotos a mesma altura. Ver lá.
  //
  // E o que for cortado LEVA «…»: com dez linhas escritas saíam cinco, e a
  // última acabava em «… ao casal. Linha» — sem nada a dizer que faltava texto.
  const ann = mb.annotation
    ? quebrarComReticencias(
        f.serifIt,
        mb.annotation,
        TXT.legenda.tamanho,
        TXT.legenda.medida,
        MAX_ANNOTATION_LINES,
      )
    : { linhas: [] as string[], cortadas: 0 };
  note(`Descrição do mood board ${boardName}`, ann.cortadas, "linhas");
  const annLines = ann.linhas;
  const annH = alturaDaLegenda(annLines.length);
  const bottom = M + annH;
  // O collage tem lugar para MOOD_BOARD_MAX_IMAGES fotos. As restantes JÁ
  // FORAM descarregadas do armazenamento com sucesso e mesmo assim não são
  // desenhadas — é a perda que este aviso existe para tornar visível.
  /**
   * ── A FOTO QUE MANDA NA PÁGINA VEM PRIMEIRO ─────────────────────────────
   *
   * `ordemDasFotos` põe a foto marcada como principal na primeira posição —
   * que é a caixa grande nas duas disposições que têm uma (o «destaque» e o
   * «mosaico»). Nas outras devolve a ordem escrita e não mexe em nada.
   *
   * A permutação é feita ANTES do corte às `MOOD_BOARD_MAX_IMAGES`: uma foto
   * marcada como principal na décima primeira posição tem de entrar na página,
   * não ser cortada por causa da ordem em que foi carregada.
   *
   * É a mesma função que o estúdio chama para desenhar a grelha. Se fossem
   * duas, ela marcava uma foto e recebia outra em grande.
   */
  const ordemDelas = ordemDasFotos(mb);
  const imgs = ordemDelas.slice(0, MOOD_BOARD_MAX_IMAGES).map((i) => mb.images[i]);
  note(`Mood board ${boardName}`, mb.images.length - MOOD_BOARD_MAX_IMAGES, "fotos");

  // Draw one framed image into a box (cover-cropped, thin hairline frame).
  //
  // A MOLDURA SÓ EXISTE SE A FOTO EXISTIR. Era isto que faltava: o contorno era
  // desenhado sempre, mesmo quando o desenho da foto falhava, e a página saía
  // com rectângulos vazios (seis molduras, duas fotos, numa proposta que já
  // tinha seguido para o cliente). Uma caixa vazia num documento que o cliente
  // vê é pior do que não haver caixa — o collage não tem lugares fixos, o resto
  // das fotos ocupa a página na mesma. E a foto que não saiu é CONTADA, para o
  // estúdio ser avisado antes de enviar.
  const place = async (b64: string, x: number, yBottom: number, w: number, h: number) => {
    const drawn = await drawCoverImage(
      pdf,
      p,
      b64,
      x,
      yBottom,
      w,
      h,
      "collage",
      cache,
      contarRecurso,
    );
    if (!drawn) {
      noteUndrawn(b64);
      return;
    }
    p.drawRectangle({ x, y: yBottom, width: w, height: h, borderColor: LINE, borderWidth: 0.5 });
  };

  /**
   * ── AS FOTOS COM A FORMA QUE TÊM ────────────────────────────────────────
   *
   * A geometria vem de `caixasDoMoodboard`, que precisa de saber a FORMA de
   * cada fotografia — é isso que faz uma vertical sair vertical em vez de ser
   * recortada ao mesmo rectângulo das outras, e é a diferença entre uma página
   * de inspiração e uma folha de contactos. Ver `proposal-geometria.ts`.
   *
   * O layout GUARDADO no documento manda sempre. Só quando não há nenhum é que
   * se usa o que o número de fotos sugere — uma sugestão que mudasse com o
   * código reescrevia páginas de propostas já enviadas.
   *
   * ── UMA FOTO QUE NÃO ABRE NÃO PODE OCUPAR LUGAR ─────────────────────────
   *
   * Medir era também a maneira de saber se a fotografia SERVE: são os mesmos
   * bytes que o desenho vai abrir a seguir, e o que não se consegue medir não
   * se consegue desenhar. Antes, essa entrava na composição com o aspecto por
   * omissão — a geometria dava-lhe uma caixa, o desenho falhava, e a página
   * saía com um buraco do tamanho de uma fotografia no meio da fila. A moldura
   * já tinha deixado de ser desenhada; o BURACO ficava.
   *
   * Agora sai da lista antes de a composição existir: as que ficam ocupam a
   * página toda, como se a outra nunca tivesse sido escolhida. E é CONTADA,
   * para o estúdio avisar antes de a proposta seguir — o que não pode
   * acontecer é desaparecer calada.
   */
  const medidas = await Promise.all(
    imgs.map(async (b64) => {
      try {
        const raw = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
        return await aspetoDaImagem(Buffer.from(raw, "base64"));
      } catch {
        return null;
      }
    }),
  );
  const desenhaveis: string[] = [];
  const aspectos: number[] = [];
  for (const [i, medida] of medidas.entries()) {
    if (medida == null) {
      noteUndrawn(imgs[i]);
      continue;
    }
    desenhaveis.push(imgs[i]);
    aspectos.push(medida);
  }
  // A disposição é escolhida para as fotos que a página vai MESMO ter.
  const layout = mb.layout ?? layoutSugerido(desenhaveis.length);
  const caixas = caixasDoMoodboard(layout, aspectos, annH, mb.enquadramento === "forma-da-foto");
  for (let i = 0; i < desenhaveis.length; i++) {
    const c = caixas[i];
    // Uma foto sem caixa não pode sair da página em silêncio. Hoje a geometria
    // devolve sempre uma caixa por foto — mas era ela que devolvia UMA só no
    // arranjo «texto e imagem», e as outras desapareciam sem nada nem ninguém
    // dar por isso. Se voltar a acontecer, conta como foto por desenhar e o
    // estúdio avisa antes de a proposta seguir.
    if (!c) {
      noteUndrawn(desenhaveis[i]);
      continue;
    }
    await place(desenhaveis[i], c.x, c.y, c.w, c.h);
  }

  if (annLines.length) {
    let ay = bottom - TXT.legenda.entrelinha;
    for (const ln of annLines) {
      fns.text(p, ln, M, ay, { font: f.serifIt, size: TXT.legenda.tamanho, color: MUTED });
      ay -= TXT.legenda.entrelinha;
    }
  }
}

function bullets(
  p: PDFPage,
  items: string[],
  x: number,
  y: number,
  maxW: number,
  f: Fonts,
  size: number,
): number {
  for (const it of items) {
    const lines = wrap(f.reg, it, size, maxW - 12);
    p.drawCircle({ x: x + 2, y: y + 3, size: 1.1, color: FAINT });
    for (const ln of lines) {
      p.drawText(ln, { x: x + 11, y, font: f.reg, size, color: INK });
      y -= size + 3;
    }
    y -= 3;
  }
  return y;
}
