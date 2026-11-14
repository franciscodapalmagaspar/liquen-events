/// <reference lib="webworker" />

import { MEDIA_LADO, MEDIA_QUALIDADE } from "@/lib/derivadas-medidas";

import { corDominanteDePixeis } from "@/lib/cor-dominante";

/**
 * Trabalhador que prepara fotos FORA do fio principal.
 *
 * Porque existe: descodificar, reduzir e reencodar uma foto de 4032×3024 custa
 * ~300 ms de CPU. Feito no fio principal — que é o mesmo que desenha a grelha e
 * responde aos cliques — um lote de 300 fotos deixa a Biblioteca de Temas
 * entaramelada durante minutos. Aqui isso corre num fio à parte, e a
 * `image-prep` mantém uma POOL destes trabalhadores para usar mais do que um
 * núcleo.
 *
 * Este ficheiro é DELIBERADAMENTE autossuficiente: não importa nada da
 * `image-prep` (que é um módulo "use client" com código de DOM lá dentro, e um
 * trabalhador não tem DOM). O preço é ter aqui uma cópia da aritmética de
 * redimensionamento — que a `image-prep.test.ts` fixa contra a versão original
 * (ver "aritmética do trabalhador"), para as duas nunca divergirem em silêncio.
 */

/** O pedido que o fio principal envia. */
export interface WorkerRequest {
  id: number;
  blob: Blob;
  /** Lado maior do original. Ignorado quando `skipOriginal`. */
  maxEdge: number;
  quality: number;
  /** O ficheiro sobe tal e qual; só se quer a miniatura (foto já pequena). */
  skipOriginal: boolean;
  wantThumb: boolean;
  thumbEdge: number;
  thumbQuality: number;
  /**
   * O formato da miniatura e da média (13/11). `"webp"` nas fotografias das
   * PROPOSTAS: ~25% menos bytes à mesma qualidade (medido —
   * `docs/GASTAR-POUCO-DESDE-O-INICIO.md`). Um navegador que não codifique
   * WebP (o Safari) devolve outro tipo, e aí sai JPEG, como antes.
   */
  formatoDerivadas?: "webp" | "jpeg";
}

/**
 * Codifica uma derivada no formato pedido; se o navegador devolver outro tipo
 * (o Safari não codifica WebP e devolve PNG em silêncio), volta ao JPEG.
 */
export async function codificarDerivada(
  canvas: OffscreenCanvas,
  quality: number,
  formato: "webp" | "jpeg" = "jpeg",
): Promise<Blob | null> {
  if (formato === "webp") {
    const w = await canvas.convertToBlob({ type: "image/webp", quality }).catch(() => null);
    if (w && w.type === "image/webp") return w;
  }
  return canvas.convertToBlob({ type: "image/jpeg", quality }).catch(() => null);
}

/** A resposta. `ok: false` NÃO é um erro fatal — quem chamou tenta o caminho
 *  do fio principal, que sabe descodificar coisas que o trabalhador não sabe
 *  (HEIC no Safari, via `<img>`, que aqui não existe). */
export type WorkerResponse =
  | {
      id: number;
      ok: true;
      blob: Blob | null;
      thumb: Blob | null;
      micro: Blob | null;
      mid: Blob | null;
      lqip: string | null;
      cor: string | null;
    }
  | { id: number; ok: false; reason: string };

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LQIP — a imagem que aparece a 0 ms, antes de haver rede
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO na linha de base (IMAGENS-BEFORE.md): entre abrir a Biblioteca de
 * Temas e ver a primeira fotografia passam **1845 ms** no computador e
 * **2192 ms** no telemóvel, com Slow 4G. Nesse tempo o que lá está é uma caixa
 * cinzenta. Não é lentidão do código — é o tempo que os bytes levam a chegar, e
 * nenhuma optimização de rede o leva a zero.
 *
 * O que o leva a zero é não precisar da rede. Uma versão de 16 px da fotografia
 * cabe em ~300 bytes de base64, viaja DENTRO do JSON que já se estava a buscar,
 * e desenha-se no instante em que o JSON chega — sem um único pedido a mais.
 *
 * ── Porque 16 px e WebP ─────────────────────────────────────────────────────
 * · 16 px de lado maior é o suficiente para dar a COR e a COMPOSIÇÃO. Ampliado
 *   e desfocado, lê-se como "a fotografia está a chegar e é assim". A 8 px
 *   perde-se a composição; a 32 px o base64 triplica sem se ganhar nada que o
 *   desfoque não apague.
 * · WebP a q40 é ~40% mais pequeno do que JPEG no mesmo tamanho, e a esta
 *   escala o artefacto é invisível — vai desfocado por cima.
 * · Se o browser não souber encodar WebP, cai para JPEG. Nunca falha o
 *   carregamento por causa disto: um LQIP em falta é uma caixa cinzenta, que é
 *   exactamente o que já existe hoje.
 *
 * ── E porque é AQUI ────────────────────────────────────────────────────────
 * Porque o bitmap já está descodificado. Sai do MESMO canvas já reduzido que
 * gera a miniatura — não há uma segunda descodificação, não há um segundo
 * `createImageBitmap`, e o custo de um lote de 300 fotos não muda. É o
 * princípio da missão aplicado à letra: o trabalho acontece uma vez, no
 * carregamento, quando ninguém está à espera.
 */
export const LQIP_EDGE = 16;
/** Qualidade do LQIP. Baixa de propósito — vai desfocado e ampliado. */
export const LQIP_QUALITY = 0.4;
/**
 * Tecto de caracteres. Um LQIP que passe disto deixou de ser "uma string curta"
 * e passou a ser peso morto em cada linha do JSON — e o JSON é servido a cada
 * abertura. Acima do tecto devolve-se `null`: melhor sem placeholder do que com
 * um que custa mais do que a miniatura que substitui.
 */
export const LQIP_MAX_CHARS = 1200;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MICRO — 96 px, para as tiras do cartão de tema
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO: as três pré-visualizações de cada cartão de tema são desenhadas com
 * **43 × 42 px** e recebem o ficheiro de 400 px. Num ecrã normal são **9,3×**
 * mais píxeis do que os que se pintam; numa retina, 4,9×. São 18 dos 24 pedidos
 * da vista Temas e ~360 KB dos 415 KB — para tiras do tamanho de uma unha.
 *
 * 96 px cobre os 43 px CSS a 2× de densidade com folga, e é o mais pequeno que
 * ainda serve uma retina. A 43 px de largura o detalhe não existe: o que uma
 * tira destas transmite é a COR e a forma geral, e isso sobrevive a q65.
 *
 * ── Porque não se resolveu com o LQIP ──────────────────────────────────────
 * Porque o LQIP tem 16 px e a tira tem 43: ampliá-lo é 2,7× de desfoque, e
 * essa tira é uma fotografia, não um placeholder. O LQIP continua a ser o que
 * aparece a 0 ms; a micro é o que fica.
 *
 * ── E porque não uma escada de quatro tamanhos ─────────────────────────────
 * Porque a medição não a pede. A miniatura de 400 px está BEM dimensionada para
 * as células de 137 px do seletor numa retina (1,5×). Acrescentar 900 e 1600
 * seria trabalho no carregamento e ficheiros no Storage para servir ecrãs que
 * ninguém tem. Se um ecrã novo os pedir, a medição di-lo-á — e o mecanismo fica
 * pronto para os receber.
 */
export const MICRO_EDGE = 96;
/** Qualidade da micro. Mais baixa do que a miniatura: a 43 px não se vê. */
export const MICRO_QUALITY = 0.65;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DE 1200 px — A QUE O CASAL VÊ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A miniatura de 400 px serve as GRELHAS do back office. A página da proposta
 * mostra outra coisa: num telemóvel a fotografia ocupa ~343 pontos a três
 * pixéis por ponto, e o `srcset` escolhe a de 1200.
 *
 * Essa nascia no SERVIDOR, uma a uma, à primeira vez que alguém olhava para
 * cada fotografia — um download do original, um `sharp` e um upload, tudo
 * dentro do pedido, com o casal a olhar para um rectângulo vazio. Numa
 * proposta acabada de enviar, essa primeira visita é sempre a deles.
 *
 * Aqui não custa quase nada: a bitmap já está descodificada para fazer a
 * miniatura, e este é mais um desenho do MESMO canvas. Sobem ~250 KB ao lado
 * de um original de 2 MB, e a fotografia nasce pronta — nunca chega a existir
 * o instante em que alguém espera por ela.
 *
 * Os números são os do servidor (`MEDIA` em `lib/derivadas.ts`): 1200 px e
 * qualidade 80. Se divergirem, a mesma fotografia sai diferente conforme o
 * caminho por onde foi fabricada.
 */
export const MID_EDGE = MEDIA_LADO;
/** Qualidade da de 1200 px. Ver `MEDIA` em `lib/derivadas.ts` — é a que o
 *  casal vê em grande, e os dois pontos acima da miniatura custam ~15 KB. */
export const MID_QUALITY = MEDIA_QUALIDADE / 100;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COR DOMINANTE — e porque é que ela nasce AQUI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas coisas do estúdio precisam de saber de que cor é cada fotografia: o
 * aviso de que uma foto destoa da paleta do board, e o «organizar
 * automaticamente». As duas se resolveriam num `canvas` do lado da proposta —
 * se as fotos não viessem de URLs assinados de OUTRO domínio. Sem os cabeçalhos
 * de CORS certos, ler os píxeis lança, e o resultado seria uma funcionalidade
 * que ora funciona ora não.
 *
 * Aqui não há origem cruzada nenhuma: a fotografia está em bruto, no computador
 * de quem a carrega, antes de subir. E o bitmap JÁ está descodificado para a
 * miniatura e para o LQIP — a cor sai do MESMO canvas reduzido, sem uma segunda
 * descodificação. O custo de um lote de 300 fotos não muda.
 *
 * A aritmética não está aqui: está em `@/lib/cor-dominante`, que é puro e se
 * testa em Node. Este ficheiro só lhe entrega os píxeis.
 *
 * ── Porque 24 px ───────────────────────────────────────────────────────────
 * A cor dominante é uma estatística grosseira: 576 píxeis chegam e sobram para
 * dizer qual é a família de cor que mais aparece. Mais do que isso é ler mais
 * memória para obter a mesma resposta; a 16 px do LQIP, uma foto com um detalhe
 * de cor pequeno mas decisivo (um ramo sobre uma parede clara) começa a perdê-lo.
 */
export const COR_EDGE = 24;

/**
 * A cor dominante de um canvas já reduzido. Nunca lança: uma foto sem cor
 * conhecida é uma foto que não entra no aviso nem na arrumação — que é
 * exactamente o que acontece hoje a todas.
 */
export async function corDe(base: CanvasImageSource, w: number, h: number): Promise<string | null> {
  try {
    const t = planResize(w, h, COR_EDGE);
    const canvas = drawTo(base, t.w, t.h);
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    return corDominanteDePixeis(ctx.getImageData(0, 0, t.w, t.h).data);
  } catch {
    return null;
  }
}

/** Cópia de `fitWithin` da image-prep (ver nota no cabeçalho). */
export function planResize(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Cópia de `needsThumb` da image-prep (ver nota no cabeçalho). */
export function planThumb(w: number, h: number, thumbEdge: number): boolean {
  return Math.max(w, h) > thumbEdge * 1.25;
}

/** Desenha para um canvas do tamanho pedido, com a interpolação boa. */
function drawTo(source: CanvasImageSource, w: number, h: number): OffscreenCanvas | null {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Reduzir 3000 → 400 px de um salto serrilha nos browsers que usam a
  // interpolação rápida; isto pede explicitamente a boa.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

/** Um `Blob` em `data:` URI — é assim que o LQIP viaja e é desenhado, sem rede. */
async function comoDataUri(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  // Aos pedaços: `String.fromCharCode(...array)` com um array grande estoira a
  // pilha de chamadas. Aqui são ~300 bytes, mas o limite é do tamanho da
  // entrada e não do que hoje se lhe dá.
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `data:${blob.type};base64,${btoa(bin)}`;
}

/**
 * O LQIP de um canvas já reduzido. Nunca lança: sem LQIP a grelha comporta-se
 * exactamente como hoje.
 */
export async function lqipDe(
  base: CanvasImageSource,
  w: number,
  h: number,
): Promise<string | null> {
  try {
    const t = planResize(w, h, LQIP_EDGE);
    const canvas = drawTo(base, t.w, t.h);
    if (!canvas) return null;
    const blob =
      (await canvas
        .convertToBlob({ type: "image/webp", quality: LQIP_QUALITY })
        .catch(() => null)) ??
      (await canvas.convertToBlob({ type: "image/jpeg", quality: LQIP_QUALITY }).catch(() => null));
    if (!blob) return null;
    const uri = await comoDataUri(blob);
    return uri.length <= LQIP_MAX_CHARS ? uri : null;
  } catch {
    return null;
  }
}

/**
 * O trabalho de uma foto: UMA descodificação serve o original, a miniatura e o
 * LQIP. Descodificar mais do que uma vez duplicaria o custo de um lote de 300
 * fotos, que é exatamente o tamanho para que isto está dimensionado.
 */
export async function prepareInWorker(req: WorkerRequest): Promise<{
  blob: Blob | null;
  thumb: Blob | null;
  micro: Blob | null;
  mid: Blob | null;
  lqip: string | null;
  cor: string | null;
}> {
  const bitmap = await createImageBitmap(req.blob);
  try {
    let blob: Blob | null = null;
    // A miniatura sai do canvas JÁ REDUZIDO quando ele existe: dois passos de
    // redução serrilham menos do que um salto de 4032 → 400 px, e desenhar a
    // partir de 2200 px é mais barato do que a partir de 4032 px.
    let base: CanvasImageSource = bitmap;
    let bw = bitmap.width;
    let bh = bitmap.height;

    if (!req.skipOriginal) {
      const { w, h } = planResize(bitmap.width, bitmap.height, req.maxEdge);
      const canvas = drawTo(bitmap, w, h);
      if (!canvas) throw new Error("sem-contexto-2d");
      blob = await canvas.convertToBlob({ type: "image/jpeg", quality: req.quality });
      if (!blob) throw new Error("sem-encode");
      base = canvas;
      bw = w;
      bh = h;
    }

    let thumb: Blob | null = null;
    if (req.wantThumb && planThumb(bw, bh, req.thumbEdge)) {
      const t = planResize(bw, bh, req.thumbEdge);
      const canvas = drawTo(base, t.w, t.h);
      // A miniatura é derivada e dispensável: falhar aqui nunca deita fora a
      // foto — a grelha cai no original, como já faz com as fotos antigas.
      if (canvas) thumb = await codificarDerivada(canvas, req.thumbQuality, req.formatoDerivadas);
    }

    // A MICRO, do mesmo canvas. Derivada e dispensável como a miniatura:
    // falhar aqui deixa o cartão a usar a miniatura de 400 px, que é
    // exactamente o que ele faz hoje.
    let micro: Blob | null = null;
    if (req.wantThumb && planThumb(bw, bh, MICRO_EDGE)) {
      const m = planResize(bw, bh, MICRO_EDGE);
      const canvas = drawTo(base, m.w, m.h);
      if (canvas) {
        micro = await canvas
          .convertToBlob({ type: "image/jpeg", quality: MICRO_QUALITY })
          .catch(() => null);
      }
    }

    // A DE 1200 px — a que a página do casal mostra. Do mesmo canvas, e pela
    // mesma regra das outras duas: só quando a fonte é maior do que ela, senão
    // seria ampliar. Uma foto que já nasce com 1000 px é servida tal e qual, e
    // é isso que o `planThumb` decide.
    //
    // Dispensável como as irmãs: falhar aqui devolve a fotografia ao caminho
    // de antes — o servidor fabrica-a à primeira visita —, e não estraga um
    // carregamento que correu bem.
    let mid: Blob | null = null;
    if (req.wantThumb && planThumb(bw, bh, MID_EDGE)) {
      const d = planResize(bw, bh, MID_EDGE);
      const canvas = drawTo(base, d.w, d.h);
      if (canvas) mid = await codificarDerivada(canvas, MID_QUALITY, req.formatoDerivadas);
    }

    // Do MESMO canvas já reduzido, como a miniatura. Sempre — uma foto sem
    // miniatura (já pequena) é precisamente uma que continua a precisar de
    // alguma coisa para mostrar enquanto chega.
    const lqip = await lqipDe(base, bw, bh);
    // Do MESMO canvas, e pela mesma razão: é aqui que os píxeis existem sem
    // origem cruzada e sem uma segunda descodificação.
    const cor = await corDe(base, bw, bh);

    return { blob, thumb, micro, mid, lqip, cor };
  } finally {
    // Só depois de AMBOS os desenhos: fechar a bitmap a seguir ao primeiro
    // deixava a miniatura sem fonte.
    bitmap.close();
  }
}

// Registo do recetor de mensagens. Guardado para este módulo poder ser
// importado por um teste (em Node não há `DedicatedWorkerGlobalScope`).
//
// NÃO ACRESCENTAR UMA VERIFICAÇÃO DE `e.origin` AQUI — partiria o carregamento
// de fotos por inteiro.
//
// O CodeQL assinala este `onmessage` com "Missing origin verification in
// postMessage handler". A regra existe para `window.addEventListener("message")`,
// onde um enquadramento de outra origem pode mandar mensagens e é preciso
// filtrar. Um trabalhador DEDICADO não é isso: só o documento que o criou lhe
// consegue falar, não há forma de outra origem obter uma referência para ele, e
// o guarda `self instanceof DedicatedWorkerGlobalScope` acima garante que este
// código nunca corre noutro contexto (um SharedWorker, esse sim, precisaria de
// cuidado).
//
// MEDIDO num Chromium a sério, com um trabalhador dedicado a devolver o próprio
// MessageEvent: `origin` é a string VAZIA e `source` é `null`. Ou seja, não há
// origem nenhuma para verificar — e o remendo óbvio,
// `if (e.origin !== self.location.origin) return;`, recusaria TODAS as
// mensagens e deixaria a Biblioteca de Temas sem conseguir preparar uma única
// foto.
if (
  typeof DedicatedWorkerGlobalScope !== "undefined" &&
  self instanceof DedicatedWorkerGlobalScope
) {
  self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
    const req = e.data;
    try {
      const { blob, thumb, micro, mid, lqip, cor } = await prepareInWorker(req);
      const res: WorkerResponse = { id: req.id, ok: true, blob, thumb, micro, mid, lqip, cor };
      self.postMessage(res);
    } catch (err) {
      const res: WorkerResponse = {
        id: req.id,
        ok: false,
        reason: err instanceof Error ? err.message : "falhou",
      };
      self.postMessage(res);
    }
  };
}
