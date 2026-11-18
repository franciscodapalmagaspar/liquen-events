"use client";

import { type PdfVisto } from "../../../pdf-visto";
import { Button } from "../../../ui";

/**
 * ── ANTES DE ENVIAR: VER O PDF FINAL (14/10) ─────────────────────────────
 * «Quero que haja algo que antes de enviar para os clientes obrigue os
 * colaboradores da Líquen a verificar se está tudo bem.» A escolha dela foi
 * «Ver o PDF primeiro». O PDF final só sai sem erros (B1); depois de
 * descarregado, pede-se a confirmação; e mudar o documento depois de o ver
 * volta a pedir as duas coisas. O servidor confere a mesma chave.
 */
export function AntesDeEnviar({
  busy,
  confirmarPdfVisto,
  pdfVisto,
  pdfVistoAgora,
  preview,
  temErros,
}: {
  busy: "preview" | "send" | null;
  confirmarPdfVisto: (confirmado: boolean) => void;
  pdfVisto: PdfVisto | null;
  pdfVistoAgora: boolean;
  preview: (opcoes?: { rascunho?: boolean }) => Promise<void>;
  temErros: boolean;
}) {
  return (
    <div
      data-testid="ver-antes-de-enviar"
      data-campo="pdf-visto"
      className="mt-4 flex flex-col items-start gap-2 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] px-3 py-3"
    >
      <p className="bo-eyebrow text-[var(--bo-text-muted)]">Antes de enviar</p>
      {temErros ? (
        <p className="text-xs leading-relaxed text-[var(--bo-tinta-72)]">
          Primeiro corrige o que está na lista acima — o PDF final só sai sem erros. Depois
          descarrega-o e vê-o com atenção.
        </p>
      ) : !pdfVistoAgora ? (
        <>
          <p className="text-xs leading-relaxed text-[var(--bo-tinta-72)]">
            {pdfVisto
              ? "A proposta mudou depois de veres o PDF. Descarrega-o outra vez e vê-o antes de enviar."
              : "Descarrega o PDF final e vê-o com atenção, página a página — é exactamente o que o cliente vai receber."}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void preview()}
            disabled={busy !== null}
          >
            {busy === "preview" ? "A gerar o PDF…" : "Descarregar o PDF final"}
          </Button>
        </>
      ) : (
        <label className="alvo-toque flex cursor-pointer items-start gap-2 text-sm leading-snug text-[var(--bo-text)]">
          <input
            type="checkbox"
            checked={!!pdfVisto?.confirmado}
            onChange={(e) => confirmarPdfVisto(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-sage-600"
          />
          <span>Vi a proposta e está tudo certo</span>
        </label>
      )}
    </div>
  );
}
