import AvisoLegal from "@/components/AvisoLegal";
import { normalizeLocale } from "@/lib/i18n";

/**
 * Full-screen surface for the quote flow (form, confirmation, back-office).
 *
 * The marker `data-orcamento-mode` is server-rendered, so the global CSS that
 * hides the footer / WhatsApp / scroll bar and switches to the white surface
 * (see globals.css `body:has([data-orcamento-mode])`) applies on the very first
 * paint — no flash, unlike a `useEffect`-added body class. Unmounting on
 * navigation removes the marker and reverts the styles automatically.
 *
 * ── O FIM LEGAL (decisões do dono, 17/11) ───────────────────────────────────
 * Esconder o rodapé levava com ele a ligação ao Livro de Reclamações, que é
 * obrigatória em todas as páginas. Fica aqui, no fim do fluxo (o formulário
 * e a confirmação), pequena e discreta: a mesma peça do rodapé, sem mudar o
 * desenho nem o formulário. No fluxo normal do documento, por baixo de tudo,
 * nunca por cima dos botões nem de nada fixo. Desde o documento de 17/11
 * (`docs/LEGAL-FORMULARIO.md`) é a peça inteira (`AvisoLegal.tsx`): o Livro,
 * as ligações legais e a resolução de litígios.
 */
export default async function OrcamentoLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const lingua = normalizeLocale((await params).lang);
  return (
    <div data-orcamento-mode>
      {children}
      {/* `recuo-consentimento`: enquanto o aviso de cookies está aberto, o
          fim da página ganha a altura dele, para o aviso não tapar a ligação. */}
      <div className="recuo-consentimento">
        <AvisoLegal
          lingua={lingua}
          alturaDoLivro={30}
          className="px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-foreground/68"
          classeDasLigacoes="alvo-toque hover:text-foreground transition-colors"
        />
      </div>
    </div>
  );
}
