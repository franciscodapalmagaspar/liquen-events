import type { Metadata } from "next";
import OrcamentoForm from "./OrcamentoForm";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { blurFor } from "@/lib/blur";
import { getDictionary, normalizeLocale } from "@/lib/i18n";
import { hifenizar } from "@/lib/hifenizar";

// The form's decorative left-panel image. Its blur placeholder is resolved here
// (server-side) so the blur-map JSON never ships to the client with the form.
const PANEL_IMG = "/imagens/DaniGui_JantarFesta_1.jpg";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.meta.orcamentoTitle,
    description: t.meta.orcamentoDescription,
    path: "/orcamento",
    image: "/imagens/EW1_1404.jpg",
    ogLocale: t.meta.ogLocale,
  });
}

export default async function OrcamentoPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.orcamento, path: "/orcamento" }]}
      />
      <OrcamentoForm
        panelBlur={blurFor(PANEL_IMG).blurDataURL}
        orcamento={{
          ...t.orcamento,
          // Justificado: as sílabas marcam-se aqui, no servidor — ver `hifenizar`.
          hintMensagem: hifenizar(t.orcamento.hintMensagem, locale),
        }}
      />
    </>
  );
}
