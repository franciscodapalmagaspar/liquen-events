import { galleryKey } from "@/app/[lang]/(site)/galeria/gallery-image-loader";

/**
 * A versão de uma fotografia que se dá a conhecer ao Google: a de 1280 px de
 * `/_img/g/`, que é a maior que o site serve (9/11, ver `app/sitemap.ts`).
 * O sitemap e os dados estruturados da galeria leem-na daqui, para os dois
 * falarem da MESMA imagem (21/11).
 */
export const LARGURA_DO_SITEMAP = 1280;

export const imagemDoSitemap = (src: string): string =>
  src.startsWith("/imagens/") ? `/_img/g/${galleryKey(src)}-${LARGURA_DO_SITEMAP}.webp` : src;
