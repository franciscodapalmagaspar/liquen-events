"use client";

import { useEffect, useState } from "react";
import { log } from "@/lib/logger";
import LivroDeReclamacoes from "@/components/LivroDeReclamacoes";

/**
 * Global error boundary — catches failures in the root layout itself, which
 * the per-segment error.tsx cannot. It must render its own <html>/<body> and
 * carries its own inline styles + copy (the app's CSS and i18n machinery may be
 * exactly what's broken), so it stays deliberately self-contained.
 */

// Cookie name mirrors LANG_COOKIE in src/lib/i18n/config.ts — inlined on
// purpose so this boundary doesn't import the (heavier) i18n module.
const LANG_COOKIE = "liquen-lang";

const STRINGS = {
  pt: {
    lang: "pt-PT",
    eyebrow: "Página parada",
    title: "Esta página não chegou a carregar.",
    body: "Foi o desenho da página que falhou, não uma gravação: nada do que já tinha enviado se perdeu. Tente carregar outra vez e, se voltar a acontecer, recarregue a página.",
    retry: "Tentar carregar outra vez",
    // Os mesmos de `pt.ts` (footer.livroReclamacoes, common.newWindow): este
    // ecrã não importa o dicionário — ver o cabeçalho.
    livro: "Livro de Reclamações Eletrónico",
    novaJanela: "abre em nova janela",
  },
  en: {
    lang: "en",
    eyebrow: "Page stopped",
    title: "This page did not load.",
    body: "The page failed to render, not a save: nothing you had already sent was lost. Try loading it again and, if it happens again, reload the page.",
    retry: "Try loading it again",
    livro: "Complaints Book (Livro de Reclamações)",
    novaJanela: "opens in a new window",
  },
} as const;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<"pt" | "en">("pt");

  useEffect(() => {
    // Structured client-side report; in production this is a JSON line.
    log.error("erro global da aplicação", error);
    // Respect the visitor's chosen language (cookie set by the language toggle).
    if (
      typeof document !== "undefined" &&
      new RegExp(`(?:^|;\\s*)${LANG_COOKIE}=en\\b`).test(document.cookie)
    ) {
      setLang("en");
    }
  }, [error]);

  const t = STRINGS[lang];

  return (
    <html lang={t.lang}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f0f0d",
          color: "#e8e6e0",
          fontFamily: "-apple-system, Segoe UI, Roboto, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <p
            style={{
              letterSpacing: "0.4em",
              textTransform: "uppercase",
              fontSize: 10,
              opacity: 0.4,
            }}
          >
            {t.eyebrow}
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: "16px 0" }}>{t.title}</h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, opacity: 0.55, marginBottom: 28 }}>{t.body}</p>
          <button
            onClick={reset}
            style={{
              padding: "14px 32px",
              background: "#7c854b",
              color: "#f5f3ee",
              border: "none",
              borderRadius: 3,
              fontSize: 13,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {t.retry}
          </button>
          {/* O Livro de Reclamações Eletrónico (auditoria legal, 17/11): é
              obrigatório em todas as páginas, e este ecrã substitui o layout
              inteiro, rodapé incluído. A mesma peça do rodapé, com o desenho
              em `style` porque aqui a folha do sítio pode não ter chegado. */}
          <div style={{ marginTop: 40, display: "flex", justifyContent: "center" }}>
            <LivroDeReclamacoes
              rotulo={t.livro}
              novaJanela={t.novaJanela}
              altura={36}
              style={{ opacity: 0.6 }}
            />
          </div>
        </div>
      </body>
    </html>
  );
}
