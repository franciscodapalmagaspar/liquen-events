"use client";

/**
 * O carregador GLOBAL do next/image (`images.loader: "custom"` +
 * `images.loaderFile` no next.config.ts). Tudo o que não passe um `loader={…}`
 * próprio passa por aqui.
 *
 * PORQUÊ. A queixa da dona — "as fotos falham imenso, muitas vezes nem
 * aparecem" — vem toda do mesmo sítio: cada imagem do sítio era uma
 * transformação on-demand no `/_next/image`, um serviço com quota mensal que,
 * esgotada, devolve 402 às transformações NOVAS enquanto as já em cache
 * continuam a servir (exactamente "umas sim, outras não, sempre as mesmas"), e
 * que sob rajada passa de ~219 ms por transformação a frio isolada para
 * ~2 900 ms. A galeria já saiu desse caminho (WebP estáticos gerados no build,
 * medido: 432 de 432 fotos pintadas) e os seis heróis de página também. Ficou
 * de fora o resto — e é o resto que aparece partido nas capturas: o logótipo do
 * Navbar (em TODAS as páginas), o rodapé, os logótipos de cliente e o
 * portefólio das páginas de serviço.
 *
 * Medido em dois builds de produção, comparando o HTML servido por
 * `next start` — número de URLs `/_next/image` no HTML de cada página:
 *   /                       634  ->  0
 *   /clientes               959  ->  0
 *   /servicos               108  ->  0
 *   /servicos/casamentos    146  ->  0
 *   /sobre                   92  ->  0
 *   /contacto                95  ->  0
 *   /galeria                 28  ->  0
 * Os 369 ficheiros `/_img/…` distintos a que as nove páginas passaram a
 * apontar respondem todos 200 (e com `Cache-Control: immutable`, pela regra
 * `/_img/:path*` que já existia no next.config.ts).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ATENÇÃO — O `/_next/image` DEIXA DE EXISTIR QUANDO ESTE FICHEIRO ESTÁ ACTIVO
 * ─────────────────────────────────────────────────────────────────────────
 * Com `images.loader !== "default"`, o servidor do Next responde 404 ao
 * endpoint, ANTES sequer de validar parâmetros:
 *
 *   node_modules/next/dist/server/next-server.js:198
 *     if (imagesConfig.loader !== 'default' || imagesConfig.unoptimized) {
 *       await this.render404(req, res); return true;
 *     }
 *
 * Medido contra `npm run build` + servidor de produção:
 *   loader "default" : /_next/image?url=%2Flogo-liquen.png&w=256&q=55 -> 200
 *   loader "custom"  : o MESMO pedido                                 -> 404
 *
 * Consequência de desenho: o ramo de recurso NÃO pode devolver
 * `/_next/image?…` como fazem o hero-image-loader e o gallery-image-loader
 * (esses são passados como `loader={…}` numa página onde o endpoint continuava
 * vivo; aqui seria um 404 garantido, e silencioso). Por isso o recurso devolve
 * o `src` INTACTO: o ficheiro original de public/ (ou o URL remoto tal e qual)
 * é sempre servido. Fica maior e sem redimensionar, mas aparece — que é
 * exactamente o problema que estamos a resolver.
 *
 * CONSEQUÊNCIA PARA QUEM DESENVOLVE: o `npm run dev` TEM de pré-gerar primeiro.
 * Sem os ficheiros em public/_img, este carregador aponta para caminhos que não
 * existem e — como o `/_next/image` já não é um recurso possível (ver acima) —
 * o site aparece com TODAS as imagens partidas em local. Não é uma avaria
 * subtil: é o site inteiro sem fotografias, e quem clonar o repositório de
 * fresco assume que partiu alguma coisa. Por isso o script `dev` do
 * package.json passou a ser `npm run pregen && next dev`. Os pré-geradores são
 * cache-aware, portanto isto custa segundos depois da primeira vez (a primeira
 * paga o encode das ~2 900 imagens).
 *
 * CUSTO EM BYTES: NEGATIVO. Este ficheiro vai no bundle de TODAS as páginas,
 * mas não SOMA — SUBSTITUI. O `loaderFile` é aliased por cima do carregador por
 * omissão do Next (build/create-compiler-aliases.js:146), e esse traz consigo o
 * `findClosestQuality`, o `getDeploymentId` e os validadores de
 * localPatterns/remotePatterns. Medido, somando todos os
 * `.next/static/chunks/*.js` de dois builds (87 chunks em ambos):
 *   sem este carregador: 1 820 238 B em bruto, 510 605 B em gzip -9
 *   com este carregador: 1 819 574 B em bruto, 509 594 B em gzip -9
 *   diferença:               −664 B em bruto,   −1 011 B em gzip
 * É por isso que aqui NÃO há manifesto nenhum de ficheiros pré-gerados
 * (embarcar as 427 chaves da galeria mais as 21 dos logótipos seriam ~12 KB por
 * visita para não ganhar nada): só dois prefixos, dois nomes e duas escadas.
 *
 * As escadas e o formato dos nomes são um CONTRATO com os pré-geradores
 * (scripts/pregen-gallery.mjs e scripts/pregen-logos.mjs). Há testes que falham
 * se saírem de sincronia.
 */

import type { ImageLoaderProps } from "next/image";
import {
  galleryImageUrl,
  galleryKey,
  snapGalleryWidth,
} from "@/app/[lang]/(site)/galeria/gallery-image-loader";
import { ficheiroDaGaleria } from "@/app/[lang]/(site)/galeria/gallery-srcset";
import { heroAvifUrl, heroImageUrl, isHeroSrc } from "@/lib/hero-image-loader";

/**
 * O saneador de nomes é UM SÓ em todo o projecto — reutilizado do
 * gallery-image-loader em vez de reescrito aqui. Basename sem extensão, tudo
 * fora de [A-Za-z0-9_-] colapsado em "_". Há um teste que compara este,
 * o `galleryKey` e o `heroKey` para o caso de algum deles derivar.
 */
export const siteImageKey = galleryKey;

/**
 * A escada dos logótipos (`/_img/l/`).
 *
 * Muito mais curta do que a das fotos porque nenhum logótipo se aproxima destes
 * tamanhos em ecrã: os 19 logótipos de cliente medem dezenas de px, e o maior
 * de todos — o wordmark do Navbar, no seu estado mais alto (`h-[148px]`, rácio
 * 3747×2238) — ocupa 248 px de CSS. Medido no HTML de produção, o srcset do
 * Navbar pedia w=360 (1x) e w=640 (2x) do mesmo PNG de 3747 px.
 *
 * O 512 EXISTE POR CAUSA DO WORDMARK, e é a correcção de um erro meu. A escada
 * acabava em 384, o que servia 384 px para os 496 px de dispositivo de um ecrã
 * 2x — na única imagem que aparece em TODAS as páginas do sítio, e a cores (os
 * 19 logótipos de cliente são desenhados com `brightness-0`, silhuetas, onde a
 * nitidez do RGB não se vê). Trocar nitidez por fiabilidade fazia sentido no
 * resto; aqui não fazia, e custava um degrau.
 */
export const LOGO_WIDTHS = [64, 128, 256, 384, 512] as const;

/**
 * Os logótipos que vivem na raiz de public/ em vez de em /logos/.
 *
 * O `logo-liquen-marca.png` entrou depois dos outros dois e ficou de fora
 * desta lista — o que não parte nada de forma visível, e é por isso que vale
 * a pena escrever aqui o que custava. Quem não está na lista cai no ramo de
 * recurso, que devolve o `src` INTACTO e IGNORA a largura pedida. Resultado
 * medido: 76 KB de PNG por cada abertura do back office, em vez do WebP de
 * uma das cinco larguras pré-geradas; e o `next dev` a avisar, em todas as
 * páginas, que "o carregador não implementa width". A marca é a imagem que
 * aparece em TODOS os ecrãs do back office — é o pior sítio para pagar isto.
 */
const ROOT_LOGOS = ["/logo-liquen.png", "/logo-liquen-branco.png", "/logo-liquen-marca.png"];

/** Arredonda para cima até à largura pré-gerada mais próxima (satura no topo). */
export function snapLogoWidth(width: number): number {
  return LOGO_WIDTHS.find((w) => w >= width) ?? LOGO_WIDTHS[LOGO_WIDTHS.length - 1];
}

/** O ficheiro estático a que um logótipo + largura corresponde. */
export function logoImageUrl(src: string, width: number): string {
  return `/_img/l/${siteImageKey(src)}-${snapLogoWidth(width)}.webp`;
}

/** Os logótipos: a pasta /logos/ inteira mais os dois da raiz de public/. */
export function isLogoSrc(src: string): boolean {
  return src.startsWith("/logos/") || ROOT_LOGOS.includes(src);
}

/**
 * O carregador propriamente dito. A ordem importa: `/imagens/` é de longe o
 * ramo mais pedido (todas as fotos do sítio), por isso vem primeiro.
 *
 * `quality` é ignorado de propósito nos dois ramos estáticos — a qualidade fica
 * COZIDA no ficheiro no momento em que o pré-gerador o escreve, e um WebP já
 * escrito não muda de qualidade por lhe pedirmos outra. Continuar a pôr um `q=`
 * no URL só criaria URLs distintos para o mesmo ficheiro e partiria a cache.
 */
export default function siteImageLoader({ src, width }: ImageLoaderProps): string {
  // As fotografias desenhadas a toda a largura têm a SUA escada, até 2048 px.
  // Vem primeiro porque também vivem em /imagens/ e o ramo seguinte apanhá-las-ia
  // com o tecto de 1280 — que é exactamente a perda de nitidez que isto corrige.
  //
  // Assim a decisão é da ORIGEM e não de quem chama: uma fotografia de fundo
  // recebe os 2048 quer venha pelo <HeroImage> (que passa o seu carregador) quer
  // por um <SafeImage> qualquer que caia aqui. Sem isto, só as seis capas de
  // página estariam cobertas.
  if (isHeroSrc(src)) return heroImageUrl(src, width);
  if (src.startsWith("/imagens/")) return galleryImageUrl(src, width);
  if (isLogoSrc(src)) return logoImageUrl(src, width);
  // Recurso: o original, intacto. Ver o aviso grande lá em cima — o
  // `/_next/image` responde 404 enquanto este ficheiro for o carregador global,
  // por isso mandar para lá seria trocar "imagem grande" por "imagem nenhuma".
  return src;
}

/**
 * As fotografias de /imagens/ a que o `pregen-gallery.mjs` escreve SEMPRE o par
 * WebP + AVIF em todas as larguras da escada. É o que o pré-gerador percorre
 * (tudo o que está em public/imagens/, recursivo, com estas extensões) MENOS a
 * bandeja `_intake/`, que ele salta de propósito. E é um contrato que se
 * defende sozinho: o script confere a saída ficheiro a ficheiro, nos dois
 * formatos, e FALHA O BUILD se faltar um — portanto um deploy com esta regra a
 * dizer «há AVIF» e o ficheiro em falta não chega a existir.
 *
 * Uma origem com `?` (um anti-cache, um parâmetro qualquer) não passa: o
 * pré-gerador nunca escreveu nada para ela, e o `$` da expressão recusa-a.
 */
const FOTO_COM_AVIF = /^\/imagens\/(?!_intake\/)[^?#\0]+\.(jpe?g|png|webp)$/i;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O GÉMEO AVIF DO QUE ESTE CARREGADOR SERVE — ou `null` se não houver
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O AVIF já existia em `/_img/` para quase todas as fotografias do sítio — a
 * galeria gera-o desde o início e os heróis desde o `HeroImage` com
 * `<picture>` —, mas só os heróis o usavam. Tudo o que passava pelo
 * `SafeImage` (fundos de secção, portefólios, a grelha das páginas) ia em WebP.
 * MEDIDO pela auditoria num `next start`, bytes de imagem depois de percorrer
 * a página toda, tudo em WebP contra tudo em AVIF: /servicos 2163 contra 1114
 * KB, /sobre 1396 contra 752, /contacto 1175 contra 630, / 1023 contra 507,
 * /clientes ~1000–1186 contra 528–668. Metade dos bytes, nas mesmas larguras.
 * (O que esta mudança poupou de facto, antes e depois, está no `SafeImage`.)
 *
 * É o espelho dos ramos do `siteImageLoader` lá em cima, ramo a ramo, e só
 * dos que TÊM gémeo:
 *   · as fotografias de largura total → a escada dos heróis, `-<w>.avif` ao
 *     lado de cada `-<w>.webp` (`pregen-heroes.mjs` escreve os dois);
 *   · as outras fotografias de /imagens/ → `/_img/g/<chave>-<w>.avif`, a mesma
 *     escada e o mesmo arredondamento do WebP (`snapGalleryWidth`);
 *   · os logótipos NÃO: o `pregen-logos.mjs` só escreve WebP, de propósito (o
 *     canal alfa — ver lá). Pôr-lhes um `<source>` AVIF era apontar para
 *     ficheiros que não existem: cada logótipo falhava primeiro e só aparecia
 *     depois, pela rede do `SafeImage` — um 404 por logótipo, em todas as
 *     páginas (o do Navbar está em todas).
 *
 * A decisão vive AQUI, por origem, e não numa lista de ficheiros: pela mesma
 * razão que o carregador não tem manifesto (ver «CUSTO EM BYTES» lá em cima).
 * E a raiz de `/_img/` tem WebP de heróis antigos SEM gémeo AVIF (o
 * `EW1_1427`, o `J_A-242`, …): uma regra do tipo «troca `.webp` por `.avif` no
 * URL» acertaria hoje por acaso e partiria no dia em que alguma coisa voltasse
 * a apontar para eles. Esta só diz que há AVIF onde um pré-gerador garante que
 * há.
 */
export function siteImageAvifUrl(src: string, width: number): string | null {
  if (isHeroSrc(src)) return heroAvifUrl(src, width);
  if (FOTO_COM_AVIF.test(src)) return ficheiroDaGaleria(src, snapGalleryWidth(width), "avif");
  return null;
}
