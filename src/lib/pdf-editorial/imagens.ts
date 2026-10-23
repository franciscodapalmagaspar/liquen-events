import "server-only";
import sharp from "sharp";
import { HEX } from "./paleta";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS, PREPARADAS NO SERVIDOR — SEM TRANSPARÊNCIA NO PDF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O tratamento do documento dela (`docs/PDF-DESIGN-NOVO.md` §5) é todo FUNDIDO
 * na própria imagem com o `sharp`: a edição quente, o grão, o fundo
 * «arrastado» e os escurecimentos de leitura. O PDF recebe uma JPEG opaca já
 * pronta — transparência por cima de uma JPEG é o que alguns leitores (o do
 * Mail, Acrobats antigos) pintam com o tom cor-de-rosa que ela já viu. O
 * logótipo continua a ser a ÚNICA imagem com transparência.
 *
 * ── O peso ─────────────────────────────────────────────────────────────────
 * O limite desta casa é o anexo de email, 8 MB (`custo-do-pdf.ts`). Página
 * inteira até {@link LADO_PAGINA} px, células até {@link LADO_CELULA} px. Um
 * fundo arrastado não tem pormenor nenhum para mostrar: desenha-se a
 * {@link LADO_FUNDO} px e o leitor amplia-o.
 */

/** Lado maior de uma fotografia que ocupa a página inteira, nítida. */
export const LADO_PAGINA = 1800;
/** Lado maior de uma célula de mosaico ou de uma foto emoldurada. */
export const LADO_CELULA = 1250;
/** Lado maior de um fundo arrastado — desfocado, não precisa de mais. */
export const LADO_FUNDO = 900;
/** Qualidade JPEG por omissão. */
export const QUALIDADE = 72;

/**
 * Um degradé de PRETO por cima da foto, em fracções da imagem (0 = esquerda/
 * topo, 1 = direita/fundo). `cobre` é a opacidade do preto naquele ponto: 0 é
 * a foto como está, 0,65 é o escurecimento de leitura do fundo da capa.
 */
export interface Degrade {
  de: readonly [number, number];
  para: readonly [number, number];
  paragens: readonly { em: number; cobre: number }[];
}

/**
 * Onde fica o recorte de uma fotografia que não cabe inteira na caixa — como o
 * `object-position` do CSS, em fracções: `{ x: 0.5, y: 1 }` é «ao centro, em
 * baixo». Só conta o eixo que sobra: numa foto ao alto numa caixa deitada, é o
 * `y` que diz que fatia da altura fica à vista.
 */
export interface Foco {
  x: number;
  y: number;
}

const entre0e1 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

export interface Tratamento {
  /**
   * O enquadramento escolhido à mão. Sem ele, quem escolhe é a «atenção» do
   * sharp — e o estúdio pergunta-lhe o mesmo, por {@link focoAutomatico}.
   */
  foco?: Foco;
  /**
   * O fundo «arrastado» (§5): desfoque direccional com o ângulo dado (graus,
   * entre −8 e −24) e comprimento de ~8% da largura, e a seguir um desfoque
   * gaussiano de 5 px da grelha.
   */
  arrastado?: { angulo: number };
  /** Multiplicador do brilho (1 = como está). Os fundos: 0,80, 0,42, 0,30. */
  brilho?: number;
  /** Multiplicador da saturação: os fundos arrastados das páginas de texto, 0,6. */
  saturacao?: number;
  /**
   * O tecto de luz por trás do texto — ver {@link TECTO}. Mede-se na imagem
   * JÁ tratada, na zona onde o texto cai (de `desde` até ao fundo, e da
   * esquerda até `ate` da largura, em fracções), e se o 98.º percentil da
   * luminância passar de `lum`, essa zona escurece até lá, com um degradé
   * suave por cima.
   */
  tecto?: { lum: number; desde?: number; ate?: number };
  degrades?: readonly Degrade[];
  qualidade?: number;
}

/* ── Os escurecimentos do documento (§5) ─────────────────────────────────── */

/**
 * O escurecimento de leitura das páginas de foto nítida (capa, citação,
 * fecho): preto de 0% a 38% da altura até 65% no fundo, e 25% no topo a
 * desvanecer até 25% da altura, para o logótipo.
 */
export const LEITURA: readonly Degrade[] = [
  {
    de: [0, 0],
    para: [0, 1],
    paragens: [
      { em: 0.38, cobre: 0 },
      { em: 1, cobre: 0.65 },
    ],
  },
  {
    de: [0, 0],
    para: [0, 1],
    paragens: [
      { em: 0, cobre: 0.25 },
      { em: 0.25, cobre: 0 },
    ],
  },
];

/** O gradiente dos cartões de serviço: só no terço de baixo (0% a 55% → 75%). */
export const CARTAO: readonly Degrade[] = [
  {
    de: [0, 0],
    para: [0, 1],
    paragens: [
      { em: 0.55, cobre: 0 },
      { em: 1, cobre: 0.75 },
    ],
  },
];

/** O brilho dos fundos arrastados: separadores, páginas de texto, condições. */
export const BRILHO = { separador: 0.8, texto: 0.42, condicoes: 0.3 } as const;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O TECTO DE LUZ — o contraste medido, e não suposto
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O brilho ×0,42 do documento é uma média: numa fotografia de amarelos e
 * vermelhos vivos, o fundo arrastado continuava claro por trás dos números
 * (o pedido dela de 23/10, com o PDF no iPhone). Por isso mede-se a luz da
 * zona real por trás do texto e, se passar do tecto, escurece-se até ele.
 *
 * O tecto é a luminância relativa (WCAG) do fundo que ainda dá o contraste
 * pedido com a letra mais escura dessa página:
 *   · `texto` (0,07): a Cal a ≥ 7:1 (os números da tabela) e o Linho dos
 *     rótulos a ≥ 4,5:1;
 *   · `foto` (0,12): o bloco de título das páginas de fotografia — a Cal e o
 *     Papel a ≥ 4,5:1.
 *
 * Os dois têm folga sobre a conta exacta (0,093 e 0,15): a página inteira
 * mede-se num percentil, e um canto da zona pode ser mais claro do que ela.
 */
export const TECTO = { texto: 0.07, foto: 0.12 } as const;

/** A luminância relativa (WCAG) de um valor sRGB de 0 a 255. */
const linear = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const LINEAR = Array.from({ length: 256 }, (_, v) => linear(v));

/**
 * Escurece a zona do texto até o 98.º percentil da luminância ficar no tecto.
 * Multiplica os valores sRGB (a luminância desce com a potência 2,2 do fator),
 * com 8 % da altura de transição por cima da zona.
 */
function aplicarTecto(px: Buffer, W: number, H: number, t: NonNullable<Tratamento["tecto"]>) {
  const y0 = Math.round((t.desde ?? 0) * H);
  const x1 = Math.round((t.ate ?? 1) * W);
  const lums: number[] = [];
  for (let y = y0; y < H; y += 2) {
    for (let x = 0; x < x1; x += 2) {
      const i = (y * W + x) * 3;
      lums.push(0.2126 * LINEAR[px[i]] + 0.7152 * LINEAR[px[i + 1]] + 0.0722 * LINEAR[px[i + 2]]);
    }
  }
  if (!lums.length) return;
  lums.sort((a, b) => a - b);
  const p98 = lums[Math.floor(lums.length * 0.98)];
  if (p98 <= t.lum) return;
  const f = (t.lum / p98) ** (1 / 2.2);
  const suave = Math.round(0.08 * H);
  for (let y = Math.max(0, y0 - suave); y < H; y++) {
    const k = y >= y0 ? f : 1 - ((1 - f) * (y - (y0 - suave))) / suave;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      px[i] = Math.round(px[i] * k);
      px[i + 1] = Math.round(px[i + 1] * k);
      px[i + 2] = Math.round(px[i + 2] * k);
    }
  }
}

const svgDegrades = (w: number, h: number, degrades: readonly Degrade[]) => {
  const defs = degrades
    .map(
      (d, i) =>
        `<linearGradient id="g${i}" x1="${d.de[0]}" y1="${d.de[1]}" x2="${d.para[0]}" y2="${d.para[1]}">` +
        d.paragens
          .map(
            (p) =>
              `<stop offset="${p.em}" stop-color="#000" stop-opacity="${Math.max(0, Math.min(1, p.cobre))}"/>`,
          )
          .join("") +
        `</linearGradient>`,
    )
    .join("");
  const rects = degrades
    .map((_, i) => `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#g${i})"/>`)
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>${defs}</defs>${rects}</svg>`,
  );
};

/**
 * A EDIÇÃO QUENTE (§5), numa só passagem linear por canal: contraste ×1,06
 * à volta do meio-tom, pretos levantados 2%, vermelho ×1,03 e azul ×0,95.
 * `y = a·x + b`, com a e b já compostos.
 */
function edicaoQuente(): { a: number[]; b: number[] } {
  const contraste = 1.06;
  const levanta = 0.02;
  // c(x) = 1,06·(x − 128) + 128; l(y) = (1 − 0,02)·y + 0,02·255.
  const a0 = contraste * (1 - levanta);
  const b0 = (128 - contraste * 128) * (1 - levanta) + levanta * 255;
  const canais = [1.03, 1, 0.95];
  return { a: canais.map((k) => a0 * k), b: canais.map((k) => b0 * k) };
}
const QUENTE = edicaoQuente();

/** O desvio do grão (§5): σ ≈ 3,5/255. */
const GRAO = 3.5;

/**
 * O grão, somado aos píxeis. Pseudo-aleatório com semente FIXA: a mesma foto na
 * mesma caixa dá sempre os mesmos bytes — o PDF guardado pela chave do conteúdo
 * (`proposal-pdf-cache.ts`) e os testes dependem disso.
 */
function comGrao(px: Buffer): Buffer {
  let s = 0x9e3779b9;
  const aleatorio = () => {
    // xorshift32
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
  for (let i = 0; i < px.length; i += 3) {
    // Box–Muller simplificado: um ruído gaussiano por píxel, igual nos três
    // canais (grão de luz, não de cor).
    const u = Math.max(1e-9, aleatorio());
    const v = aleatorio();
    const n = Math.round(GRAO * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
    for (let c = 0; c < 3; c++) {
      const val = px[i + c] + n;
      px[i + c] = val < 0 ? 0 : val > 255 ? 255 : val;
    }
  }
  return px;
}

/**
 * O núcleo do desfoque direccional: uma linha de `n` píxeis com o ângulo dado,
 * numa matriz quadrada de lado ímpar.
 */
function nucleoDaLinha(n: number, angulo: number): { lado: number; kernel: number[] } {
  const lado = Math.max(3, n | 1);
  const meio = (lado - 1) / 2;
  const kernel = new Array<number>(lado * lado).fill(0);
  const rad = (angulo * Math.PI) / 180;
  const passos = lado * 2;
  for (let k = 0; k <= passos; k++) {
    const t = (k / passos - 0.5) * (lado - 1);
    const x = Math.round(meio + t * Math.cos(rad));
    const y = Math.round(meio - t * Math.sin(rad));
    if (x >= 0 && x < lado && y >= 0 && y < lado) kernel[y * lado + x] = 1;
  }
  return { lado, kernel };
}

/**
 * Recorta `bytes` para `w × h` píxeis como o `object-fit: cover` e aplica o
 * tratamento. Devolve uma JPEG opaca, ou `null` se a foto não se deixar ler —
 * quem chama conta-a como foto em falta, nunca deita o documento abaixo.
 *
 * `larguraFolha` é a largura, em píxeis da GRELHA, que a imagem vai ocupar: é
 * o que converte o desfoque de 5 px da grelha para os píxeis desta imagem.
 */
export async function preparar(
  bytes: Buffer,
  w: number,
  h: number,
  larguraFolha: number,
  t: Tratamento = {},
): Promise<Buffer | null> {
  try {
    const W = Math.round(w);
    const H = Math.round(h);
    let img = t.foco
      ? await recortarComFoco(bytes, W, H, t.foco)
      : sharp(bytes, { failOn: "none" }).rotate().resize(W, H, {
          fit: "cover",
          position: sharp.strategy.attention,
        });
    img = img.flatten({ background: HEX.tinta }).removeAlpha();

    if (t.arrastado) {
      // Desfoca-se em pequeno (é igual à vista, e é muito mais barato) e
      // volta-se ao tamanho pedido.
      const ws = Math.min(W, 480);
      const hs = Math.max(1, Math.round((H * ws) / W));
      const { lado, kernel } = nucleoDaLinha(Math.round(ws * 0.08), t.arrastado.angulo);
      const soma = kernel.reduce((s, k) => s + k, 0);
      const pequeno = await img
        .resize(ws, hs)
        .convolve({ width: lado, height: lado, kernel, scale: soma })
        .blur(Math.max(0.3, (5 * ws) / larguraFolha))
        .toBuffer();
      img = sharp(pequeno).resize(W, H, { kernel: "cubic" });
    }

    img = img.linear(QUENTE.a, QUENTE.b);
    if ((t.brilho && t.brilho !== 1) || t.saturacao) {
      img = img.modulate({ brightness: t.brilho ?? 1, saturation: t.saturacao ?? 1 });
    }
    // O `composite` corre DEPOIS do brilho só se a imagem for materializada
    // primeiro: o sharp aplica as operações numa ordem fixa, e o degradé tem
    // de cair sobre a foto já escurecida.
    if (t.degrades?.length) {
      const base = await img.toBuffer();
      img = sharp(base).composite([{ input: svgDegrades(W, H, t.degrades) }]);
    }
    const { data, info } = await img.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    // O tecto mede-se DEPOIS do grão, que é o que fica na página.
    const comOGrao = comGrao(data);
    if (t.tecto) aplicarTecto(comOGrao, info.width, info.height, t.tecto);
    return await sharp(comOGrao, {
      raw: { width: info.width, height: info.height, channels: 3 },
    })
      // JPEG SIMPLES: «baseline», RGB de 8 bits, sem perfil nem metadados.
      // O pedido dela de 23/10 — «não aparecem todas as fotografias… aqui no
      // telemóvel» — era sobre o modelo aberto no iPhone; os leitores de PDF
      // do iOS são os mais esquisitos com JPEG, e este é o que todos lêem. As
      // afinações do mozjpeg sim, mas não o `optimiseScans`, que obriga a
      // JPEG progressivo (o que `mozjpeg: true` liga).
      .jpeg({
        quality: t.qualidade ?? QUALIDADE,
        progressive: false,
        optimiseScans: false,
        optimiseCoding: true,
        trellisQuantisation: true,
        overshootDeringing: true,
        quantisationTable: 3,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * O recorte `w × h` com o enquadramento dado — o `object-fit: cover` com o
 * `object-position` em fracções, que é o que o estúdio desenha.
 */
async function recortarComFoco(bytes: Buffer, w: number, h: number, foco: Foco) {
  const direita = await sharp(bytes, { failOn: "none" }).rotate().toBuffer({
    resolveWithObject: true,
  });
  const { width: iw, height: ih } = direita.info;
  const k = Math.max(w / iw, h / ih);
  const rw = Math.max(w, Math.round(iw * k));
  const rh = Math.max(h, Math.round(ih * k));
  return sharp(direita.data)
    .resize(rw, rh)
    .extract({
      left: Math.round((rw - w) * entre0e1(foco.x)),
      top: Math.round((rh - h) * entre0e1(foco.y)),
      width: w,
      height: h,
    });
}

/**
 * O enquadramento que a «atenção» do sharp escolhe para esta caixa, em
 * fracções — a MESMA conta que o {@link preparar} faz quando ninguém escolheu.
 *
 * Existe para o estúdio mostrar o recorte que vai sair: ela viu o meio da
 * fotografia no ecrã (com o carro) e o PDF saiu com a parte de cima (os vasos e
 * o céu). Duas contas diferentes para a mesma pergunta.
 */
export async function focoAutomatico(bytes: Buffer, w: number, h: number): Promise<Foco> {
  try {
    // A pergunta é feita aos MESMOS bytes e com a MESMA cadeia do `preparar`
    // (rodar, e recortar pela atenção) — só assim a resposta é a do PDF.
    const meta = await sharp(bytes, { failOn: "none" }).metadata();
    const deLado = (meta.orientation ?? 1) >= 5;
    const iw = (deLado ? meta.height : meta.width) ?? 0;
    const ih = (deLado ? meta.width : meta.height) ?? 0;
    if (!iw || !ih) return { x: 0.5, y: 0.5 };
    const k = Math.max(w / iw, h / ih);
    const rw = Math.max(Math.round(w), Math.round(iw * k));
    const rh = Math.max(Math.round(h), Math.round(ih * k));
    const { info } = await sharp(bytes, { failOn: "none" })
      .rotate()
      .resize(Math.round(w), Math.round(h), { fit: "cover", position: sharp.strategy.attention })
      .toBuffer({ resolveWithObject: true });
    // O sharp devolve o desvio do recorte como número NEGATIVO (é onde a imagem
    // redimensionada começa em relação à caixa).
    const esquerda = Math.abs(info.cropOffsetLeft ?? 0);
    const topo = Math.abs(info.cropOffsetTop ?? 0);
    return {
      x: rw > w ? entre0e1(esquerda / (rw - Math.round(w))) : 0.5,
      y: rh > h ? entre0e1(topo / (rh - Math.round(h))) : 0.5,
    };
  } catch {
    return { x: 0.5, y: 0.5 };
  }
}

/**
 * Píxeis de uma caixa de `wPx × hPx` (píxeis do exemplo), com o lado maior
 * limitado a `lado`. A 1123 px de folha, uma caixa de 300 px de largura numa
 * imagem de 2,2× dá 660 px — nítida no ecrã e na impressão de casa.
 */
export function pixeisDaCaixa(wPx: number, hPx: number, lado = LADO_CELULA, densidade = 2.2) {
  const k = Math.min(densidade, lado / Math.max(wPx, hPx));
  return { w: Math.round(wPx * k), h: Math.round(hPx * k) };
}

/**
 * O logótipo, recortado às margens e pintado na cor do texto.
 *
 * O PNG branco da casa (`proposal-assets.ts`), pintado na «versão creme» do
 * documento dela (a Cal, #FBFAF6). A forma vem do canal alfa e não se toca.
 */
export async function logotipoNaCor(png: Buffer, hex: string): Promise<Buffer> {
  try {
    const recortado = await sharp(png).trim().ensureAlpha().toBuffer({ resolveWithObject: true });
    const { width, height } = recortado.info;
    const alfa = await sharp(recortado.data).extractChannel(3).toBuffer();
    return await sharp({ create: { width, height, channels: 3, background: hex } })
      .joinChannel(alfa)
      .png()
      .toBuffer();
  } catch {
    return png;
  }
}
