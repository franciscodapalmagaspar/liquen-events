import type { Metadata } from "next";
import LegalDocView from "../legal/LegalDocView";
import { getLegal } from "../legal/legal-content";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const { privacy } = getLegal(locale);
  return pageMetadata({
    locale,
    title: privacy.title,
    description:
      locale === "en"
        ? "How Líquen Events collects, uses and protects your personal data, under the GDPR."
        : "Como a Líquen Events recolhe, usa e protege os seus dados pessoais, ao abrigo do RGPD.",
    path: "/privacidade",
    ogLocale: t.meta.ogLocale,
  });
}

export default async function PrivacidadePage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const { privacy } = getLegal(locale);
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: privacy.title, path: "/privacidade" }]}
      />
      <LegalDocView doc={privacy} justificado idioma={locale} />
    </>
  );
}
