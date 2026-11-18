import type { StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import type { Quote } from "@/lib/orcamento/types";
import { eCasamento, pedidoECasamento, tipoDoEventoDoPedido } from "@/lib/proposal-evento";

/**
 * «ESTE PEDIDO NÃO PARECE UM CASAMENTO» — a proposta diz casamento, mas nada
 * no pedido o diz (nem o tipo, nem os noivos), e ela ainda não confirmou que é.
 *
 * O estúdio escrevia «Casamento» sozinho em qualquer pedido sem tipo — e com
 * isso o PDF punha «Noivos» e arrumava os mood boards em Cerimónia e Cocktail
 * numa proposta para um restaurante. Os rascunhos feitos até 13/10 ficaram com
 * essa palavra; o aviso é o que os deixa corrigir com um toque, sem adivinhar.
 */
export function casamentoPorConfirmar(
  doc: Pick<StudioDoc, "eventType">,
  quote: Pick<Quote, "eventType" | "category" | "partnerA" | "partnerB"> & {
    eventName?: string | null;
  },
  casamentoConfirmado: boolean,
): boolean {
  return (
    eCasamento(doc.eventType) &&
    !pedidoECasamento(quote) &&
    !eCasamento(tipoDoEventoDoPedido(quote)) &&
    !(quote.partnerA || quote.partnerB) &&
    !casamentoConfirmado
  );
}
