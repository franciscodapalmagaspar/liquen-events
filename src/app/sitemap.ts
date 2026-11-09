import type { MetadataRoute } from "next";
import { execFileSync } from "node:child_process";
import { SITE } from "@/lib/site";
import { SERVICES } from "@/lib/services-data";
import { PHOTOS } from "@/app/[lang]/(site)/galeria/photos-data";
import { POLOS, ESTILOS, caminhoPolo } from "@/lib/ads/polos";
import { galleryKey } from "@/app/[lang]/(site)/galeria/gallery-image-loader";

const base = SITE.url;

// Absolute URL for an image in /public/imagens (ASCII names only — see the
// project notes on the optimizer 400ing on accented/space filenames).
/**
 * ── AS FOTOGRAFIAS DO SITEMAP SÃO AS QUE O SITE SERVE (9/11) ─────────────
 *
 * Eram os ORIGINAIS (`/imagens/…`, 342 MB, 1 058 ficheiros) — e eram a única
 * coisa que obrigava a pôr os 1 058 em cada publicação da Vercel: nenhuma
 * página os pede (medido, página a página, com a lupa da galeria incluída);
 * o site mostra sempre as versões de `/_img/g/`, que o `pregen-gallery` gera
 * de TODOS os originais. Ela pediu menos custo de Vercel e disse «sim, faz
 * isso dos originais». O Google passa a indexar a versão de 1280 px, que é a
 * maior que o site tem.
 *
 * O `scripts/so-originais-precisos.mjs` tira das publicações os originais a
 * que já nada se refere. Os que o código cita (OG, anúncios, JSON-LD) ficam.
 */
export const LARGURA_DO_SITEMAP = 1280;
export const imagemDoSitemap = (src: string): string =>
  src.startsWith("/imagens/") ? `/_img/g/${galleryKey(src)}-${LARGURA_DO_SITEMAP}.webp` : src;

const img = (file: string) => `${base}${imagemDoSitemap(`/imagens/${file}`)}`;

// Absolutise a "/imagens/…"-style public path into a full URL for the sitemap.
const abs = (src: string) => (src.startsWith("http") ? src : `${base}${imagemDoSitemap(src)}`);

// Every gallery photo, as absolute URLs, so Google discovers the whole
// portfolio for Google Images (not just a hand-picked few). Google allows up
// to 1000 <image> per URL; the gallery sits comfortably under that.
const galleryImages = PHOTOS.map((p) => abs(p.src));

/**
 * Real last-modified date for a route, from the last git commit that
 * touched its source file — not `new Date()` (which would stamp every URL
 * with "right now" on every build, making lastmod meaningless as a change
 * signal). Falls back to `undefined` (lastmod omitted for that entry)
 * rather than a fabricated date if git isn't available — e.g. a shallow
 * clone or a source tree without .git — since Google explicitly treats a
 * missing lastmod as more trustworthy than a wrong one.
 */
function lastModifiedFor(sourceFile: string): Date | undefined {
  try {
    // `:(literal)` pathspec magic: the source paths contain `[lang]`, which git
    // would otherwise read as a glob character class (matching l/a/n/g, not the
    // literal directory) and never resolve — freezing every lastmod.
    const iso = execFileSync(
      "git",
      ["log", "-1", "--format=%aI", "--", `:(literal)${sourceFile}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return iso ? new Date(iso) : undefined;
  } catch {
    return undefined;
  }
}

interface RawEntry {
  path: string;
  sourceFile: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
  images?: string[];
}

export default function sitemap(): MetadataRoute.Sitemap {
  const core: RawEntry[] = [
    {
      path: "/",
      sourceFile: "src/app/[lang]/(site)/page.tsx",
      changeFrequency: "weekly",
      priority: 1.0,
      images: [
        img("JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg"),
        img("DaniGui_Adois_61.jpg"),
        img("JOAO_E_PEDRO_1Y1A3450.jpg"),
      ],
    },
    {
      path: "/servicos",
      sourceFile: "src/app/[lang]/(site)/servicos/page.tsx",
      changeFrequency: "monthly",
      priority: 0.9,
      images: [img("EW1_1408.jpg"), img("EW1_1330.jpg"), img("EW1_0697.jpg")],
    },
    {
      path: "/contacto",
      sourceFile: "src/app/[lang]/(site)/contacto/page.tsx",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // Conversion page — the quote request form.
    {
      path: "/orcamento",
      sourceFile: "src/app/[lang]/(site)/orcamento/page.tsx",
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      path: "/sobre",
      sourceFile: "src/app/[lang]/(site)/sobre/page.tsx",
      changeFrequency: "monthly",
      priority: 0.8,
      images: [img("JOAO_E_PEDRO_1Y1A3204.jpg"), img("DaniGui_Preview12.jpg")],
    },
    {
      path: "/galeria",
      sourceFile: "src/app/[lang]/(site)/galeria/page.tsx",
      changeFrequency: "weekly",
      priority: 0.7,
      // The full portfolio — every gallery photo, so Google can index them all.
      images: galleryImages,
    },
    {
      path: "/clientes",
      sourceFile: "src/app/[lang]/(site)/clientes/page.tsx",
      changeFrequency: "monthly",
      priority: 0.7,
      images: [img("EW1_1393.jpg")],
    },
    {
      path: "/privacidade",
      sourceFile: "src/app/[lang]/(site)/privacidade/page.tsx",
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      path: "/termos",
      sourceFile: "src/app/[lang]/(site)/termos/page.tsx",
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  // Landing pages das campanhas. Entram no sitemap de propósito, ainda que
  // sejam destino de tráfego PAGO: uma página que a Google já conhece e indexou
  // arranca com Índice de Qualidade melhor do que uma que ela vê pela primeira
  // vez quando o anúncio começa a servir, e o custo por clique reflecte isso.
  //
  // A PRIORIDADE É DELIBERADAMENTE BAIXA (0.5), abaixo das páginas de serviço
  // (0.85) e muito abaixo da inicial (1.0). A dona foi explícita: estas páginas
  // não podem aparecer à frente do site. O sinal de prioridade do sitemap é
  // fraco — a Google trata-o como sugestão e muitas vezes ignora-o —, mas é o
  // único que se declara aqui, e não custa nada.
  //
  // O que protege a sério é outra coisa, e está feita: os títulos destas
  // páginas foram reescritos para NÃO repetirem os das páginas de serviço.
  // A landing do Alentejo dizia "Decoração de Casamentos no Alentejo", que é
  // exactamente o título de /servicos/casamentos — duas páginas do mesmo site
  // a competir pela mesma pesquisa. Agora as regionais falam de casamentos EM
  // QUINTAS E HERDADES de cada zona, e as de serviço continuam a ser donas do
  // termo genérico.
  const campanhas: RawEntry[] = [
    ...POLOS.map((p) => ({
      path: caminhoPolo(p.slug),
      // Todo o conteúdo destas páginas vive no catálogo — não há ficheiro por
      // polo a que apontar, tal como acontece nos serviços.
      sourceFile: "src/lib/ads/polos.ts",
      changeFrequency: "monthly" as const,
      priority: 0.5,
      images: [p.hero, ...p.fotos].map(abs),
    })),
    ...ESTILOS.map((e) => ({
      path: `/casamentos/estilo/${e.slug}`,
      sourceFile: "src/lib/ads/polos.ts",
      changeFrequency: "monthly" as const,
      priority: 0.4,
      images: [e.hero, ...e.fotos].map(abs),
    })),
    {
      path: "/casamentos/destination",
      sourceFile: "src/app/[lang]/(site)/casamentos/destination/page.tsx",
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const services: RawEntry[] = SERVICES.map((s) => ({
    path: `/servicos/${s.slug}`,
    // All service content (copy, hero, gallery, FAQs) lives in this single
    // shared data file — there's no per-slug source file to point at.
    sourceFile: "src/lib/services-data.ts",
    changeFrequency: "monthly",
    priority: 0.85,
    // Hero + the service's supporting gallery, so each service page surfaces
    // its own set of photos in Google Images.
    images: [s.hero, ...s.gallery].map(abs),
  }));

  // Each language version gets its own <url> entry (not just an hreflang
  // annotation on the PT one) — Google's documented pattern for sitemaps
  // with alternate-language pages — with both entries listing the full
  // reciprocal set, including themselves.
  return [...core, ...services, ...campanhas].flatMap((entry): MetadataRoute.Sitemap => {
    // Home is canonical without a trailing slash (matches the <link rel=canonical>
    // and OG url), so don't emit `${base}/` for it.
    const ptUrl = entry.path === "/" ? base : `${base}${entry.path}`;
    const enUrl = entry.path === "/" ? `${base}/en` : `${base}/en${entry.path}`;
    const lastModified = lastModifiedFor(entry.sourceFile);
    // PT is the default/canonical language → x-default points at it, mirroring
    // the hreflang set in the page <head>.
    const alternates = { languages: { "pt-PT": ptUrl, en: enUrl, "x-default": ptUrl } };
    const shared = {
      lastModified,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
      images: entry.images,
      alternates,
    };
    return [
      { url: ptUrl, ...shared },
      { url: enUrl, ...shared },
    ];
  });
}
