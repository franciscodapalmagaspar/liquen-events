import type { Metadata } from "next";
import TrackedLink from "@/components/TrackedLink";
import FAQ from "./FAQ";
import AnimateIn from "@/components/AnimateIn";
import { staggerMs } from "@/lib/motion/tokens";
import SafeImage from "@/components/SafeImage";
import HeroImage from "@/components/HeroImage";
import { blurFor } from "@/lib/blur";
import { pageMetadata } from "@/lib/page-metadata";
import { BreadcrumbJsonLd, FaqJsonLd } from "@/components/JsonLd";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import Parallax from "@/components/Parallax";
import RatingBadge from "@/components/RatingBadge";
import HeroWebGL from "@/components/motion/HeroWebGL";
import { waHref } from "@/data";
import { SITE } from "@/lib/site";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";
import { OUTLINE_LIGHT_BUTTON_CLASS } from "@/lib/ui-classes";
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
    title: t.meta.contactoTitle,
    description: t.meta.contactoDescription,
    path: "/contacto",
    image: "/imagens/DJI_20250913190635_0120_D.jpg",
    keywords: ["contacto Líquen Events", "decoração de eventos"],
    ogLocale: t.meta.ogLocale,
  });
}

export default async function ContactoPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const steps = t.contacto.steps.map((s, i) => ({ step: `0${i + 1}`, ...s }));
  const tf = t.contacto.form;
  const td = t.contacto.direct;
  const heroImg = "/imagens/DJI_20250913190635_0120_D.jpg";
  // Fundos de foto para os dois CTA (com véu por cima para manter o contraste).
  const orcamentoCtaImg = "/imagens/DaniGui_JantarFesta_130.jpg";
  const whatsappCtaImg = "/imagens/Natalia e Jonathan-198.jpg";
  const stepsBgImg = "/imagens/stephanie-mizio-555.jpg";
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.contacto, path: "/contacto" }]}
      />
      {/* Same source as the visible <FAQ /> — Google requires the FAQPage
          markup to match the on-page content, in the language being served. */}
      <FaqJsonLd faqs={t.contacto.faqs} />

      {/* ── Hero ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero runs full-bleed to
          the very top behind the transparent navbar (no white strip / hairline). */}
      <section
        className="relative -mt-24 overflow-hidden"
        style={{ height: "65svh", minHeight: "420px" }}
      >
        <Parallax speed={0.14} className="absolute inset-0">
          <HeroImage
            src={heroImg}
            {...blurFor(heroImg)}
            alt={t.common.imageAlt.contactoHero}
            fill
            priority
            sizes="100vw"
            quality={75}
            className="object-cover hero-settle"
          />
        </Parallax>
        {/* WebGL layer over the static hero (fades in when ready; absent under
            reduced motion / no-WebGL). */}
        <HeroWebGL src={heroImg} className="absolute inset-0 h-full w-full" />
        {/* SpaceX-style: photo breathes; a small caption tucked bottom-left. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end px-6 lg:px-16 pb-14 lg:pb-20">
          <div className="max-w-7xl mx-auto w-full">
            <div className="max-w-md">
              <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {tf.heroEyebrow}
              </p>
              <h1 className="text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug">
                <TituloPalavraAPalavra texto={`${tf.heroTitleLine1} ${tf.heroTitleMoss}`} />
              </h1>
              <div className="mt-4">
                <RatingBadge
                  label={t.common.reviewsLabel}
                  ptFormat={locale === "pt"}
                  starClassName="text-gold"
                  textClassName="text-white/75"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Canais diretos + CTA para o formulário único ──
          O antigo formulário de contacto foi retirado: /orcamento é agora o
          único formulário (capta o lead para o CRM). Aqui ficam os canais
          diretos (para perguntas rápidas) e o CTA que encaminha para esse
          formulário — sem dois funis a competir. */}
      <section className="bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr]">
            {/* ── Esquerda — canais diretos ── */}
            <div className="border-b border-foreground/8 lg:border-b-0 lg:border-r py-14 lg:py-24 lg:pr-20">
              <p className="text-foreground/60 text-[10px] tracking-[0.5em] uppercase mb-12 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {tf.infoEyebrow}
              </p>

              <div className="flex flex-col divide-y divide-foreground/8 mb-10">
                {[
                  {
                    label: tf.emailLabel,
                    value: SITE.email,
                    href: `mailto:${SITE.email}`,
                    sub: tf.emailSub,
                  },
                  {
                    label: tf.phoneLabel,
                    value: SITE.phoneDisplay,
                    href: `tel:${SITE.phone}`,
                    sub: tf.phoneSub,
                  },
                  {
                    label: tf.locationLabel,
                    value: tf.locationValue,
                    href: SITE.googleBusiness,
                    sub: tf.locationSub,
                  },
                ].map((item) => (
                  <div key={item.label} className="py-6">
                    <p className="text-foreground/70 text-[10px] tracking-[0.4em] uppercase mb-2.5">
                      {item.label}
                    </p>
                    {/* `alvo-toque` + `flex items-center` no lugar do `block`.
                        MEDIDO a 375 px com toque emulado: 327×20 px cada — os
                        342×20 que a primeira espreitadela viu, à largura certa.
                        São largos e baixos, que é o pior formato possível: o
                        dedo acerta na linha e falha na altura. E são, os três,
                        o que esta página existe para dar — o email, o telefone
                        e a morada.

                        `flex` e não `block` porque o `display` do `.alvo-toque`
                        vive numa camada e QUALQUER utilitário de `display` do
                        Tailwind lhe ganha (verificado). Com `block` a caixa
                        crescia para 44 px e o texto ficava colado ao topo, com
                        a legenda de baixo a 26 px de distância. Em ponteiro
                        fino `flex items-center` desenha exactamente o mesmo que
                        `block`. */}
                    {item.href ? (
                      <a
                        href={item.href}
                        {...(item.href.startsWith("http")
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="alvo-toque !justify-start flex items-center text-foreground text-sm font-medium hover:text-moss transition-colors mb-1.5"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <p className="text-foreground text-sm font-medium mb-1.5">{item.value}</p>
                    )}
                    <p className="text-foreground/70 text-xs leading-relaxed">{item.sub}</p>
                  </div>
                ))}
              </div>

              {/* WhatsApp — canal mais rápido para uma pergunta */}
              <a
                href={waHref(t.common.whatsappPrefill)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-6 py-4 border border-foreground/15 hover:border-foreground/40 transition-colors duration-300 group mb-3"
              >
                <span className="text-moss flex-shrink-0">
                  <WhatsAppIcon className="w-4 h-4" />
                </span>
                <span className="text-[11px] tracking-[0.25em] uppercase text-foreground/60 group-hover:text-foreground transition-colors">
                  {tf.whatsappLink}
                  <span className="sr-only"> ({t.common.newWindow})</span>
                </span>
                <span
                  aria-hidden
                  className="ml-auto text-foreground/35 group-hover:text-foreground/70 transition-colors duration-300 text-sm"
                >
                  →
                </span>
              </a>

              {/* Google — Perfil de Empresa (Maps + avaliações). Reforça o
                  sinal local e dá aos clientes um caminho direto para avaliar. */}
              <a
                href={SITE.googleBusiness}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-6 py-4 border border-foreground/15 hover:border-foreground/40 transition-colors duration-300 group mb-12"
              >
                <span className="flex-shrink-0" aria-hidden>
                  <svg viewBox="0 0 24 24" className="w-4 h-4">
                    <path
                      fill="#4285F4"
                      d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.58v3h3.88c2.27-2.09 3.55-5.17 3.55-8.82z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75z"
                    />
                  </svg>
                </span>
                <span className="text-[11px] tracking-[0.25em] uppercase text-foreground/60 group-hover:text-foreground transition-colors">
                  {tf.googleLink}
                  <span className="sr-only"> ({t.common.newWindow})</span>
                </span>
                <span
                  aria-hidden
                  className="ml-auto text-foreground/35 group-hover:text-foreground/70 transition-colors duration-300 text-sm"
                >
                  →
                </span>
              </a>

              {/* Redes */}
              <div className="flex gap-7">
                {[
                  { label: "Instagram", href: SITE.instagram },
                  { label: "Facebook", href: SITE.facebook },
                  { label: "LinkedIn", href: SITE.linkedin },
                ]
                  .filter((s) => s.href)
                  .map((s) => (
                    /* `min-h-[24px]` era o mínimo da WCAG 2.5.8 e ficava-se por
                     lá: medidos a 375 px com toque emulado, 89×30 e 81×30 px.
                     `alvo-toque` leva-os aos 44 das Human Interface Guidelines,
                     que é o que este repositório fixou. O filete vai para um
                     `<span>` por dentro pela mesma razão do herói da página
                     inicial: um `border-b` desenha no fundo da caixa, e uma
                     caixa de 44 px deixava-o a pairar 7 px abaixo da palavra. */
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="alvo-toque group inline-flex items-center py-1.5 text-[11px] tracking-[0.25em] uppercase text-foreground/60 hover:text-foreground transition-colors"
                    >
                      <span className="border-b border-foreground/15 transition-colors group-hover:border-foreground/40">
                        {s.label}
                        <span className="sr-only"> ({t.common.newWindow})</span>
                      </span>
                    </a>
                  ))}
              </div>
            </div>

            {/* ── Direita — CTA para o formulário único (/orcamento) ──
                Painel com foto de um evento decorado + véu escuro por cima,
                para o texto (cream) manter contraste AA sobre a imagem. */}
            <div className="relative overflow-hidden flex flex-col justify-center py-14 px-8 md:py-20 md:px-12 lg:pl-20 lg:pr-12">
              <SafeImage
                src={orcamentoCtaImg}
                {...blurFor(orcamentoCtaImg)}
                alt=""
                aria-hidden
                fill
                sizes="(max-width: 1024px) 100vw, 60vw"
                quality={75}
                className="object-cover"
              />
              {/* Véu 100% neutro (sem tinte moss) — a foto lê-se como textura
                  escura e o cream mantém o contraste AA. */}
              <div className="absolute inset-0 bg-gradient-to-br from-ink/85 via-ink/72 to-[#0c0e0b]/70" />
              <AnimateIn>
                <div className="relative">
                  <p className="text-cream/70 text-[10px] tracking-[0.5em] uppercase mb-8 flex items-center gap-3">
                    <span className="w-6 h-px bg-gold flex-shrink-0" />
                    {td.ctaEyebrow}
                  </p>
                  <h2
                    className="text-cream font-bold uppercase tracking-display leading-[0.95] mb-8"
                    style={{
                      fontSize: "clamp(34px, 4.5vw, 60px)",
                    }}
                  >
                    {td.ctaTitleLine1}
                    <br />
                    <span className="text-gold">{td.ctaTitleMoss}</span>
                  </h2>
                  <p className="text-cream/85 text-base leading-[1.85] max-w-md mb-12">
                    {td.ctaText}
                  </p>
                  <TrackedLink
                    href={localizeHref("/orcamento", locale)}
                    trackProps={{ source: "contacto" }}
                    className={OUTLINE_LIGHT_BUTTON_CLASS}
                  >
                    {td.ctaButton} →
                  </TrackedLink>
                </div>
              </AnimateIn>
            </div>
          </div>
        </div>
      </section>

      {/* ── Image band ── */}
      <section className="bg-surface border-t border-foreground/8">
        <AnimateIn from="fade">
          <div className="grid grid-cols-3 gap-px" style={{ height: "clamp(180px, 38vw, 460px)" }}>
            {[
              {
                src: "/imagens/Natalia e Jonathan-315.jpg",
                alt: "Cerimónia de casamento ao ar livre",
              },
              {
                src: "/imagens/JOAO_E_PEDRO_1Y1A3450.jpg",
                alt: "Casamento ao pôr do sol numa herdade",
              },
              {
                src: "/imagens/M&F0658.jpg",
                alt: "Mesa posta de jantar de casamento com decoração floral",
              },
            ].map(({ src, alt }, i) => (
              <div key={src} className="relative overflow-hidden group">
                <SafeImage
                  src={src}
                  {...blurFor(src)}
                  alt={t.common.imageAlt.contactoBand[i] ?? alt}
                  fill
                  sizes="33vw"
                  quality={75}
                  className="object-cover transition-transform duration-foto-zoom group-hover:scale-[1.03]"
                />
                <div className="absolute inset-0 bg-black/25 group-hover:bg-black/10 transition-colors duration-500" />
              </div>
            ))}
          </div>
        </AnimateIn>
      </section>

      {/* ── O que acontece a seguir — sobre foto de evento, com véu escuro ── */}
      <section className="relative py-16 sm:py-28 overflow-hidden border-t border-foreground/8">
        <SafeImage
          src={stepsBgImg}
          alt=""
          fill
          sizes="100vw"
          quality={75}
          className="object-cover object-center"
          {...blurFor(stepsBgImg)}
        />
        {/* Lighter veil so the venue photo actually reads through — a moderate
            uniform tint (white text spans the whole panel) plus a soft top/bottom
            gradient for the eyebrow and final divider. */}
        {/* Wash + gradient merged (gradient listed first = on top). Same look. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(8,8,8,0.5), rgba(8,8,8,0.15), rgba(8,8,8,0.55)), linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35))",
          }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-14 flex items-center gap-3">
              <span className="w-6 h-px bg-gold flex-shrink-0" />
              {t.contacto.nextEyebrow}
            </p>
          </AnimateIn>
          <div>
            {steps.map((p, i) => (
              <AnimateIn key={p.step} delay={staggerMs(i)}>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-20 py-10 border-t border-white/15">
                  <div className="lg:col-span-1 flex items-start gap-4">
                    <span aria-hidden className="text-white/40 text-xs font-mono mt-1 tabular-nums">
                      {p.step}
                    </span>
                    <h3 className="text-white text-lg font-bold uppercase tracking-display">
                      {p.title}
                    </h3>
                  </div>
                  <p className="lg:col-span-4 text-white/75 text-sm leading-relaxed max-w-xl">
                    {p.desc}
                  </p>
                </div>
              </AnimateIn>
            ))}
            <div className="border-t border-white/15" />
          </div>
        </div>
      </section>

      {/* ── FAQ (image-backed, SpaceX-style: light text over a photo + veil) ── */}
      <section className="relative py-16 sm:py-28 border-t border-white/10 overflow-hidden">
        <SafeImage
          src="/imagens/EW1_1332.jpg"
          alt=""
          fill
          sizes="100vw"
          quality={75}
          className="object-cover object-center"
          {...blurFor("/imagens/EW1_1332.jpg")}
        />
        {/* Strong, near-flat veil — this section is text-heavy, so the photo
            reads as a dark atmospheric texture while every question stays legible. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(11,13,10,0.86), rgba(11,13,10,0.9)), linear-gradient(to right, rgba(11,13,10,0.4), transparent 60%)",
          }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-20 items-start">
              <div className="text-veil-shadow lg:sticky" style={{ top: "6rem" }}>
                <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-8 flex items-center gap-3">
                  <span className="w-6 h-px bg-gold flex-shrink-0" />
                  {t.contacto.faqEyebrow}
                </p>
                <h2 className="text-white text-4xl lg:text-5xl font-bold uppercase tracking-display leading-tight">
                  {t.contacto.faqTitleLine1}
                  <br />
                  {t.contacto.faqTitleLine2}
                </h2>
                <p className="text-white/65 text-sm leading-relaxed mt-6 max-w-xs">
                  {t.contacto.faqSub}
                </p>
              </div>
              <FAQ faqs={t.contacto.faqs} light />
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── WhatsApp CTA ──
          Foto de evento com um escurecimento cinematográfico (preto) — o mesmo
          tratamento das restantes secções finais do site, para a imagem
          respirar em vez de ficar lavada de verde. Véu totalmente neutro (o
          antigo brilho verde de canto saiu no redesign SpaceX); o texto cream
          continua a garantir contraste AA sobre o véu escuro. */}
      <section className="py-20 sm:py-32 bg-[#0c0e0b] relative overflow-hidden border-t border-white/10">
        <SafeImage
          src={whatsappCtaImg}
          {...blurFor(whatsappCtaImg)}
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          quality={75}
          className="object-cover"
        />
        {/* Text lives in the left column, so darken only the left and let the
            photo read on the right (SpaceX-style — image breathes). */}
        {/* Wash + gradient merged (gradient listed first = on top). Same look. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(8,8,8,0.85), rgba(8,8,8,0.35), transparent), linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.2))",
          }}
        />
        <div className="max-w-7xl mx-auto px-6 lg:px-16 relative">
          <AnimateIn>
            <p className="text-cream/80 text-[10px] tracking-[0.5em] uppercase mb-10 flex items-center gap-3">
              <span className="w-5 h-px bg-cream/45 flex-shrink-0" />
              {t.contacto.whatsappEyebrow}
            </p>
            <h2
              className="text-cream font-bold uppercase tracking-display leading-tight mb-6"
              style={{ fontSize: "clamp(28px, 4.2vw, 52px)" }}
            >
              {t.contacto.whatsappTitleLine1}
              <br />
              {t.contacto.whatsappTitleLine2}
            </h2>
            <p className="text-cream/85 text-base leading-relaxed max-w-md mb-12">
              {t.contacto.whatsappText}
            </p>
            <div className="flex flex-wrap gap-4">
              {/* Par de ghosts brancos (idioma SpaceX): ambos preenchem a
                  branco no hover com o texto a inverter para escuro — o ícone
                  distingue o canal principal. */}
              <a
                href={waHref(t.common.whatsappPrefill)}
                target="_blank"
                rel="noopener noreferrer"
                className={OUTLINE_LIGHT_BUTTON_CLASS}
              >
                <WhatsAppIcon className="w-4 h-4 flex-shrink-0" />
                {t.common.abrirWhatsApp} →<span className="sr-only"> ({t.common.newWindow})</span>
              </a>
              <a href={`mailto:${SITE.email}`} className={OUTLINE_LIGHT_BUTTON_CLASS}>
                {t.common.enviarEmail}
              </a>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
