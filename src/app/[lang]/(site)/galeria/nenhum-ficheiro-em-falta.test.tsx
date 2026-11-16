import { describe, it, expect } from "vitest";
import { createRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  GALLERY_WEBP_WIDTHS,
  GALLERY_WIDTHS,
  galleryImageLoader,
  galleryImageUrl,
  galleryKey,
} from "./gallery-image-loader";
import {
  ESCADA_ECRA_GRANDE,
  ESCADA_TELEMOVEL,
  ficheiroDaGaleria,
  srcsetDaGaleria,
} from "./gallery-srcset";
import GalleryImage from "./GalleryImage";
import { PHOTOS } from "./photos-data";
import siteImageLoader, { siteImageAvifUrl } from "@/lib/site-image-loader";
import { isHeroSrc } from "@/lib/hero-image-loader";
import SafeImage from "@/components/SafeImage";
import { LocaleProvider } from "@/components/LocaleProvider";
import { pickChromeDict } from "@/lib/i18n";
import { pt } from "@/lib/i18n/pt";
import {
  ESCADA_FAIXA,
  ESCADA_PAINEL,
  EntradaComFotografia,
} from "@/app/[lang]/(admin)/orcamento/admin/EntradaComFotografia";
import { LARGURA_DO_SITEMAP } from "@/app/sitemap";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUM `srcset` NEM `<picture>` PEDE UM FICHEIRO QUE O PRÉ-GERADOR NÃO ESCREVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A 16/11 a pasta `public/_img/g` emagreceu (cada publicação guarda-a
 * inteira): o 768 saiu, e o WebP ficou só em 384 e 1280, como reserva para
 * quem não lê AVIF. Um `<source type="image/webp">` a apontar para `-640.webp`
 * é um mosaico partido em todos esses browsers — e num Chromium moderno não se
 * vê, porque ele escolhe o AVIF. Daí este ficheiro: percorre TODOS os sítios
 * que montam URLs de `/_img/g/` e confere cada um contra o que
 * `scripts/pregen-gallery.mjs` escreve (cada formato na sua escada).
 */

const ROOT = path.join(__dirname, "..", "..", "..", "..", "..");
const ESCADA_DE = { avif: GALLERY_WIDTHS, webp: GALLERY_WEBP_WIDTHS } as const;

/** Todos os `/_img/g/<chave>-<w>.<formato>` dentro de um texto. */
function urlsDaGaleria(texto: string): string[] {
  return [...texto.matchAll(/\/_img\/g\/[^\s"',?)]+/g)].map((m) => m[0]);
}

/** Um URL de `/_img/g/` existe se a largura está na escada do SEU formato. */
function existe(url: string): boolean {
  const m = /^\/_img\/g\/.+-(\d+)\.(avif|webp)$/.exec(url);
  if (!m) return false;
  return (ESCADA_DE[m[2] as "avif" | "webp"] as readonly number[]).includes(Number(m[1]));
}

const LARGURAS = Array.from({ length: 4000 }, (_, i) => i + 1);
const FOTO = "/imagens/EW1_1100.jpg";

describe("as funções que montam URLs de /_img/g/", () => {
  it("ficheiroDaGaleria, em qualquer largura e nos dois formatos, só dá ficheiros que existem", () => {
    const maus = new Set<string>();
    for (const w of LARGURAS) {
      for (const f of ["avif", "webp"] as const) {
        const u = ficheiroDaGaleria(FOTO, w, f);
        if (!existe(u)) maus.add(`${f} @${w} → ${u}`);
      }
    }
    expect([...maus].slice(0, 5)).toEqual([]);
  });

  it("os carregadores do next/image (o global e o da galeria) só dão WebP de 384 ou 1280", () => {
    const maus = new Set<string>();
    for (const w of LARGURAS) {
      for (const u of [
        galleryImageUrl(FOTO, w),
        galleryImageLoader({ src: FOTO, width: w }),
        siteImageLoader({ src: FOTO, width: w }),
      ]) {
        if (!existe(u)) maus.add(`@${w} → ${u}`);
      }
      const avif = siteImageAvifUrl(FOTO, w);
      if (avif === null || !existe(avif)) maus.add(`avif @${w} → ${avif}`);
    }
    expect([...maus].slice(0, 5)).toEqual([]);
  });

  it("cada escada, em cada formato, só dá candidatos que existem, com a largura verdadeira", () => {
    for (const escada of [ESCADA_TELEMOVEL, ESCADA_ECRA_GRANDE, ESCADA_PAINEL, ESCADA_FAIXA]) {
      for (const f of ["avif", "webp"] as const) {
        const srcset = srcsetDaGaleria(FOTO, escada, f, "?r=2");
        const pares = srcset.split(", ").map((c) => c.split(" "));
        const urls = pares.map(([u]) => u.replace(/\?r=2$/, ""));
        expect(new Set(urls).size, `${f} ${escada}: candidatos repetidos`).toBe(urls.length);
        for (const [u, d] of pares) {
          const limpo = u.replace(/\?r=2$/, "");
          expect(existe(limpo), `${f} ${escada}: ${limpo}`).toBe(true);
          expect(d).toBe(`${/-(\d+)\.(?:avif|webp)$/.exec(limpo)![1]}w`);
        }
      }
    }
  });

  it("as escadas da grelha e da entrada só têm degraus do AVIF (o 768 saiu)", () => {
    for (const escada of [ESCADA_TELEMOVEL, ESCADA_ECRA_GRANDE, ESCADA_PAINEL, ESCADA_FAIXA]) {
      for (const w of escada) expect((GALLERY_WIDTHS as readonly number[]).includes(w)).toBe(true);
    }
    // Nunca menos nitidez do que antes: o tecto do telemóvel subiu de 768 para 1024.
    expect(Math.max(...ESCADA_TELEMOVEL)).toBeGreaterThanOrEqual(768);
    expect(Math.max(...ESCADA_FAIXA)).toBeGreaterThanOrEqual(768);
  });

  it("o mapa do site aponta para um WebP que existe", () => {
    expect((GALLERY_WEBP_WIDTHS as readonly number[]).includes(LARGURA_DO_SITEMAP)).toBe(true);
  });
});

describe("o HTML dos componentes que desenham fotografias de /imagens/", () => {
  const DICT = pickChromeDict(pt);
  const desenhar = (no: ReactNode) =>
    renderToStaticMarkup(
      <LocaleProvider locale="pt" dict={DICT}>
        {no}
      </LocaleProvider>,
    );

  function conferir(html: string) {
    const urls = urlsDaGaleria(html);
    expect(urls.length, "o componente não desenhou nada de /_img/g/").toBeGreaterThan(0);
    expect(urls.filter((u) => !existe(u))).toEqual([]);
  }

  it("um mosaico da galeria (GalleryImage)", () => {
    conferir(
      desenhar(
        <GalleryImage
          src="/imagens/DaniGui_Preview20.jpg"
          alt="Foto"
          sizes="33vw"
          className="object-cover"
          anchorRef={createRef<HTMLElement>()}
          unavailableLabel="Foto indisponível"
          priority
        />,
      ),
    );
  });

  it("a fotografia da entrada do back office (EntradaComFotografia)", () => {
    conferir(desenhar(<EntradaComFotografia>{null}</EntradaComFotografia>));
  });

  it.each([
    { fill: true, sizes: "100vw" },
    { fill: true, sizes: "(min-width: 1024px) 33vw, 100vw" },
    { fill: true, sizes: "72px" },
    { width: 640, height: 427 },
    { width: 300, height: 200 },
  ])("o SafeImage (%o), com o carregador global como em produção", (p) => {
    // Nos testes o `loaderFile` do next.config.ts não está ligado: passa-se o
    // carregador global à mão, para o `<img>` sair como no site.
    const html = desenhar(
      <SafeImage src={FOTO} alt="Foto" initialLoader={siteImageLoader} {...p} />,
    );
    conferir(html);
    expect(html).not.toContain("/_next/image");
    expect(html).toContain('type="image/avif"');
  });
});

describe("só três ficheiros sabem escrever um URL de /_img/g/", () => {
  /**
   * Um sítio novo que monte `/_img/g/<chave>-<w>.webp` à mão não passa pelo
   * arredondamento para os degraus que existem. Se precisar, usa
   * `ficheiroDaGaleria` ou `galleryImageUrl` — ou entra nesta lista com um
   * teste ao lado.
   */
  const AUTORIZADOS = new Set([
    "src/app/[lang]/(site)/galeria/gallery-image-loader.ts",
    "src/app/[lang]/(site)/galeria/gallery-srcset.ts",
    "src/app/sitemap.ts",
  ]);

  function ficheiros(dir: string): string[] {
    const out: string[] = [];
    for (const nome of readdirSync(dir)) {
      const p = path.join(dir, nome);
      if (statSync(p).isDirectory()) out.push(...ficheiros(p));
      else if (/\.(tsx?|mjs|js)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) out.push(p);
    }
    return out;
  }

  it("nenhum outro ficheiro de src/ monta o caminho com uma largura", () => {
    const intrusos = ficheiros(path.join(ROOT, "src"))
      .filter((f) => /`\/_img\/g\/\$\{/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
      .filter((f) => !AUTORIZADOS.has(f));
    expect(intrusos).toEqual([]);
  });
});

/**
 * E no disco, quando a pasta existe (depois de `npm run pregen` ou de um
 * build): cada candidato que as escadas da grelha e da entrada dão para cada
 * fotografia da galeria é um ficheiro que lá está.
 */
const OUT = path.join(ROOT, "public", "_img", "g");
describe.skipIf(!existsSync(OUT))("as escadas contra o disco", () => {
  it("todos os candidatos das escadas existem em public/_img/g", () => {
    const faltam: string[] = [];
    for (const p of PHOTOS) {
      if (isHeroSrc(p.src)) continue;
      for (const escada of [ESCADA_TELEMOVEL, ESCADA_ECRA_GRANDE, ESCADA_PAINEL, ESCADA_FAIXA]) {
        for (const f of ["avif", "webp"] as const) {
          for (const u of urlsDaGaleria(srcsetDaGaleria(p.src, escada, f))) {
            if (!existsSync(path.join(ROOT, "public", u))) faltam.push(u);
          }
        }
      }
      if (!existsSync(path.join(ROOT, "public", galleryImageUrl(p.src, 640)))) {
        faltam.push(galleryImageUrl(p.src, 640));
      }
    }
    expect([...new Set(faltam)].slice(0, 10)).toEqual([]);
    expect(galleryKey("/imagens/a b.jpg")).toBe("a_b");
  });
});
