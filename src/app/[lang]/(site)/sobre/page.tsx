import type { Metadata } from "next";
import Link from "next/link";
import TrackedLink from "@/components/TrackedLink";
import SafeImage from "@/components/SafeImage";
import HeroImage from "@/components/HeroImage";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import Parallax from "@/components/Parallax";
import TitleReveal from "@/components/TitleReveal";
import HeroWebGL from "@/components/motion/HeroWebGL";
import Reveal from "@/components/motion/Reveal";
import { PHOTO_REVEAL_LARGE_S, staggerMs, wordCascadeEndMs } from "@/lib/motion/tokens";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";
import { OUTLINE_LIGHT_BUTTON_CLASS, VEU_DAS_PONTAS } from "@/lib/ui-classes";
import TituloPalavraAPalavra from "@/components/TituloPalavraAPalavra";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.meta.sobreTitle,
    description: t.meta.sobreDescription,
    path: "/sobre",
    // Landscape (2560×1707) — the page's own hero. The previous OG image was a
    // portrait crop, which social platforms render as a broken sliver.
    image: "/imagens/hd-edited.jpg",
    keywords: ["decoração de eventos", "sobre Líquen Events"],
    ogLocale: t.meta.ogLocale,
  });
}

const eyebrowLight =
  "text-white/70 text-[10px] tracking-[0.48em] uppercase flex items-center gap-3";

export default async function SobrePage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.sobre, path: "/sobre" }]}
      />

      {/* ── HERO ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero runs full-bleed to
          the very top behind the transparent navbar (no white strip / hairline). */}
      <section className="relative -mt-24 min-h-[100svh] flex flex-col justify-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <HeroImage
            src="/imagens/hd-edited.jpg"
            alt={t.common.imageAlt.sobreCelebration}
            fill
            priority
            sizes="100vw"
            quality={75}
            className="object-cover object-center hero-settle"
            {...blurFor("/imagens/hd-edited.jpg")}
          />
        </Parallax>
        {/* WebGL layer over the static hero (fades in when ready; absent under
            reduced motion / no-WebGL). */}
        <HeroWebGL src="/imagens/hd-edited.jpg" className="absolute inset-0 h-full w-full" />
        {/* SpaceX scrim: single bottom-anchored gradient so the photograph reads
            full at the top; no heavy flat veil. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />

        {/* Full-SpaceX hero caption: small and tucked at the bottom-left so the
            photograph owns the first screen. Still the page's single <h1>. No CTA
            on this hero, so the understated link is omitted. */}
        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-14 lg:pb-20">
          <AnimateIn>
            <div className="max-w-md">
              <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {t.sobre.heroEyebrow}
              </p>
              {/* SpaceX display tracking (.tracking-display, -0.02em) replaces the
                  airy caption tracking so the caps pull together on the h1. */}
              <h1 className="text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug">
                <TituloPalavraAPalavra texto={`${t.sobre.heroTitlePre}${t.sobre.heroTitleMoss}`} />
              </h1>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── MANIFESTO — short statement + image ── */}
      {/* overflow-x-clip contains the ~4px the from-left/right reveal transforms
          and grid rounding push past the viewport edge on mobile. */}
      <section className="relative overflow-hidden flex flex-col lg:flex-row lg:min-h-[680px]">
        <SafeImage
          src="/imagens/JOAO_E_PEDRO_IMGL2823.jpg"
          {...blurFor("/imagens/JOAO_E_PEDRO_IMGL2823.jpg")}
          alt=""
          fill
          sizes="100vw"
          // Sits under a ~84%-opaque flat dark veil (it's a texture, not a subject),
          // so quality 50 halves its decode with no perceptible change.
          quality={50}
          className="absolute inset-0 object-cover object-left"
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: "linear-gradient(rgba(8,10,8,0.72), rgba(8,10,8,0.84))" }}
        />
        {/* Left — the manifesto text over the (veiled) backdrop */}
        <div className="relative z-10 lg:w-1/2 flex items-center px-6 lg:px-16 py-20 lg:py-28">
          <AnimateIn from="left">
            <p className={`${eyebrowLight} mb-8`}>
              <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
              {t.sobre.manifestoEyebrow}
            </p>
            <h2
              className="text-white font-bold uppercase tracking-display leading-[1.05]"
              style={{ fontSize: "clamp(32px, 5vw, 68px)" }}
            >
              {t.sobre.manifestoTitleLine1}
              <br />
              <span className="text-moss">{t.sobre.manifestoTitleLine2}</span>
            </h2>
          </AnimateIn>
        </div>
        {/* Right — full-height photo, covering the centre of the backdrop (the
            cross/altar) and running top-to-bottom of the section. */}
        <div className="relative z-10 lg:w-1/2 min-h-[75vw] sm:min-h-[460px] lg:min-h-0">
          <SafeImage
            src="/imagens/DaniGui_Preview12.jpg"
            alt={t.common.imageAlt.sobrePortrait}
            fill
            sizes="(max-width: 1024px) 100vw, 50vw"
            quality={75}
            className="object-cover"
            {...blurFor("/imagens/DaniGui_Preview12.jpg")}
          />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-[#080808]/80 via-transparent to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 p-6 lg:p-8">
            <p className="text-white/75 text-[10px] tracking-[0.4em] uppercase flex items-center gap-3">
              <span className="w-8 h-px bg-gold flex-shrink-0" />
              {t.sobre.manifestoImageCaption}
            </p>
          </div>
        </div>
      </section>

      {/* ── CINEMATIC STATEMENT ── */}
      <section className="cv-panel relative overflow-hidden [--cv-h:clamp(360px,65vh,760px)]">
        <Parallax speed={0.1} className="absolute inset-0">
          <SafeImage
            src="/imagens/M&F0497.jpg"
            alt={t.common.imageAlt.sobreGolden}
            fill
            sizes="100vw"
            quality={75}
            className="object-cover object-center scale-110"
            {...blurFor("/imagens/M&F0497.jpg")}
          />
        </Parallax>
        {/* Só as pontas: o escuro que o texto pede está atrás do próprio texto
            (`.veu-texto`, globals.css). Pedido dela, 23/10: «coloca mais brilho». */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: VEU_DAS_PONTAS,
          }}
        />
        <div className="text-veil-shadow relative z-10 h-full flex items-center">
          <div className="veu-texto [--veu-recuo-cima:5rem] [--veu-recuo-baixo:5rem] lg:[--veu-recuo-cima:7rem] lg:[--veu-recuo-baixo:7rem] max-w-7xl mx-auto px-6 lg:px-16 w-full py-20 lg:py-28">
            <p
              className="text-cream font-bold uppercase tracking-display leading-[1.12] max-w-4xl"
              style={{ fontSize: "clamp(26px, 4.5vw, 64px)" }}
            >
              <TitleReveal text={t.sobre.statementLead} as="span" />{" "}
              {/* A segunda metade arranca onde a primeira acaba. Isto era uma
                  conta à mão — `…split(/\s+/).length * 50 + 80` — com o passo de
                  50 ms escrito aqui uma TERCEIRA vez, fora do componente que o
                  usa: afinar o `step` de um dos <TitleReveal> dessincronizava as
                  duas metades da frase sem nada avisar. Agora quem conta as
                  palavras é quem sabe o passo. Enquanto o tecto não morde, o
                  número é exactamente o mesmo de antes. */}
              <TitleReveal
                text={t.sobre.statementRest}
                as="span"
                className="text-cream/70"
                delay={wordCascadeEndMs(t.sobre.statementLead)}
              />
            </p>
          </div>
        </div>
      </section>

      {/* ── FOUNDER — minimal, in the site's signature idiom ── */}
      {/* Pared back to the site's own "signature" rhythm and typeface (Inter):
          gold-dash eyebrow + big uppercase display headline + a hairline +
          attribution. Just the portrait, the founder's words and her name — no
          bio paragraph, no extra lines. */}
      <section className="relative overflow-hidden">
        <SafeImage
          src="/imagens/JOAO_E_PEDRO_1Y1A4738.jpg"
          {...blurFor("/imagens/JOAO_E_PEDRO_1Y1A4738.jpg")}
          alt=""
          fill
          sizes="100vw"
          // Under a ~86%-opaque flat veil (texture, not subject) → quality 50.
          quality={50}
          className="absolute inset-0 object-cover object-center"
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{ backgroundImage: "linear-gradient(rgba(8,10,8,0.74), rgba(8,10,8,0.86))" }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 py-24 lg:py-36">
          <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-14 lg:gap-24 items-center">
            {/* Portrait — settles in with a smooth cinematic zoom (scale+fade,
                GPU-composited) instead of the clip-path wipe, which repainted and
                stuttered. loading="eager" fetches it during page load (it's small
                and properly sized) so it's already decoded when the reader scrolls
                here — no "pop-in" while the reveal plays; the blur placeholder
                covers any remaining gap. */}
            <Reveal
              as="div"
              variant="zoom"
              duration={PHOTO_REVEAL_LARGE_S}
              className="relative mx-auto w-full max-w-xs lg:max-w-none"
            >
              <div className="relative aspect-[3/4] overflow-hidden">
                <SafeImage
                  src="/imagens/catarina-gaspar.jpg"
                  alt={t.common.imageAlt.sobreFounder}
                  fill
                  loading="eager"
                  sizes="(max-width: 1024px) 80vw, 34vw"
                  quality={75}
                  className="object-cover object-[50%_18%]"
                  {...blurFor("/imagens/catarina-gaspar.jpg")}
                />
              </div>
            </Reveal>

            {/* Text — eyebrow, the founder's words, and her name. Nothing more. */}
            <div className="flex flex-col justify-center">
              <AnimateIn>
                <p className={`${eyebrowLight} mb-8`}>
                  <span className="w-8 h-px bg-gold flex-shrink-0" />
                  {t.sobre.founderEyebrow}
                </p>
                {/* Matches the Clientes page <h1> exactly: the site's small,
                    understated SpaceX caption size (18/21px). */}
                <p className="text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug">
                  {t.sobre.founderQuote}
                </p>
                <div className="mt-12 pt-6 border-t border-white/20">
                  <p className="text-white text-sm tracking-[0.15em] uppercase">
                    {t.sobre.founderName}
                  </p>
                  <p className="text-white/55 text-[11px] tracking-[0.3em] uppercase mt-1.5">
                    {t.sobre.founderRole}
                  </p>
                </div>
              </AnimateIn>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-32 lg:py-52 overflow-hidden">
        <SafeImage
          src="/imagens/DaniGui_Adois_61.jpg"
          alt={t.common.imageAlt.sobreOutdoor}
          fill
          sizes="100vw"
          quality={75}
          className="object-cover object-center"
          {...blurFor("/imagens/DaniGui_Adois_61.jpg")}
        />
        {/* Só as pontas: o escuro que o texto pede está atrás do próprio texto
            (`.veu-texto`, globals.css). Pedido dela, 23/10: «coloca mais brilho». */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: VEU_DAS_PONTAS,
          }}
        />

        <div className="text-veil-shadow veu-texto veu-texto--centro [--veu-alfa:0.76] relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/70 text-[10px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {t.sobre.ctaEyebrow}
            </p>
            <h2
              className="text-white font-bold uppercase tracking-display leading-[0.9] mb-6"
              style={{ fontSize: "clamp(30px, 5vw, 66px)" }}
            >
              {t.sobre.ctaTitleLine1}
              <br />
              <span className="text-moss-light">{t.sobre.ctaTitleMoss}</span>
            </h2>
          </AnimateIn>
          <AnimateIn delay={staggerMs(1)}>
            <p className="text-white/70 text-base leading-relaxed max-w-md mb-12">
              {t.sobre.ctaText}
            </p>
          </AnimateIn>
          <AnimateIn delay={staggerMs(2)}>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "sobre" }}
                className={OUTLINE_LIGHT_BUTTON_CLASS}
              >
                {t.common.pedirOrcamento} →
              </TrackedLink>
              <Link href={localizeHref("/contacto", locale)} className={OUTLINE_LIGHT_BUTTON_CLASS}>
                {t.common.entrarContacto}
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
