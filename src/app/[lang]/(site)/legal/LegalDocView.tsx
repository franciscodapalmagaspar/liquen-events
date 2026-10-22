import AnimateIn from "@/components/AnimateIn";
import { staggerMs } from "@/lib/motion/tokens";
import type { LegalDoc } from "./legal-content";
import { hifenizar } from "@/lib/hifenizar";

// Shared, elegant renderer for a legal document (privacy / terms). Editorial
// column, Playfair headings, AA-contrast body — consistent with the rest of the
// site, no motion beyond the site's standard scroll reveal.
//
// `justificado`: pedido dela («na política de privacidade também justifica o
// texto»), como nas páginas de serviços — só o texto corrido, e com as palavras
// partidas por hífen para o telemóvel não esticar os espaços.
export default function LegalDocView({
  doc,
  justificado = false,
  idioma = "pt",
}: {
  doc: LegalDoc;
  justificado?: boolean;
  /** A língua do texto, para as sílabas se partirem pelas regras certas. */
  idioma?: string;
}) {
  // No telemóvel à esquerda (`text-pretty` equilibra a margem), justificado só
  // a partir do `sm`: palavras dela a 22/10, com a captura do iPhone — «o
  // texto está espaçado… tem que estar normal». Numa coluna de 340 px o
  // justificado abre buracos mesmo com as sílabas marcadas.
  const corrido = justificado ? " text-left text-pretty sm:text-justify hyphens-auto" : "";
  // Justificado sem sílabas marcadas abre buracos no iPhone — ver `hifenizar`.
  const texto = (t: string) => (justificado ? hifenizar(t, idioma) : t);
  return (
    <section className="bg-surface">
      <div className="max-w-3xl mx-auto px-6 lg:px-8 pt-40 pb-24 lg:pb-32">
        <AnimateIn>
          <p className="text-foreground/68 text-[10px] tracking-[0.4em] uppercase mb-6">
            {doc.updated}
          </p>
          <h1
            className="text-foreground font-bold leading-[1.05] tracking-tight mb-8"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(36px, 6vw, 64px)" }}
          >
            {doc.title}
          </h1>
          <p
            className={`text-foreground/72 text-base leading-[1.85] border-t border-foreground/10 pt-8${corrido}`}
          >
            {texto(doc.intro)}
          </p>
        </AnimateIn>

        <div className="mt-14 flex flex-col gap-12">
          {doc.sections.map((s, i) => (
            <AnimateIn key={s.heading} delay={staggerMs(i)}>
              <div>
                <h2
                  className="text-foreground text-xl lg:text-2xl font-bold mb-4"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {s.heading}
                </h2>
                <div className="flex flex-col gap-3">
                  {s.body.map((p, j) => (
                    <p
                      key={j}
                      className={`text-foreground/72 text-[15px] leading-[1.85]${corrido}`}
                    >
                      {texto(p)}
                    </p>
                  ))}
                </div>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
