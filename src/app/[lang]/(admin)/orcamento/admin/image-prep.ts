"use client";

/**
 * Client-side image preparation for the proposal studio uploads (covers +
 * mood boards) and for the theme library.
 *
 * Why this exists: the team uploads photos straight from phones/cameras
 * (3–10 MB, often HEIC on iPhone). The serverless host rejects request bodies
 * over ~4.5 MB and the API only accepts JPG/PNG/WEBP — so "big real photo"
 * failed while small screenshots worked, which read as "às vezes não funciona".
 *
 * Fix: decode in the browser, downscale to a sane long edge and re-encode as
 * JPEG before uploading. A proposal PDF never needs more than ~2000 px. This
 * also converts HEIC → JPEG wherever the browser can decode HEIC (Safari/iOS —
 * exactly where HEIC files come from).
 *
 * The theme library additionally needs a THUMBNAIL per photo (see
 * `prepareImageWithThumb`): its grid shows hundreds of photos at ~150 px, and
 * pulling the 3000 px originals to draw them was the reason a big theme took
 * hundreds of MB to open. The thumbnail is produced from the SAME decoded
 * bitmap as the original — decoding twice would double the cost of a 300-photo
 * upload, which is the exact batch size we are sizing for.
 */

import type { WorkerRequest, WorkerResponse } from "./image-worker";
import {
  COR_EDGE,
  LQIP_EDGE,
  LQIP_MAX_CHARS,
  LQIP_QUALITY,
  MICRO_EDGE,
  MICRO_QUALITY,
  MID_EDGE,
  MID_QUALITY,
} from "./image-worker";
import { corDominanteDePixeis } from "@/lib/cor-dominante";
// A mesma explicação que o servidor dá, num sítio só. Este módulo não traz nada
// de servidor atrás — ver `recusa-de-imagem`.
import { CONSELHO_HEIC, nomeOuTipoDeHeic } from "@/lib/recusa-de-imagem";

const SUPPORTED = /^image\/(jpe?g|png|webp)$/i;

/**
 * Os formatos que o PDF da proposta sabe IMPRIMIR — que não são os mesmos que
 * carregamos.
 *
 * O gerador embute com o `pdf-lib`, que só sabe JPEG e PNG. Um WebP guardado
 * tal e qual chegava ao mood board e não era desenhado: foi assim que uma
 * proposta seguiu para uma cliente com seis molduras e duas fotos, e as fotos
 * eram do Pinterest, que serve tudo em WebP.
 *
 * O WebP continua a ser ACEITE (recusá-lo fechava a porta à forma como o
 * estúdio recolhe inspiração). O que muda é que deixa de poder ser GUARDADO
 * como está — ver `keepOriginal`.
 */
const IMPRIMIVEL = /^image\/(jpe?g|png)$/i;

/**
 * Per-use-case encode targets. Cover photos are printed LARGE in the proposal
 * (up to ~half the landscape A4 ≈ 300 DPI wants ~2500–3000 px) and are the hero
 * of the document, so they keep more pixels and a higher JPEG quality. Mood-board
 * photos render as small collage cells (a few hundred px each), so a tighter cap
 * keeps a board of 8–12 photos light without any visible loss.
 *
 * The 4.5 MB serverless body limit applies PER image (uploads are one file per
 * request), so a 3000 px cover at q0.92 (~2.5–3.5 MB) stays comfortably under it.
 * The thumbnail that travels with it adds ~30–60 KB — noise, at that scale.
 */
export type ImageKind = "cover" | "board";

/**
 * Lado maior com que a foto de CAPA é guardada. Um só sítio: mexer aqui é
 * reverter (ou reafinar) toda a decisão.
 *
 * Porquê 2200 e não 3000 — medido, não suposto:
 *
 * · O PDF nunca desenha uma foto acima de `MAX_IMAGE_EDGE_PX = 2200`
 *   (`src/lib/proposal-image.ts`). A tira de capa, que é a MAIOR utilização que
 *   existe, mede 277,8 × 595,3 pt e a 160 DPI pede exatamente 617 × 1323 px.
 *
 * · A pior situação é uma foto DEITADA recortada para essa tira em pé: de um
 *   original de 2200 × 1650 o recorte aproveita 770 × 1650 px, que ainda é
 *   1,25× mais do que os 617 × 1323 finais. Essa margem de sobreamostragem é o
 *   que mantém a capa nítida depois do lanczos. Aos 2000 px a margem cai para
 *   1,13× e aos 1800 px para 1,02× — aí qualquer rotação EXIF ou recorte
 *   descentrado já começa a AMPLIAR. Por isso o corte é aos 2200, e não abaixo.
 *
 * · Custo em fidelidade, medido sobre a tira de capa já gerada pelo PDF: 36,9 dB
 *   de PSNR contra o que sai hoje, num corpus propositadamente mau (detalhe de
 *   alta frequência em todo o quadro, o pior caso para reduzir). Acima de ~35 dB
 *   a diferença não se distingue a olho numa fotografia.
 *
 * · O que se ganha: 59% dos bytes de hoje (2,24 → 1,32 MB por foto medidos).
 *   Como os bytes atravessam a rede DUAS vezes (navegador → função → Storage),
 *   isto é o item mais pesado do tempo de carregamento.
 */
export const COVER_MAX_EDGE = 2200;
/** Qualidade JPEG da capa. Ver `COVER_MAX_EDGE` para a medição. */
export const COVER_QUALITY = 0.9;

const PRESETS: Record<ImageKind, { maxEdge: number; quality: number; keepBytes: number }> = {
  // Covers: bigger + higher quality (printed large, the document's hero image).
  cover: { maxEdge: COVER_MAX_EDGE, quality: COVER_QUALITY, keepBytes: 1_500_000 },
  // Mood boards: o mesmo lado da capa (28/10). Com 1600 a célula grande do
  // mosaico da proposta online (~720 pontos, ~1440 pixéis num ecrã retina)
  // ficava esticada numa foto ao alto — eram as fotos «comidas» dela. A
  // qualidade fica mais baixa do que a da capa: as células são mais pequenas.
  board: { maxEdge: COVER_MAX_EDGE, quality: 0.82, keepBytes: 1_000_000 },
};

/**
 * Miniatura da biblioteca de temas: 400 px de lado maior, q0.72 (~25–50 KB).
 *
 * A célula da grelha tem ~150 px de lado; 400 px cobre um ecrã Retina (2×) com
 * folga e ainda serve para a pré-visualização média do seletor de propostas.
 * Uma página de 100 miniaturas fica em ~3–5 MB — contra os ~300 MB que as
 * mesmas 100 fotos originais custavam.
 */
export const THUMB_EDGE = 400;
/** Qualidade JPEG da miniatura. Exportada para o banco de ensaio a poder
 *  comparar com o que espelha, em vez de a ler do código-fonte com uma
 *  expressão regular que se parte a cada arrumação. */
export const THUMB_QUALITY = 0.72;

/** Target width/height after capping the long edge (pure — unit-tested). */
export function fitWithin(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Should this file skip re-encoding entirely? (pure — unit-tested)
 *  A supported file that is BOTH small in bytes and already within the kind's
 *  pixel cap is sent untouched (no re-encode, no quality loss). We can't read
 *  pixels here, so this is the byte-size gate; oversize-dimension files fall
 *  through to the canvas path which enforces the cap.
 *
 *  Só vale para os formatos que o PDF sabe imprimir (`IMPRIMIVEL`), e não para
 *  todos os que aceitamos. Um WebP pequeno passava por aqui intacto — era
 *  exatamente esta a porta por onde os WebP do Pinterest entravam na biblioteca
 *  e acabavam como moldura vazia na proposta. Agora um WebP vai sempre ao
 *  canvas, que devolve JPEG; ser pequeno deixa de ser desculpa para o guardar
 *  num formato que não se imprime. */
export function keepOriginal(type: string, size: number, kind: ImageKind = "cover"): boolean {
  return IMPRIMIVEL.test(type) && size <= PRESETS[kind].keepBytes;
}

/**
 * Vale a pena gerar miniatura para uma foto deste tamanho? (puro — testado)
 *
 * Uma foto que já é pequena não ganha nada com um segundo ficheiro: a poupança
 * seria marginal e o custo (mais um upload, mais um objeto no bucket para
 * limpar) é o mesmo. Sem miniatura, a grelha cai no original — que neste caso
 * já é leve. A margem de 25 % evita gerar uma miniatura de 400 px a partir de
 * uma foto de 420 px.
 */
export function needsThumb(w: number, h: number): boolean {
  return Math.max(w, h) > THUMB_EDGE * 1.25;
}

/** Nome do ficheiro da miniatura (puro — testado). Só para leitura humana nos
 *  registos: o servidor guarda a miniatura com a MESMA chave do original, no
 *  bucket das miniaturas. */
export function microFileName(name: string): string {
  return jpegName(name).replace(/\.jpg$/i, ".micro.jpg");
}

export function midFileName(name: string): string {
  return jpegName(name).replace(/\.jpg$/i, ".mid.jpg");
}

/**
 * Vale a pena fabricar a de 1200 px?
 *
 * A mesma regra da miniatura, com a medida dela: só quando a fonte é
 * MAIOR do que o alvo com folga. Uma fotografia que já nasce com 1000 px é
 * servida tal e qual — fabricar-lhe uma «de 1200» seria ampliar, e produzir um
 * ficheiro maior do que o que se está a evitar.
 */
export function needsMid(w: number, h: number): boolean {
  return Math.max(w, h) > MID_EDGE * 1.25;
}

export function thumbFileName(name: string): string {
  return jpegName(name).replace(/\.jpg$/i, ".thumb.jpg");
}

/** O mesmo nome, com extensão .jpg (o que sai do canvas é sempre JPEG). */
function jpegName(name: string): string {
  return name.replace(/\.[^.]+$/, "") + ".jpg";
}

/** O par que sobe para a biblioteca: o original preparado + a miniatura. */
export interface PreparedImage {
  /** A foto a guardar (o original comprimido, ou o ficheiro tal e qual). */
  file: File;
  /** A miniatura, ou `null` quando não se justifica / não foi possível criar.
   *  Nunca é motivo para falhar o carregamento: sem miniatura a grelha usa o
   *  original, exatamente como faz com as fotos anteriores a esta funcionalidade. */
  thumb: File | null;
  /**
   * A derivada de 96 px, para as tiras do cartão de tema (43 px). `null`
   * quando não se justifica ou não foi possível criar — e aí o cartão usa a
   * miniatura de 400 px, exactamente como faz hoje.
   */
  micro: File | null;
  /**
   * A derivada de 1200 px — a que a PÁGINA DO CASAL mostra.
   *
   * A miniatura de 400 px serve as grelhas do back office; num telemóvel a
   * fotografia da proposta ocupa ~343 pontos a três pixéis por ponto, e o
   * `srcset` escolhe esta. Nascia no servidor, uma a uma, à primeira vez que
   * alguém olhava para cada fotografia — e numa proposta acabada de enviar
   * essa primeira vez é sempre a do casal.
   *
   * `null` quando não se justifica (a foto já é pequena) ou não foi possível
   * criar: aí volta ao caminho de antes, e o servidor fabrica-a a pedido.
   */
  mid: File | null;
  /**
   * A imagem de 16 px em `data:` URI — o que a grelha desenha a 0 ms, antes de
   * haver rede (ver `LQIP_EDGE` em `image-worker.ts`).
   *
   * `null` quando o browser não a soube gerar. Não é motivo para falhar nada:
   * sem LQIP a célula fica como está hoje, uma caixa à espera.
   */
  lqip: string | null;
  /**
   * A cor dominante da fotografia, em `#rrggbb` (ver `corDe` no trabalhador).
   *
   * É o que permite ao estúdio avisar que uma foto destoa da paleta do board e
   * arrumar as fotos por cor. Nasce aqui, com o ficheiro em bruto e sem origem
   * cruzada, porque do lado da proposta as fotos chegam por URLs assinados de
   * outro domínio e ler-lhes os píxeis lançaria.
   *
   * `null` quando não foi possível calculá-la. Uma foto sem cor conhecida não
   * entra no aviso nem na arrumação — que é o que acontece hoje a todas.
   */
  cor: string | null;
}

// ── Pool de trabalhadores ──
//
// O trabalho de pixéis sai do fio principal (ver `image-worker.ts`) e passa a
// usar mais do que um núcleo. Com uma pool, preparar a foto N+1 acontece ENQUANTO
// a foto N está a subir, em vez de as duas coisas se revezarem.

/**
 * Teto de trabalhadores. Quatro chegam: acima disto o ganho achata (o passo
 * seguinte é a rede, não o CPU) e cada trabalhador custa memória — uma bitmap
 * de 4032×3024 são ~48 MB descomprimidos, e há tantas em voo quantos os
 * trabalhadores.
 */
const POOL_MAX = 4;

/** Deixa SEMPRE um núcleo livre para a interface: o objetivo é a grelha não
 *  tremer, e ocupar todos os núcleos com codificação trai isso. */
function poolSize(): number {
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(1, Math.min(POOL_MAX, cores - 1));
}

/** Este browser sabe fazer o trabalho fora do fio principal? Safari só ganhou
 *  `OffscreenCanvas` na 16.4 — e o Safari é precisamente de onde vêm os HEIC,
 *  por isso o caminho do fio principal tem de continuar inteiro. */
function workersUsable(): boolean {
  try {
    return (
      typeof Worker !== "undefined" &&
      typeof OffscreenCanvas !== "undefined" &&
      typeof createImageBitmap !== "undefined" &&
      typeof OffscreenCanvas.prototype.convertToBlob === "function"
    );
  } catch {
    return false;
  }
}

interface Lane {
  worker: Worker;
  busy: boolean;
  /** Trabalho que esta faixa tem em mãos, para o poder desbloquear se o
   *  trabalhador morrer a meio (senão a promessa ficava por resolver e o
   *  carregamento pendurava para sempre — pior do que ser lento). */
  job: number | null;
}

let lanes: Lane[] | null = null;
let poolBroken = false;
/** `null` = a faixa desistiu (trabalhador morto) e a foto segue pelo fio principal. */
const pending = new Map<number, (r: WorkerResponse | null) => void>();
const waiting: Array<() => void> = [];
let nextJobId = 1;

/** Cria a pool à primeira utilização. `null` = este browser não dá. */
function ensurePool(): Lane[] | null {
  if (poolBroken) return null;
  if (lanes) return lanes;
  if (!workersUsable()) {
    poolBroken = true;
    return null;
  }
  try {
    lanes = Array.from({ length: poolSize() }, () => {
      const worker = new Worker(new URL("./image-worker.ts", import.meta.url), { type: "module" });
      const lane: Lane = { worker, busy: false, job: null };
      /** Fecha o trabalho em curso desta faixa e liberta-a. */
      const settle = (res: WorkerResponse | null) => {
        const id = lane.job;
        lane.job = null;
        lane.busy = false;
        if (id !== null) {
          const done = pending.get(id);
          pending.delete(id);
          done?.(res);
        }
        waiting.shift()?.();
      };
      worker.onmessage = (e: MessageEvent<WorkerResponse>) => settle(e.data);
      // Um trabalhador que rebenta (ficheiro gigante, memória esgotada) TEM de
      // desbloquear a foto que tinha em mãos: quem estava à espera segue então
      // pelo fio principal, em vez de ficar pendurado para sempre.
      worker.onerror = () => settle(null);
      worker.onmessageerror = () => settle(null);
      return lane;
    });
    return lanes;
  } catch {
    poolBroken = true;
    return null;
  }
}

/** Espera por uma faixa livre. */
async function acquire(): Promise<Lane | null> {
  const pool = ensurePool();
  if (!pool) return null;
  for (;;) {
    const free = pool.find((l) => !l.busy);
    if (free) {
      free.busy = true;
      return free;
    }
    await new Promise<void>((r) => waiting.push(r));
  }
}

/**
 * Tenta preparar a foto num trabalhador. `null` = não deu (browser sem suporte,
 * ou formato que o trabalhador não descodifica) e quem chamou tem de usar o
 * caminho do fio principal — que é o que sabe ler HEIC no Safari, via `<img>`.
 */
async function prepareViaWorker(
  file: File,
  preset: { maxEdge: number; quality: number },
  skipOriginal: boolean,
  wantThumb: boolean,
): Promise<{
  blob: Blob | null;
  thumb: Blob | null;
  micro: Blob | null;
  mid: Blob | null;
  lqip: string | null;
  cor: string | null;
} | null> {
  const lane = await acquire();
  if (!lane) return null;
  const id = nextJobId++;
  const req: WorkerRequest = {
    id,
    blob: file,
    maxEdge: preset.maxEdge,
    quality: preset.quality,
    skipOriginal,
    wantThumb,
    thumbEdge: THUMB_EDGE,
    thumbQuality: THUMB_QUALITY,
  };
  const res = await new Promise<WorkerResponse | null>((resolve) => {
    pending.set(id, resolve);
    lane.job = id;
    try {
      lane.worker.postMessage(req);
    } catch {
      // Nem sequer saiu — liberta a faixa aqui mesmo.
      pending.delete(id);
      lane.job = null;
      lane.busy = false;
      waiting.shift()?.();
      resolve(null);
    }
  });
  if (!res || !res.ok) return null;
  return {
    blob: res.blob,
    thumb: res.thumb,
    micro: res.micro,
    mid: res.mid,
    lqip: res.lqip,
    cor: res.cor,
  };
}

type Source = ImageBitmap | HTMLImageElement;

async function decode(file: File): Promise<Source> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Fallback path (older Safari, or types createImageBitmap won't take).
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("decode-failed"));
      };
      img.src = url;
    });
  }
}

/** Desenha a fonte num canvas do tamanho pedido. `null` = sem contexto 2D. */
function drawTo(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Redução de 3000 → 400 px num só passo cria serrilhado nos browsers que
  // usam a interpolação rápida; isto pede a boa (é o que o Chrome/Safari já
  // fazem por omissão, mas não é garantido).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * O LQIP no fio principal — o gémeo de `lqipDe` do trabalhador, para os
 * browsers que não têm `OffscreenCanvas` (e para o caminho do HEIC no Safari,
 * que passa por `<img>`).
 *
 * A duplicação é a mesma que já existe entre `drawTo`/`planResize` daqui e do
 * trabalhador, e pela mesma razão: um trabalhador não tem DOM. Os LIMIARES são
 * importados do trabalhador, não copiados — o que não pode divergir é o
 * tamanho e o tecto, e esses vivem num sítio só.
 *
 * Nunca lança: sem LQIP a célula da grelha fica como está hoje.
 */
async function lqipNoFioPrincipal(
  base: CanvasImageSource,
  w: number,
  h: number,
): Promise<string | null> {
  try {
    const t = fitWithin(w, h, LQIP_EDGE);
    const canvas = drawTo(base, t.w, t.h);
    if (!canvas) return null;
    const uri = canvas.toDataURL("image/webp", LQIP_QUALITY);
    // Um browser que não saiba encodar WebP devolve um PNG em silêncio — e um
    // PNG de 16 px é maior do que o tecto. O JPEG é o plano B explícito.
    const escolhido = uri.startsWith("data:image/webp")
      ? uri
      : canvas.toDataURL("image/jpeg", LQIP_QUALITY);
    return escolhido.length <= LQIP_MAX_CHARS ? escolhido : null;
  } catch {
    return null;
  }
}

/**
 * A cor dominante no fio principal — o gémeo de `corDe` do trabalhador, para os
 * browsers sem `OffscreenCanvas` e para o caminho do HEIC no Safari.
 *
 * A mesma duplicação, pela mesma razão do `lqipNoFioPrincipal`: um trabalhador
 * não tem DOM. O tamanho vem do trabalhador (`COR_EDGE`) e a aritmética da
 * `cor-dominante` — o que não pode divergir vive num sítio só.
 */
function corNoFioPrincipal(base: CanvasImageSource, w: number, h: number): string | null {
  try {
    const t = fitWithin(w, h, COR_EDGE);
    const canvas = drawTo(base, t.w, t.h);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    return corDominanteDePixeis(ctx.getImageData(0, 0, t.w, t.h).data);
  } catch {
    return null;
  }
}

function sizeOf(source: Source): { w: number; h: number } {
  return "naturalWidth" in source
    ? { w: source.naturalWidth, h: source.naturalHeight }
    : { w: source.width, h: source.height };
}

/**
 * O trabalho comum: descodifica UMA vez e produz o original (e, se pedido, a
 * miniatura) a partir dessa mesma bitmap.
 *
 * A miniatura é desenhada a partir do canvas já reduzido, e não da bitmap
 * original — dois passos de redução dão menos serrilhado do que um salto de
 * 4000 → 400 px, e desenhar a partir de 3000 px em vez de 4000 px é mais
 * barato. Só quando não há canvas (ficheiro enviado tal e qual) é que se
 * desenha diretamente da fonte.
 */
async function prepare(file: File, kind: ImageKind, wantThumb: boolean): Promise<PreparedImage> {
  const preset = PRESETS[kind];
  const keep = keepOriginal(file.type, file.size, kind);
  // Sem miniatura a pedir, um ficheiro já pequeno e suportado nem sequer é
  // descodificado — é o caminho barato que o estúdio de propostas já usava.
  if (keep && !wantThumb)
    return { file, thumb: null, micro: null, mid: null, lqip: null, cor: null };

  // 1ª tentativa: fora do fio principal. Devolve `null` quando este browser não
  // tem `OffscreenCanvas` ou quando o trabalhador não consegue descodificar o
  // ficheiro — e nesse caso segue-se, sem falhar nada, para o caminho de baixo.
  const viaWorker = await prepareViaWorker(file, preset, keep, wantThumb);
  if (viaWorker) {
    const out = viaWorker.blob
      ? new File([viaWorker.blob], jpegName(file.name), { type: "image/jpeg" })
      : file;
    const thumb = viaWorker.thumb
      ? new File([viaWorker.thumb], thumbFileName(file.name), { type: "image/jpeg" })
      : null;
    const mid = viaWorker.mid
      ? new File([viaWorker.mid], midFileName(file.name), { type: "image/jpeg" })
      : null;
    const micro = viaWorker.micro
      ? new File([viaWorker.micro], microFileName(file.name), { type: "image/jpeg" })
      : null;
    return { file: out, thumb, micro, mid, lqip: viaWorker.lqip, cor: viaWorker.cor };
  }

  let source: Source;
  try {
    source = await decode(file);
  } catch {
    // Formato suportado que este browser não descodifica: sobe tal e qual e
    // fica sem derivadas (a grelha usa o original). Se não for imprimível, é o
    // servidor que o converte antes de guardar — a porta fecha-se lá, e não
    // aqui, precisamente para casos como este.
    if (SUPPORTED.test(file.type)) {
      return { file, thumb: null, micro: null, mid: null, lqip: null, cor: null };
    }
    /**
     * O caso mais provável tem nome: um HEIC arrastado do telemóvel para o
     * computador e carregado no Chrome, que não sabe descodificá-lo. Aqui é
     * onde a pessoa encontra o problema — não chega a haver pedido nenhum ao
     * servidor — e a frase antiga («converta para JPG») não dizia como.
     *
     * A explicação é a MESMA que o servidor dá, e está num sítio só (ver
     * `recusa-de-imagem`): duas versões da mesma instrução acabam sempre com
     * uma delas desactualizada.
     */
    if (nomeOuTipoDeHeic(file.name, file.type)) {
      throw new Error(`"${file.name}" ${CONSELHO_HEIC}`);
    }
    throw new Error(
      `"${file.name}" não é suportada neste navegador. Converte para JPG e tenta de novo.`,
    );
  }

  try {
    const { w: sw, h: sh } = sizeOf(source);

    // 1) O original.
    let out = file;
    let base: CanvasImageSource = source;
    let bw = sw;
    let bh = sh;
    if (!keep) {
      const { w, h } = fitWithin(sw, sh, preset.maxEdge);
      const canvas = drawTo(source, w, h);
      const blob = canvas ? await encode(canvas, preset.quality) : null;
      if (!canvas || !blob) {
        // Sem canvas não há nada a fazer: um formato suportado ainda pode
        // subir tal e qual; um HEIC, não.
        if (!SUPPORTED.test(file.type)) {
          throw new Error(`Não foi possível processar "${file.name}". Converte para JPG.`);
        }
      } else {
        out = new File([blob], jpegName(file.name), { type: "image/jpeg" });
        base = canvas;
        bw = w;
        bh = h;
      }
    }

    // 2) A miniatura, da mesma bitmap. Qualquer falha aqui é silenciosa: a
    //    miniatura é derivada e dispensável, e perder o carregamento da foto
    //    por causa dela seria trocar o essencial pelo acessório.
    let thumb: File | null = null;
    if (wantThumb && needsThumb(bw, bh)) {
      const t = fitWithin(bw, bh, THUMB_EDGE);
      const canvas = drawTo(base, t.w, t.h);
      const blob = canvas ? await encode(canvas, THUMB_QUALITY) : null;
      if (blob) thumb = new File([blob], thumbFileName(file.name), { type: "image/jpeg" });
    }

    // 3) A micro, do mesmo canvas. Silenciosa como a miniatura.
    let micro: File | null = null;
    if (wantThumb && needsThumb(bw, bh)) {
      const m = fitWithin(bw, bh, MICRO_EDGE);
      const canvas = drawTo(base, m.w, m.h);
      const blob = canvas ? await encode(canvas, MICRO_QUALITY) : null;
      if (blob) micro = new File([blob], microFileName(file.name), { type: "image/jpeg" });
    }

    // 4) A de 1200 px, do mesmo canvas — a que a página do casal mostra.
    //    Silenciosa como as irmãs: sem ela o servidor fabrica-a à primeira
    //    visita, que é o que acontecia a todas até aqui.
    let mid: File | null = null;
    if (wantThumb && needsMid(bw, bh)) {
      const d = fitWithin(bw, bh, MID_EDGE);
      const canvas = drawTo(base, d.w, d.h);
      const blob = canvas ? await encode(canvas, MID_QUALITY) : null;
      if (blob) mid = new File([blob], midFileName(file.name), { type: "image/jpeg" });
    }

    // 5) O LQIP, do MESMO canvas — a imagem que a grelha desenha a 0 ms.
    //    Silencioso como a miniatura: sem ele fica a caixa de hoje.
    const lqip = await lqipNoFioPrincipal(base, bw, bh);
    const cor = corNoFioPrincipal(base, bw, bh);

    return { file: out, thumb, micro, mid, lqip, cor };
  } finally {
    // Só depois de AMBOS os desenhos: fechar a bitmap a seguir ao primeiro
    // deixava a miniatura sem fonte.
    if ("close" in source) source.close();
  }
}

/**
 * Downscale + re-encode an image for upload. Returns the original file when
 * it is already small and in a supported format. Throws a user-readable
 * (pt-PT) error when the browser cannot decode the file at all.
 */
export async function prepareImageForUpload(file: File, kind: ImageKind = "cover"): Promise<File> {
  return (await prepare(file, kind, false)).file;
}

/**
 * Como `prepareImageForUpload`, mas devolve também a miniatura — para a
 * Biblioteca de Temas, onde a grelha nunca deve puxar os originais.
 *
 * Uma única descodificação serve os dois ficheiros: num lote de 300 fotos, a
 * descodificação é o passo caro e duplicá-la duplicaria o tempo do lote.
 */
export async function prepareImageWithThumb(
  file: File,
  kind: ImageKind = "cover",
): Promise<PreparedImage> {
  return prepare(file, kind, true);
}
