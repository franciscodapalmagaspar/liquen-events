"use client";

import type { StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import type { Quote } from "@/lib/orcamento/types";
import type { CampoAMudar } from "@/lib/proposal-copy";
import { tipoDoEventoDoPedido } from "@/lib/proposal-evento";
import { Button } from "../../../ui";

/** O aviso «Este pedido não parece um casamento». Ver `casamentoPorConfirmar`. */
export function AvisoDoCasamento({
  chaveDoCasamentoConfirmado,
  confirmado,
  doc,
  patch,
  quote,
  setCasamentoConfirmado,
}: {
  chaveDoCasamentoConfirmado: string;
  confirmado: (campo: CampoAMudar) => void;
  doc: StudioDoc;
  patch: (p: Partial<StudioDoc>) => void;
  quote: Quote;
  setCasamentoConfirmado: (sim: boolean) => void;
}) {
  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-3 text-sm"
    >
      <p className="font-medium">Este pedido não parece um casamento.</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--bo-text-muted)]">
        A proposta diz «{doc.eventType}», e por isso o PDF chama «Noivos» ao cliente e arruma os
        mood boards em Cerimónia, Cocktail e Jantar.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            confirmado("eventType");
            patch({ eventType: tipoDoEventoDoPedido(quote) });
            document.querySelector<HTMLInputElement>('input[data-campo="eventType"]')?.focus();
          }}
        >
          {tipoDoEventoDoPedido(quote)
            ? `Mudar para «${tipoDoEventoDoPedido(quote)}»`
            : "Escrever o tipo de evento"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setCasamentoConfirmado(true);
            try {
              localStorage.setItem(chaveDoCasamentoConfirmado, "1");
            } catch {
              /* sem localStorage: cala-se só até reabrir */
            }
          }}
        >
          É mesmo um casamento
        </Button>
      </div>
    </div>
  );
}
