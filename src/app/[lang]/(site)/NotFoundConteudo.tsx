import Link from "next/link";
import type { Dict } from "@/lib/i18n";
import { localizeHref, type Locale } from "@/lib/i18n/config";

/**
 * O CORPO do 404, sem estado e sem JavaScript próprio: recebe a língua e o
 * dicionário em vez de os ler do contexto.
 *
 * Saiu do `NotFoundView` (que continua a ser o mesmo, agora um invólucro de
 * três linhas) por causa do `global-not-found.tsx` — auditoria externa, S5.
 * O Next junta os componentes cliente do 404 global ao pacote de TODAS as
 * rotas, e com o cromado do sítio lá dentro a proposta do casal passou de
 * 160 KB para 185 KB (o `peso-das-rotas` apanhou-o no CI). O 404 global usa
 * este corpo diretamente, do lado do servidor, e não leva nada.
 */
export default function NotFoundConteudo({
  locale,
  t,
}: {
  locale: Locale;
  t: Pick<Dict, "errors" | "common" | "nav">;
}) {
  return (
    <section className="relative min-h-[80vh] flex items-center justify-center px-6 bg-surface overflow-hidden">
      {/* Soft moss wash so the 404 holds the site's cinematic tier instead of
          reading as a bare framework default. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 60% at 50% 34%, rgba(99, 122, 95, 0.1), transparent 70%)",
        }}
      />
      <div className="relative max-w-xl text-center">
        <p
          className="text-moss/30 font-bold leading-none mb-6 select-none"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(80px, 16vw, 200px)" }}
        >
          404
        </p>
        <p className="text-foreground/66 text-[10px] tracking-[0.5em] uppercase mb-5 flex items-center justify-center gap-3">
          <span className="w-5 h-px bg-moss/50" />
          {t.errors.notFoundEyebrow}
        </p>
        <h1
          className="text-foreground font-bold leading-tight mb-6"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 4vw, 48px)" }}
        >
          {t.errors.notFoundTitle}
        </h1>
        <p className="text-foreground/68 text-sm leading-[1.8] max-w-md mx-auto mb-12">
          {t.errors.notFoundText}
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <Link
            href={localizeHref("/", locale)}
            className="inline-flex items-center gap-3 px-8 py-4 btn-shine bg-moss text-white font-medium hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-widest uppercase"
          >
            {t.common.voltarInicio} →
          </Link>
          <Link
            href={localizeHref("/contacto", locale)}
            className="inline-flex items-center gap-3 px-8 py-4 border border-foreground/20 text-foreground/72 font-medium hover:border-foreground/40 hover:text-foreground transition-all duration-300 text-sm tracking-widest uppercase"
          >
            {t.common.falarConnosco}
          </Link>
        </div>

        {/* Quick links — keep the crawler & visitor moving.
            `alvo-toque`, como o resto do sítio: no dedo cada link tinha 16 px
            de altura (auditoria de 13/11, n.º 13); com a classe chega aos 44,
            e no rato o desenho fica igual. */}
        <nav className="mt-14 pt-8 border-t border-foreground/8 flex flex-wrap gap-x-7 gap-y-2 justify-center">
          {[
            [t.common.pedirOrcamento, "/orcamento"],
            [t.nav.servicos, "/servicos"],
            [t.nav.galeria, "/galeria"],
            [t.nav.sobre, "/sobre"],
            [t.nav.clientes, "/clientes"],
          ].map(([label, href]) => (
            <Link
              key={href}
              href={localizeHref(href, locale)}
              className="alvo-toque text-foreground/68 hover:text-moss text-xs tracking-[0.2em] uppercase transition-colors"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}
