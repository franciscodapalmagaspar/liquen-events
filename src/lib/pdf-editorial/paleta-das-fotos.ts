import "server-only";
import sharp from "sharp";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS CINCO CORES DA PROPOSTA — tiradas das fotografias de inspiração
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O documento dela: «Cinco cores extraídas automaticamente das fotografias de
 * inspiração dessa proposta (quantização das imagens, descartando os tons
 * quase pretos e quase brancos e as cores demasiado parecidas entre si)».
 *
 * Como se faz:
 *   1. cada fotografia é reduzida a 48 × 48 pixéis (chega para a cor e custa
 *      milissegundos), e juntam-se os pixéis de todas;
 *   2. descartam-se os quase pretos e os quase brancos;
 *   3. cada pixel PESA pela cor que tem (o pedido dela de 23/10: «vai buscar
 *      cores que não são… os castanhos»): um pixel saturado — o vermelho e o
 *      bordeaux das flores, o verde das folhas — pesa até sete vezes mais do
 *      que um neutro, e um castanho escuro e baço (a mesa, a sala, a sombra)
 *      pesa quase nada. Os neutros claros (a toalha creme, as velas) pesam o
 *      normal: vêem-se, e entram;
 *   4. «corte pela mediana», pelos PESOS: a caixa de cores mais pesada parte-se
 *      ao meio pelo canal onde varia mais, até haver dezasseis caixas; a cor de
 *      cada caixa é a média pesada dos seus pixéis;
 *   5. das dezasseis, ficam as cinco mais pesadas que não sejam parecidas com
 *      uma já escolhida;
 *   6. ordenam-se da mais clara para a mais escura, como no exemplo.
 *
 * Um castanho ou um cinzento só entram se dominarem mesmo as fotografias.
 *
 * Não há sorteio em lado nenhum: as mesmas fotografias dão sempre as mesmas
 * cinco cores, e a proposta reenviada não muda de paleta.
 */

type Rgb = readonly [number, number, number];

const LADO = 48;
const CAIXAS = 16;
const QUANTAS = 5;

/** Luminância percebida, de 0 a 255. */
const luz = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;

/** A intensidade da cor, de 0 (cinzento) a 1: o máximo menos o mínimo dos canais. */
const croma = ([r, g, b]: Rgb) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;

/**
 * O peso de um pixel (passo 3): sobe com a intensidade da cor; um escuro e
 * baço — castanho de madeira, sombra, sala — quase não conta.
 */
export function pesoDoPixel(c: Rgb): number {
  const k = croma(c);
  const peso = 1 + 6 * Math.min(1, k / 0.5);
  return luz(c) < 95 && k < 0.22 ? peso * 0.12 : peso;
}

/** Distância entre duas cores (euclidiana pesada pelo olho). */
const distancia = (a: Rgb, b: Rgb) =>
  Math.sqrt(2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2);

/** As cores, em `#RRGGBB`, da mais clara para a mais escura. Vazio se não houver fotos. */
export async function paletaDasFotos(fotos: readonly Buffer[]): Promise<string[]> {
  const pixeis: Rgb[] = [];
  for (const b of fotos) {
    try {
      const { data } = await sharp(b, { failOn: "none" })
        .rotate()
        .resize(LADO, LADO, { fit: "cover" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (let i = 0; i + 2 < data.length; i += 3) {
        const c: Rgb = [data[i], data[i + 1], data[i + 2]];
        const l = luz(c);
        if (l > 28 && l < 242) pixeis.push(c);
      }
    } catch {
      // Uma foto que não se lê não tem cor para dar; as outras chegam.
    }
  }
  return escolher(pixeis);
}

/** O corte pela mediana e a escolha — separado para se poder testar sem imagens. */
export function escolher(pixeis: readonly Rgb[]): string[] {
  if (!pixeis.length) return [];
  type Caixa = { pixeis: Rgb[]; peso: number };
  const somar = (l: readonly Rgb[]) => l.reduce((s, p) => s + pesoDoPixel(p), 0);
  let caixas: Caixa[] = [{ pixeis: [...pixeis], peso: somar(pixeis) }];
  while (caixas.length < CAIXAS) {
    // Parte-se a caixa mais PESADA que ainda tenha mais de um pixel.
    caixas.sort((a, b) => b.peso - a.peso);
    const i = caixas.findIndex((c) => c.pixeis.length > 1);
    if (i < 0) break;
    const maior = caixas[i].pixeis;
    // Sem `Math.max(...lista)`: com setenta fotografias são 160 mil pixéis, e
    // espalhá-los como argumentos rebenta a pilha.
    const amp = (c: 0 | 1 | 2) => {
      let lo = 255;
      let hi = 0;
      for (const p of maior) {
        if (p[c] < lo) lo = p[c];
        if (p[c] > hi) hi = p[c];
      }
      return hi - lo;
    };
    const canal = ([1, 2] as const).reduce<0 | 1 | 2>((m, k) => (amp(k) > amp(m) ? k : m), 0);
    const ordenada = [...maior].sort((a, b) => a[canal] - b[canal]);
    // O corte é a meio do PESO, e não da contagem: os pixéis com cor ganham
    // caixas suas mesmo sendo poucos.
    const metade = caixas[i].peso / 2;
    let acc = 0;
    let meio = 1;
    for (; meio < ordenada.length - 1; meio++) {
      acc += pesoDoPixel(ordenada[meio - 1]);
      if (acc >= metade) break;
    }
    const [a, b] = [ordenada.slice(0, meio), ordenada.slice(meio)];
    caixas = [
      { pixeis: a, peso: somar(a) },
      { pixeis: b, peso: somar(b) },
      ...caixas.filter((_, k) => k !== i),
    ];
  }
  const cores = caixas
    .filter((c) => c.pixeis.length)
    .map((c) => ({
      cor: [0, 1, 2].map((k) =>
        Math.round(c.pixeis.reduce((s, p) => s + p[k] * pesoDoPixel(p), 0) / c.peso),
      ) as unknown as Rgb,
      peso: c.peso,
    }))
    .sort((a, b) => b.peso - a.peso);

  const escolhidas: Rgb[] = [];
  for (const { cor } of cores) {
    if (escolhidas.every((e) => distancia(e, cor) > 80)) escolhidas.push(cor);
    if (escolhidas.length === QUANTAS) break;
  }
  return escolhidas
    .sort((a, b) => luz(b) - luz(a))
    .map(
      (c) =>
        `#${c
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase()}`,
    );
}
