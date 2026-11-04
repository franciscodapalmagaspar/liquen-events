import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import TrackedLink from "@/components/TrackedLink";
import SafeImage from "@/components/SafeImage";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import { staggerMs } from "@/lib/motion/tokens";
import Parallax from "@/components/Parallax";
import Reveal from "@/components/motion/Reveal";
import { BreadcrumbJsonLd, ServiceJsonLd, FaqJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { SERVICES, getService, quoteTipoForSlug } from "@/lib/services-data";
import { pickServiceGalleryPool } from "@/lib/service-gallery";
import GaleriaDoServico from "./GaleriaDoServico";
import { getDictionary, localizeHref, normalizeLocale } from "@/lib/i18n";
import { PRIMARY_BUTTON_CLASS, OUTLINE_LIGHT_BUTTON_CLASS, VEU_DAS_PONTAS } from "@/lib/ui-classes";
import TituloPalavraAPalavra from "@/components/TituloPalavraAPalavra";
import { hifenizar } from "@/lib/hifenizar";
import RevealText from "@/components/motion/RevealText";

/**
 * A secção de portefólio sorteia as fotos a cada desenho, por isso a página é
 * regenerada de tempos a tempos em vez de ficar congelada na compilação: quem
 * volta encontra fotografias diferentes.
 *
 * ── UMA VEZ POR DIA, E NÃO DE 30 EM 30 SEGUNDOS (22/10) ────────────────────
 *
 * Eram 30 s. Cada regeneração reescreve o HTML, o RSC e os segmentos da
 * página, em cada serviço e nas duas línguas — e foi isto que levou a conta
 * grátis da Vercel aos 258 mil «ISR Writes» de 200 mil (era a ÚNICA rota com
 * `revalidate`). Passado o limite, a Vercel BLOQUEOU todas as publicações do
 * site: nada do que entrou no `main` chegava ao ar. Ela escolheu «ficar no
 * grátis e emagrecer». Um dia mantém o baralhar (as fotos mudam de um dia
 * para o outro) com ~2 880 vezes menos escritas.
 */
export const revalidate = 86400;

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}

// Column spans (on the lg 6-col gallery grid) that give the portfolio an
// asymmetric editorial rhythm instead of a uniform contact-sheet strip: a wide
// feature, then two balanced pairs, then mirror. Each row sums to 6. On mobile
// the grid falls back to an even 2-col layout (these lg: spans don't apply).
const GALLERY_SPANS = [
  "lg:col-span-4",
  "lg:col-span-2",
  "lg:col-span-3",
  "lg:col-span-3",
  "lg:col-span-2",
  "lg:col-span-4",
];

// Highlight brand/national keywords without dangerouslySetInnerHTML: split the
// text on the keywords and render the matches as <strong>. Safe by construction
// (no HTML is ever injected), even if the source copy changes.
// Só a marca. "Portugal" estava aqui porque aparecia nos parágrafos das
// páginas de serviço e valia a pena destacá-lo; deixou de aparecer, e uma
// alternativa morta numa expressão regular é uma armadilha para quem lá
// mexer a seguir.
const EMPHASIS = /(Líquen Events)/g;
function emphasize(text: string, locale: string) {
  // Cada pedaço é hifenizado DEPOIS do corte: as frases a destacar procuram-se
  // no texto limpo, e um hífen invisível pelo meio fazia-as falhar.
  return text.split(EMPHASIS).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="text-foreground/75 font-medium">
        {hifenizar(part, locale)}
      </strong>
    ) : (
      hifenizar(part, locale)
    ),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const locale = normalizeLocale(lang);
  const svc = getService(slug, locale);
  // `robots` a acompanhar o título: sem ele, o `index, follow` que o layout de
  // raiz declara para o sítio inteiro ficava a valer para uma página que não
  // existe. MEDIDO em `/servicos/servico-que-nao-existe`: saíam DUAS etiquetas,
  // `index, follow` à frente e o `noindex` que o Next injecta atrás — duas
  // ordens contrárias na mesma resposta, e a primeira era a errada. Ver
  // `e2e/endereco-que-nao-existe.spec.ts`.
  if (!svc)
    return {
      title: locale === "en" ? "Service not found" : "Serviço não encontrado",
      robots: { index: false, follow: false },
    };
  return pageMetadata({
    locale,
    title: svc.metaTitle,
    description: svc.metaDescription,
    path: `/servicos/${svc.slug}`,
    image: svc.ogImage ?? svc.hero,
    keywords: svc.keywords,
    ogLocale: getDictionary(locale).meta.ogLocale,
  });
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const locale = normalizeLocale(lang);
  const t = getDictionary(locale);
  const svc = getService(slug, locale);
  if (!svc) notFound();

  const related = svc.related.map((r) => getService(r, locale)).filter(Boolean) as NonNullable<
    ReturnType<typeof getService>
  >[];

  // Closing CTA backdrop — a frame from this service's own gallery (falls back
  // to the hero) so the final call-to-action stays on-topic and cinematic.
  const ctaImg = svc.gallery.at(-1) ?? svc.hero;

  // Até 18 do conjunto deste serviço, sorteadas agora: as seis primeiras abrem
  // a grelha e as outras vão entrando uma de cada vez (GaleriaDoServico). A
  // lista escolhida à mão fica como recurso para os serviços que ainda não têm
  // conjunto próprio — com seis só, a grelha fica parada e a lupa abre na mesma.
  const gallery = pickServiceGalleryPool(svc.slug) ?? svc.gallery;

  // Deep-link the quote CTAs with the matching event type so a visitor arriving
  // from this service page lands with it pre-selected (see OrcamentoForm).
  const quoteTipo = quoteTipoForSlug(svc.slug);
  const orcamentoHref =
    localizeHref("/orcamento", locale) + (quoteTipo ? `?tipo=${quoteTipo}` : "");

  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[
          { name: t.nav.servicos, path: "/servicos" },
          { name: svc.title, path: `/servicos/${svc.slug}` },
        ]}
      />
      <ServiceJsonLd
        locale={locale}
        name={svc.title}
        description={svc.metaDescription}
        path={`/servicos/${svc.slug}`}
      />
      {svc.faqs.length > 0 && <FaqJsonLd faqs={svc.faqs} />}

      {/* ── Hero ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero runs full-bleed to
          the very top behind the transparent navbar (no white strip / hairline). */}
      <section className="relative -mt-24 min-h-[calc(var(--ecra)*0.7)] flex items-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <SafeImage
            src={svc.hero}
            {...blurFor(svc.hero)}
            alt=""
            fill
            priority
            sizes="100vw"
            quality={75}
            className="object-cover hero-settle"
          />
        </Parallax>
        {/* Image-first (SpaceX-style): only the bottom darkens enough to keep the
            white caption legible — no heavy full-panel veil. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 pb-14 lg:pb-20">
          {/* Full crumb trail (Início › Serviços › serviço) — mirrors the
              BreadcrumbList JSON-LD above so the visible path matches what search
              engines index, and gives the visitor two levels up, not just one. */}
          <nav
            aria-label={t.nav.breadcrumb}
            className="text-[11px] tracking-[0.2em] uppercase text-cream/60 mb-8"
          >
            {/* `alvo-toque` nos dois degraus clicáveis: mediam 47×14 e 72×14 px
                a 375 px com toque emulado — 14 px de altura, menos de um terço
                do mínimo, e são a única forma de subir um nível nesta página
                sem o botão "voltar" do browser. O último degrau não leva nada:
                é a página actual, não é um link. */}
            <ol className="flex flex-wrap items-center gap-2">
              <li>
                <Link
                  href={localizeHref("/", locale)}
                  className="alvo-toque pointer-fine:py-1.5 hover:text-cream transition-colors"
                >
                  {t.nav.inicio}
                </Link>
              </li>
              <li aria-hidden className="text-cream/30">
                ›
              </li>
              <li>
                <Link
                  href={localizeHref("/servicos", locale)}
                  className="alvo-toque pointer-fine:py-1.5 hover:text-cream transition-colors"
                >
                  {t.nav.servicos}
                </Link>
              </li>
              <li aria-hidden className="text-cream/30">
                ›
              </li>
              <li aria-current="page" className="text-cream/90 normal-case tracking-normal">
                {svc.title}
              </li>
            </ol>
          </nav>
          {/* Full-SpaceX hero caption: small and tucked at the bottom-left so the
              photograph owns the first screen. Still the page's single <h1>. */}
          <AnimateIn>
            <div className="max-w-md">
              {/* Sem sobrancelha por cima do título (ela, 2/11: «retira estas
                  coisas dos serviços, estes subtítulos»). O título chega. */}
              <h1 className="text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug">
                <TituloPalavraAPalavra texto={svc.title} />
              </h1>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Intro + includes ── */}
      <section className="py-20 lg:py-28 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-16">
          <AnimateIn>
            <div className="flex flex-col gap-6 text-foreground/72 text-[16px] leading-[1.8] text-left text-pretty sm:text-justify hyphens-auto">
              {/* Todos os parágrafos com o mesmo corpo e a mesma cor: o primeiro
                  vinha maior e mais escuro, e a mudança de tamanho a meio do
                  texto lia-se como se fossem duas coisas diferentes. */}
              {svc.intro.map((p, i) => (
                <p key={i}>{emphasize(p, locale)}</p>
              ))}
              {/* O «Pedir proposta» a seguir à introdução saiu (ela, 2/11): um
                  só por página, o do fim (`service-detail-cta`). */}
            </div>
          </AnimateIn>
          <AnimateIn delay={staggerMs(1)}>
            {/* SpaceX-style hairline SPEC LIST (not a boxed card): each includes-
                item is a ruled row divided by a 1px foreground hairline. Phrases
                stay sentence case — uppercasing the long PT descriptions reads
                shouty — but sit against the eyebrow's uppercase spec label. */}
            <div>
              <p className="text-foreground/72 text-[10px] tracking-[0.4em] uppercase mb-2 flex items-center gap-3">
                <span className="w-8 h-px bg-gold flex-shrink-0" />
                {t.servicoDetalhe.includesTitle}
              </p>
              <ul className="flex flex-col">
                {svc.includes.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-4 border-t border-foreground/12 py-3.5 text-foreground/75 text-sm leading-[1.6]"
                  >
                    {/* Squared 1px gold dash — the site's marker vocabulary
                        (same as the eyebrow dashes), centred on the first line.
                        min-w-0 lets long PT phrases wrap instead of clipping. */}
                    <span className="w-3 h-px bg-gold mt-[0.7em] flex-shrink-0" />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
                {/* Closing hairline — bookends the ruled list (matches the FAQ). */}
                <li aria-hidden className="border-t border-foreground/12" />
              </ul>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Aluguer de viaturas — cover band (weddings only) ── */}
      {svc.slug === "casamentos" && (
        <section className="cv-panel relative overflow-hidden border-t border-foreground/8 flex items-end [--cv-h:clamp(360px,60vh,640px)]">
          <SafeImage
            src="/imagens/viaturas-classicas.jpg"
            {...blurFor("/imagens/viaturas-classicas.jpg")}
            alt=""
            fill
            sizes="100vw"
            quality={75}
            className="object-cover object-center"
          />
          {/* This band's photo is brighter than the other service bands, so the
              caption needs a touch more darkening: a stronger mid-stop on the
              gradient + the veil text-shadow keep the small paragraph legible. */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/92 via-[#080808]/45 to-[#080808]/10" />
          {/* The <section> is `flex items-end`, so this caption sits at the
              bottom of the band's min-height (a bare `h-full` here wouldn't
              resolve against the section's min-height and the caption floated
              to the top, leaving the band looking empty). */}
          <div className="text-veil-shadow relative z-10 w-full">
            <div className="max-w-7xl mx-auto w-full px-6 lg:px-16 pb-12 lg:pb-16">
              <AnimateIn>
                <div className="max-w-md">
                  <p className="text-white/75 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                    <span className="w-6 h-px bg-gold flex-shrink-0" />
                    {t.servicoDetalhe.viaturasEyebrow}
                  </p>
                  <h2 className="text-white font-semibold uppercase tracking-display text-[15px] sm:text-[17px] leading-snug">
                    {t.servicoDetalhe.viaturasTitle}
                  </h2>
                  <p className="mt-3 text-white/85 text-[12.5px] leading-[1.6] max-w-sm">
                    {t.servicoDetalhe.viaturasText}
                  </p>
                </div>
              </AnimateIn>
            </div>
          </div>
        </section>
      )}

      {/* ── Gallery — editorial portfolio ── */}
      <section className="py-20 lg:py-28 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 mb-10 lg:mb-14">
          <AnimateIn>
            <p className="text-foreground/72 text-[10px] tracking-[0.5em] uppercase flex items-center gap-3">
              <span className="w-8 h-px bg-gold flex-shrink-0" />
              {t.servicoDetalhe.galleryEyebrow}
            </p>
          </AnimateIn>
          <AnimateIn delay={staggerMs(1)}>
            <RevealText
              className="text-foreground font-bold uppercase tracking-display leading-[1.05] mt-5"
              style={{ fontSize: "clamp(28px, 3.8vw, 52px)" }}
            >
              {t.servicoDetalhe.galleryTitle}
            </RevealText>
          </AnimateIn>
        </div>
        {/* Full-bleed mosaic (no horizontal padding): the photos run edge to
            edge, separated only by a 1px hairline of the surface showing
            through — keeps tile boundaries legible where similar photos meet. */}
        {/* zoom (transform+opacity, GPU-composited), NOT mask: a clip-path wipe
            repaints each tile every frame, and here it staggered across 6 freshly
            decoded full-bleed photos as you scrolled in — the clearest remaining
            scroll stutter on the service pages. zoom is the same "settle in"
            reveal the home/service bands already use, with zero repaint. */}
        {/* A grelha que vai trocando, e a lupa (1/11). As medidas da grelha
            (filas de 340 e não 300; o `overflow-x-clip`, auditoria C1), o
            `sizes` por coluna e a legenda de último recurso vivem lá. */}
        <GaleriaDoServico
          fotos={gallery.map((src) => ({ src, blur: blurFor(src).blurDataURL }))}
          spans={GALLERY_SPANS}
          alt={`${t.servicoDetalhe.galleryAlt}: ${svc.title}`}
          textos={{
            galeria: t.galeria.lbGallery,
            fechar: t.galeria.lbClose,
            anterior: t.galeria.lbPrev,
            seguinte: t.galeria.lbNext,
            de: t.galeria.lbOf,
            indisponivel: t.galeria.photoUnavailable,
          }}
        />
      </section>

      {/* ── FAQ (image-backed, SpaceX-style: light text over a photo + veil) ── */}
      {svc.faqs.length > 0 && (
        <section className="relative py-20 lg:py-28 border-t border-white/10 overflow-hidden">
          <SafeImage
            src={svc.hero}
            alt=""
            fill
            sizes="100vw"
            // Match the hero's quality for the SAME source image: a different
            // quality would resolve to a second /_next/image URL and re-fetch +
            // re-decode the full-bleed photo. Same value → the already-decoded
            // hero asset is reused.
            quality={75}
            className="object-cover object-center"
            {...blurFor(svc.hero)}
          />
          {/* Strong, near-flat veil — this section is text-heavy, so the service's
              own photo reads as a dark atmospheric texture while every question
              stays legible. Matches the /contacto FAQ treatment. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(11,13,10,0.86), rgba(11,13,10,0.9)), linear-gradient(to right, rgba(11,13,10,0.4), transparent 60%)",
            }}
          />
          <div className="relative z-10 max-w-3xl mx-auto px-6 lg:px-16">
            <AnimateIn>
              <h2 className="text-veil-shadow text-white/70 text-[10px] tracking-[0.4em] uppercase mb-10 flex items-center gap-3">
                <span className="w-8 h-px bg-gold flex-shrink-0" /> {t.servicoDetalhe.faqTitle}
              </h2>
            </AnimateIn>
            <Reveal as="div" stagger className="text-veil-shadow flex flex-col">
              {svc.faqs.map((f) => (
                <div key={f.q} className="border-t border-white/12 py-7">
                  <h3 className="text-white text-base font-bold uppercase tracking-display mb-3">
                    {f.q}
                  </h3>
                  <p className="text-white/80 text-sm leading-[1.9] text-left text-pretty sm:text-justify hyphens-auto">
                    {hifenizar(f.a, locale)}
                  </p>
                </div>
              ))}
              <div className="border-t border-white/12" />
            </Reveal>
          </div>
        </section>
      )}

      {/* ── Related ── */}
      {related.length > 0 && (
        <section className="py-20 lg:py-28 bg-surface border-t border-foreground/8">
          <div className="max-w-7xl mx-auto px-6 lg:px-16">
            <AnimateIn>
              <h2 className="text-foreground/72 text-[10px] tracking-[0.4em] uppercase mb-10 flex items-center gap-3">
                <span className="w-8 h-px bg-gold flex-shrink-0" /> {t.servicoDetalhe.relatedTitle}
              </h2>
            </AnimateIn>
            <Reveal as="div" stagger className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={localizeHref(`/servicos/${r.slug}`, locale)}
                  className="group relative overflow-hidden aspect-[16/9] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
                >
                  <SafeImage
                    src={r.hero}
                    {...blurFor(r.hero)}
                    alt=""
                    fill
                    sizes="(max-width: 639px) 100vw, (max-width: 1280px) 50vw, 576px"
                    quality={75}
                    className="object-cover transition-transform duration-foto-zoom group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />
                  <div className="absolute bottom-0 p-6">
                    {/* Uppercase caption treatment (matches the hero / band
                        titles) — reads cleaner than serif at card size. */}
                    <h3 className="text-white font-semibold uppercase tracking-display text-[14px] sm:text-[15px] leading-snug">
                      {r.title}
                    </h3>
                  </div>
                </Link>
              ))}
            </Reveal>
          </div>
        </section>
      )}

      {/* ── CTA — full-bleed cinematic closer ── */}
      <section
        className="relative flex items-center overflow-hidden border-t border-foreground/8 py-28 lg:py-40"
        style={{ minHeight: "clamp(460px, 68vh, 760px)" }}
      >
        <SafeImage
          src={ctaImg}
          alt=""
          fill
          sizes="100vw"
          quality={75}
          className="object-cover object-bottom"
          {...blurFor(ctaImg)}
        />
        {/* Só as pontas: o escuro que o texto pede está atrás do próprio texto
            (`.veu-texto`, globals.css). Pedido dela, 23/10: «coloca mais brilho». */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: VEU_DAS_PONTAS,
          }}
        />
        <div className="text-veil-shadow veu-texto veu-texto--esquerda [--veu-alfa:0.6] relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <h2
              className="text-white font-bold uppercase tracking-display leading-[0.95] mb-12 max-w-2xl"
              style={{ fontSize: "clamp(28px, 4.4vw, 54px)" }}
            >
              {t.servicoDetalhe.ctaTitle}
            </h2>
          </AnimateIn>
          <TrackedLink
            href={orcamentoHref}
            trackProps={{ source: "service-detail-cta", servico: slug }}
            className={OUTLINE_LIGHT_BUTTON_CLASS}
          >
            {t.common.pedirOrcamento} <span aria-hidden>→</span>
          </TrackedLink>
        </div>
      </section>
    </>
  );
}
