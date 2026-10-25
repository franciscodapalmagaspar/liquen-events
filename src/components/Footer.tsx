import Link from "next/link";
import { IconeFacebook, IconeInstagram, IconeLinkedIn } from "@/components/IconesDasRedes";
import SafeImage from "@/components/SafeImage";
import TrackedLink from "@/components/TrackedLink";
import TrackedAnchor from "@/components/ads/TrackedAnchor";
import ManageCookiesLink from "@/components/ManageCookiesLink";
import { blurFor } from "@/lib/blur";
import WhatsAppIcon from "./WhatsAppIcon";
import { WHATSAPP_HREF } from "@/data";
import { SITE } from "@/lib/site";
import { getDictionary, localizeHref, type Locale } from "@/lib/i18n";

// Editorial footer background — a long-table photo from João & Pedro's wedding
// under a dark veil, so the footer reads as one immersive, premium band
// (wedding-editorial look). Chosen for warmth + legibility under white text.
const FOOTER_BG = "/imagens/JOAO_E_PEDRO_1Y1A4472.jpg";

// Service detail slugs, paired with t.footer.serviceLinks (same order) — gives
// the money pages keyword-anchored internal links from every page's footer.
//
// ── ESTA LISTA TEM DE COBRIR O CATÁLOGO INTEIRO ────────────────────────────
// É escrita à mão (e não derivada de `SERVICES`) porque o rótulo de cada link
// é traduzido e vive no dicionário, emparelhado por ÍNDICE: derivar os slugs
// daqui faria nascer um link sem rótulo, invisível ao olho e mudo ao leitor de
// ecrã, no dia em que alguém acrescentasse um serviço.
//
// O preço de ser à mão foi este: «batizados-e-comunhoes» tem página, sitemap e
// lugar em /servicos desde sempre, e nunca chegou ao rodapé. O rodapé aparece
// em TODAS as páginas e nas duas línguas, portanto o serviço andou a perder a
// ligação interna que os outros quatro têm em todo o lado.
//
// Quem guarda isto agora é `rodape-servicos.test.tsx`: percorre `SERVICES` e
// exige um link por serviço, nas duas línguas. Acrescentar um serviço ao
// catálogo passa a partir esse teste até esta lista e os dois dicionários
// crescerem com ele.
const serviceSlugs = [
  "casamentos",
  "aluguer-de-viaturas-classicas",
  "eventos-corporativos",
  "festas-e-aniversarios",
  "batizados-e-comunhoes",
];

export default function Footer({ locale = "pt" }: { locale?: Locale }) {
  const t = getDictionary(locale);
  return (
    <footer className="relative overflow-hidden bg-[#0c0e0b] text-white">
      {/* ── Background photo + dark veil ── */}
      {/* Sem legenda de indisponível: isto é uma textura de fundo decorativa
          (alt=""), coberta por dois véus escuros. Uma etiqueta "foto
          indisponível" aqui só chamaria a atenção para uma imagem que ninguém
          repara que existe; o recurso digno é a própria foto desfocada, que sob
          os véus é indistinguível do resultado normal. */}
      <SafeImage
        src={FOOTER_BG}
        {...blurFor(FOOTER_BG)}
        alt=""
        fill
        sizes="100vw"
        quality={72}
        // Frame lower-centre so the long table (foreground of the photo) is the
        // part that shows, instead of the middle band of the building.
        className="absolute inset-0 object-cover object-[50%_68%]"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(to bottom, rgba(7,8,7,0.42), rgba(7,8,7,0.66))",
        }}
      />
      {/* Soft top fade (no hard line): the footer image eases in from the dark
          section above as you scroll, so the backgrounds read as one continuous
          flow instead of two panels with a seam between them. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-40"
        style={{ backgroundImage: "linear-gradient(to bottom, rgba(7,8,7,0.9), transparent)" }}
      />

      {/* ── Content (over the photo) ── */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          {/* Editorial hero — big white logo, serif promise, CTA, social */}
          <div className="pt-16 pb-12 flex flex-col items-center text-center">
            <SafeImage
              src="/logo-liquen-branco.png"
              alt="Líquen Events"
              width={215}
              height={128}
              className="h-20 sm:h-24 w-auto object-contain"
            />
            <p className="mt-7 max-w-xl text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug">
              {t.footer.sloganLine1} {t.footer.sloganLine2}
            </p>
            <TrackedLink
              href={localizeHref("/orcamento", locale)}
              trackProps={{ source: "footer" }}
              className="mt-8 inline-flex items-center gap-2.5 px-8 py-3.5 border border-white/35 text-white/90 text-[11px] tracking-[0.25em] uppercase hover:bg-white hover:text-[#0c0e0b] hover:border-white transition-colors duration-300 ease-expo"
            >
              {t.footer.pedirOrcamento} <span aria-hidden>→</span>
            </TrackedLink>

            {/* Social icons.
                `alvo-toque` nos três: o `p-2 -m-2` dava-lhes 35×35 px medidos
                com toque emulado — a margem negativa recupera para o desenho o
                espaço que o preenchimento tinha dado ao dedo, e o alvo ficava a
                9 px do mínimo. No dedo passam a 44×44 sem mexer no ícone. */}
            <div className="mt-9 flex items-center gap-6">
              <a
                href={SITE.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Instagram (${t.common.newWindow})`}
                className="alvo-toque inline-flex items-center justify-center p-2 -m-2 text-white/60 hover:text-white transition-colors duration-300"
              >
                <IconeInstagram />
              </a>
              <a
                href={SITE.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Facebook (${t.common.newWindow})`}
                className="alvo-toque inline-flex items-center justify-center p-2 -m-2 text-white/60 hover:text-white transition-colors duration-300"
              >
                <IconeFacebook />
              </a>
              {/* LinkedIn (pedido dela, 16/10): ao lado das outras redes, com o
                  mesmo traço. Só aparece se houver endereço — a regra dela de
                  «uma rede sem endereço não tem ícone». */}
              {SITE.linkedin ? (
                <a
                  href={SITE.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`LinkedIn (${t.common.newWindow})`}
                  className="alvo-toque inline-flex items-center justify-center p-2 -m-2 text-white/60 hover:text-white transition-colors duration-300"
                >
                  <IconeLinkedIn />
                </a>
              ) : null}
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp (${t.common.newWindow})`}
                className="alvo-toque inline-flex items-center justify-center p-2 -m-2 text-white/60 hover:text-white transition-colors duration-300"
              >
                <WhatsAppIcon className="w-[19px] h-[19px]" />
              </a>
            </div>
          </div>

          {/* Serviços + Contacto — centred on mobile, two columns from sm up */}
          <div className="border-t border-white/12 py-10 flex flex-col sm:flex-row sm:justify-between gap-8 text-center sm:text-left">
            <div>
              <p className="text-white/55 text-[10px] tracking-[0.42em] uppercase mb-4">
                {t.footer.servicosTitulo}
              </p>
              {/* `alvo-toque` em todos os links deste rodapé: medidos a 375 px
                  com toque emulado, os quatro serviços davam ~20 px de altura,
                  o email e o telefone 20 px, e os três da barra de direitos de
                  autor 17 px. Nenhum chegava a metade do mínimo — e são os
                  links que aparecem em TODAS as páginas do sítio. */}
              <ul className="flex flex-col gap-2.5">
                {serviceSlugs.map((slug, i) => (
                  <li key={slug}>
                    <Link
                      href={localizeHref(`/servicos/${slug}`, locale)}
                      className="alvo-toque link-line pointer-fine:pt-1.5 pointer-fine:-mt-1.5 text-[13px] text-white/75 hover:text-white transition-colors duration-300"
                    >
                      {t.footer.serviceLinks[i]}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="sm:text-right">
              <p className="text-white/55 text-[10px] tracking-[0.42em] uppercase mb-4">
                {t.footer.contacto}
              </p>
              <div className="flex flex-col gap-2.5 text-[13px] text-white/75">
                {/* `justify-center sm:justify-end` porque estes dois são itens
                    de flex e por isso ESTICAM à largura da coluna: quando o
                    `alvo-toque` os torna `inline-flex`, quem os alinha deixa de
                    ser o `text-align` herdado (centro no telemóvel, direita a
                    partir de `sm`) e passa a ser o `justify-content`. Sem estas
                    duas classes ficavam à esquerda numa coluna alinhada à
                    direita. Em ponteiro fino não fazem nada. */}
                <a
                  href={`mailto:${SITE.email}`}
                  className="alvo-toque link-line pointer-fine:pt-1.5 pointer-fine:-mt-1.5 justify-center sm:justify-end hover:text-white transition-colors duration-300"
                >
                  {SITE.email}
                </a>
                {/* Um clique no telefone é o sinal de intenção mais forte que
                    este site produz: quem liga quer falar hoje. Sem o medir, a
                    Google optimiza com metade das conversões escondidas. */}
                <TrackedAnchor
                  event="PhoneClick"
                  trackProps={{ origem: "footer" }}
                  href={`tel:${SITE.phone}`}
                  className="alvo-toque link-line pointer-fine:pt-1.5 pointer-fine:-mt-1.5 justify-center sm:justify-end hover:text-white transition-colors duration-300"
                >
                  {SITE.phoneDisplay}
                </TrackedAnchor>
              </div>
            </div>
          </div>
        </div>

        {/* ── Copyright bar ── */}
        <div className="border-t border-white/12 py-5">
          <div className="max-w-7xl mx-auto px-6 lg:px-16 flex flex-col sm:flex-row justify-between items-center gap-3 text-center">
            <p className="text-[11px] text-white/55 tracking-wide">
              © {new Date().getFullYear()} Líquen Events. {t.footer.rights}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-[11px] text-white/55 tracking-wide">
              {/* ── Livro de Reclamações Eletrónico ──
                  Obrigatório para quem presta serviços a consumidores: o
                  acesso à plataforma oficial, visível, em todas as páginas.
                  Ela (17/10): «no canto, ao lado da privacidade, e
                  transparente como está tudo no cabeçalho» — por isso o
                  logótipo oficial vai em silhueta branca, com a mesma
                  transparência dos links ao lado (as letras do círculo ficam
                  vazadas, e lêem-se no fundo escuro). */}
              <a
                href={SITE.livroReclamacoes}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${t.footer.livroReclamacoes} (${t.common.newWindow})`}
                title={t.footer.livroReclamacoes}
                className="alvo-toque inline-flex items-center opacity-70 hover:opacity-100 transition-opacity duration-300"
              >
                <SafeImage
                  src="/logos/livro-de-reclamacoes.png"
                  alt=""
                  width={1012}
                  height={408}
                  sizes="100px"
                  className="h-10 w-auto brightness-0 invert"
                />
              </a>
              <Link
                href={localizeHref("/privacidade", locale)}
                className="alvo-toque link-line pointer-fine:pt-2 pointer-fine:-mt-2 hover:text-white transition-colors"
              >
                {t.footer.privacidade}
              </Link>
              <Link
                href={localizeHref("/termos", locale)}
                className="alvo-toque link-line pointer-fine:pt-2 pointer-fine:-mt-2 hover:text-white transition-colors"
              >
                {t.footer.termos}
              </Link>
              <ManageCookiesLink locale={locale} />
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
