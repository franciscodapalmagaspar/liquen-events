/**
 * Custom next/image loader for the six full-bleed page heroes.
 *
 * Instead of routing through the on-demand `/_next/image` optimizer (which
 * cold-encodes on the first request after a deploy — the visible "blur, then it
 * snaps sharp" gap), it points each srcset candidate at a static WebP that
 * `scripts/pregen-heroes.mjs` produces at build time: `/_img/<key>-<w>.webp`.
 * So the very first visitor gets the fully-optimized hero with zero encode
 * latency.
 *
 * Used via the `<HeroImage>` client wrapper (a function loader can't be passed
 * as a prop from a Server Component). Keep HERO_SOURCES / HERO_WIDTHS / the key
 * sanitiser in sync with scripts/pregen-heroes.mjs.
 */
import type { ImageLoaderProps } from "next/image";

// The widths pregen-heroes.mjs emits. Each srcset candidate rounds up to the
// nearest of these (and clamps to the largest).
export const HERO_WIDTHS = [640, 1080, 1536, 2048] as const;

/**
 * AS FOTOGRAFIAS DESENHADAS A TODA A LARGURA DO ECRÃ. Eram os seis heróis de
 * página; passaram a ser todas as que o `sizes="100vw"` põe de borda a borda.
 *
 * PORQUÊ CRESCEU. Ao tirar o sítio do optimizador, a escada das fotos comuns
 * (topo: 1280 px) passou a servir também os fundos de secção — que antes
 * pediam 1920 ao optimizador. MEDIDO num ecrã de 1920 a 2x, com o `naturalWidth`
 * de cada `<img sizes="100vw">` contra a sua caixa em pixels de dispositivo:
 * os heróis recebiam 2048 para caixas de 4070, e estas 23 recebiam 1280 para
 * caixas de 3840 — de uma ampliação de 2x para uma de 3x. Numa fotografia sob
 * um véu escuro nota-se pouco, mas o sítio inteiro é fotografia e a perda foi
 * introduzida por mim ao fixar a escada.
 *
 * A lista é MANTIDA À MÃO e é a única coisa deste trabalho que não se defende
 * sozinha: acrescentar uma fotografia de largura total nova sem a pôr aqui
 * fá-la funcionar, mas suave. A rede de segurança das imagens
 * (e2e/imagens.spec.ts) apanha uma imagem que NÃO APARECE, não uma que apareça
 * menos nítida do que devia. Foi assim recolhida — a medir, não a adivinhar —
 * e é assim que deve ser refeita.
 */
export const HERO_SOURCES = new Set([
  // Os seis heróis de página originais.
  "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg",
  // A entrada da página inicial: o 1.º fotograma do vídeo 1, sem as tiras pretas (EntradaEmVideo).
  "/imagens/entrada-floresta-clara.jpg",
  "/imagens/hd-edited.jpg",
  "/imagens/EW1_1330.jpg",
  "/imagens/DaniGui_Preview20.jpg",
  // A faixa das celebrações em /servicos (era a mesma fotografia da capa da galeria).
  "/imagens/stephanie-mizio-834-1.jpg",
  "/imagens/DJI_20250913190635_0120_D.jpg",
  "/imagens/EW1_1393.jpg",
  // Fundos de secção, faixas e capas de serviço, todos a `sizes="100vw"`.
  "/imagens/DaniGui_Adois_61.jpg",
  "/imagens/DaniGui_JantarFesta_130.jpg",
  "/imagens/DaniGui_JantarFesta_18.jpg",
  "/imagens/DaniGui_JantarFesta_26.jpg",
  "/imagens/DaniGui_JantarFesta_48.jpg",
  "/imagens/EW1_1332.jpg",
  "/imagens/EW1_1333.jpg",
  "/imagens/EW1_1404.jpg",
  "/imagens/EW1_1405.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4463.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4472.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4738.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A5248.jpg",
  "/imagens/JOAO_E_PEDRO_IMGL2823.jpg",
  "/imagens/J&A-68.jpg",
  "/imagens/M&F0497.jpg",
  "/imagens/Natalia e Jonathan-198.jpg",
  "/imagens/stephanie-mizio-555.jpg",
  "/imagens/stephanie-mizio-715.jpg",
  "/imagens/stephanie-mizio-760.jpg",
  "/imagens/viaturas-classicas.jpg",
  // Heróis das landing pages das campanhas (src/lib/ads/polos.ts). São todos
  // desenhados a `sizes="100vw"` e são o candidato a LCP de uma página que
  // recebe tráfego PAGO — é o pior sítio do site para servir uma imagem suave.
  // Os testes `polos-heroi.test.ts` e `polos-peso.test.ts` garantem que nenhum
  // herói do catálogo fica fora desta lista nem passa dos 100 KB.
  "/imagens/EW1_1392.jpg",
  "/imagens/J&A-243.jpg",
  "/imagens/teresinhaeze-1434.jpg",
  "/imagens/DaniGui_Preview79.jpg",
  "/imagens/M&F0508.jpg",
  "/imagens/EW1_0580.jpg",
  "/imagens/EW1_0365.jpg",
  "/imagens/EW1_0363.jpg",
  "/imagens/J&A-442.jpg",
  "/imagens/matilde-e-tomas28.jpg",
  "/imagens/EW1_1396.jpg",
  "/imagens/stephanie-mizio-7.jpg",
  "/imagens/M&F0502.jpg",
  "/imagens/EW1_1342.jpg",
  "/imagens/J&A-52.jpg",
  "/imagens/M&F0515.jpg",
]);

/** Esta fotografia é desenhada a toda a largura e tem ficheiros até 2048 px? */
export function isHeroSrc(src: string): boolean {
  return HERO_SOURCES.has(src);
}

/** Basename without extension, non-[A-Za-z0-9_-] collapsed to "_". */
export function heroKey(src: string): string {
  const base = (src.split("/").pop() ?? src).replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Round a requested width up to the nearest pre-generated width. */
export function snapHeroWidth(width: number): number {
  return HERO_WIDTHS.find((w) => w >= width) ?? HERO_WIDTHS[HERO_WIDTHS.length - 1];
}

/** The static path a given hero + width resolves to. */
export function heroImageUrl(src: string, width: number): string {
  return `/_img/${heroKey(src)}-${snapHeroWidth(width)}.webp`;
}

/**
 * O ficheiro AVIF que o `<picture>` de um herói escolhe para esta largura — o
 * mesmo `snapHeroWidth` — ou `null` se a origem não for um herói conhecido.
 * É o que o `HeroWarm` deve aquecer num browser com AVIF: aquecer o WebP era
 * descarregar um ficheiro que a página seguinte nunca ia usar.
 */
export function heroAvifUrl(src: string, width: number): string | null {
  if (!HERO_SOURCES.has(src)) return null;
  return `/_img/${heroKey(src)}-${snapHeroWidth(width)}.avif`;
}

/**
 * O `srcset` AVIF completo de um herói, para a `<source>` do `<picture>`.
 *
 * Devolve `null` quando a origem não é um herói conhecido — e essa é a
 * salvaguarda que interessa: só se anuncia AVIF para os ficheiros que o
 * `pregen-heroes.mjs` gera de certeza. Um `<source>` que aponte para um ficheiro
 * inexistente não cai para o `<img>`: o browser escolhe a fonte pelo `type`,
 * não pela existência, e a rede de recuperação do `SafeImage` fica do lado de
 * lá a olhar.
 */
export function heroAvifSrcSet(src: string): string | null {
  if (!HERO_SOURCES.has(src)) return null;
  const key = heroKey(src);
  return HERO_WIDTHS.map((w) => `/_img/${key}-${w}.avif ${w}w`).join(", ");
}

export function heroImageLoader({ src, width }: ImageLoaderProps): string {
  if (HERO_SOURCES.has(src)) return heroImageUrl(src, width);
  /**
   * RECURSO: O FICHEIRO ORIGINAL, TAL E QUAL.
   *
   * Isto devolvia um URL do `/_next/image`, descrito como "defensivo". Deixou
   * de o ser e passou a ser o contrário: desde que `next.config.ts` declara um
   * `loaderFile`, o optimizador RESPONDE 404 A TUDO. Não é configuração nossa,
   * é o próprio Next — `next-server.js` faz `render404` mal veja
   * `images.loader !== 'default'`, antes sequer de olhar para os parâmetros.
   * Medido nos dois sentidos: o mesmo pedido dá 200 com o carregador por
   * omissão e 404 com o nosso.
   *
   * Ou seja, o ramo que existia para uma origem inesperada ainda funcionar
   * garantia que ela NUNCA funcionava. Servir o ficheiro original custa bytes
   * (não é redimensionado) mas aparece sempre — e um herói que aparece grande
   * de mais é melhor do que um herói que não aparece.
   */
  return src;
}
