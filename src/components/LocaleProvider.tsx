"use client";

import { createContext, useContext } from "react";
import type { ChromeDict, Locale } from "@/lib/i18n";

// Holds the already-resolved dictionary SLICE (not just the locale code) so
// client components never need to import lib/i18n's getDictionary — that module
// pulls in BOTH pt.ts and en.ts (~43KB combined) at module scope, which would
// otherwise ship both languages' full dictionary to every page's client bundle
// even though only one is ever used per request.
//
// The slice is a ChromeDict (nav/langToggle/common/errors/footer), not the whole
// dictionary: this context lives in the root layout and is embedded in EVERY
// page's flight/hydration payload, so carrying all ~25KB of namespaces there —
// when the always-mounted chrome only reads a fraction — was ~8KB gzip of dead
// weight per page. Heavier, page-specific namespaces (the quote form, gallery,
// testimonials, confirmation, proposal, FAQ) are passed as explicit props from
// their own server page instead.
const LocaleContext = createContext<{ locale: Locale; dict: ChromeDict } | null>(null);

export function LocaleProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: ChromeDict;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={{ locale, dict }}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): { locale: Locale; dict: ChromeDict } {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale/useTranslations must be used within <LocaleProvider>");
  return ctx;
}

/** Current locale, provided server-side via the layout (no flash). */
export function useLocale(): Locale {
  return useLocaleContext().locale;
}

/**
 * Current locale + the site-wide chrome dictionary slice, for the always-mounted
 * client components and error boundaries. Page-scoped components that need a
 * heavier namespace receive it as a prop from their server page.
 */
export function useTranslations(): { locale: Locale; t: ChromeDict } {
  const { locale, dict } = useLocaleContext();
  return { locale, t: dict };
}

/**
 * O mesmo que `useTranslations`, mas `null` em vez de rebentar quando não há
 * `<LocaleProvider>` por cima.
 *
 * Existe para os componentes PARTILHADOS entre o site e o back office (o
 * `CampoTelefone`): na aplicação há sempre fornecedor — o `[lang]/layout.tsx`
 * embrulha as duas metades —, mas um ecrã do back office montado sozinho num
 * teste não tem, e o campo não pode deitar o ecrã abaixo por causa de três
 * frases. Quem usa isto decide o que fazer sem dicionário.
 */
export function useTranslationsSeHouver(): { locale: Locale; t: ChromeDict } | null {
  const ctx = useContext(LocaleContext);
  return ctx ? { locale: ctx.locale, t: ctx.dict } : null;
}
