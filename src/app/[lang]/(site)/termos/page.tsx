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
  const { terms } = getLegal(locale);
  return pageMetadata({
    locale,
    title: terms.title,
    description:
      locale === "en"
        ? "The terms and conditions governing the use of the Líquen Events website."
        : "Os termos e condições que regem a utilização do site da Líquen Events.",
    path: "/termos",
    ogLocale: t.meta.ogLocale,
  });
}

export default async function TermosPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const { terms } = getLegal(locale);
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: terms.title, path: "/termos" }]}
      />
      <LegalDocView doc={terms} justificado />
    </>
  );
}
