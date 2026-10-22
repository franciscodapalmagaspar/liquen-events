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
import ClientLogoGrid from "@/components/ClientLogoGrid";
import ClientMarquee from "@/components/ClientMarquee";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { clientLogos } from "@/data";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";
import { OUTLINE_LIGHT_BUTTON_CLASS } from "@/lib/ui-classes";
import RotatingPhotoGrid from "@/components/RotatingPhotoGrid";
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
    title: t.meta.clientesTitle,
    description: t.meta.clientesDescription,
    path: "/clientes",
    image: "/imagens/EW1_1393.jpg",
    keywords: ["clientes Líquen Events", "empresa de decoração de eventos"],
    ogLocale: t.meta.ogLocale,
  });
}

const eyebrow =
  "text-foreground/68 text-[10px] tracking-[0.48em] uppercase flex items-center gap-3";

// O mosaico sorteia 7 desta lista a cada entrada na página (ver
// RotatingPhotoGrid). TODAS TÊM DE SER EM PAISAGEM, e isso não é preferência:
// as células são largas e a imagem é `object-cover`, portanto uma fotografia
// em retrato é cortada a uma FAIXA ESTREITA do meio — perde-se o enquadramento
// e o que fica raramente se percebe.
//
// O comentário aqui dizia "Landscape event frames" e quatro das catorze eram
// retrato (r=0.67): EW1_1408, JOAO_E_PEDRO_1Y1A3439, 428694133-… e
// JOAO_E_PEDRO_1Y1A3204. A afirmação estava escrita, não verificada — e a
// célula grande da esquerda mostrava uma mancha irreconhecível por causa disso.
// Agora há um teste que MEDE os ficheiros (mosaico.paisagem.test.ts).
const MOSAIC_POOL = [
  "/imagens/PJ-5396.jpg",
  "/imagens/DaniGui_Preview20.jpg",
  "/imagens/stephanie-mizio-523.jpg",
  "/imagens/stephanie-mizio-558.jpg",
  "/imagens/M&F0512.jpg",
  "/imagens/Sophia&Artur_MAINOVA-889.jpg",
  "/imagens/hd-edited.jpg",
  "/imagens/EW1_1330.jpg",
  "/imagens/J&P-IMGL4769.jpg",
  "/imagens/EW1_1404.jpg",
  "/imagens/teresinhaeze-909.jpg",
  "/imagens/matilde-e-tomas27.jpg",
  "/imagens/DJI_20250913190635_0120_D.jpg",
  "/imagens/stephanie-mizio-555.jpg",
];

// The mosaic is a 2-col grid below `md` and a 12-col grid from `md` (768px) up,
// full-bleed (no max-width wrapper). So each cell's real rendered width is its
// share of the viewport: on mobile 100vw when it spans both columns, else 50vw;
// from md its column span as a fraction of 12 (span/12 of 100vw, no px cap).
//
// ESTES NÚMEROS FORAM MEDIDOS, não deduzidos. No build de produção a 1440px e
// DPR 1, com o `getBoundingClientRect()` de cada célula contra o ficheiro que o
// browser foi buscar (`currentSrc`):
//
//   célula    caixa real   quota real   declarado   ficheiro escolhido
//   span-5      600,0 px    41,67vw       42vw      …-640.webp
//   span-7      840,0 px    58,33vw       59vw      …-1024.webp / …-1080.webp
//   span-4      480,0 px    33,33vw       34vw      …-640.webp
//   span-3      360,0 px    25,00vw       25vw      …-384.webp
//
// Ou seja: o `sizes` já descreve a caixa, com uma folga de 0,7 pontos no
// máximo, e sempre PARA CIMA (declarar a menos desfocava; declarar a mais só
// custaria um degrau, e aqui nem isso acontece). Não há bytes a ganhar a mexer
// nestes valores — está medido, e o que se ganharia era zero.
//
// O QUE AINDA FICA GORDO, e não é o `sizes`: uma fotografia que esteja em
// `HERO_SOURCES` (src/lib/hero-image-loader.ts) usa a ESCADA DOS HERÓIS
// (640/1080/1536/2048) mesmo dentro de uma célula pequena, porque a decisão é
// da ORIGEM e não de quem chama. Como essa escada não tem degrau abaixo de 640,
// uma célula de 360 px recebe o ficheiro de 640 px em vez do de 384 px da
// escada das fotos comuns — medido: `DJI_…-640.webp` (51,8 KB) numa caixa de
// 360 px, onde `-384` chegaria. Seis das catorze fotos deste conjunto são
// origens de herói, portanto isto acontece em cerca de metade das entradas.
// A correcção é acrescentar um degrau de 384 a `HERO_WIDTHS` — nas DUAS listas
// (o carregador e scripts/pregen-heroes.mjs) — e não neste ficheiro.
const MOSAIC_5 = "(max-width: 767px) 100vw, 42vw"; // md:col-span-5, wide on mobile
const MOSAIC_7 = "(max-width: 767px) 100vw, 59vw"; // md:col-span-7, wide on mobile
const MOSAIC_4 = "(max-width: 767px) 50vw, 34vw"; // md:col-span-4, one mobile column
const MOSAIC_3 = "(max-width: 767px) 50vw, 25vw"; // md:col-span-3, one mobile column
const MOSAIC_CELLS = [
  { cls: "col-span-2 md:col-span-5 md:row-span-2", sizes: MOSAIC_5 },
  { cls: "md:col-span-4 md:row-span-1", sizes: MOSAIC_4 },
  { cls: "md:col-span-3 md:row-span-1", sizes: MOSAIC_3 },
  { cls: "md:col-span-4 md:row-span-1", sizes: MOSAIC_4 },
  { cls: "md:col-span-3 md:row-span-1", sizes: MOSAIC_3 },
  { cls: "col-span-2 md:col-span-7 md:row-span-1", sizes: MOSAIC_7 },
  { cls: "col-span-2 md:col-span-5 md:row-span-1", sizes: MOSAIC_5 },
];

export default async function ClientesPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const testimonials = t.clientes.testimonials;
  const introImg = "/imagens/EW1_1404.jpg";
  const wordsImg = "/imagens/stephanie-mizio-555.jpg";
  const mosaicPool = MOSAIC_POOL.map((src) => ({ src, blurDataURL: blurFor(src).blurDataURL }));
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.clientes, path: "/clientes" }]}
      />

      {/* ── HERO ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero runs full-bleed to
          the very top behind the transparent navbar (no white strip / hairline). */}
      <section className="relative -mt-24 min-h-[100svh] flex flex-col justify-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <HeroImage
            src="/imagens/EW1_1393.jpg"
            alt={t.common.imageAlt.clientesCorporate}
            fill
            priority
            sizes="100vw"
            quality={75}
            className="object-cover object-center hero-settle"
            {...blurFor("/imagens/EW1_1393.jpg")}
          />
        </Parallax>
        {/* WebGL layer over the static hero (fades in when ready; absent under
            reduced motion / no-WebGL). */}
        <HeroWebGL src="/imagens/EW1_1393.jpg" className="absolute inset-0 h-full w-full" />
        {/* Two hero veils merged into one layer (former upper div listed first,
            since multiple backgrounds paint first-listed on top). Same pixels,
            one paint/composite pass. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(0,0,0,0.3), transparent), linear-gradient(to top, rgba(8,8,8,0.92), rgba(8,8,8,0.25), transparent)",
          }}
        />

        {/* Full-SpaceX hero caption: small and tucked at the bottom-left so the
            photograph owns the first screen. Still the page's single <h1>. */}
        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-14 lg:pb-20">
          <AnimateIn>
            <div className="max-w-md">
              <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {t.clientes.heroEyebrow}
              </p>
              <h1 className="text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug">
                <TituloPalavraAPalavra
                  texto={`${t.clientes.heroTitleLine1} ${t.clientes.heroTitleMoss}`}
                />
              </h1>
              <p className="mt-3 text-white/70 text-[12.5px] leading-[1.6] max-w-xs">
                {t.clientes.heroLead}
              </p>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <ClientMarquee />

      {/* ── LEAD STATEMENT ── */}
      <section className="relative py-28 lg:py-36 overflow-hidden border-b border-foreground/8">
        <SafeImage
          src={introImg}
          alt=""
          fill
          sizes="100vw"
          quality={75}
          className="object-cover object-center"
          {...blurFor(introImg)}
        />
        {/* Wash + gradient merged (gradient listed first = on top). Same look. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgb(8,8,8), transparent, rgba(8,8,8,0.5)), linear-gradient(rgba(0,0,0,0.42), rgba(0,0,0,0.42))",
          }}
        />
        <div className="text-veil-shadow relative z-10 max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            {/* The wrapper's text-veil-shadow already carries the lift-off-photo
                shadow, so the statement needs no inline duplicate. */}
            <p
              className="text-white/90 font-bold uppercase tracking-display leading-[1.4]"
              style={{
                fontSize: "clamp(22px, 2.8vw, 36px)",
              }}
            >
              {t.clientes.leadPre}
              <span className="text-moss-light">{t.clientes.leadMoss}</span>
              {t.clientes.leadPost}
            </p>
          </AnimateIn>
        </div>
      </section>

      {/* ── CLIENT LOGOS ── */}
      <section className="py-24 lg:py-32 bg-surface border-b border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14">
            <AnimateIn>
              <p className={`${eyebrow} mb-4`}>
                <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
                {t.clientes.logosEyebrow}
              </p>
              <h2
                className="text-foreground font-bold uppercase tracking-display leading-[1.05]"
                style={{ fontSize: "clamp(28px, 3.4vw, 44px)" }}
              >
                {t.clientes.logosTitle}
              </h2>
            </AnimateIn>
          </div>
          <AnimateIn delay={staggerMs(2)}>
            <ClientLogoGrid clients={clientLogos} />
          </AnimateIn>
        </div>
      </section>

      {/* ── TESTIMONIALS GRID ── */}
      <section className="relative py-24 lg:py-28 overflow-hidden">
        <SafeImage
          src={wordsImg}
          alt=""
          fill
          sizes="100vw"
          quality={75}
          className="object-cover object-center"
          {...blurFor(wordsImg)}
        />
        {/* Wash + gradient merged (gradient listed first = on top). Same look. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgb(8,8,8), transparent, rgba(8,8,8,0.5)), linear-gradient(rgba(0,0,0,0.42), rgba(0,0,0,0.42))",
          }}
        />
        <div className="text-veil-shadow relative z-10 max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn className="mb-14">
            <h2
              className="text-white font-bold uppercase tracking-display leading-[1.05]"
              style={{ fontSize: "clamp(28px, 3.4vw, 44px)" }}
            >
              {t.clientes.gridTitle}
            </h2>
          </AnimateIn>

          {/* Testemunhos planos — texto branco directamente sobre a foto+véu,
              separados por réguas finas (a mesma linguagem do FAQ-sobre-foto do
              contacto): sem cartões fumados nem aspas decorativas. */}
          <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-16 border-b border-white/12">
            {testimonials.map((item, i) => (
              <AnimateIn key={item.name} delay={staggerMs(i)} className="h-full">
                <figure className="h-full flex flex-col py-9 lg:py-10 border-t border-white/12">
                  <blockquote
                    className="text-cream/85 uppercase tracking-display leading-[1.55] flex-1"
                    style={{
                      fontSize: "clamp(16px, 1.7vw, 19px)",
                    }}
                  >
                    {item.text}
                  </blockquote>
                  <figcaption className="mt-8 flex items-center gap-4">
                    <div className="w-6 h-px bg-gold flex-shrink-0" />
                    <div>
                      <p className="text-white text-sm font-semibold">{item.name}</p>
                      <p className="text-moss-light text-[10px] mt-0.5 tracking-[0.18em] uppercase">
                        {item.event}
                      </p>
                    </div>
                  </figcaption>
                </figure>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PHOTO MOSAIC ── */}
      {/* O mosaico sangra de bordo a bordo (sem moldura max-w nem goteiras),
          à maneira SpaceX; só o eyebrow mantém a grelha de conteúdo. */}
      <section className="pt-16 lg:pt-20 bg-[#0b0b0b]">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn className="mb-10">
            <p className="text-white/70 text-[10px] tracking-[0.48em] uppercase flex items-center gap-3">
              <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
              {t.clientes.mosaicEyebrow}
            </p>
          </AnimateIn>
        </div>
        <RotatingPhotoGrid
          cells={MOSAIC_CELLS}
          pool={mosaicPool}
          alt={t.common.imageAlt.clientesCorporate}
          className="grid grid-cols-2 md:grid-cols-12 gap-0 auto-rows-[150px] md:auto-rows-auto md:grid-rows-[210px_210px_230px]"
          imgClassName="transition-transform duration-foto-zoom group-hover:scale-[1.03]"
        />
      </section>

      {/* ── CTA with background photo ── */}
      {/*
        A FOTOGRAFIA DE DRONE FICA. Foi posta em causa por ser a maior da
        página (o degrau de 1536 px pesa 282 KB) e por haver a ideia de que uma
        tomada de drone comprime 3 a 4 vezes pior do que uma fotografia normal
        e portanto seria substituível por outra qualquer em paisagem. Fui ver as
        duas coisas, e nenhuma se confirmou:

        1. NÃO É DECORATIVA. Mostra uma cerimónia real: as cadeiras em duas
           filas curvas debaixo de um pinheiro isolado, numa encosta de vinha.
           É uma fotografia identificável de um evento — trocá-la é mudar
           conteúdo, e não há nada a retirar deste sítio.

        2. NÃO É UM CASO À PARTE. Ordenando os 48 ficheiros `-1536.webp`
           pré-gerados por peso, esta é a OITAVA: à frente dela estão
           `M_F0497` (489,6 KB), `J_P-DJI_…0165_D` (316,4 KB),
           `viaturas-classicas` (310,5 KB), `J_A-68` (310,4 KB),
           `stephanie-mizio-555` (296,1 KB), `DaniGui_JantarFesta_26`
           (292,8 KB) e `EW1_1332` (284,3 KB) — e só uma dessas é de drone. A
           mediana dos 48 é 110,5 KB. O que faz um ficheiro pesar não é o
           drone, é o detalhe fino; e é geral, não desta foto.

        Como é geral, a redução também tem de ser: está em
        scripts/pregen-heroes.mjs (`effort: 6`), que corta os mesmos bytes em
        TODOS os heróis sem tocar na qualidade pedida. Baixar o `quality` foi
        medido e NÃO foi aplicado: q65 poupava mais 36 KB nesta foto mas custava
        1,35 dB de PSNR contra o original (33,78 -> 32,43 dB), e esta imagem
        também é o herói a toda a largura de /contacto, onde não há véu que a
        proteja. Os números estão no relatório.

        NOTA DE PESO, para quem vier medir /clientes: estes 282 KB são
        descarregados nesta página mesmo que ninguém chegue ao fim dela — o
        <HeroWarm> do layout pré-aquece as capas das outras cinco páginas, e
        esta é a de /contacto. Mexer no `sizes` daqui não os evita.
      */}
      <section className="relative py-36 lg:py-52 overflow-hidden">
        <SafeImage
          src="/imagens/DJI_20250913190635_0120_D.jpg"
          alt={t.common.imageAlt.clientesAerial}
          fill
          sizes="100vw"
          quality={75}
          className="object-cover object-center"
          {...blurFor("/imagens/DJI_20250913190635_0120_D.jpg")}
        />
        {/* Wash + gradient merged (gradient listed first = on top). Same look. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(8,8,8,0.9), transparent, rgba(8,8,8,0.5)), linear-gradient(rgba(0,0,0,0.48), rgba(0,0,0,0.48))",
          }}
        />

        <div className="text-veil-shadow relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/70 text-[10px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {t.clientes.ctaEyebrow}
            </p>
            <h2
              className="text-white font-bold uppercase tracking-display leading-[0.88] mb-6"
              style={{ fontSize: "clamp(34px, 6vw, 84px)" }}
            >
              {t.clientes.ctaTitleLine1}
              <br />
              {t.clientes.ctaTitleLine2}
            </h2>
          </AnimateIn>
          <AnimateIn delay={staggerMs(1)}>
            <p className="text-white/70 text-base leading-relaxed max-w-sm mb-14">
              {t.clientes.ctaText}
            </p>
          </AnimateIn>
          <AnimateIn delay={staggerMs(2)}>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "clientes" }}
                className={OUTLINE_LIGHT_BUTTON_CLASS}
              >
                {t.common.pedirOrcamento} →
              </TrackedLink>
              <Link href={localizeHref("/contacto", locale)} className={OUTLINE_LIGHT_BUTTON_CLASS}>
                {t.common.falarConnosco}
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
