import type { Metadata } from "next";
import Link from "next/link";
import TrackedLink from "@/components/TrackedLink";
import SafeImage from "@/components/SafeImage";
import HeroImage from "@/components/HeroImage";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import { staggerMs } from "@/lib/motion/tokens";
import Parallax from "@/components/Parallax";
import HeroWebGL from "@/components/motion/HeroWebGL";
import { BreadcrumbJsonLd, ServiceJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { getDictionary, normalizeLocale, localizeHref, type Locale } from "@/lib/i18n";
import { OUTLINE_LIGHT_BUTTON_CLASS, VEU_DAS_PONTAS } from "@/lib/ui-classes";
import TituloPalavraAPalavra from "@/components/TituloPalavraAPalavra";
import { hifenizar } from "@/lib/hifenizar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.meta.servicosTitle,
    description: t.meta.servicosDescription,
    path: "/servicos",
    image: "/imagens/EW1_1330.jpg",
    keywords: [
      "decoração de casamentos",
      "coordenação de casamentos",
      "eventos corporativos",
      "decoração de eventos",
    ],
    ogLocale: t.meta.ogLocale,
  });
}

const eyebrowLight =
  "text-white/70 text-[10px] tracking-[0.52em] uppercase flex items-center gap-3";

/* ── Mosaico editorial para categorias ── */
type ServiceCard = {
  title: string;
  slug: string;
  desc: string;
  image: string;
};

type Category = {
  id: string;
  num: string;
  label: string;
  subtitle: string;
  desc: string;
  layout: "mosaic-right" | "mosaic-left" | "duo";
  band: string;
  services: ServiceCard[];
};

// Locale-independent metadata (ids, images, slugs, layout). Display text comes
// from the dictionary (t.servicos.categories) and is merged in at render time.
const categoryMeta = [
  {
    id: "celebracoes",
    num: "01",
    layout: "mosaic-left" as const,
    band: "/imagens/DaniGui_Preview20.jpg",
    services: [
      { slug: "casamentos", image: "/imagens/stephanie-mizio-760.jpg" },
      { slug: "batizados-e-comunhoes", image: "/imagens/DaniGui_JantarFesta_26.jpg" },
      { slug: "festas-e-aniversarios", image: "/imagens/JOAO_E_PEDRO_1Y1A5248.jpg" },
      { slug: "aluguer-de-viaturas-classicas", image: "/imagens/viaturas-classicas.jpg" },
    ],
  },
  {
    id: "empresas",
    num: "02",
    layout: "mosaic-right" as const,
    band: "/imagens/EW1_1333.jpg",
    services: [{ slug: "eventos-corporativos", image: "/imagens/EW1_1405.jpg" }],
  },
];

// Shared veil for every full-bleed service panel (category intros + service
// bands) so they read as ONE continuous, softly-fading sequence rather than a
// stack of separate photos. Lighter than before (bottom 0.72, not 0.90) so the
// images stay bright and the seams don't turn into a hard black band; a gentle
// 0.30 fade at the very top blends each image into the bottom of the panel above
// it — the "continuous fade between images" look, kept light.
const PANEL_VEIL =
  "linear-gradient(to top, rgba(8,8,8,0.75) 0%, rgba(8,8,8,0.20) 38%, rgba(8,8,8,0.16) 58%, rgba(8,8,8,0.55) 100%)";

/* ── Full-screen service band — one image, one service (SpaceX-style) ── */
function ServiceBand({
  service,
  cta,
  locale,
}: {
  service: ServiceCard;
  cta: string;
  locale: Locale;
}) {
  return (
    // Shorter on phones (≈46svh) so 8 stacked service bands don't become an
    // endless scroll; full cinematic height from lg up.
    <section
      // `cv-panel` (globals.css) salta a renderização enquanto a banda está
      // fora do ecrã e reserva-lhe o espaço A PARTIR DE `--cv-h` — a MESMA
      // variável que lhe dá a altura mínima. Antes eram dois valores escritos
      // à parte e o do telemóvel estava errado: a banda mede `46svh` (≈386 px)
      // e reservava `clamp(480px,60vh,680px)` (≈503 px), 117 px a mais vezes
      // oito bandas. A página encolhia debaixo do dedo na primeira descida.
      className="cv-panel relative overflow-hidden flex items-end [--cv-h:46svh] lg:[--cv-h:clamp(480px,60vh,680px)]"
    >
      <Parallax speed={0.12} className="absolute inset-0">
        <SafeImage
          src={service.image}
          alt={service.title}
          fill
          sizes="100vw"
          quality={75}
          className="object-cover object-center"
          {...blurFor(service.image)}
        />
      </Parallax>
      {/* Image-first (SpaceX-style): the photo reads fully at the top, and only
          the bottom — where the number/title/description sit — darkens enough to
          keep the white text legible. No heavy full-panel veil. */}
      <div className="absolute inset-0" style={{ backgroundImage: PANEL_VEIL }} />
      {/* A big bold uppercase headline, a one-line description, and the ghost
          outline button. The mono chapter index was removed on request. */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 pb-12 lg:pb-16">
        <AnimateIn>
          <div className="max-w-2xl">
            <h3
              className="text-veil-shadow text-white font-bold uppercase tracking-display leading-[0.95]"
              style={{ fontSize: "clamp(20px, 2.8vw, 34px)" }}
            >
              {service.title}
            </h3>
            <p className="mt-4 text-white/70 text-[12.5px] leading-[1.6] max-w-xs">
              {service.desc}
            </p>
            <Link
              href={localizeHref(`/servicos/${service.slug}`, locale)}
              // Specific accessible name so the link's purpose is clear out of
              // context (screen-reader link list) and the anchor text carries the
              // service keyword for SEO — the visible label stays minimal.
              aria-label={`${cta}: ${service.title}`}
              className={`mt-7 inline-flex items-center gap-3 ${OUTLINE_LIGHT_BUTTON_CLASS}`}
            >
              {cta} <span aria-hidden>→</span>
            </Link>
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}

export default async function ServicosPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const ts = t.servicos;
  const categories: Category[] = categoryMeta.map((m, ci) => {
    const ct = ts.categories[ci];
    return {
      id: m.id,
      num: m.num,
      layout: m.layout,
      band: m.band,
      label: ct.label,
      subtitle: ct.subtitle,
      desc: ct.desc,
      services: m.services.map((s, si) => ({
        slug: s.slug,
        image: s.image,
        title: ct.services[si].title,
        desc: ct.services[si].desc,
      })),
    };
  });
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.servicos, path: "/servicos" }]}
      />
      <ServiceJsonLd
        locale={locale}
        name={t.jsonld.servicosServiceName}
        description={t.jsonld.servicosServiceDescription}
        path="/servicos"
      />

      {/* ── HERO — full-bleed immersive ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero image runs to the
          very top behind the transparent navbar (no white strip / hairline). */}
      {/* `data-paineis-escuros`: ver «PÁGINAS FEITAS DE PAINÉIS ESCUROS» no
          globals.css — o fundo da página passa a escuro, para as frestas de
          meio píxel entre painéis não mostrarem branco. */}
      <section
        data-paineis-escuros
        className="relative -mt-24 min-h-[100svh] flex flex-col justify-end overflow-hidden"
      >
        <Parallax speed={0.14} className="absolute inset-0">
          <HeroImage
            src="/imagens/EW1_1330.jpg"
            alt={t.common.imageAlt.servicosEndOfDay}
            fill
            priority
            sizes="100vw"
            quality={75}
            className="object-cover object-center hero-settle"
            {...blurFor("/imagens/EW1_1330.jpg")}
          />
        </Parallax>
        {/* WebGL layer over the static hero (fades in when ready; absent under
            reduced motion / no-WebGL). */}
        <HeroWebGL src="/imagens/EW1_1330.jpg" className="absolute inset-0 h-full w-full" />
        {/* Two hero veils merged into one layer (former upper div first, as
            multiple backgrounds paint first-listed on top). Same pixels. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "linear-gradient(to right, rgba(0,0,0,0.15), transparent)",
          }}
        />

        {/* Full-SpaceX hero caption: small and tucked at the bottom-left so the
            photograph owns the first screen. Still the page's single <h1>. */}
        <div className="veu-texto veu-texto--esquerda [--veu-recuo-baixo:3.5rem] lg:[--veu-recuo-baixo:5rem] relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-14 lg:pb-20">
          <AnimateIn>
            <div className="max-w-md">
              <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {ts.heroEyebrow}
              </p>
              <h1 className="text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug">
                <TituloPalavraAPalavra texto={ts.heroTitle.join(" ")} />
              </h1>
              <p className="mt-3 text-white/70 text-[12.5px] leading-[1.6] max-w-xs">
                {ts.heroLead}
              </p>
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "services-hero" }}
                className={`mt-7 inline-flex items-center gap-3 ${OUTLINE_LIGHT_BUTTON_CLASS}`}
              >
                {t.common.pedirOrcamento} <span aria-hidden>→</span>
              </TrackedLink>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Service categories ── */}
      {categories.map((cat) => (
        <div key={cat.id}>
          {/* Category intro — full-screen cinematic panel (SpaceX-style):
              one image, one message. The light editorial header was dropped so
              the page reads as a sequence of immersive full-bleed panels. */}
          <section
            id={cat.id}
            className="cv-panel relative overflow-hidden scroll-mt-[60px] flex items-end [--cv-h:clamp(500px,80vh,820px)]"
          >
            <Parallax speed={0.12} className="absolute inset-0">
              <SafeImage
                src={cat.band}
                alt={cat.label}
                fill
                sizes="100vw"
                quality={75}
                className="object-cover object-center"
                {...blurFor(cat.band)}
              />
            </Parallax>
            <div className="absolute inset-0" style={{ backgroundImage: PANEL_VEIL }} />
            {/* The descriptive sentence IS the headline now — the uppercase
                category label and the ghost "Ver detalhes" button were dropped
                so the panel reads as a single elegant statement. Navigation into
                the category still happens via the service bands below, each with
                its own link. Rendered in the serif display face, sentence case
                (a full sentence uppercased at display size reads shouty). */}
            <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-12 lg:pb-16">
              <AnimateIn>
                <div className="max-w-2xl">
                  {/* Same lettering as the Clientes hero title: the compact
                      SpaceX caption size (text-[18px] sm:text-[21px]), not the
                      large section-heading size. */}
                  <h2 className="text-veil-shadow text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug max-w-md">
                    {cat.desc}
                  </h2>
                </div>
              </AnimateIn>
            </div>
          </section>

          {/* Service bands — one full-screen panel per service */}
          {cat.services.map((s, i) => (
            <ServiceBand key={`${cat.id}-${i}`} service={s} cta={ts.verMais} locale={locale} />
          ))}
        </div>
      ))}

      {/* ── Cinematic statement (where we work) — full-screen, matches panels ── */}
      <section className="cv-panel relative overflow-hidden [--cv-h:clamp(560px,90vh,900px)]">
        <SafeImage
          src="/imagens/J&A-68.jpg"
          alt={t.common.imageAlt.servicosCeremony}
          fill
          sizes="100vw"
          quality={75}
          className="object-cover object-center"
          {...blurFor("/imagens/J&A-68.jpg")}
        />
        {/* Só as pontas: o escuro que o texto pede está atrás do próprio texto
            (`.veu-texto`, globals.css). Pedido dela, 23/10: «coloca mais brilho». */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: VEU_DAS_PONTAS,
          }}
        />
        <div className="text-veil-shadow relative z-10 h-full flex items-center">
          <div className="veu-texto veu-texto--esquerda [--veu-alfa:0.72] [--veu-recuo-cima:5rem] [--veu-recuo-baixo:5rem] lg:[--veu-recuo-cima:7rem] lg:[--veu-recuo-baixo:7rem] max-w-7xl mx-auto px-6 lg:px-16 w-full py-20 lg:py-28">
            <AnimateIn>
              <p className={`${eyebrowLight} mb-7`}>
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {ts.seoEyebrow}
              </p>
              <h2
                className="text-cream font-bold uppercase tracking-display leading-[1.06] mb-6 max-w-3xl"
                style={{ fontSize: "clamp(26px, 3.6vw, 52px)" }}
              >
                {ts.seoTitle}
              </h2>
              <p className="text-cream/75 text-sm lg:text-base leading-[1.8] max-w-xl text-left text-pretty sm:text-justify hyphens-auto">
                {hifenizar(ts.seoText, locale)}
              </p>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── CTA — full-screen closing panel ── */}
      <section
        // O `py-28 lg:py-40` mudou-se daqui para o bloco de conteúdo. O
        // `contain-intrinsic-size` é o tamanho da caixa de CONTEÚDO: com o
        // padding aqui, o painel saltado media 560+224 px e o desenhado 560 px,
        // e a página encolhia 224 px ao passar por ele. O conteúdo continua
        // centrado na secção, por isso o aspecto é o mesmo.
        className="cv-panel relative overflow-hidden flex items-center [--cv-h:clamp(560px,90vh,900px)]"
      >
        <SafeImage
          src="/imagens/M&F0497.jpg"
          alt={t.common.imageAlt.servicosEvening}
          fill
          sizes="100vw"
          quality={75}
          className="object-cover object-center"
          {...blurFor("/imagens/M&F0497.jpg")}
        />
        {/* Só as pontas: o escuro que o texto pede está atrás do próprio texto
            (`.veu-texto`, globals.css). Pedido dela, 23/10: «coloca mais brilho». */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: VEU_DAS_PONTAS,
          }}
        />

        <div className="text-veil-shadow veu-texto veu-texto--centro [--veu-alfa:0.76] [--veu-recuo-cima:7rem] [--veu-recuo-baixo:7rem] lg:[--veu-recuo-cima:10rem] lg:[--veu-recuo-baixo:10rem] relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 py-28 lg:py-40 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/70 text-[10px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {ts.ctaEyebrow}
            </p>
            <h2
              className="text-white font-bold uppercase tracking-display leading-[0.9] mb-6"
              style={{ fontSize: "clamp(32px, 5.5vw, 74px)" }}
            >
              {ts.ctaTitleLine1}
              <br />
              <span className="text-moss-light">{ts.ctaTitleMoss}</span>
            </h2>
          </AnimateIn>
          <AnimateIn delay={staggerMs(1)}>
            <p className="text-white/75 text-base leading-relaxed max-w-md mb-12">{ts.ctaText}</p>
          </AnimateIn>
          <AnimateIn delay={staggerMs(2)}>
            <div className="flex flex-wrap gap-4 justify-center">
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "services-cta" }}
                className={`inline-flex items-center gap-3 ${OUTLINE_LIGHT_BUTTON_CLASS}`}
              >
                {t.common.pedirOrcamento} →
              </TrackedLink>
              <Link href={localizeHref("/galeria", locale)} className={OUTLINE_LIGHT_BUTTON_CLASS}>
                {ts.ctaGaleria}
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
