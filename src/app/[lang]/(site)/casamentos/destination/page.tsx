import type { Metadata } from "next";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import HeroImage from "@/components/HeroImage";
import TrackedAnchor from "@/components/ads/TrackedAnchor";
import PedidoRapido, { TEXTOS_PT, TEXTOS_EN } from "@/components/ads/PedidoRapido";
import { blurFor } from "@/lib/blur";
import { pageMetadata } from "@/lib/page-metadata";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { getDictionary, localizeHref, normalizeLocale } from "@/lib/i18n";
import { POLOS, caminhoPolo, conteudoPolo } from "@/lib/ads/polos";
import { SITE } from "@/lib/site";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PÁGINA DO CASAL ESTRANGEIRO (destination weddings)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * É o segmento de maior valor por evento e aquele onde o site bilingue já dá
 * vantagem: a maior parte dos concorrentes portugueses tem site só em
 * português, ou uma tradução automática que se nota.
 *
 * ── PORQUE É QUE ESTA PÁGINA É DIFERENTE DE TODAS AS OUTRAS ────────────────
 * Um casal que vive em Londres e vai casar no Alentejo não tem as dúvidas de
 * um casal português. Não pergunta "gosto do estilo?" — isso vê nas
 * fotografias. Pergunta coisas que ninguém responde nos sites:
 *
 *   • Como é que isto se decide sem eu aí estar?
 *   • Quantas vezes tenho mesmo de ir a Portugal antes do casamento?
 *   • Quem é que está lá no dia, se eu não conheço nenhum fornecedor?
 *   • Em que língua é que isto se passa?
 *   • O preço inclui a deslocação da equipa até ao sítio onde vou casar?
 *
 * A página responde às cinco, por escrito e sem rodeios. É deliberadamente
 * pouco "de marketing": quem está a comprar à distância compra confiança, e
 * confiança faz-se com respostas concretas a perguntas incómodas, não com
 * adjectivos.
 */

export const dynamic = "force-static";

const CAMINHO = "/casamentos/destination";
const HERO = "/imagens/J&A-442.jpg";
const FOTOS = [
  "/imagens/J&P-IMGL4767.jpg",
  "/imagens/J&A-242.jpg",
  "/imagens/EW1_1392.jpg",
  "/imagens/DaniGui_Preview12.jpg",
];

const CONTEUDO = {
  en: {
    eyebrow: "Destination weddings in Portugal",
    h1: "Getting married in Portugal, planned from wherever you live",
    metaTitle: "Destination Wedding Design in Portugal | Líquen Events",
    metaDescription:
      "Wedding design and production across Portugal for couples marrying from abroad. Remote planning, one team on the ground, quoted in English.",
    intro: [
      "We design and produce weddings across Portugal for couples who live somewhere else. Most of our international clients see the venue once, or not at all, before the week of the wedding.",
      "That is a workable way to do this, but only if the process is built for it from the start. Here is how ours works, in plain terms.",
    ],
    perguntasTitulo: "The five questions we actually get asked",
    perguntas: [
      {
        q: "How does this get decided if I am not there?",
        a: "With drawings and photographs of real materials, not mood boards pulled off the internet. You get a concept document with the floor plan, the palette, the actual flowers in season on your date, and photographs of the pieces we would use. We revise it with you over video calls. Nothing is ordered before you have approved that document.",
      },
      {
        q: "How many times do I have to fly to Portugal?",
        a: "Zero times, if that is what you need. Couples who want one visit usually come for a venue-and-tasting trip and we join it. We walk the venue and take the technical measurements ourselves regardless of whether you are there, and we send you what we found.",
      },
      {
        q: "Who is on the ground on the day?",
        a: "Our own team, with our own stock. We are not a booking agency that subcontracts the setup to whoever is free. The people who designed your wedding are the people building it, and one of them coordinates the day from the first supplier arriving to the last piece coming down.",
      },
      {
        q: "What language does this happen in?",
        a: "English throughout, including the quote, the contract and the supplier coordination on the day. Portuguese with your Portuguese guests and suppliers, so you never have to translate anything.",
      },
      {
        q: "Does the price include getting your team to the venue?",
        a: "Yes, and it is stated as a line in the quote rather than appearing at the end. Travel, transport of the stock, and accommodation for the crew when the venue needs it are all quoted up front for the region you are marrying in.",
      },
    ],
    regioesTitulo: "Where our international couples marry",
    verMais: "See the region",
    contacto: "Prefer to write first?",
  },
  pt: {
    eyebrow: "Casamentos de estrangeiros em Portugal",
    h1: "Casar em Portugal, organizado a partir de onde vive",
    metaTitle: "Destination Weddings em Portugal | Líquen Events",
    metaDescription:
      "Decoração e produção de casamentos em Portugal para casais que vivem no estrangeiro. Planeamento à distância, equipa própria no terreno.",
    intro: [
      "Desenhamos e produzimos casamentos por todo o Portugal para casais que vivem noutro país. A maior parte vê o espaço uma vez, ou nenhuma, antes da semana do casamento.",
      "É um método que funciona, mas só se o processo for construído para isso desde o início. É assim que o nosso funciona.",
    ],
    perguntasTitulo: "As cinco perguntas que nos fazem mesmo",
    perguntas: [
      {
        q: "Como é que isto se decide sem eu aí estar?",
        a: "Com desenhos e fotografias de materiais reais, não com painéis de inspiração tirados da internet. Recebe um documento de conceito com a planta, a paleta, as flores efectivamente disponíveis na sua data, e fotografias das peças que usaríamos. Revemo-lo consigo por videochamada. Não se encomenda nada antes de esse documento estar aprovado.",
      },
      {
        q: "Quantas vezes tenho de vir a Portugal?",
        a: "Nenhuma, se for isso que precisa. Quem quer fazer uma visita costuma vir para ver o espaço e provar o menu, e nós vamos juntos. A visita técnica ao espaço e as medições fazemo-las nós, esteja o casal presente ou não, e enviamos o que encontrámos.",
      },
      {
        q: "Quem está lá no dia?",
        a: "A nossa equipa, com material nosso. Não somos uma agência que subcontrata a montagem a quem estiver livre. Quem desenhou o casamento é quem o monta, e uma dessas pessoas coordena o dia desde a chegada do primeiro fornecedor até à última peça a sair.",
      },
      {
        q: "Em que língua se passa isto?",
        a: "Em inglês do princípio ao fim, incluindo o orçamento, o contrato e a coordenação dos fornecedores no dia. Em português com os convidados e fornecedores portugueses, para nunca ter de traduzir nada.",
      },
      {
        q: "O preço inclui levar a equipa até ao espaço?",
        a: "Inclui, e aparece como linha do orçamento em vez de surgir no fim. Deslocação, transporte do material e estadia da equipa quando o espaço a exige, tudo orçamentado à partida para a região onde vai casar.",
      },
    ],
    regioesTitulo: "Onde casam os nossos clientes estrangeiros",
    verMais: "Ver a região",
    contacto: "Prefere escrever primeiro?",
  },
} as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const locale = normalizeLocale(lang);
  const c = CONTEUDO[locale];
  const meta = pageMetadata({
    locale,
    title: c.metaTitle,
    ogTitle: c.metaTitle,
    description: c.metaDescription,
    path: CAMINHO,
    image: HERO,
    keywords: [
      "destination wedding Portugal",
      "wedding designer Portugal",
      "wedding decor Portugal",
      "Portugal wedding styling",
      "English speaking wedding planner Portugal",
    ],
    ogLocale: getDictionary(locale).meta.ogLocale,
  });
  // Título absoluto e `ogTitle` explícito: o `metaTitle` daqui já traz a marca,
  // e sem isto ela saía duas vezes. A medição e o porquê estão em
  // ../[polo]/page.tsx.
  return { ...meta, title: { absolute: c.metaTitle } };
}

export default async function DestinationPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const locale = normalizeLocale(lang);
  const t = getDictionary(locale);
  const c = CONTEUDO[locale];
  const textos = locale === "en" ? TEXTOS_EN : TEXTOS_PT;

  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: c.h1, path: CAMINHO }]}
      />

      <section className="relative min-h-[calc(var(--ecra)*0.92)] flex items-center">
        <div className="absolute inset-0">
          {/* HeroImage e não SafeImage — ver a nota na página de polo. */}
          <HeroImage
            src={HERO}
            alt=""
            fill
            priority
            fetchPriority="high"
            sizes="100vw"
            {...blurFor(HERO)}
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/30" />
        </div>

        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 py-24 lg:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_minmax(0,460px)] gap-10 lg:gap-16 items-center">
            <div className="text-white">
              <p className="text-[10px] tracking-[0.35em] uppercase text-white/70">{c.eyebrow}</p>
              <h1 className="mt-4 text-[32px] sm:text-[42px] lg:text-[52px] font-bold uppercase tracking-display leading-[1.06]">
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

            <PedidoRapido locale={locale} textos={textos} contexto="internacional" />
          </div>
        </div>
      </section>

      {/* As cinco perguntas. É o corpo da página, não um apêndice de FAQ no
          fundo — quem compra à distância lê isto antes de olhar para as fotos. */}
      <section className="py-20 lg:py-28">
        <div className="max-w-4xl mx-auto px-6 lg:px-8">
          <h2 className="text-[24px] sm:text-[30px] font-bold uppercase tracking-display leading-tight">
            {c.perguntasTitulo}
          </h2>
          <dl className="mt-12 space-y-10">
            {c.perguntas.map((p) => (
              <div key={p.q} className="border-t border-foreground/10 pt-6">
                <dt className="text-[17px] sm:text-[19px] font-medium leading-snug">{p.q}</dt>
                <dd className="mt-3 text-[15px] leading-relaxed text-foreground/70">{p.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-surface border-y border-foreground/8 py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <h2 className="text-[24px] sm:text-[30px] font-bold uppercase tracking-display">
            {c.regioesTitulo}
          </h2>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {FOTOS.map((foto, i) => (
              <div key={foto} className="relative aspect-[3/2] overflow-hidden bg-foreground/5">
                <SafeImage
                  src={foto}
                  // Distinct alt per photo: real portfolio content, not a
                  // decorative band. No region claim here (unlike the polo
                  // page) since these photos aren't tied to one place.
                  alt={`${t.common.imageAlt.portfolioExemplo} ${i + 1}`}
                  fill
                  loading="lazy"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  {...blurFor(foto)}
                  className="object-cover"
                />
              </div>
            ))}
          </div>
          {/* `alvo-toque` nos treze: medidos a 375 px com toque emulado, davam
              15 px de altura cada — a lista inteira de destinos desta página, e
              a única porta para as treze páginas de pólo. O sublinhado é
              `text-decoration` e não `border-b`, portanto acompanha o texto e
              não o fundo da caixa: crescer o alvo não o descola da palavra. */}
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-[12px] tracking-[0.2em] uppercase">
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

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <p className="text-[15px] text-foreground/70">{c.contacto}</p>
          <TrackedAnchor
            event="EmailClick"
            trackProps={{ origem: "internacional" }}
            href={`mailto:${SITE.email}`}
            // `!justify-start` porque este link é item de uma coluna de flex e
            // por isso estica à largura toda; sem ele, o `justify-content:
            // center` do `.alvo-toque` punha o email ao meio no telemóvel.
            className="alvo-toque !justify-start text-[12px] tracking-[0.25em] uppercase underline hover:text-moss"
          >
            {SITE.email}
          </TrackedAnchor>
        </div>
      </section>
    </>
  );
}
