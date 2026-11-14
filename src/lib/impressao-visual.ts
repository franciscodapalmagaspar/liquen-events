/**
 * ════════════════════════════════════════════════════════════════════════════
 * A IMPRESSÃO VISUAL DE UMA FOTOGRAFIA — RECONHECER PELO QUE MOSTRA (13/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dele: «faz isso das fotografias pelo que mostram». O resumo exacto
 * (`theme-fingerprint.ts`, SHA-256 do ficheiro) reconhece o mesmo FICHEIRO; a
 * mesma FOTOGRAFIA tirada de um PowerPoint antigo nunca é o mesmo ficheiro — o
 * PowerPoint recomprime-a, reduz-lhe o tamanho, às vezes passa-a a PNG ou
 * corta-lhe as margens. Isto reconhece-a pelo que se VÊ.
 *
 * ── O QUE SE CALCULA ────────────────────────────────────────────────────────
 *
 * Um pHash de 64 bits (o «perceptual hash» de DCT), sobre a fotografia em tons
 * de cinzento:
 *
 *   1. tons de cinzento (luma BT.601), com a transparência sobre branco;
 *   2. as margens lisas tiram-se (até {@link MAX_APARAR} de cada lado) — é o
 *      que o PowerPoint e o Word acrescentam a uma foto colada numa caixa;
 *   3. reduz-se a 32 × 32 pela MÉDIA das áreas (feito aqui, em aritmética
 *      simples, e não pelo canvas nem pelo `sharp`: assim o navegador e o
 *      servidor fazem exactamente as mesmas contas);
 *   4. DCT 2D, e os 8 × 8 coeficientes de mais baixa frequência;
 *   5. um bit por coeficiente: acima ou abaixo da mediana dos 64.
 *
 * Duas fotografias comparam-se pela distância de Hamming (quantos dos 64 bits
 * diferem).
 *
 * ── PORQUÊ O pHASH E NÃO O dHASH ───────────────────────────────────────────
 *
 * Medido com as fotografias reais de `public/imagens` (1 058, das mesmas
 * séries de casamentos): ver a tabela em `docs/GASTAR-POUCO-DESDE-O-INICIO.md`
 * («Reconhecer pelo que mostra»). O dHash (diferenças entre vizinhos, 9 × 8)
 * aguenta tão bem como o pHash a recompressão e a redução, mas com um corte de
 * 4% nas margens já se aproxima da distância entre duas fotos DIFERENTES da
 * mesma mesa — a margem fica fina. O pHash, por olhar só para as baixas
 * frequências (a composição da fotografia, não o pormenor), separa as duas
 * famílias com mais folga.
 *
 * ── O LIMITE HONESTO ───────────────────────────────────────────────────────
 *
 * Duas fotos da mesma mesa, tiradas com um passo de diferença, podem ter a
 * composição quase igual. Por isso há DUAS fronteiras ({@link QUASE_CERTO} e
 * {@link ZONA_CINZENTA}): abaixo da primeira é a mesma foto; entre as duas,
 * NINGUÉM decide sozinho — o importador mostra as duas lado a lado e ela
 * escolhe; o estúdio guarda como nova. Nunca se troca uma foto por outra sem
 * ser quase certo ou sem ela confirmar.
 *
 * Este módulo é puro e não importa nada: o navegador e o servidor têm de
 * aplicar EXACTAMENTE a mesma regra.
 */

/** O lado maior da versão pequena de onde se parte (o canvas ou o `sharp` reduzem até aqui). */
export const LADO_DE_TRABALHO = 128;

/** O lado da grelha onde corre a DCT. */
const N = 32;
/** A parte grossa: 8 × 8 = 64 bits. */
const K = 8;
/** A parte fina: 16 × 16 = 256 bits. */
const KF = 16;

/** Quanto de cada lado as margens lisas podem levar (fracção do lado). */
export const MAX_APARAR = 0.2;

/**
 * ── AS DUAS FRONTEIRAS (medidas — ver o documento) ──────────────────────────
 *
 * `≤ QUASE_CERTO`: a mesma fotografia, recomprimida, reduzida, convertida ou
 * com as margens cortadas. Usa-se a que já está guardada, sem perguntar.
 *
 * `≤ ZONA_CINZENTA`: pode ser a mesma ou uma muito parecida (a mesma mesa
 * com outro enquadramento). O importador pergunta; o estúdio guarda como nova.
 *
 * Acima: é outra.
 */
export const LIMITES = {
  /** «A mesma», sem perguntar: a composição quase igual… */
  grossaMesma: 4,
  /** …E o pormenor também (separa as rajadas)… */
  finaMesma: 16,
  /** …E a mesma cor (separa a cores / preto e branco). */
  corMesma: 8,
  /** «Talvez» (pergunta-se): a composição parecida. */
  grossaTalvez: 12,
} as const;

export type Veredicto = "mesma" | "talvez" | "outra";

/** O que as distâncias querem dizer — ver {@link LIMITES}. */
export function veredicto(d: Distancias): Veredicto {
  if (!Number.isFinite(d.grossa)) return "outra";
  if (d.grossa <= LIMITES.grossaMesma && d.fina <= LIMITES.finaMesma && d.cor <= LIMITES.corMesma)
    return "mesma";
  if (d.grossa <= LIMITES.grossaTalvez) return "talvez";
  return "outra";
}

/** Uma impressão bem formada: 16 hex (64 bits). */
export function eImpressao(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{86}$/.test(v);
}

/**
 * Tons de cinzento a partir de píxeis RGBA (o `ImageData` do canvas) ou RGB
 * (o `raw()` do `sharp`), com a transparência achatada sobre branco.
 */
export function cinzentoDePixeis(
  dados: ArrayLike<number>,
  largura: number,
  altura: number,
  canais: 3 | 4,
): Float64Array {
  const n = largura * altura;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * canais;
    const r = dados[o];
    const g = dados[o + 1];
    const b = dados[o + 2];
    const a = canais === 4 ? dados[o + 3] / 255 : 1;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    out[i] = y * a + 255 * (1 - a);
  }
  return out;
}

/** Uma linha (ou coluna) é «lisa» quando quase não varia e tem a cor da margem. */
function lisa(valores: number[], cor: number): boolean {
  let soma = 0;
  let max = 0;
  for (const v of valores) {
    soma += v;
    const d = Math.abs(v - cor);
    if (d > max) max = d;
  }
  const media = soma / valores.length;
  return max <= 10 && Math.abs(media - cor) <= 6;
}

/**
 * A caixa da fotografia sem as margens lisas que a rodeiam (uma foto colada
 * num diapositivo com uma faixa branca ou preta à volta). Só tira linhas que
 * são TODAS da mesma cor da margem; nunca mais de {@link MAX_APARAR} por lado.
 */
export function caixaSemMargens(
  cinz: Float64Array,
  w: number,
  h: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const px = (x: number, y: number) => cinz[y * w + x];
  const linha = (y: number, x0: number, x1: number) => {
    const v: number[] = [];
    for (let x = x0; x < x1; x++) v.push(px(x, y));
    return v;
  };
  const coluna = (x: number, y0: number, y1: number) => {
    const v: number[] = [];
    for (let y = y0; y < y1; y++) v.push(px(x, y));
    return v;
  };
  let x0 = 0;
  let y0 = 0;
  let x1 = w;
  let y1 = h;
  const maxX = Math.floor(w * MAX_APARAR);
  const maxY = Math.floor(h * MAX_APARAR);
  // A cor de cada margem é a do canto dela — uma faixa branca à volta é branca nos cantos.
  const corCima = px(Math.floor(w / 2), 0);
  while (y0 < maxY && lisa(linha(y0, 0, w), corCima)) y0++;
  const corBaixo = px(Math.floor(w / 2), h - 1);
  while (h - y1 < maxY && lisa(linha(y1 - 1, 0, w), corBaixo)) y1--;
  const corEsq = px(0, Math.floor(h / 2));
  while (x0 < maxX && lisa(coluna(x0, y0, y1), corEsq)) x0++;
  const corDir = px(w - 1, Math.floor(h / 2));
  while (w - x1 < maxX && lisa(coluna(x1 - 1, y0, y1), corDir)) x1--;
  // Uma imagem toda lisa (um fundo, um quadrado de cor) fica como está.
  if (x1 - x0 < 4 || y1 - y0 < 4) return { x0: 0, y0: 0, x1: w, y1: h };
  return { x0, y0, x1, y1 };
}

/**
 * Reduz a caixa `[x0,x1) × [y0,y1)` a `n × n` pela média das áreas (cada
 * píxel de saída é a média ponderada dos de entrada que cobre). Determinístico
 * e igual em qualquer motor — é por isso que não se usa o canvas para isto.
 */
export function reduzirPorArea(
  cinz: Float64Array,
  w: number,
  caixa: { x0: number; y0: number; x1: number; y1: number },
  n: number,
): Float64Array {
  const out = new Float64Array(n * n);
  const cw = caixa.x1 - caixa.x0;
  const ch = caixa.y1 - caixa.y0;
  const sx = cw / n;
  const sy = ch / n;
  for (let j = 0; j < n; j++) {
    const ya = caixa.y0 + j * sy;
    const yb = ya + sy;
    for (let i = 0; i < n; i++) {
      const xa = caixa.x0 + i * sx;
      const xb = xa + sx;
      let soma = 0;
      let peso = 0;
      for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
        const wy = Math.min(yb, y + 1) - Math.max(ya, y);
        if (wy <= 0) continue;
        for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
          const wx = Math.min(xb, x + 1) - Math.max(xa, x);
          if (wx <= 0) continue;
          soma += cinz[y * w + x] * wx * wy;
          peso += wx * wy;
        }
      }
      out[j * n + i] = peso > 0 ? soma / peso : 0;
    }
  }
  return out;
}

/** Os cossenos da DCT-II (32 pontos), para os primeiros {@link KF} índices. */
const COS: Float64Array = (() => {
  const c = new Float64Array(KF * N);
  for (let u = 0; u < KF; u++)
    for (let x = 0; x < N; x++) c[u * N + x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
  return c;
})();

/** Um bit por coeficiente, acima ou abaixo da mediana, em hex. */
function bitsPelaMediana(coef: Float64Array): string {
  const ordenados = [...coef].sort((a, b) => a - b);
  const m = ordenados.length / 2;
  const mediana = (ordenados[m - 1] + ordenados[m]) / 2;
  let hex = "";
  for (let q = 0; q < coef.length / 4; q++) {
    let nib = 0;
    for (let b = 0; b < 4; b++) nib = (nib << 1) | (coef[q * 4 + b] > mediana ? 1 : 0);
    hex += nib.toString(16);
  }
  return hex;
}

/** Os `k × k` coeficientes de mais baixa frequência da DCT 2D de `g` (N × N). */
function dct(g: Float64Array, k: number): Float64Array {
  const linhas = new Float64Array(N * k); // [y][u]
  for (let y = 0; y < N; y++)
    for (let u = 0; u < k; u++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += g[y * N + x] * COS[u * N + x];
      linhas[y * k + u] = s;
    }
  const coef = new Float64Array(k * k);
  for (let v = 0; v < k; v++)
    for (let u = 0; u < k; u++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += linhas[y * k + u] * COS[v * N + y];
      coef[v * k + u] = s;
    }
  return coef;
}

/**
 * As duas partes de tons de cinzento da impressão: o pHash de 64 bits (8 × 8,
 * a composição — aguenta recortes pequenos) e o de 256 bits (16 × 16, o
 * pormenor — separa duas fotos tiradas em rajada). 16 + 64 hex.
 */
export function impressaoDeCinzento(cinz: Float64Array, w: number, h: number): string {
  const caixa = caixaSemMargens(cinz, w, h);
  const g = reduzirPorArea(cinz, w, caixa, N);
  return bitsPelaMediana(dct(g, K)) + bitsPelaMediana(dct(g, KF));
}

/**
 * A cor média (dentro da caixa, sem as margens): Cb e Cr médios (128 = neutro) e o croma médio de cada píxel
 * (0 numa fotografia a preto e branco). 6 hex. É o que separa a versão a cores
 * da versão a preto e branco da MESMA fotografia — que em tons de cinzento são
 * iguais, e que para ela são duas fotografias.
 */
export function corMedia(
  dados: ArrayLike<number>,
  largura: number,
  altura: number,
  canais: 3 | 4,
  caixa = { x0: 0, y0: 0, x1: largura, y1: altura },
): string {
  const n = Math.max(1, (caixa.x1 - caixa.x0) * (caixa.y1 - caixa.y0));
  let cb = 0;
  let cr = 0;
  let croma = 0;
  for (let y = caixa.y0; y < caixa.y1; y++)
    for (let x = caixa.x0; x < caixa.x1; x++) {
      const o = (y * largura + x) * canais;
      const a = canais === 4 ? dados[o + 3] / 255 : 1;
      const r = dados[o] * a + 255 * (1 - a);
      const g = dados[o + 1] * a + 255 * (1 - a);
      const b = dados[o + 2] * a + 255 * (1 - a);
      const pb = -0.168736 * r - 0.331264 * g + 0.5 * b;
      const pr = 0.5 * r - 0.418688 * g - 0.081312 * b;
      cb += pb;
      cr += pr;
      croma += Math.sqrt(pb * pb + pr * pr);
    }
  const byte = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return byte(128 + cb / n) + byte(128 + cr / n) + byte(croma / n);
}

/** A impressão de píxeis RGBA (o `ImageData` do canvas) ou RGB (o `raw()` do `sharp`). */
export function impressaoDePixeis(
  dados: ArrayLike<number>,
  largura: number,
  altura: number,
  canais: 3 | 4,
): string {
  const cinz = cinzentoDePixeis(dados, largura, altura, canais);
  // A cor mede-se DENTRO das margens: uma faixa branca à volta não é a fotografia.
  return (
    impressaoDeCinzento(cinz, largura, altura) +
    corMedia(dados, largura, altura, canais, caixaSemMargens(cinz, largura, altura))
  );
}

const BITS = Array.from({ length: 16 }, (_, i) => {
  let n = 0;
  for (let v = i; v; v >>= 1) n += v & 1;
  return n;
});

function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += BITS[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}

/** As três distâncias entre duas impressões. */
export interface Distancias {
  /** Bits diferentes dos 64 da composição. */
  grossa: number;
  /** Bits diferentes dos 256 do pormenor. */
  fina: number;
  /** A maior diferença entre as três medidas da cor (0–255). */
  cor: number;
}

export function distancias(a: string, b: string): Distancias {
  if (!eImpressao(a) || !eImpressao(b)) return { grossa: Infinity, fina: Infinity, cor: Infinity };
  const byte = (s: string, i: number) => parseInt(s.slice(80 + i * 2, 82 + i * 2), 16);
  return {
    grossa: hamming(a.slice(0, 16), b.slice(0, 16)),
    fina: hamming(a.slice(16, 80), b.slice(16, 80)),
    cor: Math.max(...[0, 1, 2].map((i) => Math.abs(byte(a, i) - byte(b, i)))),
  };
}

/** A distância grossa (a que ordena as candidatas). */
export function distancia(a: string, b: string): number {
  return distancias(a, b).grossa;
}

/**
 * O lado maior com que se reduz antes de calcular (o canvas no navegador, o
 * `sharp` no servidor): {@link LADO_DE_TRABALHO}, sem ampliar.
 */
export function ladoReduzido(w: number, h: number): { w: number; h: number } {
  const escala = Math.min(1, LADO_DE_TRABALHO / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * escala)), h: Math.max(1, Math.round(h * escala)) };
}
