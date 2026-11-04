import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import HeroImage from "@/components/HeroImage";
import PedidoRapido, { TEXTOS_PT, TEXTOS_EN } from "@/components/ads/PedidoRapido";
import { blurFor } from "@/lib/blur";
import { pageMetadata } from "@/lib/page-metadata";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { getDictionary, localizeHref, normalizeLocale } from "@/lib/i18n";
import { ESTILOS, getEstilo, POLOS, caminhoPolo, conteudoPolo } from "@/lib/ads/polos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LANDING PAGE DE UM ESTILO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quem pesquisa "casamento boho" ou "casamento minimalista" está numa fase
 * DIFERENTE de quem pesquisa "decoração casamento Algarve". Ainda não tem
 * fornecedor em vista e, muitas vezes, nem tem data marcada — está a decidir a
 * estética. Mandar essa pessoa para uma página regional é pedir-lhe que
 * responda a uma pergunta que ela ainda não se fez, e ela sai.
 *
 * Por isso a página é a mesma máquina com outro peso: o formulário continua
 * acima da dobra (quem estiver pronto não tem de o procurar) mas o texto fala
 * do estilo, não da logística, e há uma saída explícita para as páginas
 * regionais — que é o passo seguinte natural de quem se decidiu pela estética
 * e agora quer saber quem faz aquilo na zona dele.
 */

export const dynamic = "force-static";

export function generateStaticParams() {
  return ESTILOS.map((e) => ({ estilo: e.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; estilo: string }>;
}): Promise<Metadata> {
  const { lang, estilo: slug } = await params;
  const locale = normalizeLocale(lang);
  const estilo = getEstilo(slug);
  // `robots` a acompanhar o título — mesma razão, e mesma medição, que em
  // `servicos/[slug]`: um estilo que não existe saía com `index, follow` à
  // frente do `noindex`. Ver `e2e/endereco-que-nao-existe.spec.ts`.
  if (!estilo)
    return {
      title: locale === "en" ? "Page not found" : "Página não encontrada",
      robots: { index: false, follow: false },
    };
  const c = estilo[locale];
  const meta = pageMetadata({
    locale,
    title: c.metaTitle,
    ogTitle: c.metaTitle,
    description: c.metaDescription,
    path: `/casamentos/estilo/${estilo.slug}`,
    image: estilo.hero,
    keywords: [c.h1, `${c.nome} wedding Portugal`],
    ogLocale: getDictionary(locale).meta.ogLocale,
  });
  // Título absoluto e `ogTitle` explícito: o `metaTitle` do catálogo já traz a
  // marca, e sem isto ela saía duas vezes — no separador e no cartão social.
  // A medição e o porquê estão em ../../[polo]/page.tsx.
  return { ...meta, title: { absolute: c.metaTitle } };
}

export default async function EstiloPage({
  params,
}: {
  params: Promise<{ lang: string; estilo: string }>;
}) {
  const { lang, estilo: slug } = await params;
  const locale = normalizeLocale(lang);
  const estilo = getEstilo(slug);
  if (!estilo) notFound();

  const t = getDictionary(locale);
  const c = estilo[locale];
  const textos = locale === "en" ? TEXTOS_EN : TEXTOS_PT;
  const en = locale === "en";

  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: c.h1, path: `/casamentos/estilo/${estilo.slug}` }]}
      />

      <section className="relative min-h-[calc(var(--ecra)*0.92)] flex items-center">
        <div className="absolute inset-0">
          {/* HeroImage e não SafeImage: só o HeroImage usa o `heroImageLoader`,
              que resolve a imagem para os WebP estáticos até 2048 px. Numa
              página que recebe tráfego pago o herói é o candidato a LCP, e um
              herói servido pela escada das fotos comuns fica visivelmente mais
              suave no ecrã grande. */}
          <HeroImage
            src={estilo.hero}
            alt=""
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            {...blurFor(estilo.hero)}
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/30" />
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 py-24 lg:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_minmax(0,460px)] gap-10 lg:gap-16 items-center">
            <div className="text-white">
              <p className="text-[10px] tracking-[0.35em] uppercase text-white/70">
                {en ? "Style" : "Estilo"}
              </p>
              <h1 className="mt-4 text-[34px] sm:text-[46px] lg:text-[56px] font-bold uppercase tracking-display leading-[1.05]">
                {c.h1}
              </h1>
              <div className="mt-6 space-y-4 max-w-xl">
                {c.intro.map((p, i) => (
                  <p key={i} className="text-[15px] sm:text-[16px] leading-relaxed text-white/85">
                    {p}
                  </p>
                ))}
              </div>
            </div>

            <PedidoRapido locale={locale} textos={textos} contexto={`estilo:${estilo.slug}`} />
          </div>
        </div>
      </section>

      <section className="py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {estilo.fotos.map((foto, i) => (
              <div key={foto} className="relative aspect-[3/2] overflow-hidden bg-foreground/5">
                <SafeImage
                  src={foto}
                  // Distinct alt per photo: real portfolio content for this
                  // style, not a decorative band.
                  alt={`${t.common.imageAlt.portfolioExemplo}: ${c.h1} ${i + 1}`}
                  fill
                  loading="lazy"
                  sizes="(max-width: 640px) 100vw, 50vw"
                  {...blurFor(foto)}
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Passo seguinte de quem já se decidiu pela estética: onde vai casar.
          É a única ligação interna que esta página precisa de ter. */}
      <section className="bg-surface border-t border-foreground/8 py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <h2 className="text-[20px] sm:text-[24px] font-bold uppercase tracking-display">
            {en ? "Where are you getting married?" : "Onde vai casar?"}
          </h2>
          {/*
            `alvo-toque` nos treze. MEDIDO num Chromium a 375 px com toque
            emulado: cada uma destas ligações media **15 px de altura**
            («Alentejo» 82×15, «Comporta, Melides e Troia» 237×15, …), contra os
            44 px que a casa exige (TOUCH-AUDIT.md).
            
            São a ÚNICA navegação interna desta página — o comentário aqui em
            cima di-lo por extenso —, e a página recebe tráfego pago. Treze
            ligações de 15 px, empilhadas com 12 px de intervalo, é uma lista em
            que o dedo acerta na linha errada.
            
            A dispensa de «palavra sublinhada numa frase» (WCAG 2.5.8) não se
            aplica: é uma lista de destinos, não prosa. O que as fazia escapar é
            o mesmo de sempre — `alvos-de-toque-do-sitio.test.tsx` não monta
            esta página.
          */}
          <ul className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px] tracking-[0.2em] uppercase">
            {POLOS.map((polo) => (
              <li key={polo.slug}>
                <Link
                  href={localizeHref(caminhoPolo(polo.slug), locale)}
                  className="alvo-toque underline hover:text-moss"
                >
                  {conteudoPolo(polo, locale).eyebrow}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
