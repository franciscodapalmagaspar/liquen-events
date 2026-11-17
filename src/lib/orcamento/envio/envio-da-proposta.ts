import type { Quote } from "@/lib/orcamento/types";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import type { DocumentoPreparado } from "./documento-do-envio";

/**
 * O que todas as etapas do envio sabem: de que pedido é, o pedido, o
 * documento já preparado (`documento-do-envio.ts`) e a língua em que se
 * desenha. Monta-se UMA vez, no orquestrador (`atender-o-estudio.ts`), e cada
 * etapa diz o que mais precisa ao lado.
 */
export interface EnvioDaProposta {
  /** O id do PEDIDO — nunca o da proposta (esse é `proposal.id`). */
  pedidoId: string;
  quote: Quote;
  /** Com a validade já escrita (`documento-do-envio.ts`). */
  doc: DocumentoPreparado;
  idioma: IdiomaDaProposta;
}
