import { localizeHref } from "@/lib/i18n/config";
import { NOTA_DO_FORMULARIO, type Lingua } from "@/lib/legal/textos-legais";

/**
 * A nota de proteção de dados por baixo do botão «Enviar» — a MESMA em todos
 * os formulários de pedido (o `/orcamento` e os dos anúncios, Meta e Google).
 *
 * Pedido do Francisco, 17/11 (`docs/LEGAL-FORMULARIO.md`, ponto 1): letra
 * pequena, cor suave, ligação à política, sem caixa de «aceito» — a base
 * legal é o pedido do próprio titular (art. 6.º, n.º 1, al. b) do RGPD), não
 * o consentimento. O texto vive em `textos-legais.ts`.
 *
 * Substitui a frase curta «Não vendemos os seus dados.»: ao lado desta nota,
 * que diz para que servem os dados e por quanto tempo ficam, era redundante
 * (decisão de 17/11, registada em `.claude/rules/legal.md`). A política
 * continua a dizê-lo na secção 5.
 *
 * A cor herda-se de quem a monta (o contraste AA foi medido em cada sítio).
 */
export default function NotaDeProtecaoDeDados({
  lingua,
  className,
  classeDaLigacao = "underline underline-offset-2",
}: {
  lingua: Lingua;
  className?: string;
  classeDaLigacao?: string;
}) {
  return (
    <p className={className} data-nota-de-protecao-de-dados="">
      {NOTA_DO_FORMULARIO[lingua].map((t, i) =>
        typeof t === "string" ? (
          <span key={i}>{t}</span>
        ) : (
          <a key={i} href={localizeHref(t.href, lingua)} className={classeDaLigacao}>
            {t.texto}
          </a>
        ),
      )}
    </p>
  );
}
