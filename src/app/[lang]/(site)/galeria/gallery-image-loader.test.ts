import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  GALLERY_WEBP_WIDTHS,
  GALLERY_WIDTHS,
  GALLERY_QUALITY,
  galleryKey,
  snapGalleryWidth,
  galleryImageUrl,
  galleryImageLoader,
} from "./gallery-image-loader";
import { PHOTOS } from "./photos-data";
import TILE_COLORS from "./tile-colors.json";
import nextConfig from "../../../../../next.config";

const ROOT = path.join(__dirname, "..", "..", "..", "..", "..");
const PREGEN_SCRIPT = readFileSync(path.join(ROOT, "scripts", "pregen-gallery.mjs"), "utf8");

describe("gallery-image-loader: a grelha não depende do optimizador", () => {
  it("devolve sempre um ficheiro estático para as fotos da galeria", () => {
    // O WebP só existe em 384 e 1280 (16/11): 640 sobe ao ficheiro de 1280.
    const url = galleryImageLoader({ src: "/imagens/EW1_1330.jpg", width: 640, quality: 65 });
    expect(url).toBe("/_img/g/EW1_1330-1280.webp");
    expect(url).not.toContain("/_next/image");
  });

  it("qualquer outra origem recebe o ficheiro original, NUNCA o optimizador", () => {
    // Este ramo mandava a origem inesperada para o `/_next/image`, e o
    // comentário dizia que assim se evitava um 404. Passou a garanti-lo: desde
    // que `next.config.ts` declara um `loaderFile`, o optimizador responde 404
    // a TUDO — `next-server.js` faz `render404` mal veja
    // `images.loader !== 'default'`, antes de olhar para os parâmetros. Medido:
    // 200 com o carregador por omissão, 404 com o nosso.
    //
    // O original é maior por não ser redimensionado, mas existe. É a mesma
    // troca que o <GalleryImage> faz quando uma miniatura falha: uma fotografia
    // pesada vale mais do que nenhuma fotografia.
    const url = galleryImageLoader({ src: "/logos/x.png", width: 640, quality: 50 });
    expect(url).toBe("/logos/x.png");
    expect(url).not.toContain("/_next/image");
  });

  it("a chave é o basename saneado (e não colide entre as 427 fotos)", () => {
    expect(galleryKey("/imagens/20_10_2025_0044.jpg")).toBe("20_10_2025_0044");
    expect(galleryKey("/imagens/foto com espaço.jpeg")).toBe("foto_com_espa_o");

    const keys = new Map<string, string>();
    for (const p of PHOTOS) {
      const k = galleryKey(p.src);
      expect(keys.has(k), `colisão de chave "${k}": ${keys.get(k)} e ${p.src}`).toBe(false);
      keys.set(k, p.src);
    }
    expect(keys.size).toBe(PHOTOS.length);
  });

  it("arredonda a largura PARA CIMA e satura no topo da escada", () => {
    expect(snapGalleryWidth(1)).toBe(384);
    expect(snapGalleryWidth(384)).toBe(384);
    expect(snapGalleryWidth(385)).toBe(640);
    expect(snapGalleryWidth(1024)).toBe(1024);
    expect(snapGalleryWidth(1281)).toBe(1280);
    expect(snapGalleryWidth(4096)).toBe(1280);
    // Nunca serve uma imagem MAIS PEQUENA do que a pedida (a não ser no topo,
    // onde já é maior do que qualquer miniatura precisa de ser).
    for (const w of [100, 300, 500, 700, 900, 1100, 1279]) {
      expect(snapGalleryWidth(w)).toBeGreaterThanOrEqual(w);
    }
  });

  it("a escada é um SUBCONJUNTO das larguras que o next/image pede", () => {
    // Foi isto que custou +63% de bytes na primeira tentativa: com a escada
    // [384,640,960,1280], o browser escolhia o candidato de 1024w (que existe
    // no srcset) e o loader, não tendo 1024, subia para o ficheiro de 1280 —
    // 48 de 48 mosaicos a 175KB em vez de ~107KB. O next/image só emite
    // candidatos de deviceSizes ∪ imageSizes, por isso cada largura da escada
    // TEM de estar lá.
    const allSizes = new Set([
      ...(nextConfig.images?.deviceSizes ?? []),
      ...(nextConfig.images?.imageSizes ?? []),
    ]);
    for (const w of GALLERY_WIDTHS) {
      expect(allSizes.has(w), `${w} não existe em deviceSizes/imageSizes`).toBe(true);
    }
  });

  it("a escada está ordenada (o `find` do snap depende disso)", () => {
    const sorted = [...GALLERY_WIDTHS].sort((a, b) => a - b);
    expect([...GALLERY_WIDTHS]).toEqual(sorted);
  });

  it("o URL é o que o script de pré-geração escreve", () => {
    expect(galleryImageUrl("/imagens/DaniGui_Preview20.jpg", 800)).toBe(
      "/_img/g/DaniGui_Preview20-1280.webp",
    );
    expect(galleryImageUrl("/imagens/DaniGui_Preview20.jpg", 200)).toBe(
      "/_img/g/DaniGui_Preview20-384.webp",
    );
    expect(PREGEN_SCRIPT).toContain('path.join(PUBLIC, "_img", "g")');
    // O nome do ficheiro passou a ter o formato como variável (`.${f.ext}`),
    // porque a escada emite AVIF **e** WebP. O que este teste prende continua a
    // ser o mesmo: que o padrão escrito pelo script é o padrão que o loader
    // constrói — chave, traço, largura, ponto, extensão.
    expect(PREGEN_SCRIPT).toContain("`${chave}-${w}.${f.ext}`");
  });

  it("o script gera as duas famílias, e o WebP continua a ser uma delas", () => {
    // O AVIF é a que vai à frente na negociação; o WebP é a rede de segurança
    // para quem não o souber ler. Perder o WebP daqui seria deixar esses
    // visitantes sem fotografia nenhuma — e o loader continua a apontar para
    // `.webp` no `<img>` de recurso.
    const bloco = PREGEN_SCRIPT.match(/const FORMATOS = \[([\s\S]*?)\];/);
    expect(bloco, "não encontrei `const FORMATOS = [...]` no script").not.toBeNull();
    expect(bloco![1]).toContain('ext: "webp"');
    expect(bloco![1]).toContain('ext: "avif"');
  });

  it("larguras e qualidade estão em sincronia com scripts/pregen-gallery.mjs", () => {
    // O script é .mjs e não pode importar este módulo TS, por isso duplica as
    // constantes. Se as duas cópias divergirem, o loader passa a apontar para
    // ficheiros que ninguém gerou — e a galeria cai toda no fallback pesado.
    const widths = PREGEN_SCRIPT.match(/^const WIDTHS = \[([^\]]+)\];$/m);
    expect(widths, "não encontrei `const WIDTHS = [...]` no script").not.toBeNull();
    expect(widths![1].split(",").map((s) => Number(s.trim()))).toEqual([...GALLERY_WIDTHS]);
    const webp = PREGEN_SCRIPT.match(/^const WEBP_WIDTHS = \[([^\]]+)\];$/m);
    expect(webp, "não encontrei `const WEBP_WIDTHS = [...]` no script").not.toBeNull();
    expect(webp![1].split(",").map((s) => Number(s.trim()))).toEqual([...GALLERY_WEBP_WIDTHS]);
    // E cada formato percorre a SUA escada.
    expect(PREGEN_SCRIPT).toMatch(/ext: "webp", larguras: WEBP_WIDTHS/);
    expect(PREGEN_SCRIPT).toMatch(/ext: "avif",\s+larguras: WIDTHS/);

    const quality = PREGEN_SCRIPT.match(/^const QUALITY = (\d+);$/m);
    expect(quality, "não encontrei `const QUALITY = N` no script").not.toBeNull();
    expect(Number(quality![1])).toBe(GALLERY_QUALITY);
  });

  it("a função de chave do script é a mesma que a daqui", () => {
    const fn = PREGEN_SCRIPT.match(/function galleryKey\(src\) \{([\s\S]*?)\n\}/);
    expect(fn, "não encontrei galleryKey() no script").not.toBeNull();
    const scriptKey = new Function("src", fn![1]) as (s: string) => string;
    for (const src of [
      "/imagens/EW1_1330.jpg",
      "/imagens/foto com espaço.jpeg",
      "/imagens/428708341-abc-n.jpg",
      "/imagens/José & Ana (1).jpg",
    ]) {
      expect(scriptKey(src)).toBe(galleryKey(src));
    }
  });
});

describe("tile-colors.json: nenhum mosaico fica sem cor", () => {
  it("as 427 fotos têm cor, e é um #rrggbb válido", () => {
    // O ficheiro é gerado por scripts/pregen-gallery.mjs e VERSIONADO (como
    // src/lib/blur-map.json), para o typecheck e os testes funcionarem numa
    // árvore acabada de clonar. Uma foto sem cor volta a ser o rectângulo liso
    // que se quer eliminar — e como o blur só vai para as 48 primeiras, seria
    // um buraco visível.
    const semCor = PHOTOS.filter(
      (p) => !/^#[0-9a-f]{6}$/.test((TILE_COLORS as Record<string, string>)[p.src] ?? ""),
    ).map((p) => p.src);
    expect(semCor.slice(0, 10)).toEqual([]);
    expect(semCor).toHaveLength(0);
  });

  it("não tem entradas a mais (fotos que já saíram da galeria)", () => {
    const conhecidas = new Set(PHOTOS.map((p) => p.src));
    const orfas = Object.keys(TILE_COLORS).filter((k) => !conhecidas.has(k));
    expect(orfas).toEqual([]);
  });
});

/**
 * Guarda de integração: depois de `npm run pregen` (ou de um build), TODAS as
 * fotos têm TODAS as larguras. É o invariante de que depende a promessa "todas
 * as fotos carregam" — uma que falte cai no ficheiro original, pesado.
 *
 * Só corre quando a pasta existe: um `vitest run` numa árvore acabada de clonar
 * não deve falhar por não ter corrido o build. O próprio script já falha o
 * build se alguma foto não puder ser gerada.
 */
const OUT_DIR = path.join(ROOT, "public", "_img", "g");
describe.skipIf(!existsSync(OUT_DIR))("miniaturas pré-geradas presentes", () => {
  it("as fotos da galeria têm o AVIF em cada degrau e o WebP em 384 e 1280", () => {
    const missing: string[] = [];
    for (const p of PHOTOS) {
      for (const [formato, escada] of [
        ["avif", GALLERY_WIDTHS],
        ["webp", GALLERY_WEBP_WIDTHS],
      ] as const) {
        for (const w of escada) {
          const f = path.join(OUT_DIR, `${galleryKey(p.src)}-${w}.${formato}`);
          if (!existsSync(f)) missing.push(path.basename(f));
        }
      }
    }
    expect(missing.slice(0, 10)).toEqual([]);
    expect(missing).toHaveLength(0);
  });
});
