"use client";

import { useEffect } from "react";
import Link from "next/link";
import { log } from "@/lib/logger";
import { relatarErroPara } from "@/lib/relatar-erro";
import { useTranslations } from "@/components/LocaleProvider";
import { localizeHref } from "@/lib/i18n/config";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { locale, t } = useTranslations();

  useEffect(() => {
    log.error("erro renderizado no boundary de página", error);
    // O `log.error` do browser morre na consola do telemóvel; isto chega ao registo.
    relatarErroPara("/api/erro-do-site", error, error.digest ?? "ecra-de-erro");
  }, [error]);

  return (
    <section className="min-h-[80vh] flex items-center justify-center px-6 bg-surface">
      <div className="max-w-lg text-center">
        <p className="text-foreground/60 text-[10px] tracking-[0.5em] uppercase mb-5 flex items-center justify-center gap-3">
          <span className="w-5 h-px bg-moss/50" />
          {t.errors.errorEyebrow}
        </p>
        <h1
          className="text-foreground font-bold leading-tight mb-6"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 4vw, 48px)" }}
        >
          {t.errors.errorTitle}
        </h1>
        <p className="text-foreground/68 text-sm leading-[1.8] max-w-md mx-auto mb-12">
          {t.errors.errorText}
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-3 px-8 py-4 btn-shine bg-moss text-white font-medium rounded-sm hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-widest uppercase"
          >
            {t.errors.retry} →
          </button>
          <Link
            href={localizeHref("/orcamento", locale)}
            className="inline-flex items-center gap-3 px-8 py-4 border border-foreground/25 text-foreground/75 font-medium rounded-sm hover:border-foreground/40 hover:text-foreground transition-all duration-300 text-sm tracking-widest uppercase"
          >
            {t.common.pedirOrcamento}
          </Link>
          <Link
            href={localizeHref("/", locale)}
            className="inline-flex items-center gap-3 px-8 py-4 border border-foreground/25 text-foreground/75 font-medium rounded-sm hover:border-foreground/40 hover:text-foreground transition-all duration-300 text-sm tracking-widest uppercase"
          >
            {t.common.voltarInicio}
          </Link>
        </div>
      </div>
    </section>
  );
}
