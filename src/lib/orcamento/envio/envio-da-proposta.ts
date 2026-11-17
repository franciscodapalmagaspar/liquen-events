import type { Quote } from "@/lib/orcamento/types";
import type { IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { ProposalMoney } from "@/lib/proposal-doc";
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import type { RelatorioDoPdf } from "@/lib/proposal-preview-cache";

/** O documento depois de preparado (`documento-do-envio.ts`): a validade já
 *  lá está ESCRITA — é a data que o PDF mostra e a que a proposta grava. */
export type DocumentoPreparado = ProposalDoc & { validUntil: string };

/** Os bytes do PDF desenhado — um tipo só, o do desenho, da pré-visualização
 *  ao anexo do email e à cópia do envio. */
export type BytesDoPdf = RelatorioDoPdf["pdf"];

/**
 * O que todas as etapas do envio sabem: de que pedido é, o pedido, o
 * documento já preparado (`documento-do-envio.ts`) e a língua em que se
 * desenha. Monta-se UMA vez, no orquestrador (`atender-o-estudio.ts`), e cada
 * etapa diz o que mais precisa ao lado. O dinheiro não é um campo: deriva do
 * documento ({@link dinheiroDe}).
 */
export interface EnvioDaProposta {
  /** O id do PEDIDO — nunca o da proposta (esse é `proposal.id`). */
  pedidoId: string;
  quote: Quote;
  /** Com a validade já escrita (`documento-do-envio.ts`). */
  doc: DocumentoPreparado;
  idioma: IdiomaDaProposta;
}

const contado = new WeakMap<DocumentoPreparado, ProposalMoney>();

/**
 * O dinheiro da proposta: DERIVADO do documento, nunca guardado ao lado dele
 * — um campo à parte podia ficar com o valor de outro documento, e o PDF
 * dizia uma coisa e a linha gravada e o email outra.
 *
 * `dinheiroDaProposta` e não `resolveProposalMoney`: quando os valores
 * adicionais somam ao valor escrito, o bruto que fica GRAVADO tem de os
 * trazer. Senão o PDF dizia 3.862,20 € e o sinal continuava a ser calculado
 * sobre 3.690 € — o documento e a cobrança a discordarem em silêncio.
 *
 * Contado UMA vez por documento (as travas, a linha e o email leem o mesmo
 * objecto) e só quando alguém o pede: o rascunho nunca o pede, como na rota
 * antiga — um `budgetExtras` meio escrito não pode partir a pré-visualização
 * de um rascunho.
 */
export function dinheiroDe(envio: Pick<EnvioDaProposta, "doc">): ProposalMoney {
  let dinheiro = contado.get(envio.doc);
  if (!dinheiro) {
    dinheiro = dinheiroDaProposta(envio.doc);
    contado.set(envio.doc, dinheiro);
  }
  return dinheiro;
}
