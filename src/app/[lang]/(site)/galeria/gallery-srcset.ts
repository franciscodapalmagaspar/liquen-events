import {
  GALLERY_WIDTHS,
  galleryKey,
  snapGalleryWebpWidth,
  snapGalleryWidth,
} from "./gallery-image-loader";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUE FICHEIRO É QUE CADA ECRÃ RECEBE — E PORQUE NÃO O MAIOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O problema, medido ────────────────────────────────────────────────────
 * A galeria servia ficheiros de **1280 px** para caixas de **412 CSS px** num
 * telemóvel: 3,11× o tamanho de exibição, em 374 de 374 fotografias. Não era um
 * defeito — era a aritmética correcta a levar ao sítio errado. O ecrã é DPR 3,
 * o `sizes` dizia honestamente "100vw", e o browser fazia a conta certa:
 * 412 × 3 = 1236 px de ecrã, logo o candidato de 1280. Uma travessia completa
 * da galeria descarregava **55 MB**.
 *
 * ── A decisão ─────────────────────────────────────────────────────────────
 * Uma miniatura de grelha não precisa de 3× a densidade. Acima de ~2× o olho
 * deixa de distinguir numa fotografia, e a diferença de bytes é enorme:
 *
 *     1280 px → 132,9 KB       (1,04× os píxeis do ecrã)
 *     1024 px → 101,4 KB       (0,83×)
 *      768 px →  40,7 KB       (0,62× — ou seja, 1,86 de densidade efectiva)
 *
 * Ao telemóvel passa a ir no máximo **768**: −69 % dos bytes, com a fotografia
 * ainda a 1,86 de densidade efectiva. Quem quiser ver a fotografia a sério
 * abre-a — e aí o lightbox serve a resolução inteira, que é onde a nitidez
 * conta e onde o visitante está mesmo a olhar.
 *
 * Na secretária o tecto fica em **1024**, que dá 1,08× os píxeis físicos: aí
 * não há aperto de largura de banda que justifique perder nitidez.
 *
 * ── Porquê `<picture>` com `media`, e não só `sizes` ──────────────────────
 * Isto não se consegue dizer num `sizes`. O `sizes` descreve a LARGURA DA
 * CAIXA; quem multiplica pela densidade é o browser, e não há sintaxe para lhe
 * pedir "no máximo 2×". Mentir na percentagem (pôr 66vw numa caixa de 100vw)
 * resolvia no telemóvel e estragava tudo o resto — a DPR 1 pedia menos píxeis
 * do que a caixa tem, que é a definição de foto suave. Já esteve assim, e a
 * nota que isso deixou no código está a pedir para não se repetir.
 *
 * Com `<source media="…">` cada classe de ecrã recebe a SUA escada, com o SEU
 * tecto, e a conta do browser continua a ser a honesta dentro dela.
 */

/**
 * Larguras que a grelha oferece a um telemóvel (mosaico a 100vw). O tecto é o
 * 768 (a 16/11 subiu ao 1024 e o telemóvel pagava +150 % de bytes na galeria;
 * voltou a 17/11). Em AVIF; o WebP de reserva arredonda para 384 ou 1280.
 */
export const ESCADA_TELEMOVEL = GALLERY_WIDTHS.filter((w) => w <= 768);
/** Larguras que a grelha oferece de `sm` para cima (mosaico a 50vw / 33vw). */
export const ESCADA_ECRA_GRANDE = GALLERY_WIDTHS.filter((w) => w <= 1024);

/** O ponto onde o mosaico deixa de ocupar a largura toda (Tailwind `sm`). */
export const CORTE_TELEMOVEL = "(max-width: 639px)";

export type FormatoDaGaleria = "avif" | "webp";

/**
 * `/_img/g/<chave>-<largura>.<formato>` — o que o pré-gerador escreve.
 *
 * A largura arredonda PARA CIMA até um degrau que existe NESSE formato: o AVIF
 * tem a escada toda (`GALLERY_WIDTHS`), o WebP só a reserva
 * (`GALLERY_WEBP_WIDTHS`). Quem pedir `-1024.webp` recebe `-1280.webp` — nunca
 * um ficheiro que o pré-gerador não escreveu.
 */
export function ficheiroDaGaleria(src: string, largura: number, formato: FormatoDaGaleria): string {
  const w = formato === "webp" ? snapGalleryWebpWidth(largura) : snapGalleryWidth(largura);
  return `/_img/g/${galleryKey(src)}-${w}.${formato}`;
}

/**
 * Um `srcset` com descritores `w`, para uma escada e um formato.
 *
 * `sufixo` é o cache-buster das re-tentativas (`?r=2`). Vai em TODOS os
 * candidatos: se fosse só no `src`, a re-tentativa podia apanhar em cache
 * exactamente a resposta falhada que o srcset ainda referencia.
 */
export function srcsetDaGaleria(
  src: string,
  escada: readonly number[],
  formato: FormatoDaGaleria,
  sufixo = "",
): string {
  // Cada candidato diz a largura VERDADEIRA do seu ficheiro, e os repetidos
  // saem: na escada do WebP, 640 e 1024 caem os dois no ficheiro de 1280.
  const porFicheiro = new Map<string, string>();
  for (const w of escada) {
    const url = ficheiroDaGaleria(src, w, formato);
    const real = formato === "webp" ? snapGalleryWebpWidth(w) : snapGalleryWidth(w);
    if (!porFicheiro.has(url)) porFicheiro.set(url, `${url}${sufixo} ${real}w`);
  }
  return [...porFicheiro.values()].join(", ");
}

/**
 * A LARGURA CERTA para uma caixa, dentro de uma escada — a regra "nunca acima
 * de 2× o tamanho de exibição", escrita uma vez só.
 *
 * Um degrau acima do que a caixa precisa é inevitável (a escada é discreta e o
 * browser arredonda para cima); o que não pode acontecer é servir dois ou três
 * degraus acima, que era o caso. Esta função é a definição que o teste de
 * regressão usa para julgar uma medição real.
 */
export function larguraEsperada(larguraCss: number, escada: readonly number[]): number {
  const querido = larguraCss * 2;
  return escada.find((w) => w >= querido) ?? escada[escada.length - 1];
}

/**
 * O `sizes` de cada foto da fila do topo (`FotoDaFila` em GaleriaClient),
 * calculado da forma das fotos que lá estão — não de uma média.
 *
 * A fila tem 1, 2, 3 ou 4 fotos (a partir de 640, 768 e 1536 px) e cada uma
 * ocupa `r ÷ Σr` da largura, com r a largura ÷ altura de cada foto. Um `sizes`
 * fixo («25vw») acertava na média e errava nas outras: medido a 1440 px, uma
 * foto ao alto de 302 px recebia o ficheiro de 1024 em vez do de 640.
 *
 * Num sítio só porque o preload da página (`page.tsx`) pede o destaque com o
 * MESMO `sizes`: se divergirem, a foto descarrega-se duas vezes. As larguras em
 * que uma foto não está na fila ficam de fora (está escondida e não carrega).
 */
export function sizesDaFila(racios: number[], idx: number): string {
  const LIMITES = ["(max-width: 639px) ", "(max-width: 767px) ", "(max-width: 1535px) ", ""];
  const partes: string[] = [];
  LIMITES.forEach((limite, k) => {
    const naFila = racios.slice(0, k + 1);
    if (idx >= naFila.length) return;
    const soma = naFila.reduce((a, r) => a + r, 0);
    // Para BAIXO, a 0,1vw: arredondar para cima (27vw para uma caixa de 26,1)
    // bastava, perto de um degrau, para pedir o ficheiro seguinte — medido, 29
    // de 900 fotos da fila a 1440 px recebiam o de 1024 em vez do de 768.
    partes.push(`${limite}${Math.floor((racios[idx] / soma) * 1000) / 10}vw`);
  });
  return partes.join(", ");
}
